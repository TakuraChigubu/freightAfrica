import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { query, transaction } from '../database/pool.js';
import * as loadModel from '../models/load.js';
import * as walletService from './wallet.js';
import * as notificationService from './notification.js';
import logger from '../utils/logger.js';
import {
  BadRequestError,
  NotFoundError,
  LoadNotFoundError,
  LoadExpiredError,
  InsufficientFundsError,
  AlreadyUnlockedError,
  UnlockError,
} from '../utils/errors.js';

/**
 * Contact Unlock Service
 * Handles paid broker contact unlocks
 */

/**
 * Calculate cost floor for unlock pricing
 * Based on: (WhatsApp cost + Gemini cost + Paynow fee + Infrastructure) / expected conversion rate
 */
export const calculateUnlockPrice = (): {
  basePrice: number;
  costs: {
    whatsappConversation: number;
    geminiParsing: number;
    paynowFee: number;
    infrastructure: number;
  };
  pricingByConversion: Record<string, number>;
} => {
  const costs = {
    whatsappConversation: config.pricing.whatsappConversationCost,
    geminiParsing: config.pricing.geminiCostPerRequest,
    infrastructure: config.pricing.infrastructureAllocation,
    paynowFee: 0, // Calculated as percentage
  };

  // Calculate prices at different conversion rates
  const pricingByConversion: Record<string, number> = {};
  const conversionRates = [0.02, 0.05, 0.10, 0.15, 0.20];

  for (const rate of conversionRates) {
    const paynowFee = config.pricing.baseUnlockPrice * (config.pricing.paynowFeePercent / 100);
    const totalCost = costs.whatsappConversation + costs.geminiParsing + paynowFee + costs.infrastructure;
    const priceAtRate = totalCost / rate;

    pricingByConversion[`${(rate * 100)}%`] = Math.max(
      config.pricing.baseUnlockPrice,
      Math.ceil(priceAtRate * 100) / 100
    );
  }

  return {
    basePrice: config.pricing.baseUnlockPrice,
    costs,
    pricingByConversion,
  };
};

/**
 * Get effective unlock price for user
 */
export const getUnlockPrice = async (userId?: string): Promise<number> => {
  // TODO: Check user subscription for discounted rates
  return config.pricing.baseUnlockPrice;
};

/**
 * Unlock broker contact for a load
 */
