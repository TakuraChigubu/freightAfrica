import { query } from '../database/pool.js';
import * as unlockService from './unlock.js';
import logger from '../utils/logger.js';

/**
 * Dashboard Service
 * User dashboard stats and activity
 */

/**
 * Get user dashboard overview
 */
export const getUserDashboard = async (userId) => {
  // Get credit balance
  const credits = await unlockService.getUserCredits(userId);

  // Get unlock stats
  const unlockStatsResult = await query(`
    SELECT
      COUNT(*) as total_unlocks,
      COUNT(*) FILTER (WHERE status = 'active' AND access_expires_at > NOW()) as active_unlocks,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as unlocks_this_week,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as unlocks_this_month
    FROM contact_unlocks
    WHERE user_id = $1
  `, [userId]);

  const unlockStats = unlockStatsResult.rows[0];

  // Get marketplace unlocks if applicable
  const marketplaceStatsResult = await query(`
    SELECT
      COUNT(*) as total_unlocks,
      COUNT(*) FILTER (WHERE access_expires_at > NOW()) as active_unlocks
    FROM marketplace_unlocks
    WHERE user_id = $1
  `, [userId]).catch(() => ({ rows: [{ total_unlocks: 0, active_unlocks: 0 }] }));

  const marketplaceStats = marketplaceStatsResult.rows[0];

  // Get bundle purchase history summary
  const bundleSummaryResult = await query(`
    SELECT
      COUNT(*) as total_bundles,
      SUM(total_unlocks) as total_unlocks_purchased,
      SUM(unlocks_used) as total_unlocks_used,
      SUM(price_paid) as total_spent
    FROM unlock_bundles
    WHERE user_id = $1
  `, [userId]);

  const bundleSummary = bundleSummaryResult.rows[0];

  // Get recent loads viewed (from load views if tracked)
  const recentActivityResult = await query(`
    SELECT
      l.id,
      l.public_id,
      l.origin_raw as origin,
      l.destination_raw as destination,
      l.cargo_type,
      l.created_at
    FROM loads l
    JOIN contact_unlocks cu ON cu.load_id = l.id
    WHERE cu.user_id = $1
    ORDER BY cu.created_at DESC
    LIMIT 5
  `, [userId]);

  return {
    credits: {
      total: credits.totalCredits,
      bundles: credits.activeBundles,
    },
    unlocks: {
      total: parseInt(unlockStats.total_unlocks || '0', 10),
      active: parseInt(unlockStats.active_unlocks || '0', 10),
      thisWeek: parseInt(unlockStats.unlocks_this_week || '0', 10),
      thisMonth: parseInt(unlockStats.unlocks_this_month || '0', 10),
    },
    marketplace: {
      total: parseInt(marketplaceStats.total_unlocks || '0', 10),
      active: parseInt(marketplaceStats.active_unlocks || '0', 10),
    },
    purchases: {
      totalBundles: parseInt(bundleSummary.total_bundles || '0', 10),
      totalUnlocks: parseInt(bundleSummary.total_unlocks_purchased || '0', 10),
      totalUsed: parseInt(bundleSummary.total_unlocks_used || '0', 10),
      totalSpent: parseFloat(bundleSummary.total_spent || '0'),
    },
    recentActivity: recentActivityResult.rows,
  };
};

/**
 * Get user activity feed
 */
export const getUserActivity = async (userId, options = {}) => {
  const { page = 1, limit = 20, type } = options;
  const offset = (page - 1) * limit;

  let activities = [];

  // Get unlock activities
  if (!type || type === 'unlock') {
    const unlockResult = await query(`
      SELECT
        'unlock' as type,
        cu.id,
        cu.created_at,
        cu.access_expires_at,
        l.public_id as load_id,
        l.origin_raw as origin,
        l.destination_raw as destination,
        l.cargo_type
      FROM contact_unlocks cu
      JOIN loads l ON cu.load_id = l.id
      WHERE cu.user_id = $1
      ORDER BY cu.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    activities = activities.concat(unlockResult.rows.map(row => ({
      type: 'load_unlock',
      id: row.id,
      createdAt: row.created_at,
      data: {
        loadId: row.load_id,
        origin: row.origin,
        destination: row.destination,
        cargoType: row.cargo_type,
        expiresAt: row.access_expires_at,
      },
    })));
  }

  // Get purchase activities
  if (!type || type === 'purchase') {
    const purchaseResult = await query(`
      SELECT
        'purchase' as type,
        p.id,
        p.created_at,
        p.amount,
        p.currency,
        p.status,
        ub.bundle_name,
        ub.total_unlocks
      FROM payments p
      JOIN unlock_bundles ub ON ub.payment_id = p.id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    activities = activities.concat(purchaseResult.rows.map(row => ({
      type: 'bundle_purchase',
      id: row.id,
      createdAt: row.created_at,
      data: {
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        bundleName: row.bundle_name,
        totalUnlocks: row.total_unlocks,
      },
    })));
  }

  // Sort by created_at desc
  activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return activities.slice(0, limit);
};

export default {
  getUserDashboard,
  getUserActivity,
};
