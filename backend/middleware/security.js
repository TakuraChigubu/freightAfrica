import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import { RateLimitError } from '../utils/errors.js';

/**
 * General rate limiter for API routes
 */
const generalLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
      },
    });
  },
});

/**
 * Strict rate limiter for authentication routes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts, please try again later',
      },
    });
  },
});

/**
 * Rate limiter for password reset
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many password reset requests, please try again later',
    },
  },
});

/**
 * Rate limiter for unlock operations (anti-leakage)
 */
const unlockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 unlocks per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per user if authenticated, by IP otherwise
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many unlock requests, please try again later',
    },
  },
});

/**
 * Rate limiter for load creation
 */
const loadCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 loads per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many loads created, please try again later',
    },
  },
});

/**
 * Rate limiter for API endpoints (for future public API)
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'API rate limit exceeded',
    },
  },
});

/**
 * Strict rate limiter for contact endpoints (anti-leakage)
 */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many contact requests',
    },
  },
});

/**
 * Rate limiter for WhatsApp webhook
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // High limit for webhooks
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Slow down middleware for repeated offenders
 */
const speedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  delayMs: 1000, // Add 1 second delay per request after first 100
});

export {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  unlockLimiter,
  loadCreationLimiter,
  apiLimiter,
  contactLimiter,
  webhookLimiter,
  speedLimiter,
};

export default {
  generalLimiter,
  authLimiter,
  passwordResetLimiter,
  unlockLimiter,
  loadCreationLimiter,
  apiLimiter,
  contactLimiter,
  webhookLimiter,
  speedLimiter,
};
