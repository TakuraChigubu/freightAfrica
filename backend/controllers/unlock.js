import unlockService from '../services/unlock.js';
import { successResponse, paginatedResponse } from '../utils/response.js';
import {
  BadRequestError,
  InsufficientFundsError,
} from '../utils/errors.js';

/**
 * Unlock Controller
 * HTTP handlers for contact unlock endpoints
 *
 * NEW FLOW:
 * 1. User purchases bundle credits via /pricing/purchase (EcoCash, Card, Wallet)
 * 2. User unlocks loads using credits (no payment needed per-unlock)
 */

/**
 * Get unlock pricing and user's credit balance
 * GET /api/v1/unlock/pricing
 */
export const getPricing = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const pricing = await unlockService.getUnlockPrice(userId);

    successResponse(res, {
      ...pricing,
      unlockDurationHours: 24,
    }, 'Pricing retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * Unlock a load's contact information using credits
 * POST /api/v1/unlock/:loadId
 *
 * Requires user to have credits from a bundle purchase
 */
export const unlockLoad = async (req, res, next) => {
  try {
    const { loadId } = req.params;
    const userId = req.user.id;

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await unlockService.unlockContact({
      loadId,
      userId,
      deviceFingerprint: req.body?.deviceFingerprint,
      ipAddress,
      userAgent,
    });

    successResponse(res, result, 'Contact unlocked successfully');
  } catch (error) {
    // Convert insufficient funds to helpful message
    if (error instanceof InsufficientFundsError) {
      error.details = [{
        field: 'credits',
        message: 'Purchase an unlock bundle to unlock contacts',
        code: 'NO_CREDITS',
      }];
    }
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

    // Include credit balance if not unlocked
    if (!status.isUnlocked) {
      const credits = await unlockService.getUserCredits(userId);
      status.availableCredits = credits.totalCredits;
    }

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
