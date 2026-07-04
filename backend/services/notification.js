import { query } from '../database/pool.js';
import logger from '../utils/logger.js';

/**
 * Notification Service
 * Handles user notifications and preferences
 */

/**
 * Create notification preferences for a user
 */
export const createNotificationPreferences = async (userId: string): Promise<any> => {
  const sql = `
    INSERT INTO notification_preferences (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING *
  `;
  const result = await query(sql, [userId]);
  return result.rows[0];
};

/**
 * Get notification preferences
 */
export const getNotificationPreferences = async (userId: string): Promise<any | null> => {
  const sql = `
    SELECT * FROM notification_preferences WHERE user_id = $1
  `;
  const result = await query(sql, [userId]);
  return result.rows[0] || null;
};

/**
 * Update notification preferences
 */
export const updateNotificationPreferences = async (
  userId: string,
  preferences: {
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    pushEnabled?: boolean;
    inAppEnabled?: boolean;
    whatsappEnabled?: boolean;
    preferences?: object;
  }
): Promise<any> => {
  const updates: string[] = [];
  const params: any[] = [userId];
  let paramCount = 2;

  const fieldMapping: Record<string, string> = {
    emailEnabled: 'email_enabled',
    smsEnabled: 'sms_enabled',
    pushEnabled: 'push_enabled',
    inAppEnabled: 'in_app_enabled',
    whatsappEnabled: 'whatsapp_enabled',
  };

  for (const [key, value] of Object.entries(preferences)) {
    if (key === 'preferences') {
      updates.push(`preferences = $${paramCount++}`);
      params.push(JSON.stringify(value));
    } else if (fieldMapping[key] !== undefined) {
      updates.push(`${fieldMapping[key]} = $${paramCount++}`);
      params.push(value);
    }
  }

  if (updates.length === 0) {
    return getNotificationPreferences(userId);
  }

  const sql = `
    UPDATE notification_preferences
    SET ${updates.join(', ')}
    WHERE user_id = $1
    RETURNING *
  `;

  const result = await query(sql, params);
  return result.rows[0];
};

/**
 * Create a notification
 */
export const createNotification = async (data: {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: object;
  sentVia?: string[];
}): Promise<any> => {
  const sql = `
    INSERT INTO notifications (user_id, type, title, message, data, sent_via)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const result = await query(sql, [
    data.userId,
    data.type,
    data.title,
    data.message,
    JSON.stringify(data.data || {}),
    data.sentVia || ['in_app'],
  ]);

  const notification = result.rows[0];

  // TODO: Send to push notification service
  // TODO: Send email if email enabled

  logger.info('Notification created', {
    notificationId: notification.id,
    userId: data.userId,
    type: data.type,
  });

  return notification;
};

/**
 * Get notifications for a user
 */
export const getNotifications = async (
  userId: string,
  options: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    type?: string;
  } = {}
): Promise<{ notifications: any[]; total: number; unreadCount: number }> => {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false,
    type,
  } = options;

  const offset = (page - 1) * limit;
  const conditions: string[] = ['user_id = $1'];
  const params: any[] = [userId];
  let paramCount = 2;

  if (unreadOnly) {
    conditions.push('read = FALSE');
  }

  if (type) {
    conditions.push(`type = $${paramCount++}`);
    params.push(type);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM notifications ${whereClause}`;
  const countResult = await query(countSql, params);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get unread count
  const unreadSql = `
    SELECT COUNT(*) as unread_count
    FROM notifications
    WHERE user_id = $1 AND read = FALSE
  `;
  const unreadResult = await query(unreadSql, [userId]);
  const unreadCount = parseInt(unreadResult.rows[0]?.unread_count ?? '0', 10);

  // Get notifications
  const sql = `
    SELECT * FROM notifications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  params.push(limit, offset);
  const result = await query(sql, params);

  return {
    notifications: result.rows,
    total,
    unreadCount,
  };
};

/**
 * Mark notification as read
 */
export const markAsRead = async (notificationId: string, userId: string): Promise<boolean> => {
  const sql = `
    UPDATE notifications
    SET read = TRUE, read_at = NOW()
    WHERE id = $1 AND user_id = $2
  `;
  const result = await query(sql, [notificationId, userId]);
  return (result.rowCount ?? 0) > 0;
};

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (userId: string): Promise<number> => {
  const sql = `
    UPDATE notifications
    SET read = TRUE, read_at = NOW()
    WHERE user_id = $1 AND read = FALSE
  `;
  const result = await query(sql, [userId]);
  return result.rowCount ?? 0;
};

/**
 * Delete notification
 */
export const deleteNotification = async (notificationId: string, userId: string): Promise<boolean> => {
  const sql = `
    DELETE FROM notifications
    WHERE id = $1 AND user_id = $2
  `;
  const result = await query(sql, [notificationId, userId]);
  return (result.rowCount ?? 0) > 0;
};

/**
 * Delete old notifications (cleanup)
 */
export const deleteOldNotifications = async (daysOld: number = 90): Promise<number> => {
  const sql = `
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '${daysOld} days'
  `;
  const result = await query(sql);
  return result.rowCount ?? 0;
};

// Notification type helpers

export const notifyLoadPublished = async (userId: string, load: any) => {
  return createNotification({
    userId,
    type: 'load_published',
    title: 'Load Published',
    message: `Your load from ${load.origin_raw} to ${load.destination_raw} has been published.`,
    data: { loadId: load.id },
  });
};

export const notifyLoadUnlocked = async (userId: string, load: any) => {
  return createNotification({
    userId,
    type: 'load_unlocked',
    title: 'Contact Unlocked',
    message: `You unlocked contact details for load ${load.public_id}.`,
    data: { loadId: load.id },
    sentVia: ['in_app', 'email'],
  });
};

export const notifyPaymentReceived = async (userId: string, amount: number, paymentId: string) => {
  return createNotification({
    userId,
    type: 'payment_received',
    title: 'Payment Received',
    message: `Your payment of $${amount.toFixed(2)} has been confirmed.`,
    data: { amount, paymentId },
    sentVia: ['in_app', 'email'],
  });
};

export const notifyWalletCredited = async (userId: string, amount: number, balance: number) => {
  return createNotification({
    userId,
    type: 'wallet_credited',
    title: 'Wallet Credited',
    message: `Your wallet has been credited with $${amount.toFixed(2)}. New balance: $${balance.toFixed(2)}`,
    sentVia: ['in_app'],
  });
};

export const notifyDisputeUpdate = async (userId: string, dispute: any, status: string) => {
  return createNotification({
    userId,
    type: 'dispute_update',
    title: 'Dispute Update',
    message: `Your dispute #${dispute.public_id} status: ${status}`,
    data: { disputeId: dispute.id },
    sentVia: ['in_app', 'email'],
  });
};

export default {
  createNotificationPreferences,
  getNotificationPreferences,
  updateNotificationPreferences,
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteOldNotifications,
  notifyLoadPublished,
  notifyLoadUnlocked,
  notifyPaymentReceived,
  notifyWalletCredited,
  notifyDisputeUpdate,
};
