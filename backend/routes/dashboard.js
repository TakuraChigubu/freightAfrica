import express from 'express';
import * as dashboardController from '../controllers/dashboard.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route GET /api/v1/dashboard
 * @description Get user dashboard overview
 * @access Private
 */
router.get('/',
  authenticate,
  dashboardController.getDashboard
);

/**
 * @route GET /api/v1/dashboard/activity
 * @description Get user activity feed
 * @access Private
 */
router.get('/activity',
  authenticate,
  dashboardController.getActivity
);

export default router;
