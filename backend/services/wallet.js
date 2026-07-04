import { query, transaction } from '../database/pool.js';
import logger from '../utils/logger.js';
import { BadRequestError, InsufficientFundsError, NotFoundError } from '../utils/errors.js';

/**
 * Wallet Service
 * Handles wallet operations including balance management, credits, and debits
 */

/**
 * Create a wallet for a user
 */
export const createWallet = async (userId: string, currency: string = 'USD'): Promise<any> => {
  const sql = `
    INSERT INTO wallets (user_id, currency)
    VALUES ($1, $2)
    RETURNING *
  `;
  const result = await query(sql, [userId, currency]);
  logger.info('Wallet created', { userId, currency });
  return result.rows[0];
};

/**
 * Get wallet by user ID
 */
export const getWalletByUserId = async (userId: string): Promise<any | null> => {
  const sql = `
    SELECT * FROM wallets WHERE user_id = $1
  `;
  const result = await query(sql, [userId]);
  return result.rows[0] || null;
};

/**
 * Get wallet by ID
 */
export const getWalletById = async (walletId: string): Promise<any | null> => {
  const sql = `
    SELECT * FROM wallets WHERE id = $1
  `;
  const result = await query(sql, [walletId]);
  return result.rows[0] || null;
};

/**
 * Get wallet balance
 */
export const getBalance = async (userId: string): Promise<{
  available: number;
  pending: number;
  currency: string;
}> => {
  const wallet = await getWalletByUserId(userId);

  if (!wallet) {
    throw new NotFoundError('Wallet not found');
  }

  return {
    available: parseFloat(wallet.balance),
    pending: parseFloat(wallet.pending_balance),
    currency: wallet.currency,
  };
};

/**
 * Credit wallet (add funds)
 */
export const creditWallet = async (
  userId: string,
  amount: number,
  referenceType: string,
  referenceId: string,
  description: string,
  paymentId?: string
): Promise<any> => {
  return await transaction(async (client) => {
    // Get current wallet state
    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw new NotFoundError('Wallet not found');
    }

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    // Update wallet balance
    await client.query(
      `UPDATE wallets
       SET balance = $1,
           total_credited = total_credited + $2,
           last_transaction_at = NOW()
       WHERE user_id = $3`,
      [balanceAfter, amount, userId]
    );

    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, description, payment_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        wallet.id,
        'credit',
        amount,
        balanceBefore,
        balanceAfter,
        referenceType,
        referenceId,
        description,
        paymentId || null,
      ]
    );

    logger.info('Wallet credited', {
      userId,
      amount,
      balanceBefore,
      balanceAfter,
      referenceType,
      referenceId,
    });

    return transactionResult.rows[0];
  });
};

/**
 * Debit wallet (deduct funds)
 */
export const debitWallet = async (
  userId: string,
  amount: number,
  referenceType: string,
  referenceId: string,
  description: string
): Promise<any> => {
  return await transaction(async (client) => {
    // Get current wallet state
    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw new NotFoundError('Wallet not found');
    }

    const balanceBefore = parseFloat(wallet.balance);

    if (balanceBefore < amount) {
      throw new InsufficientFundsError(
        `Insufficient funds. Available: $${balanceBefore.toFixed(2)}, Required: $${amount.toFixed(2)}`
      );
    }

    const balanceAfter = balanceBefore - amount;

    // Update wallet balance
    await client.query(
      `UPDATE wallets
       SET balance = $1,
           total_debited = total_debited + $2,
           last_transaction_at = NOW()
       WHERE user_id = $3`,
      [balanceAfter, amount, userId]
    );

    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        wallet.id,
        'debit',
        amount,
        balanceBefore,
        balanceAfter,
        referenceType,
        referenceId,
        description,
      ]
    );

    logger.info('Wallet debited', {
      userId,
      amount,
      balanceBefore,
      balanceAfter,
      referenceType,
      referenceId,
    });

    return transactionResult.rows[0];
  });
};

/**
 * Refund to wallet
 */
export const refundWallet = async (
  userId: string,
  amount: number,
  referenceType: string,
  referenceId: string,
  description: string
): Promise<any> => {
  return await transaction(async (client) => {
    // Get current wallet state
    const walletResult = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );

    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw new NotFoundError('Wallet not found');
    }

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore + amount;

    // Update wallet balance
    await client.query(
      `UPDATE wallets
       SET balance = $1,
           total_credited = total_credited + $2,
           last_transaction_at = NOW()
       WHERE user_id = $3`,
      [balanceAfter, amount, userId]
    );

    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id, type, amount, balance_before, balance_after,
        reference_type, reference_id, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        wallet.id,
        'refund',
        amount,
        balanceBefore,
        balanceAfter,
        referenceType,
        referenceId,
        description,
      ]
    );

    logger.info('Wallet refund processed', {
      userId,
      amount,
      balanceBefore,
      balanceAfter,
      referenceType,
      referenceId,
    });

    return transactionResult.rows[0];
  });
};

/**
 * Get wallet transactions
 */
export const getTransactions = async (
  userId: string,
  options: {
    page?: number;
    limit?: number;
    type?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}
): Promise<{ transactions: any[]; total: number }> => {
  const {
    page = 1,
    limit = 20,
    type,
    startDate,
    endDate,
  } = options;

  const wallet = await getWalletByUserId(userId);
  if (!wallet) {
    throw new NotFoundError('Wallet not found');
  }

  const offset = (page - 1) * limit;
  const conditions: string[] = ['wallet_id = $1'];
  const params: any[] = [wallet.id];
  let paramCount = 2;

  if (type) {
    conditions.push(`type = $${paramCount++}`);
    params.push(type);
  }

  if (startDate) {
    conditions.push(`created_at >= $${paramCount++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`created_at <= $${paramCount++}`);
    params.push(endDate);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM wallet_transactions ${whereClause}`;
  const countResult = await query(countSql, params);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get transactions
  const sql = `
    SELECT * FROM wallet_transactions
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;

  params.push(limit, offset);
  const result = await query(sql, params);

  return {
    transactions: result.rows,
    total,
  };
};

/**
 * Check if user has sufficient balance
 */
export const hasSufficientBalance = async (userId: string, amount: number): Promise<boolean> => {
  const wallet = await getWalletByUserId(userId);
  if (!wallet) {
    return false;
  }
  return parseFloat(wallet.balance) >= amount;
};

/**
 * Get total wallet statistics
 */
export const getWalletStats = async (): Promise<{
  totalWallets: number;
  totalBalance: number;
  totalPending: number;
  totalCredited: number;
  totalDebited: number;
}> => {
  const sql = `
    SELECT
      COUNT(*) as total_wallets,
      COALESCE(SUM(balance), 0) as total_balance,
      COALESCE(SUM(pending_balance), 0) as total_pending,
      COALESCE(SUM(total_credited), 0) as total_credited,
      COALESCE(SUM(total_debited), 0) as total_debited
    FROM wallets
  `;
  const result = await query(sql);
  const row = result.rows[0];

  return {
    totalWallets: parseInt(row.total_wallets ?? '0', 10),
    totalBalance: parseFloat(row.total_balance ?? '0'),
    totalPending: parseFloat(row.total_pending ?? '0'),
    totalCredited: parseFloat(row.total_credited ?? '0'),
    totalDebited: parseFloat(row.total_debited ?? '0'),
  };
};

export default {
  createWallet,
  getWalletByUserId,
  getWalletById,
  getBalance,
  creditWallet,
  debitWallet,
  refundWallet,
  getTransactions,
  hasSufficientBalance,
  getWalletStats,
};
