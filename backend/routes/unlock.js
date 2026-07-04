import { Router } from 'express';
import unlockController from '../controllers/unlock.js';
import { authenticate } from '../middleware/auth.js';
import { unlockLimiter } from '../middleware/security.js';
import { validateBody } from '../middleware/validate.js';
import { z } from 'zod';

const router = Router();

// Unlock schemas
const unlockSchema = z.object({
  paymentMethod: z.enum(['wallet', 'ecocash', 'onemoney', 'zipit', 'card']),
  phoneNumber: z.string().max(50).optional(),
  deviceFingerprint: z.string().max(255).optional(),
});

/**
 * Unlock Routes
 * Base path: /api/v1/unlock
 */

/**
 * @route GET /unlock/pricing
 * @desc Get unlock pricing information
 * @access Public
 */
router.get('/pricing', unlockController.getPricing);

/**
 * @route POST /unlock/:loadId
 * @desc Unlock broker contact for a load
 * @access Protected
 */
router.post(
  '/:loadId',
  authenticate,
  unlockLimiter,
  validateBody(unlockSchema),
  unlockController.unlockLoad
);

/**
 * @route GET /unlock/:loadId/status
 * @desc Check if user has unlocked a load
 * @access Protected
 */
router.get(
  '/:loadId/status',
  authenticate,
  unlockController.checkStatus
);

/**
 * @route GET /unlock/my
 * @desc Get user's unlocked loads
 * @access Protected
 */
router.get(
  '/my',
  authenticate,
  unlockController.getMyUnlocks
);

export default router;
