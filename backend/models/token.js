import { query } from '../database/pool.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';

/**
 * Token Model - Database operations for tokens
 * Email verification, password reset, and refresh tokens
 */

/**
 * Create email verification token
 */
export const createEmailVerificationToken = async (userId: string): Promise<{ id: string; token: string; expiresAt: Date }> => {
  // Generate secure token
  const token = uuidv4() + '_' + uuidv4().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const sql = `
    INSERT INTO email_verification_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, token, expires_at
  `;

  const result = await query(sql, [userId, token, expiresAt]);
  return result.rows[0];
};

/**
 * Consume email verification token (validates and marks as used)
 */
export const consumeEmailVerificationToken = async (token: string): Promise<{ id: string; user_id: string } | null> => {
  const sql = `
    UPDATE email_verification_tokens
    SET used_at = NOW()
    WHERE token = $1
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING id, user_id
  `;

  const result = await query(sql, [token]);
  return result.rows[0] || null;
};

/**
 * Delete expired verification tokens
 */
export const deleteExpiredVerificationTokens = async (): Promise<number> => {
  const sql = `
    DELETE FROM email_verification_tokens
    WHERE expires_at < NOW() OR used_at IS NOT NULL
  `;
  const result = await query(sql);
  return result.rowCount ?? 0;
};

/**
 * Create password reset token
 */
export const createPasswordResetToken = async (userId: string): Promise<{ id: string; token: string; expiresAt: Date }> => {
  // Generate secure token
  const token = uuidv4() + '_' + uuidv4().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Invalidate any existing tokens for this user
  await query(
    'DELETE FROM password_reset_tokens WHERE user_id = $1',
    [userId]
  );

  const sql = `
    INSERT INTO password_reset_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, token, expires_at
  `;

  const result = await query(sql, [userId, token, expiresAt]);
  return result.rows[0];
};

/**
 * Consume password reset token
 */
export const consumePasswordResetToken = async (token: string): Promise<{ id: string; user_id: string } | null> => {
  const sql = `
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE token = $1
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING id, user_id
  `;

  const result = await query(sql, [token]);
  return result.rows[0] || null;
};

/**
 * Delete expired reset tokens
 */
export const deleteExpiredResetTokens = async (): Promise<number> => {
  const sql = `
    DELETE FROM password_reset_tokens
    WHERE expires_at < NOW() OR used_at IS NOT NULL
  `;
  const result = await query(sql);
  return result.rowCount ?? 0;
};

/**
 * Create refresh token (database backup)
 */
export const createRefreshToken = async (
  userId: string,
  token: string,
  expiresAt: number,
  deviceInfo?: any,
  ipAddress?: string
): Promise<{ id: string; tokenHash: string }> => {
  // Create hash of token for storage
  const tokenHash = await bcrypt.hash(token, 10);

  const sql = `
    INSERT INTO refresh_tokens (
      user_id, token_hash, device_info, ip_address, expires_at
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id, token_hash
  `;

  const result = await query(sql, [
    userId,
    tokenHash,
    JSON.stringify(deviceInfo || {}),
    ipAddress || null,
    new Date(expiresAt),
  ]);

  return result.rows[0];
};

/**
 * Find refresh token by ID
 */
export const findRefreshToken = async (id: string): Promise<any | null> => {
  const sql = `
    SELECT * FROM refresh_tokens
    WHERE id = $1 AND revoked = FALSE AND expires_at > NOW()
  `;
  const result = await query(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Find all active refresh tokens for a user
 */
export const findUserRefreshTokens = async (userId: string): Promise<any[]> => {
  const sql = `
    SELECT id, device_info, ip_address, created_at, expires_at
    FROM refresh_tokens
    WHERE user_id = $1
      AND revoked = FALSE
      AND expires_at > NOW()
    ORDER BY created_at DESC
  `;
  const result = await query(sql, [userId]);
  return result.rows;
};

/**
 * Revoke a refresh token
 */
export const revokeToken = async (tokenId: string, reason?: string): Promise<boolean> => {
  const sql = `
    UPDATE refresh_tokens
    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
    WHERE id = $1
  `;
  const result = await query(sql, [tokenId, reason || 'logout']);
  return (result.rowCount ?? 0) > 0;
};

/**
 * Revoke all refresh tokens for a user
 */
export const revokeAllUserTokens = async (userId: string, reason?: string): Promise<number> => {
  const sql = `
    UPDATE refresh_tokens
    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
    WHERE user_id = $1 AND revoked = FALSE
  `;
  const result = await query(sql, [userId, reason || 'logout_all']);
  return result.rowCount ?? 0;
};

/**
 * Revoke tokens by device fingerprint
 */
export const revokeTokensByDevice = async (userId: string, deviceFingerprint: string): Promise<number> => {
  const sql = `
    UPDATE refresh_tokens
    SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'device_revoke'
    WHERE user_id = $1
      AND revoked = FALSE
      AND device_info->>'fingerprint' = $2
  `;
  const result = await query(sql, [userId, deviceFingerprint]);
  return result.rowCount ?? 0;
};

/**
 * Delete expired refresh tokens
 */
export const deleteExpiredRefreshTokens = async (): Promise<number> => {
  const sql = `
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW() OR revoked = TRUE
  `;
  const result = await query(sql);
  return result.rowCount ?? 0;
};

/**
 * Count active sessions for a user
 */
export const countActiveSessions = async (userId: string): Promise<number> => {
  const sql = `
    SELECT COUNT(*) as count
    FROM refresh_tokens
    WHERE user_id = $1
      AND revoked = FALSE
      AND expires_at > NOW()
  `;
  const result = await query(sql, [userId]);
  return parseInt(result.rows[0]?.count ?? '0', 10);
};

/**
 * Verify refresh token against stored hash
 */
export const verifyRefreshTokenHash = async (
  storedToken: any,
  providedToken: string
): Promise<boolean> => {
  if (!storedToken || storedToken.revoked) {
    return false;
  }

  return bcrypt.compare(providedToken, storedToken.token_hash);
};

/**
 * Cleanup job - delete all expired tokens across all token tables
 */
export const cleanupExpiredTokens = async (): Promise<{
  verificationTokensDeleted: number;
  resetTokensDeleted: number;
  refreshTokensDeleted: number;
}> => {
  const verificationTokensDeleted = await deleteExpiredVerificationTokens();
  const resetTokensDeleted = await deleteExpiredResetTokens();
  const refreshTokensDeleted = await deleteExpiredRefreshTokens();

  logger.info('Token cleanup completed', {
    verificationTokensDeleted,
    resetTokensDeleted,
    refreshTokensDeleted,
  });

  return {
    verificationTokensDeleted,
    resetTokensDeleted,
    refreshTokensDeleted,
  };
};

export default {
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  deleteExpiredVerificationTokens,
  createPasswordResetToken,
  consumePasswordResetToken,
  deleteExpiredResetTokens,
  createRefreshToken,
  findRefreshToken,
  findUserRefreshTokens,
  revokeToken,
  revokeAllUserTokens,
  revokeTokensByDevice,
  deleteExpiredRefreshTokens,
  countActiveSessions,
  verifyRefreshTokenHash,
  cleanupExpiredTokens,
};
