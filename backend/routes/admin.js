import express from 'express';
import * as adminController from '../controllers/admin.js';
import { authenticate } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { z } from 'zod';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(adminController.requireAdmin);

// Edit load validation schema
const editLoadSchema = z.object({
  origin_raw: z.string().optional(),
  destination_raw: z.string().optional(),
  origin_country: z.string().optional(),
  destination_country: z.string().optional(),
  cargo_type: z.string().optional(),
  truck_type: z.string().optional(),
  weight_kg: z.number().optional(),
  number_of_trucks: z.number().optional(),
  pickup_date: z.string().optional(),
  delivery_date: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  price_negotiable: z.boolean().optional(),
  price_per_ton: z.number().optional(),
  description: z.string().optional(),
  is_hazardous: z.boolean().optional(),
  hazardous_class: z.string().optional(),
  parsed_phone: z.string().optional(),
  parsed_whatsapp: z.string().optional(),
  broker_name: z.string().optional(),
  broker_company: z.string().optional(),
  status: z.enum(['pending', 'published', 'expired', 'rejected']).optional(),
});

const rejectLoadSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

const bulkCreateSchema = z.object({
  loads: z.array(z.object({
    origin: z.string(),
    destination: z.string(),
    originCountry: z.string().optional(),
    destinationCountry: z.string().optional(),
    cargoType: z.string().optional(),
    truckType: z.string().optional(),
    weightKg: z.number().optional(),
    numberOfTrucks: z.number().optional(),
    pickupDate: z.string().optional(),
    deliveryDate: z.string().optional(),
    price: z.number().optional(),
    currency: z.string().optional(),
    contactPhone: z.string().optional(),
    contactWhatsapp: z.string().optional(),
    brokerName: z.string().optional(),
    brokerCompany: z.string().optional(),
  })).min(1, 'At least one load is required'),
});

/**
 * @route GET /api/v1/admin/stats
 * @description Get admin stats overview
 * @access Private (Admin)
 */
router.get('/stats', adminController.getStats);

/**
 * @route GET /api/v1/admin/pending
 * @description Get pending loads for review
 * @access Private (Admin)
 */
router.get('/pending', adminController.getPendingLoads);

/**
 * @route GET /api/v1/admin/loads
 * @description Get all loads with filters
 * @access Private (Admin)
 */
router.get('/loads', adminController.getLoads);

/**
 * @route GET /api/v1/admin/loads/:id
 * @description Get load details for editing
 * @access Private (Admin)
 */
router.get('/loads/:id', adminController.getLoadDetails);

/**
 * @route POST /api/v1/admin/loads/:id/approve
 * @description Approve a load
 * @access Private (Admin)
 */
router.post('/loads/:id/approve', adminController.approveLoad);

/**
 * @route POST /api/v1/admin/loads/:id/reject
 * @description Reject a load
 * @access Private (Admin)
 */
router.post('/loads/:id/reject',
  validateRequest(rejectLoadSchema),
  adminController.rejectLoad
);

/**
 * @route PUT /api/v1/admin/loads/:id
 * @description Edit a load
 * @access Private (Admin)
 */
router.put('/loads/:id',
  validateRequest(editLoadSchema),
  adminController.editLoad
);

/**
 * @route DELETE /api/v1/admin/loads/:id
 * @description Delete a load
 * @access Private (Admin)
 */
router.delete('/loads/:id', adminController.deleteLoad);

/**
 * @route GET /api/v1/admin/users
 * @description Get users list
 * @access Private (Admin)
 */
router.get('/users', adminController.getUsers);

/**
 * @route POST /api/v1/admin/parse-bulk
 * @description Parse bulk chain messages
 * @access Private (Admin)
 */
router.post('/parse-bulk', adminController.parseBulkLoads);

/**
 * @route POST /api/v1/admin/bulk-create
 * @description Bulk create loads from parsed messages
 * @access Private (Admin)
 */
router.post('/bulk-create',
  validateRequest(bulkCreateSchema),
  adminController.bulkCreateLoads
);

export default router;
