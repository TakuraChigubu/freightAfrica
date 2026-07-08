/**
 * Pricing Controller
 * API endpoints for bundle pricing and purchase
 */

import * as pricingService from '../services/pricing.js';
import * as unlockService from '../services/unlock.js';
import { successResponse } from '../utils/response.js';
import {
  BadRequestError,
} from '../utils/errors.js';

/**
 * Get pricing information
 * GET /api/v1/pricing
 */
export const getPricing = async (req, res, next) => {
  try {
    const summary = pricingService.getPricingSummary();
    const bundles = pricingService.getAvailableBundles();

    res.json(successResponse({
      bundles: bundles.map(b => ({
        id: b.id,
        name: b.name,
        unlocks: b.unlocks,
        price: b.price,
        pricePerUnlock: b.pricePerUnlock,
        savingsPercent: b.savingsPercent,
        description: b.description,
        isDefault: b.isDefault,
        paynowFeeRatio: b.paynowFeeRatio,
      })),
      costFloor: {
        costPerLoad: summary.costFloor.costPerLoad,
        minimumViablePrice: summary.costFloor.minimumViablePrice,
        breakdown: summary.costFloor.breakdown,
      },
      paynowFees: {
        flatFee: pricingService.PRICING_CONFIG.PAYNOW.FLAT_FEE,
        percentageFee: pricingService.PRICING_CONFIG.PAYNOW.PERCENTAGE_FEE * 100,
        singleUnlockFee: summary.paynowFees.at3.total,
        bundleFee: summary.paynowFees.at10.total,
      },
      unlockDurationHours: pricingService.PRICING_CONFIG.UNLOCK_DURATION_HOURS,
    }));
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's credit balance and bundle history
 * GET /api/v1/pricing/credits
 */
export const getCredits = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const credits = await unlockService.getUserCredits(userId);
    const bundles = await unlockService.getUserBundles(userId);

    res.json(successResponse({
      totalCredits: credits.totalCredits,
      activeBundles: credits.activeBundles,
      bundleHistory: bundles,
    }));
  } catch (error) {
    next(error);
  }
};

/**
 * Purchase an unlock bundle
 * POST /api/v1/pricing/purchase
 */
export const purchaseBundle = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { bundleType, paymentMethod, phoneNumber, idempotencyKey } = req.body;

    const result = await unlockService.purchaseBundle({
      userId,
      bundleType,
      paymentMethod,
      phoneNumber,
      idempotencyKey,
      deviceFingerprint: req.body.deviceFingerprint,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json(successResponse({
      bundleId: result.bundleId,
      publicId: result.publicId,
      paymentStatus: result.paymentStatus,
      paymentId: result.paymentId,
      paynowPollUrl: result.paynowPollUrl,
      paynowRedirectUrl: result.paynowRedirectUrl,
      message: result.paymentStatus === 'confirmed'
        ? 'Bundle purchased successfully'
        : 'Payment initiated. Complete payment to activate bundle.',
    }));
  } catch (error) {
    next(error);
  }
};

/**
 * Get cost statistics (admin only)
 * GET /api/v1/pricing/stats
 */
export const getCostStats = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const stats = await pricingService.getCostStatistics(days);

    res.json(successResponse({
      period: { days },
      ...stats,
      margin: {
        revenue: stats.avgCostPerLoad * 10 * 0.10, // 10% assumed conversion rate
        cost: stats.totalCost,
        profit: stats.totalCost > 0
          ? (stats.avgCostPerLoad * 10 * 0.10 - stats.avgCostPerLoad) * stats.totalLoads
          : 0,
      },
    }));
  } catch (error) {
    next(error);
  }
};

/**
 * Validate pricing against cost floor
 * GET /api/v1/pricing/validate
 */
export const validatePricingEndpoint = async (req, res, next) => {
  try {
    const { price, unlocks } = req.query;

    if (!price || !unlocks) {
      throw new BadRequestError('price and unlocks query parameters required');
    }

    const result = pricingService.validatePricing(
      parseFloat(price as string),
      parseInt(unlocks as string)
    );

    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export default {
  getPricing,
  getCredits,
  purchaseBundle,
  getCostStats,
  validatePricingEndpoint,
};
