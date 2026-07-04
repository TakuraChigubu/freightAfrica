import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/index.js';
import { query, closePool } from './pool.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration tracking table
 */
const createMigrationsTable = async () => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64)
    );
  `;

  await query(createTableSQL);
  logger.info('Migrations table created or already exists');
};

/**
 * Get list of executed migrations
 */
const getExecutedMigrations = async () => {
  const result = await query('SELECT filename FROM migrations ORDER BY id');
  return result.rows.map(row => row.filename);
};

/**
 * Get migration files from disk
 */
const getMigrationFiles = () => {
  const sqlDir = path.join(__dirname, 'sql');
  const files = fs.readdirSync(sqlDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  return files;
};

/**
 * Calculate checksum for a file
 */
const calculateChecksum = (content) => {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
};

/**
 * Execute a single migration
 */
const executeMigration = async (filename, sqlDir) => {
  const filepath = path.join(sqlDir, filename);
  const sql = fs.readFileSync(filepath, 'utf-8');
  const checksum = calculateChecksum(sql);

  logger.info(`Executing migration: ${filename}`);

  try {
    await query(sql);

    await query(
      'INSERT INTO migrations (filename, checksum) VALUES ($1, $2)',
      [filename, checksum]
    );

    logger.info(`Migration completed: ${filename}`);
  } catch (error) {
    // Check if it's a "already exists" type error that we can safely ignore
    const ignoredErrors = [
      'already exists',
      'duplicate key value violates unique constraint "migrations_pkey"',
    ];

    const canIgnore = ignoredErrors.some(msg =>
      error.message.toLowerCase().includes(msg.toLowerCase())
    );

    if (canIgnore) {
      logger.warn(`Migration ${filename} may have partially succeeded`, {
        error: error.message,
      });
    } else {
      logger.error(`Migration failed: ${filename}`, { error: error.message });
      throw error;
    }
  }
};

/**
 * Run all pending migrations
 */
const runMigrations = async () => {
  try {
    logger.info('Starting database migrations...');

    // Create migrations tracking table
    await createMigrationsTable();

    // Get executed migrations
    const executed = await getExecutedMigrations();
    logger.info(`Found ${executed.length} executed migrations`);

    // Get all migration files
    const sqlDir = path.join(__dirname, 'sql');
    const files = getMigrationFiles();
    logger.info(`Found ${files.length} migration files`);

    // Find pending migrations
    const pending = files.filter(file => !executed.includes(file));

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    logger.info(`Running ${pending.length} pending migrations`);

    // Execute each pending migration
    for (const file of pending) {
      await executeMigration(file, sqlDir);
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration process failed', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Main entry point
 */
const main = async () => {
  try {
    await runMigrations();
  } catch (error) {
    process.exit(1);
  } finally {
    await closePool();
  }
};

// Run migrations if this script is executed directly
if (process.argv[1] === __filename) {
  main();
}

export { runMigrations, createMigrationsTable, executeMigration };
