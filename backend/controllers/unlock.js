import unlockService from '../services/unlock.js';
import { successResponse, createdResponse, paginatedResponse } from '../utils/response.js';
import logger from '../utils/logger.js';
import {
  BadRequestError,
} from '../utils/errors.js';

/**
 * Unlock Controller
 * HTTP handlers for contact unlock endpoints
 */

/**
 * Get unlock pricing information
 * GET /api/v1/unlock/pricing
 */
export const getPricing = async (req, res, next) => {
  try {
    const pricing = unlockService.calculateUnlockPrice();

    successResponse(res, {
      basePrice: pricing.basePrice,
      currency: 'USD',
      unlockDurationHours: 24,
    }, 'Pricing retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * Unlock a load's contact information
 * POST /api/v1/unlock/:loadId
 */
export const unlockLoad = async (req, res, next) => {
  try {
    const { loadId } = req.params;
    const userId = req.user.id;
    const { paymentMethod, phoneNumber } = req.body;

    if (!paymentMethod) {
      throw new BadRequestError('Payment method is required', 'MISSING_PAYMENT_METHOD');
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await unlockService.unlockContact({
      loadId,
      userId,
      paymentMethod,
      phoneNumber,
      deviceFingerprint: req.body.deviceFingerprint,
      ipAddress,
      userAgent,
    });

    successResponse(res, result, 'Contact unlocked successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Check unlock status for a load
 * GET /api/v1/unlock/:loadId/status
 */
export const checkStatus = async (req, res, next) => {
  try {
    const { loadId } = req.params;
    const userId = req.user.id;

    const status = await unlockService.checkUnlockStatus(userId, loadId);

    successResponse(res, status);
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's unlocked loads
 * GET /api/v1/unlock/my
 */
export const getMyUnlocks = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      activeOnly: req.query.activeOnly === 'true',
    };

    const result = await unlockService.getUserUnlocks(userId, options);

    paginatedResponse(res, result.unlocks, {
      page: options.page,
      limit: options.limit,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getPricing,
  unlockLoad,
  checkStatus,
  getMyUnlocks,
};
