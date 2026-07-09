import { query, transaction } from '../database/pool.js';
import * as loadModel from '../models/load.js';
import * as aiService from './ai.js';
import logger from '../utils/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';

/**
 * Admin Service
 * Admin panel operations
 */

/**
 * Check if user is admin
 */
export const requireAdmin = (user) => {
  if (!user || user.role !== 'admin') {
    throw new ForbiddenError('Admin access required', 'ADMIN_REQUIRED');
  }
  return true;
};

/**
 * Get admin stats overview
 */
export const getAdminStats = async () => {
  // Load stats
  const loadStatsResult = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'published') as published,
      COUNT(*) FILTER (WHERE status = 'expired') as expired,
      COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today
    FROM loads
  `);

  // User stats
  const userStatsResult = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_this_week,
      COUNT(*) FILTER (WHERE last_login > NOW() - INTERVAL '24 hours') as logged_in_today
    FROM users
  `);

  // Revenue stats
  const revenueResult = await query(`
    SELECT
      COALESCE(SUM(amount), 0) as total_revenue,
      COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'), 0) as revenue_this_week,
      COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 0) as revenue_this_month,
      COUNT(*) as total_transactions,
      COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_transactions
    FROM payments
    WHERE status = 'confirmed'
  `);

  // Unlock stats
  const unlockStatsResult = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as this_month
    FROM contact_unlocks
  `);

  // Marketplace stats
  const marketplaceStatsResult = await query(`
    SELECT
      COUNT(*) as total_items,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'approved') as approved,
      COUNT(*) FILTER (WHERE status = 'sold') as sold
    FROM marketplace_items
  `).catch(() => ({ rows: [{ total_items: 0, pending: 0, approved: 0, sold: 0 }] }));

  return {
    loads: loadStatsResult.rows[0],
    users: userStatsResult.rows[0],
    revenue: revenueResult.rows[0],
    unlocks: unlockStatsResult.rows[0],
    marketplace: marketplaceStatsResult.rows[0],
  };
};

/**
 * Get pending loads for review
 */
export const getPendingLoads = async (options = {}) => {
  const { page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  const result = await query(`
    SELECT
      l.*,
      u.email as posted_by_email,
      u.first_name as posted_by_name
    FROM loads l
    LEFT JOIN users u ON l.created_by = u.id
    WHERE l.status IN ('pending', 'under_review')
    ORDER BY l.created_at ASC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM loads WHERE status IN ('pending', 'under_review')
  `);

  return {
    loads: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    page,
    limit,
  };
};

/**
 * Get all loads with filters
 */
export const getLoads = async (options = {}) => {
  const { page = 1, limit = 20, status, search } = options;
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`l.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (search) {
    conditions.push(`(
      l.origin_raw ILIKE $${paramIndex}
      OR l.destination_raw ILIKE $${paramIndex}
      OR l.cargo_type ILIKE $${paramIndex}
      OR l.public_id ILIKE $${paramIndex}
    )`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(`
    SELECT
      l.*,
      u.email as posted_by_email
    FROM loads l
    LEFT JOIN users u ON l.created_by = u.id
    ${whereClause}
    ORDER BY l.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM loads l ${whereClause}
  `, params);

  return {
    loads: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    page,
    limit,
  };
};

/**
 * Approve a load
 */
export const approveLoad = async (loadId, adminId, options = {}) => {
  const load = await loadModel.findById(loadId);
  if (!load) {
    throw new NotFoundError('Load not found', 'LOAD_NOT_FOUND');
  }

  const updates = {
    status: 'published',
    published_at: new Date(),
    reviewed_by: adminId,
    reviewed_at: new Date(),
  };

  // Apply any edits provided
  if (options.edits) {
    Object.assign(updates, options.edits);
  }

  const result = await loadModel.update(loadId, updates);

  // Log admin action
  await logAdminAction(adminId, 'approve_load', 'load', loadId, {
    oldStatus: load.status,
    newStatus: 'published',
  });

  logger.info('Load approved', { loadId, adminId });

  return result;
};

/**
 * Reject a load
 */
export const rejectLoad = async (loadId, adminId, reason) => {
  const load = await loadModel.findById(loadId);
  if (!load) {
    throw new NotFoundError('Load not found', 'LOAD_NOT_FOUND');
  }

  const result = await loadModel.update(loadId, {
    status: 'rejected',
    reviewed_by: adminId,
    reviewed_at: new Date(),
    rejection_reason: reason,
  });

  await logAdminAction(adminId, 'reject_load', 'load', loadId, {
    oldStatus: load.status,
    reason,
  });

  logger.info('Load rejected', { loadId, adminId, reason });

  return result;
};

/**
 * Edit a load (full edit of all fields)
 */
export const editLoad = async (loadId, adminId, updates) => {
  const load = await loadModel.findById(loadId);
  if (!load) {
    throw new NotFoundError('Load not found', 'LOAD_NOT_FOUND');
  }

  const allowedFields = [
    'origin_raw', 'destination_raw', 'origin_country', 'destination_country',
    'cargo_type', 'truck_type', 'weight_kg', 'number_of_trucks',
    'pickup_date', 'delivery_date', 'price', 'currency', 'price_negotiable',
    'price_per_ton', 'description', 'is_hazardous', 'hazardous_class',
    'parsed_phone', 'parsed_whatsapp', 'broker_name', 'broker_company',
    'status', 'border_crossing', 'special_requirements',
  ];

  const filteredUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = value;
    }
  }

  filteredUpdates.updated_at = new Date();
  filteredUpdates.edited_by = adminId;
  filteredUpdates.edited_at = new Date();

  const result = await loadModel.update(loadId, filteredUpdates);

  await logAdminAction(adminId, 'edit_load', 'load', loadId, {
    oldValues: load,
    newValues: filteredUpdates,
  });

  logger.info('Load edited', { loadId, adminId, fields: Object.keys(filteredUpdates) });

  return result;
};

