import crypto from 'crypto';
import config from '../config/index.js';
import { query } from '../database/pool.js';
import logger from '../utils/logger.js';
import {
  BadRequestError,
  PaymentError,
  PaymentDeclinedError,
  PaymentProcessingError,
} from '../utils/errors.js';

/**
 * Paynow Payment Gateway Service
 * Integration with Paynow Zimbabwe for mobile money and card payments
 */

const PAYNOW_BASE_URL = config.paynow.sandbox
  ? 'https://sandbox.paynow.co.zw'
  : 'https://www.paynow.co.zw';

/**
 * Generate signature for Paynow request
 */
const generateSignature = (data: Record<string, string>, integrationKey: string): string => {
  // Concatenate values in order, append key, then SHA-512
  const concatenated = Object.values(data).join('') + integrationKey;
  return crypto.createHash('sha512').update(concatenated).digest('hex').toUpperCase();
};

/**
 * Verify Paynow signature from response
 */
const verifySignature = (data: Record<string, string>, integrationKey: string): boolean => {
  const receivedSignature = data.hash;
  if (!receivedSignature) return false;

  const dataToSign = { ...data };
  delete dataToSign.hash;

  const expectedSignature = generateSignature(dataToSign, integrationKey);
  return receivedSignature.toUpperCase() === expectedSignature.toUpperCase();
};

/**
 * Create payment request (initiate transaction)
 */
