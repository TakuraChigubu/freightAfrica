import * as dashboardService from '../services/dashboard.js';
import logger from '../utils/logger.js';

/**
 * Dashboard Controller
 * User dashboard endpoints
 */

/**
 * Get user dashboard overview
 */
export const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const dashboard = await dashboardService.getUserDashboard(userId);

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    logger.error('Failed to get dashboard', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

/**
 * Get user activity feed
 */
export const getActivity = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit, type } = req.query;

    const activity = await dashboardService.getUserActivity(userId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      type,
    });

    res.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    logger.error('Failed to get activity', { error: error.message, userId: req.user?.id });
    next(error);
  }
};

export default {
  getDashboard,
  getActivity,
};
