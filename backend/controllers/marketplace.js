import * as marketplaceService from '../services/marketplace.js';
import logger from '../utils/logger.js';

/**
 * Marketplace Controller
 * Marketplace endpoints for goods and vehicles
 */

/**
 * Get marketplace items
 */
export const getItems = async (req, res, next) => {
  try {
    const { page, limit, category, search, country, minPrice, maxPrice } = req.query;

    const result = await marketplaceService.getItems({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      category,
      search,
      country,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to get marketplace items', { error: error.message });
    next(error);
  }
};

/**
 * Get single marketplace item
 */
export const getItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await marketplaceService.getItemById(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    // Don't expose contact info until unlocked
    const publicItem = {
      id: item.id,
      publicId: item.publicId,
      title: item.title,
      description: item.description,
      category: item.category,
      price: item.price,
      priceNegotiable: item.priceNegotiable,
      currency: item.currency,
      location: item.location,
      country: item.country,
      imageUrls: item.imageUrls,
      viewCount: item.viewCount,
      unlockCount: item.unlockCount,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
    };

    res.json({
      success: true,
      data: publicItem,
    });
  } catch (error) {
    logger.error('Failed to get marketplace item', { error: error.message, itemId: req.params.id });
    next(error);
  }
};

/**
 * Create marketplace item
 */
export const createItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemData = req.body;

    const item = await marketplaceService.createItem(userId, itemData);

    res.status(201).json({
      success: true,
      data: item,
      message: 'Item submitted for approval',
    });
  } catch (error) {
    logger.error('Failed to create marketplace item', { error: error.message });
    next(error);
  }
};

/**
 * Unlock marketplace item contact
 */
export const unlockItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await marketplaceService.unlockItemContact(userId, id, {
      deviceFingerprint: req.headers['x-device-fingerprint'],
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to unlock marketplace item', { error: error.message, itemId: req.params.id });
    next(error);
  }
};

/**
 * Approve marketplace item (admin)
 */
export const approveItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await marketplaceService.approveItem(id);

    res.json({
      success: true,
      data: item,
      message: 'Item approved',
    });
  } catch (error) {
    logger.error('Failed to approve item', { error: error.message, itemId: req.params.id });
    next(error);
  }
};

/**
 * Reject marketplace item (admin)
 */
export const rejectItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const item = await marketplaceService.rejectItem(id, reason);

    res.json({
      success: true,
      data: item,
      message: 'Item rejected',
    });
  } catch (error) {
    logger.error('Failed to reject item', { error: error.message, itemId: req.params.id });
    next(error);
  }
};

export default {
  getItems,
  getItem,
  createItem,
  unlockItem,
  approveItem,
  rejectItem,
};