export const createTransaction = async (data: {
  userId: string;
  amount: number;
  currency?: string;
  purpose: string; // 'unlock', 'wallet_topup', 'subscription'
  referenceId: string;
  referenceType: string;
  paymentMethod: 'ecocash' | 'onemoney' | 'zipit' | 'card';
  phoneNumber?: string;
  idempotencyKey?: string;
}): Promise<{
  paymentId: string;
  publicId: string;
  status: string;
  paynowReference: string;
  pollUrl: string;
  redirectUrl?: string;
}> => {
  const {
    userId,
    amount,
    currency = 'USD',
    purpose,
    referenceId,
    referenceType,
    paymentMethod,
    phoneNumber,
    idempotencyKey,
  } = data;

  // Validate amount
  if (amount < 0.01) {
    throw new BadRequestError('Minimum amount is $0.01', 'INVALID_AMOUNT');
  }

  // Check for duplicate using idempotency key
  if (idempotencyKey) {
    const existingPayment = await query(
      'SELECT id, status, public_id FROM payments WHERE idempotency_key = $1 AND user_id = $2',
      [idempotencyKey, userId]
    );

    if (existingPayment.rows.length > 0) {
      const payment = existingPayment.rows[0];
      logger.info('Idempotent payment request', {
        idempotencyKey,
        paymentId: payment.id,
        status: payment.status,
      });
      return {
        paymentId: payment.id,
        publicId: payment.public_id,
        status: payment.status,
        paynowReference: '',
        pollUrl: '',
      };
    }
  }

  // Create payment record
  const paymentResult = await query(`
    INSERT INTO payments (
      user_id, amount, currency, payment_method, payment_method_detail,
      purpose, reference_id, reference_type, status, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'initiated', $9)
    RETURNING id, public_id
  `, [
    userId,
    amount,
    currency,
    paymentMethod,
    phoneNumber || null,
    purpose,
    referenceId,
    referenceType,
    idempotencyKey || null,
  ]);

  const payment = paymentResult.rows[0];

  // Generate unique reference for Paynow
  const paynowReference = `FL-${Date.now()}-${payment.public_id.split('-').pop()}`;

  // Update payment with Paynow reference
  await query(
    'UPDATE payments SET paynow_reference = $1 WHERE id = $2',
    [paynowReference, payment.id]
  );

  // Build Paynow request
  const returnUrl = `${config.paynow.returnUrl}?payment_id=${payment.public_id}`;
  const resultUrl = `${config.paynow.resultUrl}`;

  const requestData: Record<string, string> = {
    id: config.paynow.integrationId,
    reference: paynowReference,
    amount: amount.toFixed(2),
    additionalinfo: `${purpose} - ${referenceType}:${referenceId}`,
    returnurl: returnUrl,
    resulturl: resultUrl,
  };

  // Generate signature
  const signature = generateSignature(requestData, config.paynow.integrationKey);
  requestData.hash = signature;

  try {
    // Call Paynow API
    const response = await fetch(`${PAYNOW_BASE_URL}/interface/initiatetransaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(requestData).toString(),
    });

    const responseText = await response.text();
    const responseData = Object.fromEntries(new URLSearchParams(responseText));

    if (responseData.status !== 'Ok' && responseData.status !== 'ok') {
      // Payment request failed
      await query(
        "UPDATE payments SET status = 'failed', status_reason = $1, status_changed_at = NOW() WHERE id = $2",
        [responseData.error || 'Paynow request failed', payment.id]
      );

      throw new PaymentError(responseData.error || 'Failed to initiate payment');
    }

    // Update payment status
    await query(`
      UPDATE payments
      SET status = 'pending',
          paynow_poll_url = $1,
          status_changed_at = NOW()
      WHERE id = $2
    `, [responseData.pollurl, payment.id]);

    logger.info('Paynow transaction initiated', {
      paymentId: payment.id,
      publicId: payment.public_id,
      paynowReference,
      amount,
      paymentMethod,
    });

    // Initiate mobile money payment if applicable
    if (['ecocash', 'onemoney'].includes(paymentMethod) && phoneNumber) {
      await initiateMobileMoney({
        pollUrl: responseData.pollurl,
        paymentId: payment.id,
        phoneNumber,
        paymentMethod,
      });
    }

    return {
      paymentId: payment.id,
      publicId: payment.public_id,
      status: 'pending',
      paynowReference,
      pollUrl: responseData.pollurl,
      redirectUrl: responseData.browserurl,
    };
  } catch (error) {
    logger.error('Paynow transaction failed', {
      paymentId: payment.id,
      error: error.message,
    });

    await query(
      "UPDATE payments SET status = 'failed', status_reason = $1 WHERE id = $2",
      [error.message, payment.id]
    );

    if (error instanceof PaymentError) {
      throw error;
    }

    throw new PaymentProcessingError('Payment initiation failed');
  }
};

/**
 * Initiate mobile money payment (EcoCash, OneMoney)
 */
const initiateMobileMoney = async (data: {
  pollUrl: string;
  paymentId: string;
  phoneNumber: string;
  paymentMethod: 'ecocash' | 'onemoney';
}): Promise<void> => {
  const { pollUrl, paymentId, phoneNumber, paymentMethod } = data;

  // Mobile money endpoint
  const mobileUrl = `${pollUrl}/mobile/${paymentMethod === 'ecocash' ? 'ecocash' : 'onemoney'}`;

  try {
    const response = await fetch(mobileUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        phone: formatPhoneNumber(phoneNumber),
      }).toString(),
    });

    const responseText = await response.text();
    const responseData = Object.fromEntries(new URLSearchParams(responseText));

    logger.info('Mobile money initiated', {
      paymentId,
      paymentMethod,
      phone: phoneNumber.slice(-4).padStart(phoneNumber.length, '*'),
      status: responseData.status,
    });

    // Update payment status
    if (responseData.status === 'Ok' || responseData.status === 'ok') {
      await query(
        "UPDATE payments SET status = 'processing', status_changed_at = NOW() WHERE id = $1",
        [paymentId]
      );
    } else {
      await query(
        "UPDATE payments SET status = 'failed', status_reason = $1 WHERE id = $2",
        [responseData.error || 'Mobile money initiation failed', paymentId]
      );
    }
  } catch (error) {
    logger.error('Mobile money initiation failed', {
      paymentId,
      error: error.message,
    });
  }
};

/**
 * Format phone number for Paynow (263 format)
 */
const formatPhoneNumber = (phone: string): string => {
  // Remove non-numeric characters
  let cleaned = phone.replace(/\D/g, '');

  // Convert to 263 format
  if (cleaned.startsWith('0')) {
    cleaned = '263' + cleaned.substring(1);
  } else if (cleaned.startsWith('+263')) {
    cleaned = cleaned.substring(1);
  } else if (!cleaned.startsWith('263')) {
    cleaned = '263' + cleaned;
  }

  return cleaned;
};

/**
 * Poll payment status from Paynow
 */
export const pollPaymentStatus = async (paymentId: string): Promise<{
  status: string;
  amount: number;
  paynowReference: string;
}> => {
  const paymentResult = await query(
    'SELECT * FROM payments WHERE id = $1 OR public_id = $1',
    [paymentId]
  );

  const payment = paymentResult.rows[0];

  if (!payment) {
    throw new BadRequestError('Payment not found', 'PAYMENT_NOT_FOUND');
  }

  if (!payment.paynow_poll_url) {
    return {
      status: payment.status,
      amount: parseFloat(payment.amount),
      paynowReference: payment.paynow_reference,
    };
  }

  try {
    const response = await fetch(payment.paynow_poll_url);
    const responseText = await response.text();
    const responseData = Object.fromEntries(new URLSearchParams(responseText));

    // Check signature
    if (!verifySignature(responseData, config.paynow.integrationKey)) {
      logger.error('Invalid Paynow signature in poll response', { paymentId });
      throw new Error('Invalid response signature');
    }

    const paynowStatus = responseData.status?.toLowerCase();
    let newStatus = payment.status;

    if (paynowStatus === 'paid' || paynowStatus === 'awaiting delivery' || paynowStatus === 'delivered') {
      newStatus = 'confirmed';
    } else if (paynowStatus === 'cancelled' || paynowStatus === 'failed') {
      newStatus = 'failed';
    }

    // Update if status changed
    if (newStatus !== payment.status) {
      await query(`
        UPDATE payments
        SET status = $1,
            status_reason = $2,
            status_changed_at = NOW()
        WHERE id = $3
      `, [newStatus, paynowStatus, payment.id]);

      payment.status = newStatus;
    }

    return {
      status: payment.status,
      amount: parseFloat(payment.amount),
      paynowReference: payment.paynow_reference,
    };
  } catch (error) {
    logger.error('Failed to poll payment status', {
      paymentId,
      error: error.message,
    });

    return {
      status: payment.status,
      amount: parseFloat(payment.amount),
      paynowReference: payment.paynow_reference,
    };
  }
};

/**
 * Process Paynow webhook result
 */
export const processWebhookResult = async (webhookData: Record<string, string>): Promise<{
  success: boolean;
  paymentId?: string;
}> => {
  // Verify signature
  if (!verifySignature(webhookData, config.paynow.integrationKey)) {
    logger.error('Invalid Paynow webhook signature', { data: webhookData });
    return { success: false };
  }

  const paynowReference = webhookData.reference;
  const status = webhookData.status?.toLowerCase();

  // Find payment by reference
  const paymentResult = await query(
    'SELECT * FROM payments WHERE paynow_reference = $1',
    [paynowReference]
  );

  const payment = paymentResult.rows[0];

  if (!payment) {
    logger.error('Payment not found for webhook', { paynowReference });
    return { success: false };
  }

  let newStatus = payment.status;

  if (status === 'paid' || status === 'awaiting delivery' || status === 'delivered') {
    newStatus = 'confirmed';
  } else if (status === 'cancelled' || status === 'failed') {
    newStatus = 'failed';
  }

  // Update payment
  await query(`
    UPDATE payments
    SET status = $1,
        status_reason = $2,
        status_changed_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
    WHERE id = $4
  `, [
    newStatus,
    status,
    JSON.stringify(webhookData),
    payment.id,
  ]);

  logger.info('Payment webhook processed', {
    paymentId: payment.id,
    oldStatus: payment.status,
    newStatus,
    amount: payment.amount,
  });

  return {
    success: true,
    paymentId: payment.id,
  };
};

/**
 * Process refund
 */
export const processRefund = async (
  paymentId: string,
  refundAmount: number,
  reason: string,
  processedBy: string
): Promise<{ success: boolean; refundId?: string }> => {
  const paymentResult = await query(
    'SELECT * FROM payments WHERE id = $1 AND status = $2',
    [paymentId, 'confirmed']
  );

  const payment = paymentResult.rows[0];

  if (!payment) {
    throw new BadRequestError('Cannot refund this payment', 'REFUND_NOT_POSSIBLE');
  }

  if (refundAmount > parseFloat(payment.amount)) {
    throw new BadRequestError('Refund amount exceeds payment amount', 'INVALID_REFUND_AMOUNT');
  }

  // Update payment with refund info
  await query(`
    UPDATE payments
    SET refunded_amount = $1,
        refunded_at = NOW(),
        refund_reason = $2,
        status = 'refunded',
        metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
    WHERE id = $4
  `, [
    refundAmount,
    reason,
    JSON.stringify({ refundedBy: processedBy, refundedAt: new Date().toISOString() }),
    paymentId,
  ]);

  logger.info('Payment refunded', {
    paymentId,
    refundAmount,
    reason,
    processedBy,
  });

  return { success: true };
};

export default {
  createTransaction,
  pollPaymentStatus,
  processWebhookResult,
  processRefund,
};
