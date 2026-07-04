import app from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import { testConnection, closePool } from './database/pool.js';
import redisClient from './utils/redis.js';

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Close HTTP server first
  server.close(async () => {
    logger.info('HTTP server closed');

    // Close database connections
    try {
      await closePool();
    } catch (error) {
      logger.error('Error closing database pool', { error: error.message });
    }

    // Close Redis connection
    try {
      redisClient.disconnect(false);
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', { error: error.message });
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force close after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000); // 30 second timeout
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
  });
});

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected && config.app.env === 'production') {
      logger.error('Database connection failed, exiting...');
      process.exit(1);
    }

    // Test Redis connection
    if (redisClient.status !== 'ready') {
      logger.info('Waiting for Redis connection...');
    }

    // Start listening
    const server = app.listen(config.app.port, () => {
      logger.info(`${config.app.name} started`, {
        port: config.app.port,
        environment: config.app.env,
        apiVersion: config.app.apiVersion,
      });
    });

    return server;

  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
};

// Make server available globally for shutdown
let server;
startServer().then(s => { server = s; });
