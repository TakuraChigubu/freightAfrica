import { query, transaction } from '../database/pool.js';
import logger from '../utils/logger.js';

/**
 * User Model - Database operations for users
 * All methods use parameterized SQL queries
 */

interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  passwordHash: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  phoneVerified: boolean;
  phoneVerifiedAt: Date | null;
  status: string;
  googleId: string | null;
  googleData: object | null;
  locale: string;
  timezone: string;
  roleId: string;
  organisationId: string | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  loginCount: number;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  metadata: object;
  preferences: object;
  createdAt: Date;
  updatedAt: Date;
}

interface UserWithRole extends User {
  roleName: string;
  roleLevel: number;
  isSystemRole: boolean;
}

interface UserWithPermissions extends UserWithRole {
  permissions: string[];
}

/**
 * Find user by ID
 */
export const findById = async (id: string): Promise<User | null> => {
  const sql = `
    SELECT * FROM users
    WHERE id = $1
  `;
  const result = await query(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Find user by ID with role info
 */
export const findByIdWithRole = async (id: string): Promise<UserWithRole | null> => {
  const sql = `
    SELECT u.*, r.name as role_name, r.level as role_level, r.is_system_role
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = $1
  `;
  const result = await query(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Find user by ID with permissions
 */
export const findByIdWithPermissions = async (id: string): Promise<UserWithPermissions | null> => {
  const sql = `
    SELECT u.*, r.name as role_name, r.level as role_level, r.is_system_role,
           COALESCE(
             ARRAY_AGG(p.name) FILTER (WHERE p.name IS NOT NULL),
             ARRAY[]::VARCHAR[]
           ) as permissions
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    LEFT JOIN permissions p ON rp.permission_id = p.id
    WHERE u.id = $1
    GROUP BY u.id, r.id
  `;
  const result = await query(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Find user by email
 */
export const findByEmail = async (email: string): Promise<User | null> => {
  const sql = `
    SELECT * FROM users
    WHERE LOWER(email) = LOWER($1)
  `;
  const result = await query(sql, [email]);
  return result.rows[0] || null;
};

/**
 * Find user by Google ID
 */
export const findByGoogleId = async (googleId: string): Promise<User | null> => {
  const sql = `
    SELECT * FROM users
    WHERE google_id = $1
  `;
  const result = await query(sql, [googleId]);
  return result.rows[0] || null;
};

/**
 * Create new user
 */
export const create = async (data: {
  email: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  googleId?: string;
  googleData?: object;
  roleId?: string;
  organisationId?: string;
  locale?: string;
  status?: string;
  emailVerified?: boolean;
  metadata?: object;
}): Promise<User> => {
  // Get default 'Standard User' role if not specified
  let roleId = data.roleId;
  if (!roleId) {
    const roleResult = await query(
      "SELECT id FROM roles WHERE name = 'Standard User'"
    );
    roleId = roleResult.rows[0]?.id;
  }

  const sql = `
    INSERT INTO users (
      email, password_hash, first_name, last_name, phone,
      google_id, google_data, role_id, organisation_id,
      locale, status, email_verified, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `;

  const params = [
    data.email,
    data.passwordHash || null,
    data.firstName || null,
    data.lastName || null,
    data.phone || null,
    data.googleId || null,
    JSON.stringify(data.googleData || {}),
    roleId,
    data.organisationId || null,
    data.locale || 'en',
    data.status || 'pending',
    data.emailVerified || false,
    JSON.stringify(data.metadata || {}),
  ];

  const result = await query(sql, params);
  return result.rows[0];
};

/**
 * Update user
 */
export const update = async (id: string, data: Partial<{
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string;
  phone: string;
  timezone: string;
  locale: string;
  preferences: object;
  metadata: object;
  status: string;
  roleId: string;
  organisationId: string;
}>): Promise<User | null> => {
  const allowedFields = [
    'first_name', 'last_name', 'display_name', 'avatar_url', 'phone',
    'timezone', 'locale', 'preferences', 'metadata', 'status', 'role_id',
    'organisation_id'
  ];

  const updates: string[] = [];
  const params: any[] = [id];
  let paramCount = 1;

  const fieldMapping: Record<string, string> = {
    firstName: 'first_name',
    lastName: 'last_name',
    displayName: 'display_name',
    avatarUrl: 'avatar_url',
    phone: 'phone',
    timezone: 'timezone',
    locale: 'locale',
    preferences: 'preferences',
    metadata: 'metadata',
    status: 'status',
    roleId: 'role_id',
    organisationId: 'organisation_id',
  };

  for (const [key, value] of Object.entries(data)) {
    const dbField = fieldMapping[key];
    if (dbField && allowedFields.includes(dbField)) {
      paramCount++;
      let dbValue = value;
      if (typeof value === 'object' && value !== null) {
        dbValue = JSON.stringify(value);
      }
      updates.push(`${dbField} = $${paramCount}`);
      params.push(dbValue);
    }
  }

  if (updates.length === 0) {
    return findById(id);
  }

  const sql = `
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, params);
  return result.rows[0] || null;
};

/**
 * Update password
 */
export const updatePassword = async (id: string, passwordHash: string): Promise<boolean> => {
  const sql = `
    UPDATE users
    SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL
    WHERE id = $2
  `;
  const result = await query(sql, [passwordHash, id]);
  return (result.rowCount ?? 0) > 0;
};

/**
 * Verify email
 */
export const verifyEmail = async (id: string): Promise<boolean> => {
  const sql = `
    UPDATE users
    SET email_verified = TRUE, email_verified_at = NOW(), status = 'active'
    WHERE id = $1
  `;
  const result = await query(sql, [id]);
  return (result.rowCount ?? 0) > 0;
};

/**
 * Record successful login
 */
export const recordLogin = async (id: string, ipAddress: string): Promise<void> => {
  const sql = `
    UPDATE users
    SET last_login_at = NOW(),
        last_login_ip = $2,
        login_count = login_count + 1,
        failed_login_attempts = 0,
        locked_until = NULL
    WHERE id = $1
  `;
  await query(sql, [id, ipAddress]);
};

/**
 * Record failed login attempt
 */
export const recordFailedLogin = async (id: string, maxAttempts = 5, lockoutMinutes = 30): Promise<{ locked: boolean; attempts: number }> => {
  const sql = `
    UPDATE users
    SET failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE
          WHEN failed_login_attempts + 1 >= $2 THEN NOW() + INTERVAL '${lockoutMinutes} minutes'
          ELSE locked_until
        END
    WHERE id = $1
    RETURNING failed_login_attempts, locked_until
  `;
  const result = await query(sql, [id, maxAttempts]);
  const row = result.rows[0];
  return {
    locked: row?.locked_until !== null,
    attempts: row?.failed_login_attempts ?? 0,
  };
};

/**
 * Unlock user account
 */
export const unlockAccount = async (id: string): Promise<boolean> => {
  const sql = `
    UPDATE users
    SET failed_login_attempts = 0, locked_until = NULL
    WHERE id = $1
  `;
  const result = await query(sql, [id]);
  return (result.rowCount ?? 0) > 0;
};

/**
 * Update last login timestamp
 */
export const updateLastLogin = async (id: string, ipAddress?: string): Promise<void> => {
  const sql = ipAddress
    ? `UPDATE users SET last_login_at = NOW(), last_login_ip = $2 WHERE id = $1`
    : `UPDATE users SET last_login_at = NOW() WHERE id = $1`;

  const params = ipAddress ? [id, ipAddress] : [id];
  await query(sql, params);
};

/**
 * Delete user (soft delete by updating status)
 */
export const softDelete = async (id: string): Promise<boolean> => {
  const sql = `
    UPDATE users
    SET status = 'deleted', email = email || '_deleted_' || id
    WHERE id = $1
  `;
  const result = await query(sql, [id]);
  return (result.rowCount ?? 0) > 0;
};

/**
 * Hard delete user
 */
export const hardDelete = async (id: string): Promise<boolean> => {
  const sql = `DELETE FROM users WHERE id = $1`;
  const result = await query(sql, [id]);
  return (result.rowCount ?? 0) > 0;
};

/**
 * List users with pagination
 */
export const list = async (options: {
  page?: number;
  limit?: number;
  status?: string;
  roleId?: string;
  organisationId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}): Promise<{ users: User[]; total: number }> => {
  const {
    page = 1,
    limit = 20,
    status,
    roleId,
    organisationId,
    search,
    sortBy = 'created_at',
    sortOrder = 'DESC',
  } = options;

  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: any[] = [];
  let paramCount = 1;

  if (status) {
    conditions.push(`status = $${paramCount++}`);
    params.push(status);
  }

  if (roleId) {
    conditions.push(`role_id = $${paramCount++}`);
    params.push(roleId);
  }

  if (organisationId) {
    conditions.push(`organisation_id = $${paramCount++}`);
    params.push(organisationId);
  }

  if (search) {
    conditions.push(`(
      email ILIKE $${paramCount} OR
      first_name ILIKE $${paramCount} OR
      last_name ILIKE $${paramCount}
    )`);
    params.push(`%${search}%`);
    paramCount++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // Validate sort column
  const validSortColumns = ['created_at', 'updated_at', 'email', 'first_name', 'last_name', 'status'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM users ${whereClause}`;
  const countResult = await query(countSql, params);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get users
  const sql = `
    SELECT * FROM users
    ${whereClause}
    ORDER BY ${sortColumn} ${order}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  params.push(limit, offset);
  const result = await query(sql, params);

  return {
    users: result.rows,
    total,
  };
};

/**
 * Count users by status
 */
export const countByStatus = async (): Promise<Record<string, number>> => {
  const sql = `
    SELECT status, COUNT(*) as count
    FROM users
    GROUP BY status
  `;
  const result = await query(sql);
  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    counts[row.status] = parseInt(row.count, 10);
  }
  return counts;
};

/**
 * Check if email exists
 */
export const emailExists = async (email: string): Promise<boolean> => {
  const sql = `SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`;
  const result = await query(sql, [email]);
  return result.rowCount !== null && result.rowCount > 0;
};

/**
 * Create user with auto-generated fields
 */
export const createWithDefaults = async (data: {
  email: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  googleId?: string;
  googleData?: object;
  roleName?: string;
  organisationId?: string;
  locale?: string;
  emailVerified?: boolean;
}): Promise<User> => {
  const roleResult = await query(
    "SELECT id FROM roles WHERE name = $1",
    [data.roleName || 'Standard User']
  );

  const roleId = roleResult.rows[0]?.id;

  return create({
    ...data,
    roleId,
  });
};

export default {
  findById,
  findByIdWithRole,
  findByIdWithPermissions,
  findByEmail,
  findByGoogleId,
  create,
  update,
  updatePassword,
  verifyEmail,
  recordLogin,
  recordFailedLogin,
  unlockAccount,
  updateLastLogin,
  softDelete,
  hardDelete,
  list,
  countByStatus,
  emailExists,
  createWithDefaults,
};
