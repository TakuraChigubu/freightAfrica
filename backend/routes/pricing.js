/**
 * Pricing Routes
 * API endpoints for bundle pricing and purchases
 */

import express from 'express';
import * as pricingController from '../controllers/pricing.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { z } from 'zod';

const router = express.Router();

// Purchase bundle validation schema
const purchaseBundleSchema = z.object({
  bundleType: z.enum(['single', 'bundle_3', 'bundle_5', 'bundle_10'], {
    errorMap: () => ({ message: 'Invalid bundle type' }),
  }),
  paymentMethod: z.enum(['ecocash', 'onemoney', 'zipit', 'card', 'wallet']),
  phoneNumber: z.string().optional(),
  idempotencyKey: z.string().optional(),
  deviceFingerprint: z.string().optional(),
});

/**
 * @route GET /api/v1/pricing
 * @description Get pricing information and available bundles
 * @access Public
 */
router.get('/',
  optionalAuth,
  pricingController.getPricing
);

/**
 * @route GET /api/v1/pricing/credits
 * @description Get user's credit balance and bundle history
 * @access Private
 */
router.get('/credits',
  authenticate,
  pricingController.getCredits
);

/**
 * @route POST /api/v1/pricing/purchase
 * @description Purchase an unlock bundle
 * @access Private
 */
router.post('/purchase',
  authenticate,
  validateRequest(purchaseBundleSchema),
  pricingController.purchaseBundle
);

/**
 * @route GET /api/v1/pricing/validate
 * @description Validate pricing against cost floor (admin)
 * @access Private (would add admin check in production)
 */
router.get('/validate',
  authenticate,
  pricingController.validatePricingEndpoint
);

/**
 * @route GET /api/v1/pricing/stats
 * @description Get cost statistics (admin)
 * @access Private (would add admin check in production)
 */
router.get('/stats',
  authenticate,
  pricingController.getCostStats
);

export default router;
