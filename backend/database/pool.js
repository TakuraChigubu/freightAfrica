import pg from 'pg';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: config.database.maxConnections,
  idleTimeoutMillis: config.database.idleTimeout,
  connectionTimeoutMillis: config.database.connectionTimeout,
});

// Pool event handlers
pool.on('connect', (client) => {
  logger.debug('New database client connected', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

pool.on('error', (err, client) => {
  logger.error('Unexpected database pool error', {
    error: err.message,
    stack: err.stack,
  });
});

pool.on('remove', (client) => {
  logger.debug('Database client removed from pool', {
    totalCount: pool.totalCount,
  });
});

/**
 * Execute a query with automatic parameterized SQL handling
 * @param {string} text - SQL query with parameterized placeholders ($1, $2, etc.)
 * @param {Array} params - Parameters to substitute
 * @returns {Promise<pg.QueryResult>} Query result
 */
const query = async (text, params = []) => {
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug('Query executed', {
      query: text.substring(0, 200),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    logger.error('Database query error', {
      query: text.substring(0, 200),
      params: params.length > 0 ? `[${params.length} parameters]` : 'none',
      duration: `${duration}ms`,
      error: error.message,
      code: error.code,
    });

    throw error;
  }
};

/**
 * Execute a query within a transaction
 * @param {Function} callback - Callback that receives a client for transaction queries
 * @returns {Promise<any>} Result of callback
 */
const transaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await callback(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', { error: error.message });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get a dedicated client from the pool for multiple queries
 * @returns {Promise<pg.PoolClient>}
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Test database connection
 * @returns {Promise<boolean>}
 */
const testConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    logger.info('Database connection successful', {
      timestamp: result.rows[0].now,
    });
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error: error.message });
    return false;
  }
};

/**
 * Close all database connections
 * @returns {Promise<void>}
 */
const closePool = async () => {
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (error) {
    logger.error('Error closing database pool', { error: error.message });
    throw error;
  }
};

// Export database utilities
export {
  pool,
  query,
  transaction,
  getClient,
  testConnection,
  closePool,
};

export default {
  pool,
  query,
  transaction,
  getClient,
  testConnection,
  closePool,
};