export const unlockContact = async (data: {
  loadId: string;
  userId: string;
  paymentMethod: 'wallet' | 'ecocash' | 'onemoney' | 'zipit' | 'card';
  phoneNumber?: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  unlockId: string;
  accessExpiresAt: Date;
  contact: {
    phone: string;
    whatsapp: string;
    brokerName: string;
    brokerCompany: string;
    brokerEmail?: string;
  };
}> => {
  const {
    loadId,
    userId,
    paymentMethod,
    phoneNumber,
    deviceFingerprint,
    ipAddress,
    userAgent,
  } = data;

  // Get load
  const load = await loadModel.findById(loadId);

  if (!load) {
    throw new LoadNotFoundError();
  }

  // Check if load is published and not expired
  if (load.status !== 'published') {
    throw new BadRequestError('This load is not available for unlock', 'LOAD_NOT_PUBLISHED');
  }

  if (load.expires_at && new Date(load.expires_at) < new Date()) {
    throw new LoadExpiredError();
  }

  // Check if user already has an active unlock for this load
  const existingUnlock = await query(`
    SELECT * FROM contact_unlocks
    WHERE user_id = $1 AND load_id = $2 AND status = 'active' AND access_expires_at > NOW()
  `, [userId, loadId]);

  if (existingUnlock.rows.length > 0) {
    // Return existing unlock
    const unlock = existingUnlock.rows[0];
    logger.info('Returning existing unlock', { userId, loadId, unlockId: unlock.id });

    return {
      unlockId: unlock.id,
      accessExpiresAt: new Date(unlock.access_expires_at),
      contact: {
        phone: unlock.phone,
        whatsapp: unlock.whatsapp,
        brokerName: unlock.broker_name,
        brokerCompany: unlock.broker_company,
        brokerEmail: unlock.broker_email,
      },
    };
  }

  // Calculate unlock price
  const price = await getUnlockPrice(userId);

  // Process payment
  if (paymentMethod === 'wallet') {
    // Check wallet balance
    const walletBalance = await walletService.getBalance(userId);

    if (walletBalance.available < price) {
      throw new InsufficientFundsError(
        `Insufficient wallet balance. Required: $${price.toFixed(2)}, Available: $${walletBalance.available.toFixed(2)}`
      );
    }

    // Create wallet payment record
    await transaction(async (client) => {
      // Create unlock payment
      const paymentResult = await client.query(`
        INSERT INTO payments (
          user_id, amount, currency, payment_method,
          purpose, reference_id, reference_type, status
        ) VALUES ($1, $2, 'USD', 'wallet', 'unlock', $3, 'load', 'confirmed')
        RETURNING id
      `, [userId, price, loadId]);

      const paymentId = paymentResult.rows[0].id;

      // Debit wallet
      const walletResult = await client.query(
        'SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      const wallet = walletResult.rows[0];

      const balanceBefore = await client.query(
        'SELECT balance FROM wallets WHERE user_id = $1',
        [userId]
      );

      const newBalance = parseFloat(balanceBefore.rows[0].balance) - price;

      await client.query(
        'UPDATE wallets SET balance = $1, total_debited = total_debited + $2, last_transaction_at = NOW() WHERE user_id = $3',
        [newBalance, price, userId]
      );

      // Create wallet transaction
      await client.query(`
        INSERT INTO wallet_transactions (
          wallet_id, type, amount, balance_before, balance_after,
          reference_type, reference_id, description, payment_id
        ) VALUES ($1, 'debit', $2, $3, $4, 'unlock', $5, $6, $7)
      `, [
        wallet.id,
        price,
        parseFloat(balanceBefore.rows[0].balance),
        newBalance,
        loadId,
        `Unlock load ${load.public_id}`,
        paymentId,
      ]);

      // Create unlock record
      const expiresAt = new Date(Date.now() + config.pricing.unlock_duration_hours * 60 * 60 * 1000);
      const unlockResult = await client.query(`
        INSERT INTO contact_unlocks (
          user_id, load_id, payment_id,
          phone, whatsapp, broker_name, broker_company, broker_email,
          access_expires_at, device_fingerprint, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, access_expires_at
      `, [
        userId,
        loadId,
        paymentId,
        load.parsed_phone || load.raw_phone,
        load.parsed_whatsapp || load.raw_whatsapp,
        load.broker_name,
        load.broker_company,
        load.broker_email,
        expiresAt,
        deviceFingerprint,
        ipAddress,
        userAgent,
      ]);

      return unlockResult.rows[0];
    });
  } else {
    // Use Paynow for other payment methods
    // This would integrate with paynow service
    const { paynowService } = await import('./paynow.js');

    const unlock = await transaction(async (client) => {
      // Create pending payment
      const paymentResult = await client.query(`
        INSERT INTO payments (
          user_id, amount, currency, payment_method, payment_method_detail,
          purpose, reference_id, reference_type, status,
          idempotency_key
        ) VALUES ($1, $2, 'USD', $3, $4, 'unlock', $5, 'load', 'pending', $6)
        RETURNING id
      `, [
        userId,
        price,
        paymentMethod,
        phoneNumber,
        loadId,
        uuidv4(), // idempotency key
      ]);

      const paymentId = paymentResult.rows[0].id;

      // Initialize Paynow transaction
      const txn = await paynowService.createTransaction({
        userId,
        amount: price,
        currency: 'USD',
        purpose: 'unlock',
        referenceId: loadId,
        referenceType: 'load',
        paymentMethod: paymentMethod as 'ecocash' | 'onemoney' | 'zipit' | 'card',
        phoneNumber,
        idempotencyKey: paymentId,
      });

      // Create pending unlock (will be activated on payment confirmation)
      const unlockResult = await client.query(`
        INSERT INTO contact_unlocks (
          user_id, load_id, payment_id,
          access_expires_at, device_fingerprint, ip_address, user_agent,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id
      `, [
        userId,
        loadId,
        paymentId,
        new Date(), // Temporary, will be updated on payment
        deviceFingerprint,
        ipAddress,
        userAgent,
      ]);

      return unlockResult.rows[0];
    });

    // Payment is pending - return payment info
    throw new BadRequestError('Payment required', 'PAYMENT_REQUIRED', [
      { field: 'payment', message: 'Complete payment to unlock', code: 'payment_required' },
    ]);
  }

  // Get final unlock record
  const finalUnlock = await query(
    'SELECT * FROM contact_unlocks WHERE user_id = $1 AND load_id = $2 ORDER BY created_at DESC LIMIT 1',
    [userId, loadId]
  );

  const unlock = finalUnlock.rows[0];

  // Increment load unlock count
  await loadModel.incrementUnlockCount(loadId);

  // Send notification
  await notificationService.notifyLoadUnlocked(userId, load);

  logger.info('Contact unlocked', {
    unlockId: unlock.id,
    userId,
    loadId,
    price,
    paymentMethod,
  });

  return {
    unlockId: unlock.id,
    accessExpiresAt: new Date(unlock.access_expires_at),
    contact: {
      phone: unlock.phone,
      whatsapp: unlock.whatsapp,
      brokerName: unlock.broker_name,
      brokerCompany: unlock.broker_company,
      brokerEmail: unlock.broker_email,
    },
  };
};

/**
 * Check if user has unlocked a load
 */
export const checkUnlockStatus = async (userId: string, loadId: string): Promise<{
  isUnlocked: boolean;
  accessExpiresAt?: Date;
  contact?: any;
}> => {
  const result = await query(`
    SELECT * FROM contact_unlocks
    WHERE user_id = $1
      AND load_id = $2
      AND status = 'active'
      AND access_expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId, loadId]);

  if (result.rows.length === 0) {
    return { isUnlocked: false };
  }

  const unlock = result.rows[0];

  return {
    isUnlocked: true,
    accessExpiresAt: new Date(unlock.access_expires_at),
    contact: {
      phone: unlock.phone,
      whatsapp: unlock.whatsapp,
      brokerName: unlock.broker_name,
      brokerCompany: unlock.broker_company,
      brokerEmail: unlock.broker_email,
    },
  };
};

/**
 * Get user's unlocked loads
 */
export const getUserUnlocks = async (userId: string, options: {
  page?: number;
  limit?: number;
  activeOnly?: boolean;
} = {}): Promise<{ unlocks: any[]; total: number }> => {
  const { page = 1, limit = 20, activeOnly = false } = options;
  const offset = (page - 1) * limit;

  const conditions = ['u.user_id = $1'];
  const params: any[] = [userId];

  if (activeOnly) {
    conditions.push('u.status = $2 AND u.access_expires_at > NOW()');
    params.push('active');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Get total
  const countSql = `SELECT COUNT(*) as total FROM contact_unlocks u ${whereClause}`;
  const countResult = await query(countSql, params);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get unlocks with load info
  const sql = `
    SELECT u.*,
           l.public_id as load_public_id,
           l.origin_raw,
           l.destination_raw,
           l.cargo_type,
           l.status as load_status
    FROM contact_unlocks u
    JOIN loads l ON u.load_id = l.id
    ${whereClause}
    ORDER BY u.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  params.push(limit, offset);
  const result = await query(sql, params);

  return {
    unlocks: result.rows.map(unlock => ({
      id: unlock.id,
      loadId: unlock.load_id,
      loadPublicId: unlock.load_public_id,
      origin: unlock.origin_raw,
      destination: unlock.destination_raw,
      cargoType: unlock.cargo_type,
      loadStatus: unlock.load_status,
      phone: unlock.phone,
      whatsapp: unlock.whatsapp,
      brokerName: unlock.broker_name,
      brokerCompany: unlock.broker_company,
      accessExpiresAt: unlock.access_expires_at,
      status: unlock.status,
      createdAt: unlock.created_at,
    })),
    total,
  };
};

/**
 * Revoke/expire old unlocks (cleanup)
 */
export const expireOldUnlocks = async (): Promise<number> => {
  const sql = `
    UPDATE contact_unlocks
    SET status = 'expired'
    WHERE status = 'active'
      AND access_expires_at < NOW()
  `;

  const result = await query(sql);
  const expired = result.rowCount ?? 0;

  if (expired > 0) {
    logger.info('Expired unlocks', { count: expired });
  }

  return expired;
};

/**
 * Get unlock usage by user (for rate limiting)
 */
export const getUnlockCountByUser = async (userId: string, hours: number = 1): Promise<number> => {
  const sql = `
    SELECT COUNT(*) as count
    FROM contact_unlocks
    WHERE user_id = $1
      AND created_at > NOW() - INTERVAL '${hours} hours'
  `;

  const result = await query(sql, [userId]);
  return parseInt(result.rows[0]?.count ?? '0', 10);
};

/**
 * Process unlock after payment confirmation
 */
export const activateUnlockAfterPayment = async (paymentId: string): Promise<void> => {
  const paymentResult = await query(
    'SELECT * FROM payments WHERE id = $1 AND status = $2 AND purpose = $3',
    [paymentId, 'confirmed', 'unlock']
  );

  const payment = paymentResult.rows[0];

  if (!payment) {
    return;
  }

  // Get pending unlock
  const unlockResult = await query(
    'SELECT * FROM contact_unlocks WHERE payment_id = $1 AND status = $2',
    [paymentId, 'pending']
  );

  const unlock = unlockResult.rows[0];

  if (!unlock) {
    return;
  }

  // Get load for contact info
  const load = await loadModel.findById(unlock.load_id);

  if (!load) {
    return;
  }

  // Activate unlock
  const expiresAt = new Date(Date.now() + config.pricing.unlock_duration_hours * 60 * 60 * 1000);

  await query(`
    UPDATE contact_unlocks
    SET status = 'active',
        access_expires_at = $1,
        phone = $2,
        whatsapp = $3,
        broker_name = $4,
        broker_company = $5,
        broker_email = $6
    WHERE id = $7
  `, [
    expiresAt,
    load.parsed_phone || load.raw_phone,
    load.parsed_whatsapp || load.raw_whatsapp,
    load.broker_name,
    load.broker_company,
    load.broker_email,
    unlock.id,
  ]);

  // Increment unlock count
  await loadModel.incrementUnlockCount(load.id);

  // Send notification
  await notificationService.notifyLoadUnlocked(payment.user_id, load);

  logger.info('Unlock activated after payment', { unlockId: unlock.id, paymentId });
};

export default {
  calculateUnlockPrice,
  getUnlockPrice,
  unlockContact,
  checkUnlockStatus,
  getUserUnlocks,
  expireOldUnlocks,
  getUnlockCountByUser,
  activateUnlockAfterPayment,
};
