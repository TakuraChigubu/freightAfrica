import loadService from '../services/load.js';
import aiService from '../services/ai.js';
import { successResponse, createdResponse, paginatedResponse } from '../utils/response.js';
import { calculatePagination } from '../utils/response.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Load Controller
 * HTTP handlers for load endpoints
 */

/**
 * Create new load
 * POST /api/v1/loads
 */
export const createLoad = async (req, res, next) => {
  try {
    const load = await loadService.createLoad(req.body, req.user?.id);

    // Trigger AI parsing if raw message available
    if (load.source_raw_message) {
      // Parse asynchronously (don't wait)
      loadService.processAiParsing(load.id).catch(err => {
        logger.error('Background AI parsing failed', { loadId: load.id, error: err.message });
      });
    }

    createdResponse(res, {
      id: load.id,
      publicId: load.public_id,
      status: load.status,
      message: 'Load submitted successfully and pending review',
    }, 'Load created');
  } catch (error) {
    next(error);
  }
};

/**
 * Get load by ID or public ID
 * GET /api/v1/loads/:id
 */
export const getLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const includePrivate = req.user?.permissions?.includes('loads.view_all') || false;

    const load = await loadService.getLoad(id, includePrivate);

    successResponse(res, load);
  } catch (error) {
    next(error);
  }
};

/**
 * List loads (public feed)
 * GET /api/v1/loads
 */
export const listLoads = async (req, res, next) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      originCountry: req.query.originCountry,
      destinationCountry: req.query.destinationCountry,
      pickupDateFrom: req.query.pickupDateFrom ? new Date(req.query.pickupDateFrom) : undefined,
      pickupDateTo: req.query.pickupDateTo ? new Date(req.query.pickupDateTo) : undefined,
      commodityCategoryId: req.query.commodityCategoryId,
      truckTypeId: req.query.truckTypeId,
      currency: req.query.currency,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
      search: req.query.search,
      sortBy: req.query.sortBy || 'created_at',
      sortOrder: req.query.sortOrder?.toUpperCase() || 'DESC',
    };

    const result = await loadService.listLoads(options);

    paginatedResponse(res, result.loads, result.pagination);
  } catch (error) {
    next(error);
  }
};

/**
 * Update load
 * PATCH /api/v1/loads/:id
 */
export const updateLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const load = await loadService.updateLoad(id, req.body, userId);

    successResponse(res, load, 'Load updated');
  } catch (error) {
    next(error);
  }
};

/**
 * Delete load
 * DELETE /api/v1/loads/:id
 */
export const deleteLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await loadService.deleteLoad(id, userId);

    successResponse(res, null, 'Load deleted');
  } catch (error) {
    next(error);
  }
};

/**
 * Get my loads (broker's own loads)
 * GET /api/v1/loads/my
 */
export const getMyLoads = async (req, res, next) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      brokerUserId: req.user.id,
      status: req.query.status,
      sortBy: req.query.sortBy || 'created_at',
      sortOrder: req.query.sortOrder?.toUpperCase() || 'DESC',
      excludeExpired: false,
    };

    const result = await loadService.listLoads(options);

    paginatedResponse(res, result.loads, result.pagination);
  } catch (error) {
    next(error);
  }
};

/**
 * Reparse load with AI
 * POST /api/v1/loads/:id/reparse
 */
export const reparseLoad = async (req, res, next) => {
  try {
    const { id } = req.params;

    const load = await loadService.processAiParsing(id);

    successResponse(res, load, 'Load reparsed successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Natural language search
 * POST /api/v1/loads/search
 */
export const naturalLanguageSearch = async (req, res, next) => {
  try {
    const { query } = req.body;

    if (!query) {
      throw new BadRequestError('Search query is required', 'MISSING_QUERY');
    }

    const result = await aiService.naturalLanguageSearch(query);

    successResponse(res, result, 'Search query processed');
  } catch (error) {
    next(error);
  }
};

/**
 * Moderate a load (approve/reject/mark fraud)
 * POST /api/v1/loads/:id/moderate
 */
export const moderateLoad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    const moderatorId = req.user.id;

    const load = await loadService.moderateLoad(id, action, moderatorId, notes);

    successResponse(res, load, `Load ${action}`);
  } catch (error) {
    next(error);
  }
};

/**
 * Get moderation queue
 * GET /api/v1/loads/moderation
 */
export const getModerationQueue = async (req, res, next) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      minConfidence: req.query.minConfidence ? parseFloat(req.query.minConfidence) : undefined,
      maxConfidence: req.query.maxConfidence ? parseFloat(req.query.maxConfidence) : undefined,
    };

    const result = await loadService.getModerationQueue(options, req.user.id);

    paginatedResponse(res, result.loads, result.pagination);
  } catch (error) {
    next(error);
  }
};

/**
 * Get load statistics (admin dashboard)
 * GET /api/v1/loads/stats
 */
export const getLoadStats = async (req, res, next) => {
  try {
    const stats = await loadService.getLoadStatistics();

    successResponse(res, stats);
  } catch (error) {
    next(error);
  }
};

/**
 * Get suggested price for a route
 * POST /api/v1/loads/suggest-price
 */
export const suggestPrice = async (req, res, next) => {
  try {
    const { origin, destination, cargoType, weightKg, truckType } = req.body;

    if (!origin || !destination) {
      throw new BadRequestError('Origin and destination are required', 'MISSING_ROUTE');
    }

    const suggestion = await aiService.getPriceSuggestion({
      origin,
      destination,
      cargoType,
      weightKg,
      truckType,
    });

    successResponse(res, suggestion, 'Price suggestion generated');
  } catch (error) {
    next(error);
  }
};

/**
 * Check for duplicates
 * GET /api/v1/loads/:id/duplicates
 */
export const checkDuplicates = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await loadService.checkForDuplicates(id);

    successResponse(res, result);
  } catch (error) {
    next(error);
  }
};

export default {
  createLoad,
  getLoad,
  listLoads,
  updateLoad,
  deleteLoad,
  getMyLoads,
  reparseLoad,
  naturalLanguageSearch,
  moderateLoad,
  getModerationQueue,
  getLoadStats,
  suggestPrice,
  checkDuplicates,
};
