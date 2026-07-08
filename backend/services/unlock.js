import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { query, transaction } from '../database/pool.js';
import * as loadModel from '../models/load.js';
import * as walletService from './wallet.js';
import * as notificationService from './notification.js';
import { PRICING_CONFIG, getAvailableBundles, getBundleById, validatePricing } from './pricing.js';
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
 * Handles paid broker contact unlocks with bundle pricing
 */

/**
 * Get user's available unlock credits
 */
export const getUserCredits = async (userId: string): Promise<{
  totalCredits: number;
  activeBundles: Array<{
    id: string;
    bundleType: string;
    remaining: number;
    expiresAt: Date | null;
  }>;
}> => {
  const result = await query(`
    SELECT
      id,
      bundle_type,
      unlocks_remaining,
      expires_at
    FROM unlock_bundles
    WHERE user_id = $1
      AND is_active = TRUE
      AND unlocks_remaining > 0
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY expires_at NULLS LAST, created_at ASC
  `, [userId]);

  const activeBundles = result.rows.map(row => ({
    id: row.id,
    bundleType: row.bundle_type,
    remaining: row.unlocks_remaining,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  }));

  const totalCredits = activeBundles.reduce((sum, b) => sum + b.remaining, 0);

  return { totalCredits, activeBundles };
};

/**
 * Consume one unlock credit from user's bundles
 * Uses FIFO: oldest bundles consumed first
 */
export const consumeCredit = async (userId: string): Promise<{
  success: boolean;
  bundleId: string;
  bundleType: string;
  remainingAfter: number;
} | null> => {
  // Get oldest bundle with credits
  const result = await query(`
    SELECT id, bundle_type, unlocks_remaining
    FROM unlock_bundles
    WHERE user_id = $1
      AND is_active = TRUE
      AND unlocks_remaining > 0
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY expires_at NULLS LAST, created_at ASC
    LIMIT 1
    FOR UPDATE
  `, [userId]);

  if (result.rows.length === 0) {
    return null;
  }

  const bundle = result.rows[0];

  // Decrement and check if fully consumed
  const updateResult = await query(`
    UPDATE unlock_bundles
    SET
      unlocks_remaining = unlocks_remaining - 1,
      unlocks_used = unlocks_used + 1,
      fully_consumed_at = CASE WHEN unlocks_remaining = 1 THEN NOW() ELSE NULL END,
      is_active = CASE WHEN unlocks_remaining = 1 THEN FALSE ELSE TRUE END
    WHERE id = $1
    RETURNING unlocks_remaining
  `, [bundle.id]);

  return {
    success: true,
    bundleId: bundle.id,
    bundleType: bundle.bundle_type,
    remainingAfter: updateResult.rows[0].unlocks_remaining,
  };
};

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
  const bundles = getAvailableBundles();
  const defaultBundle = bundles.find(b => b.isDefault) || bundles[1]; // bundle_3

  const costs = {
    whatsappConversation: PRICING_CONFIG.COSTS.WHATSAPP_CONVERSATION,
    geminiParsing: calculateGeminiCost(),
    infrastructure: PRICING_CONFIG.COSTS.INFRASTRUCTURE,
    paynowFee: PRICING_CONFIG.PAYNOW.FLAT_FEE,
  };

  // Calculate prices at different conversion rates
  const pricingByConversion: Record<string, number> = {};
  const conversionRates = [0.05, 0.10, 0.15, 0.20];

  for (const rate of conversionRates) {
    const totalCost = costs.whatsappConversation + costs.geminiParsing + costs.infrastructure;
    const priceAtRate = totalCost / rate;

    pricingByConversion[`${(rate * 100)}%`] = Math.max(
      PRICING_CONFIG.MIN_PRICE_FOR_ACCEPTABLE_FEE_RATIO,
      Math.ceil(priceAtRate * 100) / 100
    );
  }

  return {
    basePrice: defaultBundle.pricePerUnlock,
    costs,
    pricingByConversion,
  };
};

/**
 * Calculate Gemini cost per request
 */
const calculateGeminiCost = (): number => {
  const { GEMINI_FLASH_INPUT, GEMINI_FLASH_OUTPUT, GEMINI_AVG_TOKENS } = PRICING_CONFIG.COSTS;
  const inputTokens = GEMINI_AVG_TOKENS * 0.6;
  const outputTokens = GEMINI_AVG_TOKENS * 0.4;
  return (inputTokens / 1000 * GEMINI_FLASH_INPUT) + (outputTokens / 1000 * GEMINI_FLASH_OUTPUT);
};

/**
 * Get effective unlock price for user (now returns bundle info)
 */
export const getUnlockPrice = async (userId?: string): Promise<{
  hasCredits: boolean;
  credits: number;
  bundles: ReturnType<typeof getAvailableBundles>;
  recommendedBundle: any;
}> => {
  let credits = 0;
  let hasCredits = false;

  if (userId) {
    const userCredits = await getUserCredits(userId);
    credits = userCredits.totalCredits;
    hasCredits = credits > 0;
  }

  const bundles = getAvailableBundles();
  const recommendedBundle = bundles.find(b => b.isDefault) || bundles[1];

  return {
    hasCredits,
    credits,
    bundles,
    recommendedBundle,
  };
};

