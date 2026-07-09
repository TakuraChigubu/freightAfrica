import express from 'express';
import * as marketplaceController from '../controllers/marketplace.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { z } from 'zod';

const router = express.Router();

// Create item validation schema
const createItemSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  category: z.enum(['vehicle', 'equipment', 'goods', 'other']),
  price: z.number().optional(),
  priceNegotiable: z.boolean().optional(),
  currency: z.string().default('USD'),
  location: z.string().min(2, 'Location is required'),
  country: z.string().optional(),
  contactPhone: z.string().min(10, 'Contact phone is required'),
  contactWhatsapp: z.string().optional(),
  contactEmail: z.string().email().optional(),
  imageUrls: z.array(z.string()).optional(),
  attributes: z.record(z.any()).optional(),
});

/**
 * @route GET /api/v1/marketplace
 * @description Get marketplace items with filters
 * @access Public
 */
router.get('/',
  optionalAuth,
  marketplaceController.getItems
);

/**
 * @route GET /api/v1/marketplace/:id
 * @description Get single marketplace item
 * @access Public
 */
router.get('/:id',
  optionalAuth,
  marketplaceController.getItem
);

/**
 * @route POST /api/v1/marketplace
 * @description Create a marketplace item
 * @access Private
 */
router.post('/',
  authenticate,
  validateRequest(createItemSchema),
  marketplaceController.createItem
);

/**
 * @route POST /api/v1/marketplace/:id/unlock
 * @description Unlock marketplace item contact
 * @access Private
 */
router.post('/:id/unlock',
  authenticate,
  marketplaceController.unlockItem
);

/**
 * @route POST /api/v1/marketplace/:id/approve
 * @description Approve marketplace item (admin)
 * @access Private
 */
router.post('/:id/approve',
  authenticate,
  marketplaceController.approveItem
);

/**
 * @route POST /api/v1/marketplace/:id/reject
 * @description Reject marketplace item (admin)
 * @access Private
 */
router.post('/:id/reject',
  authenticate,
  marketplaceController.rejectItem
);

export default router;