/**
 * Delete a load
 */
export const deleteLoad = async (loadId, adminId, reason) => {
  const load = await loadModel.findById(loadId);
  if (!load) {
    throw new NotFoundError('Load not found', 'LOAD_NOT_FOUND');
  }

  await logAdminAction(adminId, 'delete_load', 'load', loadId, {
    loadDetails: load,
    reason,
  });

  await loadModel.remove(loadId);

  logger.info('Load deleted', { loadId, adminId, reason });

  return { success: true };
};

/**
 * Get users list
 */
export const getUsers = async (options = {}) => {
  const { page = 1, limit = 20, search, role } = options;
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (search) {
    conditions.push(`(
      email ILIKE $${paramIndex}
      OR first_name ILIKE $${paramIndex}
      OR last_name ILIKE $${paramIndex}
    )`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (role) {
    conditions.push(`role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(`
    SELECT
      id, email, first_name, last_name, role, is_active,
      created_at, last_login, phone
    FROM users
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM users ${whereClause}
  `, params);

  return {
    users: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    page,
    limit,
  };
};

/**
 * Parse bulk chain messages
 */
export const parseBulkMessages = async (messages, adminId) => {
  // Try Gemini bulk parsing
  const parsed = await aiService.parseBulkMessages(messages);

  await logAdminAction(adminId, 'bulk_parse', 'bulk_import', null, {
    inputLength: messages.length,
    resultsCount: parsed.loads?.length || 0,
    confidence: parsed.confidence,
  });

  return parsed;
};

/**
 * Bulk create loads from parsed messages
 */
export const bulkCreateLoads = async (loads, adminId) => {
  const created = [];

  await transaction(async (client) => {
    for (const loadData of loads) {
      const result = await client.query(`
        INSERT INTO loads (
          origin_raw, destination_raw, origin_country, destination_country,
          cargo_type, truck_type, weight_kg, number_of_trucks,
          pickup_date, delivery_date, price, currency, price_negotiable,
          parsed_phone, parsed_whatsapp, broker_name, broker_company,
          status, created_by, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'published', $18, NOW())
        RETURNING id, public_id
      `, [
        loadData.origin,
        loadData.destination,
        loadData.originCountry,
        loadData.destinationCountry,
        loadData.cargoType,
        loadData.truckType,
        loadData.weightKg,
        loadData.numberOfTrucks || 1,
        loadData.pickupDate,
        loadData.deliveryDate,
        loadData.price,
        loadData.currency || 'USD',
        loadData.priceNegotiable || false,
        loadData.contactPhone,
        loadData.contactWhatsapp,
        loadData.brokerName,
        loadData.brokerCompany,
        adminId,
      ]);

      created.push(result.rows[0]);
    }
  });

  await logAdminAction(adminId, 'bulk_create', 'loads', null, {
    count: created.length,
    loadIds: created.map(l => l.id),
  });

  logger.info('Bulk loads created', { count: created.length, adminId });

  return created;
};

/**
 * Get load details for editing
 */
export const getLoadDetails = async (loadId) => {
  const load = await loadModel.findById(loadId);
  if (!load) {
    throw new NotFoundError('Load not found', 'LOAD_NOT_FOUND');
  }
  return load;
};

/**
 * Log admin action
 */
const logAdminAction = async (adminId, action, entityType, entityId, details) => {
  try {
    await query(`
      INSERT INTO admin_action_logs (
        admin_id, action, entity_type, entity_id, old_values, new_values
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      adminId,
      action,
      entityType,
      entityId,
      details.oldValues ? JSON.stringify(details.oldValues) : null,
      details.newValues || details,
    ]);
  } catch (error) {
    logger.error('Failed to log admin action', { error: error.message, adminId, action });
  }
};

export default {
  requireAdmin,
  getAdminStats,
  getPendingLoads,
  getLoads,
  approveLoad,
  rejectLoad,
  editLoad,
  deleteLoad,
  getUsers,
  parseBulkMessages,
  bulkCreateLoads,
  getLoadDetails,
};
