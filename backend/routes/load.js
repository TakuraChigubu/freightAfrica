import { Router } from 'express';
import loadController from '../controllers/load.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validate.js';
import { authenticate, authorize, requireRole } from '../middleware/auth.js';
import { loadCreationLimiter } from '../middleware/security.js';
import {
  createLoadSchema,
  updateLoadSchema,
  loadQuerySchema,
  moderateLoadSchema,
  loadIdParamSchema,
} from '../validators/load.js';

const router = Router();

/**
 * Load Routes
 * Base path: /api/v1/loads
 */

// ============================================
// PUBLIC ROUTES (no authentication required)
// ============================================

/**
 * @route GET /loads
 * @desc List published loads (public feed)
 * @query page, limit, originCountry, destinationCountry, search, etc.
 * @access Public
 */
router.get(
  '/',
  validateQuery(loadQuerySchema),
  loadController.listLoads
);

/**
 * @route GET /loads/stats
 * @desc Get public load statistics
 * @access Public
 */
router.get('/stats', loadController.getLoadStats);

/**
 * @route POST /loads/search
 * @desc Natural language search for loads
 * @access Public
 */
router.post(
  '/search',
  loadController.naturalLanguageSearch
);

/**
 * @route GET /loads/:id
 * @desc Get load details by ID or public ID
 * @access Public (limited info), Protected (full info with permissions)
 */
router.get(
  '/:id',
  validateParams(loadIdParamSchema),
  loadController.getLoad
);

/**
 * @route POST /loads/suggest-price
 * @desc Get AI-suggested price for a route
 * @access Public
 */
router.post(
  '/suggest-price',
  loadController.suggestPrice
);

// ============================================
// PROTECTED ROUTES (authentication required)
// ============================================

/**
 * @route POST /loads
 * @desc Create new load
 * @access Protected
 */
router.post(
  '/',
  authenticate,
  loadCreationLimiter,
  validateBody(createLoadSchema),
  loadController.createLoad
);

/**
 * @route GET /loads/my
 * @desc Get current user's loads
 * @access Protected
 */
router.get(
  '/my',
  authenticate,
  loadController.getMyLoads
);

/**
 * @route PATCH /loads/:id
 * @desc Update load (owner only)
 * @access Protected (owner or admin)
 */
router.patch(
  '/:id',
  authenticate,
  validateBody(updateLoadSchema),
  loadController.updateLoad
);

/**
 * @route DELETE /loads/:id
 * @desc Delete load (soft delete, owner only)
 * @access Protected (owner or admin)
 */
router.delete(
  '/:id',
  authenticate,
  loadController.deleteLoad
);

/**
 * @route POST /loads/:id/reparse
 * @desc Reparse load with AI
 * @access Protected
 */
router.post(
  '/:id/reparse',
  authenticate,
  loadController.reparseLoad
);

/**
 * @route GET /loads/:id/duplicates
 * @desc Check for potential duplicates
 * @access Protected
 */
router.get(
  '/:id/duplicates',
  authenticate,
  loadController.checkDuplicates
);

// ============================================
// MODERATION ROUTES (moderator+ roles only)
// ============================================

/**
 * @route GET /loads/moderation
 * @desc Get loads pending moderation
 * @access Protected (Moderator, Admin, Super Admin)
 */
router.get(
  '/moderation',
  authenticate,
  requireRole(['Moderator', 'Admin', 'Super Admin']),
  loadController.getModerationQueue
);

/**
 * @route POST /loads/:id/moderate
 * @desc Moderate a load (approve/reject/mark fraud)
 * @access Protected (Moderator, Admin, Super Admin)
 */
router.post(
  '/:id/moderate',
  authenticate,
  requireRole(['Moderator', 'Admin', 'Super Admin']),
  validateBody(moderateLoadSchema),
  loadController.moderateLoad
);

export default router;
