import * as adminService from '../services/admin.js';
import logger from '../utils/logger.js';
import { ForbiddenError } from '../utils/errors.js';

/**
 * Admin Controller
 * Admin panel endpoints
 */

/**
 * Admin middleware
 */
export const requireAdmin = (req, res, next) => {
  try {
    adminService.requireAdmin(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Get admin stats overview
 */
export const getStats = async (req, res, next) => {
  try {
    const stats = await adminService.getAdminStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get admin stats', { error: error.message });
    next(error);
  }
};

/**
 * Get pending loads for review
 */
export const getPendingLoads = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await adminService.getPendingLoads({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to get pending loads', { error: error.message });
    next(error);
  }
};

/**
 * Get all loads with filters
 */
export const getLoads = async (req, res, next) => {
  try {
    const { page, limit, status, search } = req.query;
    const result = await adminService.getLoads({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      search,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to get loads', { error: error.message });
    next(error);
  }
};

/**
 * Get load details for editing
 */
export const getLoadDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const load = await adminService.getLoadDetails(id);

    res.json({
      success: true,
      data: load,
    });
  } catch (error) {
    logger.error('Failed to get load details', { error: error.message, loadId: req.params.id });
    next(error);
  }
};

/**
 * Approve a load
 */
export const approveLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { edits } = req.body;

    const load = await adminService.approveLoad(id, adminId, { edits });

    res.json({
      success: true,
      data: load,
      message: 'Load approved successfully',
    });
  } catch (error) {
    logger.error('Failed to approve load', { error: error.message, loadId: req.params.id });
    next(error);
  }
};

/**
 * Reject a load
 */
export const rejectLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required',
      });
    }

    const load = await adminService.rejectLoad(id, adminId, reason);

    res.json({
      success: true,
      data: load,
      message: 'Load rejected',
    });
  } catch (error) {
    logger.error('Failed to reject load', { error: error.message, loadId: req.params.id });
    next(error);
  }
};

/**
 * Edit a load
 */
export const editLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const updates = req.body;

    const load = await adminService.editLoad(id, adminId, updates);

    res.json({
      success: true,
      data: load,
      message: 'Load updated successfully',
    });
  } catch (error) {
    logger.error('Failed to edit load', { error: error.message, loadId: req.params.id });
    next(error);
  }
};

/**
 * Delete a load
 */
export const deleteLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { reason } = req.body;

    await adminService.deleteLoad(id, adminId, reason);

    res.json({
      success: true,
      message: 'Load deleted',
    });
  } catch (error) {
    logger.error('Failed to delete load', { error: error.message, loadId: req.params.id });
    next(error);
  }
};

/**
 * Get users list
 */
export const getUsers = async (req, res, next) => {
  try {
    const { page, limit, search, role } = req.query;
    const result = await adminService.getUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      role,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to get users', { error: error.message });
    next(error);
  }
};

/**
 * Parse bulk messages
 */
export const parseBulkLoads = async (req, res, next) => {
  try {
    const { messages } = req.body;
    const adminId = req.user.id;

    if (!messages || typeof messages !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Messages text is required',
      });
    }

    const result = await adminService.parseBulkMessages(messages, adminId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to parse bulk loads', { error: error.message });
    next(error);
  }
};

/**
 * Bulk create loads
 */
export const bulkCreateLoads = async (req, res, next) => {
  try {
    const { loads } = req.body;
    const adminId = req.user.id;

    if (!Array.isArray(loads) || loads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Loads array is required',
      });
    }

    const created = await adminService.bulkCreateLoads(loads, adminId);

    res.json({
      success: true,
      data: {
        created,
        count: created.length,
      },
      message: `${created.length} loads created successfully`,
    });
  } catch (error) {
    logger.error('Failed to bulk create loads', { error: error.message });
    next(error);
  }
};

export default {
  requireAdmin,
  getStats,
  getPendingLoads,
  getLoads,
  getLoadDetails,
  approveLoad,
  rejectLoad,
  editLoad,
  deleteLoad,
  getUsers,
  parseBulkLoads,
  bulkCreateLoads,
};
