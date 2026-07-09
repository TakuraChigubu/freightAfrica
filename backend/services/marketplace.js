import { query } from '../database/pool.js';
import * as unlockService from './unlock.js';
import { PRICING_CONFIG } from './pricing.js';
import logger from '../utils/logger.js';
import { BadRequestError, NotFoundError, InsufficientFundsError } from '../utils/errors.js';

/**
 * Marketplace Service
 * Handles marketplace items for goods, vehicles, equipment
 */

/**
 * Create a marketplace listing
 */
export const createItem = async (userId, data) => {
  const result = await query(`
    INSERT INTO marketplace_items (
      seller_id, title, description, category, price, price_negotiable, currency,
      location, country, contact_phone, contact_whatsapp, contact_email,
      image_urls, attributes, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
    RETURNING *
  `, [
    userId,
    data.title,
    data.description,
    data.category,
    data.price,
    data.priceNegotiable || false,
    data.currency || 'USD',
    data.location,
    data.country,
    data.contactPhone,
    data.contactWhatsapp,
    data.contactEmail,
    data.imageUrls || [],
    data.attributes || {},
  ]);

  logger.info('Marketplace item created', {
    itemId: result.rows[0].id,
    userId,
    category: data.category,
  });

  return result.rows[0];
};

/**
 * Get marketplace items with filters
 */
export const getItems = async (options = {}) => {
  const {
    page = 1,
    limit = 20,
    category,
    search,
    country,
    minPrice,
    maxPrice,
    status = 'approved',
  } = options;
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (country) {
    conditions.push(`country = $${paramIndex}`);
    params.push(country);
    paramIndex++;
  }

  if (minPrice !== undefined) {
    conditions.push(`price >= $${paramIndex}`);
    params.push(minPrice);
    paramIndex++;
  }

  if (maxPrice !== undefined) {
    conditions.push(`price <= $${paramIndex}`);
    params.push(maxPrice);
    paramIndex++;
  }

  if (search) {
    conditions.push(`(
      title ILIKE $${paramIndex}
      OR description ILIKE $${paramIndex}
      OR location ILIKE $${paramIndex}
    )`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(`
    SELECT
      id, public_id, seller_id, title, description, category,
      price, price_negotiable, currency, location, country,
      image_urls, view_count, unlock_count, created_at, expires_at
    FROM marketplace_items
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM marketplace_items ${whereClause}
  `, params);

  return {
    items: result.rows.map(row => ({
      id: row.id,
      publicId: row.public_id,
      sellerId: row.seller_id,
      title: row.title,
      description: row.description,
      category: row.category,
      price: row.price,
      priceNegotiable: row.price_negotiable,
      currency: row.currency,
      location: row.location,
      country: row.country,
      imageUrls: row.image_urls,
      viewCount: row.view_count,
      unlockCount: row.unlock_count,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    })),
    total: parseInt(countResult.rows[0].total, 10),
    page,
    limit,
  };
};

/**
 * Get single marketplace item
 */
export const getItemById = async (itemId) => {
  const result = await query(`
    SELECT * FROM marketplace_items WHERE id = $1
  `, [itemId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Increment view count
  await query(`
    UPDATE marketplace_items SET view_count = view_count + 1 WHERE id = $1
  `, [itemId]);

  return {
    id: row.id,
    publicId: row.public_id,
    sellerId: row.seller_id,
    title: row.title,
    description: row.description,
    category: row.category,
    price: row.price,
    priceNegotiable: row.price_negotiable,
    currency: row.currency,
    location: row.location,
    country: row.country,
    imageUrls: row.image_urls,
    attributes: row.attributes,
    viewCount: row.view_count + 1,
    unlockCount: row.unlock_count,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
};

/**
 * Unlock marketplace item contact
 * Uses the same credit system as loads
 */
export const unlockItemContact = async (userId, itemId, options = {}) => {
  const { deviceFingerprint, ipAddress, userAgent } = options;

  // Check if item exists and is approved
  const itemResult = await query(`
    SELECT * FROM marketplace_items WHERE id = $1 AND status = 'approved'
  `, [itemId]);

  if (itemResult.rows.length === 0) {
    throw new NotFoundError('Marketplace item not found', 'ITEM_NOT_FOUND');
  }

  const item = itemResult.rows[0];

  // Check if already unlocked
  const existingUnlock = await query(`
    SELECT * FROM marketplace_unlocks
    WHERE user_id = $1 AND item_id = $2 AND access_expires_at > NOW()
  `, [userId, itemId]);

  if (existingUnlock.rows.length > 0) {
    const unlock = existingUnlock.rows[0];
    return {
      unlockId: unlock.id,
      accessExpiresAt: new Date(unlock.access_expires_at),
      contact: {
        phone: item.contact_phone,
        whatsapp: item.contact_whatsapp,
        email: item.contact_email,
      },
      item: {
        id: item.id,
        title: item.title,
        category: item.category,
      },
    };
  }

  // Consume credit
  const creditConsumption = await unlockService.consumeCredit(userId);
  if (!creditConsumption) {
    throw new InsufficientFundsError(
      'No unlock credits available. Purchase a bundle to unlock contacts.',
      'NO_CREDITS'
    );
  }

  // Create unlock record
  const expiresAt = new Date(Date.now() + PRICING_CONFIG.UNLOCK_DURATION_HOURS * 60 * 60 * 1000);

  const result = await query(`
    INSERT INTO marketplace_unlocks (
      item_id, user_id, unlock_bundle_id, price_at_unlock,
      device_fingerprint, ip_address, user_agent, access_expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, access_expires_at
  `, [
    itemId,
    userId,
    creditConsumption.bundleId,
    creditConsumption.bundleType === 'single' ? 3.50 : 0,
    deviceFingerprint,
    ipAddress,
    userAgent,
    expiresAt,
  ]);

  // Increment unlock count
  await query(`
    UPDATE marketplace_items SET unlock_count = unlock_count + 1 WHERE id = $1
  `, [itemId]);

  const unlock = result.rows[0];

  logger.info('Marketplace item unlocked', {
    unlockId: unlock.id,
    userId,
    itemId,
    bundleType: creditConsumption.bundleType,
  });

  return {
    unlockId: unlock.id,
    accessExpiresAt: new Date(unlock.access_expires_at),
    contact: {
      phone: item.contact_phone,
      whatsapp: item.contact_whatsapp,
      email: item.contact_email,
    },
    item: {
      id: item.id,
      title: item.title,
      category: item.category,
    },
  };
};

/**
 * Approve marketplace item (admin)
 */
export const approveItem = async (itemId) => {
  const result = await query(`
    UPDATE marketplace_items
    SET status = 'approved', updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [itemId]);

  return result.rows[0];
};

/**
 * Reject marketplace item (admin)
 */
export const rejectItem = async (itemId, reason) => {
  const result = await query(`
    UPDATE marketplace_items
    SET status = 'rejected', updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [itemId]);

  return result.rows[0];
};

export default {
  createItem,
  getItems,
  getItemById,
  unlockItemContact,
  approveItem,
  rejectItem,
};