/**
 * Purchase unlock bundle
 */
export const purchaseBundle = async (data: {
  userId: string;
  bundleType: string;
  paymentMethod: 'ecocash' | 'onemoney' | 'zipit' | 'card' | 'wallet';
  phoneNumber?: string;
  idempotencyKey?: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{
  bundleId: string;
  publicId: string;
  paymentStatus: string;
  paymentId: string;
  paynowPollUrl?: string;
  paynowRedirectUrl?: string;
}> => {
  const { userId, bundleType, paymentMethod, phoneNumber, idempotencyKey, deviceFingerprint, ipAddress, userAgent } = data;

  // Get bundle details
  const bundle = getBundleById(bundleType);
  if (!bundle) {
    throw new BadRequestError('Invalid bundle type', 'INVALID_BUNDLE');
  }

  // Validate pricing against cost floor
  const validation = validatePricing(bundle.price, bundle.unlocks);
  if (!validation.isValid) {
    logger.error('Pricing validation failed', { bundle: bundleType, ...validation });
    throw new Error(`Pricing validation failed: ${validation.warning}`);
  }

  // Check for idempotent request
  if (idempotencyKey) {
    const existing = await query(
      'SELECT id, public_id FROM unlock_bundles WHERE payment_id IN (SELECT id FROM payments WHERE idempotency_key = $1)',
      [idempotencyKey]
    );
    if (existing.rows.length > 0) {
      return {
        bundleId: existing.rows[0].id,
        publicId: existing.rows[0].public_id,
        paymentStatus: 'confirmed',
        paymentId: '',
      };
    }
  }

  // Process payment
  if (paymentMethod === 'wallet') {
    // Use wallet balance
    const wallet = await walletService.getBalance(userId);
    if (wallet.available < bundle.price) {
      throw new InsufficientFundsError(
        `Insufficient wallet balance. Required: $${bundle.price.toFixed(2)}, Available: $${wallet.available.toFixed(2)}`
      );
    }

    const result = await transaction(async (client) => {
      // Create payment
      const paymentRes = await client.query(`
        INSERT INTO payments (
          user_id, amount, currency, payment_method, purpose,
          bundle_type, unlocks_purchased, status
        ) VALUES ($1, $2, 'USD', 'wallet', 'bundle_purchase', $3, $4, 'confirmed')
        RETURNING id
      `, [userId, bundle.price, bundle.id, bundle.unlocks]);

      const paymentId = paymentRes.rows[0].id;

      // Debit wallet
      await client.query(`
        UPDATE wallets
        SET balance = balance - $1,
            total_debited = total_debited + $1,
            last_transaction_at = NOW()
        WHERE user_id = $2
      `, [bundle.price, userId]);

      // Create bundle
      const bundleRes = await client.query(`
        INSERT INTO unlock_bundles (
          user_id, payment_id, bundle_type, bundle_name,
          total_unlocks, price_paid, cost_per_unlock_at_purchase,
          unlocks_remaining, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $5, TRUE)
        RETURNING id, public_id
      `, [
        userId,
        paymentId,
        bundle.id,
        bundle.name,
        bundle.unlocks,
        bundle.price,
        validation.costPerUnlock,
      ]);

      return { bundle: bundleRes.rows[0], paymentId };
    });

    logger.info('Bundle purchased via wallet', {
      userId,
      bundleType: bundle.id,
      price: bundle.price,
      unlocks: bundle.unlocks,
    });

    return {
      bundleId: result.bundle.id,
      publicId: result.bundle.public_id,
      paymentStatus: 'confirmed',
      paymentId: result.paymentId,
    };
  } else {
    // Paynow payment
    const { createTransaction: createPaynowTransaction } = await import('./paynow.js');

    const txn = await createPaynowTransaction({
      userId,
      amount: bundle.price,
      currency: 'USD',
      purpose: 'bundle_purchase',
      referenceId: bundle.id,
      referenceType: 'unlock_bundle',
      paymentMethod: paymentMethod as 'ecocash' | 'onemoney' | 'zipit' | 'card',
      phoneNumber,
      idempotencyKey,
    });

    // Create pending bundle (will be activated on payment)
    await query(`
      INSERT INTO unlock_bundles (
        user_id, payment_id, bundle_type, bundle_name,
        total_unlocks, price_paid, cost_per_unlock_at_purchase,
        unlocks_remaining, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, FALSE)
    `, [
      userId,
      txn.paymentId,
      bundle.id,
      bundle.name,
      bundle.unlocks,
      bundle.price,
      validation.costPerUnlock,
    ]);

    return {
      bundleId: txn.paymentId,
      publicId: txn.publicId,
      paymentStatus: 'pending',
      paymentId: txn.paymentId,
      paynowPollUrl: txn.pollUrl,
      paynowRedirectUrl: txn.redirectUrl,
    };
  }
};

/**
 * Unlock broker contact for a load
 */
export const unlockContact = async (data: {
  loadId: string;
  userId: string;
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
  creditsRemaining: number;
}> => {
  const { loadId, userId, deviceFingerprint, ipAddress, userAgent } = data;

  // Get load
  const load = await loadModel.findById(loadId);

  if (!load) {
    throw new LoadNotFoundError();
  }

  if (load.status !== 'published') {
    throw new BadRequestError('This load is not available for unlock', 'LOAD_NOT_PUBLISHED');
  }

  if (load.expires_at && new Date(load.expires_at) < new Date()) {
    throw new LoadExpiredError();
  }

  // Check if already unlocked
  const existingUnlock = await query(`
    SELECT * FROM contact_unlocks
    WHERE user_id = $1 AND load_id = $2 AND status = 'active' AND access_expires_at > NOW()
  `, [userId, loadId]);

  if (existingUnlock.rows.length > 0) {
    const unlock = existingUnlock.rows[0];
    const credits = await getUserCredits(userId);
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
      creditsRemaining: credits.totalCredits,
    };
  }

  // Check credits
  const creditConsumption = await consumeCredit(userId);
  if (!creditConsumption) {
    throw new InsufficientFundsError(
      'No unlock credits available. Purchase a bundle to unlock contacts.',
      'NO_CREDITS'
    );
  }

  // Create unlock record
  const expiresAt = new Date(Date.now() + PRICING_CONFIG.UNLOCK_DURATION_HOURS * 60 * 60 * 1000);

  const result = await query(`
    INSERT INTO contact_unlocks (
      user_id, load_id, unlock_bundle_id, price_at_unlock,
      phone, whatsapp, broker_name, broker_company, broker_email,
      access_expires_at, device_fingerprint, ip_address, user_agent, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
    RETURNING id, access_expires_at
  `, [
    userId,
    loadId,
    creditConsumption.bundleId,
    creditConsumption.bundleType === 'single' ? 3.50 : 0, // Track price for single vs bundle
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

  const unlock = result.rows[0];

  // Increment load unlock count
  await loadModel.incrementUnlockCount(loadId);

  // Get updated credits
  const credits = await getUserCredits(userId);

  // Send notification
  await notificationService.notifyLoadUnlocked(userId, load);

  logger.info('Contact unlocked via bundle', {
    unlockId: unlock.id,
    userId,
    loadId,
    bundleType: creditConsumption.bundleType,
    bundleId: creditConsumption.bundleId,
    creditsRemaining: credits.totalCredits,
  });

  return {
    unlockId: unlock.id,
    accessExpiresAt: new Date(unlock.access_expires_at),
    contact: {
      phone: load.parsed_phone || load.raw_phone,
      whatsapp: load.parsed_whatsapp || load.raw_whatsapp,
      brokerName: load.broker_name,
      brokerCompany: load.broker_company,
      brokerEmail: load.broker_email,
    },
    creditsRemaining: credits.totalCredits,
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

/**
 * Activate bundle after payment confirmation
 */
export const activateBundleAfterPayment = async (paymentId: string): Promise<void> => {
  const paymentResult = await query(
    'SELECT * FROM payments WHERE id = $1 AND status = $2 AND purpose = $3',
    [paymentId, 'confirmed', 'bundle_purchase']
  );

  const payment = paymentResult.rows[0];
  if (!payment) return;

  // Get pending bundle
  const bundleResult = await query(
    'SELECT * FROM unlock_bundles WHERE payment_id = $1 AND is_active = FALSE',
    [paymentId]
  );

  const bundle = bundleResult.rows[0];
  if (!bundle) return;

  // Activate bundle
  await query(`
    UPDATE unlock_bundles
    SET is_active = TRUE,
        unlocks_remaining = total_unlocks
    WHERE id = $1
  `, [bundle.id]);

  logger.info('Bundle activated after payment', { bundleId: bundle.id, paymentId });
};

/**
 * Get user's purchased bundles
 */
export const getUserBundles = async (userId: string): Promise<any[]> => {
  const result = await query(`
    SELECT
      ub.*,
      p.status as payment_status,
      p.created_at as purchased_at
    FROM unlock_bundles ub
    JOIN payments p ON ub.payment_id = p.id
    WHERE ub.user_id = $1
    ORDER BY ub.created_at DESC
  `, [userId]);

  return result.rows.map(row => ({
    id: row.id,
    publicId: row.public_id,
    bundleType: row.bundle_type,
    bundleName: row.bundle_name,
    totalUnlocks: row.total_unlocks,
    unlocksRemaining: row.unlocks_remaining,
    unlocksUsed: row.unlocks_used,
    pricePaid: row.price_paid,
    isActive: row.is_active,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    paymentStatus: row.payment_status,
  }));
};

export default {
  calculateUnlockPrice,
  getUnlockPrice,
  getUserCredits,
  purchaseBundle,
  unlockContact,
  checkUnlockStatus,
  getUserUnlocks,
  expireOldUnlocks,
  getUnlockCountByUser,
  activateUnlockAfterPayment,
  activateBundleAfterPayment,
  getUserBundles,
};
