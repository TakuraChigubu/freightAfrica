import Redis from 'ioredis';
import config from '../config/index.js';
import logger from '../utils/logger.js';

// Create Redis client
const createRedisClient = () => {
  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      if (times > 10) {
        logger.error('Redis connection retry limit exceeded');
        return null;
      }
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  client.on('connect', () => {
    logger.info('Redis client connected', {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
    });
  });

  client.on('ready', () => {
    logger.info('Redis client ready');
  });

  client.on('error', (error) => {
    logger.error('Redis client error', { error: error.message });
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
  });

  client.on('reconnecting', () => {
    logger.info('Redis client reconnecting');
  });

  return client;
};

// Primary Redis client for caching and sessions
const redisClient = createRedisClient();

// Connection class for BullMQ
class RedisConnection {
  constructor() {
    this.client = redisClient;
  }

  get client() {
    return this._client;
  }

  set client(value) {
    this._client = value;
  }
}

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
  maxRetriesPerRequest: null,
};

// Cache utilities
const cache = {
  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>}
   */
  get: async (key) => {
    try {
      const value = await redisClient.get(key);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  },

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {Promise<boolean>}
   */
  set: async (key, value, ttl = null) => {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redisClient.setex(key, ttl, serialized);
      } else {
        await redisClient.set(key, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error: error.message });
      return false;
    }
  },

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  del: async (key) => {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('Cache del error', { key, error: error.message });
      return false;
    }
  },

  /**
   * Delete keys matching a pattern
   * @param {string} pattern - Pattern to match
   * @returns {Promise<number>} Number of keys deleted
   */
  delPattern: async (pattern) => {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return keys.length;
    } catch (error) {
      logger.error('Cache delPattern error', { pattern, error: error.message });
      return 0;
    }
  },

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  exists: async (key) => {
    try {
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error: error.message });
      return false;
    }
  },

  /**
   * Set TTL on a key
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>}
   */
  expire: async (key, ttl) => {
    try {
      await redisClient.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error('Cache expire error', { key, error: error.message });
      return false;
    }
  },

  /**
   * Increment a value
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment (default: 1)
   * @returns {Promise<number>}
   */
  incr: async (key, amount = 1) => {
    try {
      if (amount === 1) {
        return await redisClient.incr(key);
      }
      return await redisClient.incrby(key, amount);
    } catch (error) {
      logger.error('Cache incr error', { key, error: error.message });
      return 0;
    }
  },
};

// Session utilities for JWT refresh tokens
const sessionStore = {
  /**
   * Store a refresh token for a user session
   * @param {string} userId - User ID
   * @param {string} tokenId - Unique token identifier
   * @param {string} refreshToken - The refresh token
   * @param {number} expiresAt - Expiration timestamp
   * @param {object} deviceInfo - Device information
   */
  storeRefreshToken: async (userId, tokenId, refreshToken, expiresAt, deviceInfo = {}) => {
    const key = `session:${userId}:${tokenId}`;
    const value = {
      refreshToken,
      expiresAt,
      deviceInfo,
      createdAt: Date.now(),
    };
    const ttl = Math.floor((expiresAt - Date.now()) / 1000);
    await cache.set(key, value, ttl);

    // Also add to user's session set
    await redisClient.sadd(`sessions:${userId}`, tokenId);
  },

  /**
   * Get a refresh token
   * @param {string} userId - User ID
   * @param {string} tokenId - Token identifier
   */
  getRefreshToken: async (userId, tokenId) => {
    const key = `session:${userId}:${tokenId}`;
    return await cache.get(key);
  },

  /**
   * List all sessions for a user
   * @param {string} userId - User ID
   */
  listSessions: async (userId) => {
    const tokenIds = await redisClient.smembers(`sessions:${userId}`);
    const sessions = [];

    for (const tokenId of tokenIds) {
      const session = await cache.get(`session:${userId}:${tokenId}`);
      if (session) {
        sessions.push({ tokenId, ...session });
      } else {
        // Clean up stale entry
        await redisClient.srem(`sessions:${userId}`, tokenId);
      }
    }

    return sessions;
  },

  /**
   * Remove a session (logout from one device)
   * @param {string} userId - User ID
   * @param {string} tokenId - Token identifier
   */
  removeSession: async (userId, tokenId) => {
    await redisClient.del(`session:${userId}:${tokenId}`);
    await redisClient.srem(`sessions:${userId}`, tokenId);
  },

  /**
   * Remove all sessions for a user (logout from all devices)
   * @param {string} userId - User ID
   */
  removeAllSessions: async (userId) => {
    const tokenIds = await redisClient.smembers(`sessions:${userId}`);

    for (const tokenId of tokenIds) {
      await redisClient.del(`session:${userId}:${tokenId}`);
    }

    await redisClient.del(`sessions:${userId}`);
  },
};

export {
  redisClient,
  redisConnection,
  cache,
  sessionStore,
};

export default redisClient;
