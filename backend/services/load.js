import { v4 as uuidv4 } from 'uuid';
import * as loadModel from '../models/load.js';
import * as aiService from './ai.js';
import { query } from '../database/pool.js';
import logger from '../utils/logger.js';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  DuplicateLoadError,
  LoadNotFoundError,
  LoadExpiredError,
  ForbiddenError,
} from '../utils/errors.js';

/**
 * Load Service
 * Business logic for freight load management
 */

/**
 * Create a new load (manual entry)
 */
export const createLoad = async (data: any, userId?: string): Promise<any> => {
  // Get manual load source ID
  const sourceResult = await query(
    "SELECT id FROM load_sources WHERE code = 'manual'"
  );
  const loadSourceId = sourceResult.rows[0]?.id;

  const load = await loadModel.create({
    ...data,
    loadSourceId,
    createdBy: userId,
    brokerUserId: userId,
    status: 'pending_review',
  });

  logger.info('Load created manually', { loadId: load.id, userId });

  return load;
};

/**
 * Create load from WhatsApp message
 */
export const createLoadFromWhatsapp = async (
  messageId: string,
  rawData: { from: string; body: string; timestamp: string | number },
  parsedData?: any
): Promise<any> => {
  // Get WhatsApp load source ID
  const sourceResult = await query(
    "SELECT id FROM load_sources WHERE code = 'whatsapp'"
  );
  const loadSourceId = sourceResult.rows[0]?.id;

  const load = await loadModel.create({
    originRaw: parsedData?.origin || 'Unknown',
    destinationRaw: parsedData?.destination || 'Unknown',
    rawPhone: rawData.from,
    rawWhatsapp: rawData.from,
    parsedPhone: parsedData?.contactPhone,
    parsedWhatsapp: parsedData?.contactWhatsapp,
    cargoType: parsedData?.cargoType,
    description: parsedData?.description || rawData.body,
    pickupDate: parsedData?.pickupDate ? new Date(parsedData.pickupDate) : undefined,
    deliveryDate: parsedData?.deliveryDate ? new Date(parsedData.deliveryDate) : undefined,
    truckTypeRaw: parsedData?.truckType,
    numberOfTrucks: parsedData?.numberOfTrucks || 1,
    weightKg: parsedData?.weight,
    price: parsedData?.price,
    currency: parsedData?.currency || 'USD',
    brokerName: parsedData?.brokerName,
    brokerCompany: parsedData?.company,
    specialInstructions: parsedData?.specialInstructions,
    isHazardous: parsedData?.isHazardous || false,
    loadSourceId,
    sourceRawMessage: rawData.body,
    sourceMessageId: messageId,
    aiParsed: !!parsedData,
    aiConfidence: parsedData?._confidence,
    aiConfidenceLevel: parsedData?._confidenceLevel,
    aiRawResponse: parsedData?._rawResponse,
    aiModel: parsedData?._model,
    aiParsedAt: new Date(),
    aiNeedsReview: parsedData?._needsReview,
    status: parsedData?._needsReview ? 'moderation' : 'pending_review',
  });

  logger.info('Load created from WhatsApp', {
    loadId: load.id,
    messageId,
    aiParsed: !!parsedData,
  });

  return load;
};

/**
 * Get load by ID or public ID
 */
export const getLoad = async (idOrPublicId: string, includePrivate = false): Promise<any> => {
  let load;

  // Check if it's a UUID or public ID
  if (idOrPublicId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    load = await loadModel.findById(idOrPublicId);
  } else {
    load = await loadModel.findByPublicId(idOrPublicId);
  }

  if (!load) {
    throw new LoadNotFoundError();
  }

  // Increment view count
  await loadModel.incrementViewCount(load.id);

  // Prepare public view (hide broker contact info)
  const publicLoad = {
    id: load.id,
    publicId: load.public_id,
    origin: load.origin_raw,
    originCountry: load.origin_country,
    destination: load.destination_raw,
    destinationCountry: load.destination_country,
    cargoType: load.cargo_type,
    commodityCategory: load.commodity_category_name,
    description: load.description,
    weightKg: load.weight_kg,
    truckType: load.truck_type_name || load.truck_type_raw,
    numberOfTrucks: load.number_of_trucks,
    pickupDate: load.pickup_date,
    pickupDateFlexible: load.pickup_date_flexible,
    deliveryDate: load.delivery_date,
    deliveryDateFlexible: load.delivery_date_flexible,
    isHazardous: load.is_hazardous,
    currency: load.currency,
    price: load.price,
    pricePerTon: load.price_per_ton,
    priceNegotiable: load.price_negotiable,
    aiConfidence: load.ai_confidence,
    aiConfidenceLevel: load.ai_confidence_level,
    status: load.status,
    publishedAt: load.published_at,
    expiresAt: load.expires_at,
    viewCount: load.view_count,
    unlockCount: load.unlock_count,
    createdAt: load.created_at,
    specialInstructions: load.special_instructions,
  };

  // Include private broker info only if authorized
  if (includePrivate) {
    return {
      ...publicLoad,
      brokerContact: {
        phone: load.parsed_phone || load.raw_phone,
        whatsapp: load.parsed_whatsapp || load.raw_whatsapp,
        name: load.broker_name,
        company: load.broker_company,
        email: load.broker_email,
      },
    };
  }

  return publicLoad;
};

/**
 * List loads (public feed)
 */
export const listLoads = async (options: any): Promise<{ loads: any[]; pagination: any }> => {
  // Only show published loads for public feed
  const result = await loadModel.list({
    ...options,
    status: 'published',
    excludeExpired: true,
  });

  const loads = result.loads.map(load => ({
    id: load.id,
    publicId: load.public_id,
    origin: load.origin_raw,
    originCountry: load.origin_country,
    destination: load.destination_raw,
    destinationCountry: load.destination_country,
    cargoType: load.cargo_type,
    commodityCategory: load.commodity_category_name,
    weightKg: load.weight_kg,
    truckType: load.truck_type_name || load.truck_type_raw,
    numberOfTrucks: load.number_of_trucks,
    pickupDate: load.pickup_date,
    deliveryDate: load.delivery_date,
    isHazardous: load.is_hazardous,
    currency: load.currency,
    price: load.price,
    aiConfidence: load.ai_confidence,
    aiConfidenceLevel: load.ai_confidence_level,
    publishedAt: load.published_at,
    expiresAt: load.expires_at,
    viewCount: load.view_count,
    unlockCount: load.unlock_count,
  }));

  const totalPages = Math.ceil(result.total / options.limit);

  return {
    loads,
    pagination: {
      page: options.page,
      limit: options.limit,
      total: result.total,
      totalPages,
      hasNext: options.page < totalPages,
      hasPrev: options.page > 1,
    },
  };
};

/**
 * Process AI parsing for a load
 */
export const processAiParsing = async (loadId: string): Promise<any> => {
  const load = await loadModel.findById(loadId);

  if (!load) {
    throw new LoadNotFoundError();
  }

  if (!load.source_raw_message) {
    throw new BadRequestError('No raw message to parse', 'NO_MESSAGE');
  }

  // Parse with Gemini
  const parseResult = await aiService.parseFreightMessage(load.source_raw_message);

  // Update load with parsed data
  const updated = await loadModel.update(loadId, {
    originRaw: parseResult.origin || load.origin_raw,
    destinationRaw: parseResult.destination || load.destination_raw,
    cargoType: parseResult.cargoType || load.cargo_type,
    pickupDate: parseResult.pickupDate ? new Date(parseResult.pickupDate) : undefined,
    deliveryDate: parseResult.deliveryDate ? new Date(parseResult.deliveryDate) : undefined,
    truckTypeRaw: parseResult.truckType,
    weightKg: parseResult.weight,
    numberOfTrucks: parseResult.numberOfTrucks || 1,
    price: parseResult.price,
    currency: parseResult.currency || 'USD',
    brokerName: parseResult.brokerName,
    parsedPhone: parseResult.contactPhone,
    parsedWhatsapp: parseResult.contactWhatsapp,
    isHazardous: parseResult.isHazardous || false,
    aiParsed: true,
    aiConfidence: parseResult._confidence,
    aiConfidenceLevel: parseResult._confidenceLevel,
    aiRawResponse: parseResult._rawResponse,
    aiModel: parseResult._model,
    aiParsedAt: new Date(),
    aiNeedsReview: parseResult._needsReview,
    status: parseResult._needsReview ? 'moderation' : 'pending_review',
  });

  logger.info('AI parsing processed', {
    loadId,
    confidence: parseResult._confidence,
    needsReview: parseResult._needsReview,
  });

  return updated;
};

/**
 * Moderate a load
 */
export const moderateLoad = async (
  loadId: string,
  action: 'approve' | 'reject' | 'mark_fraud',
  moderatorId: string,
  notes?: string
): Promise<any> => {
  const load = await loadModel.findById(loadId);

  if (!load) {
    throw new LoadNotFoundError();
  }

  if (!['pending_review', 'moderation'].includes(load.status)) {
    throw new BadRequestError('Load is not pending moderation', 'INVALID_STATUS');
  }

  let newStatus: string;
  let statusReason: string;

  switch (action) {
    case 'approve':
      newStatus = 'published';
      statusReason = 'Approved by moderator';
      break;
    case 'reject':
      newStatus = 'rejected';
      statusReason = notes || 'Rejected by moderator';
      break;
    case 'mark_fraud':
      newStatus = 'fraud';
      statusReason = notes || 'Marked as fraud by moderator';
      break;
  }

  const updated = await loadModel.updateStatus(loadId, newStatus, statusReason, moderatorId);

  if (action === 'approve') {
    await loadModel.update(loadId, {
      moderatedBy: moderatorId,
      moderatedAt: new Date(),
      moderatorNotes: notes,
    });
  }

  logger.info('Load moderated', {
    loadId,
    action,
    newStatus,
    moderatorId,
  });

  return updated;
};

/**
 * Check for duplicates before publishing
 */
export const checkForDuplicates = async (loadId: string): Promise<{
  hasDuplicates: boolean;
  duplicates: any[];
  similarity: number;
}> => {
  const load = await loadModel.findById(loadId);

  if (!load) {
    throw new LoadNotFoundError();
  }

  const duplicates = await loadModel.findPotentialDuplicates({
    parsedPhone: load.parsed_phone,
    originRaw: load.origin_raw,
    destinationRaw: load.destination_raw,
    cargoType: load.cargo_type,
    price: load.price,
  });

  const maxSimilarity = duplicates.length > 0
    ? Math.max(...duplicates.map(d => d.duplicate_score || 0))
    : 0;

  // Update load with duplicate info
  await loadModel.update(loadId, {
    duplicateScore: maxSimilarity,
    duplicateCheckedAt: new Date(),
  });

  if (duplicates.length > 0 && maxSimilarity >= 85) {
    await loadModel.update(loadId, {
      duplicateOfId: duplicates[0].id,
    });
  }

  return {
    hasDuplicates: duplicates.length > 0,
    duplicates: duplicates.map(d => ({
      id: d.id,
      publicId: d.public_id,
      origin: d.origin_raw,
      destination: d.destination_raw,
      similarity: d.duplicate_score,
    })),
    similarity: maxSimilarity,
  };
};

/**
 * Get moderation queue
 */
export const getModerationQueue = async (
  options: any,
  moderatorId?: string
): Promise<{ loads: any[]; pagination: any }> => {
  const result = await loadModel.getPendingModeration(options);

  const loads = result.loads.map(load => ({
    id: load.id,
    publicId: load.public_id,
    origin: load.origin_raw,
    destination: load.destination_raw,
    cargoType: load.cargo_type,
    rawMessage: load.source_raw_message,
    aiConfidence: load.ai_confidence,
    aiConfidenceLevel: load.ai_confidence_level,
    brokerName: load.broker_name,
    brokerCompany: load.broker_company,
    contactPhone: load.parsed_phone || load.raw_phone,
    contactWhatsapp: load.parsed_whatsapp || load.raw_whatsapp,
    price: load.price,
    currency: load.currency,
    createdAt: load.created_at,
    aiReviewReason: load.ai_review_reason,
  }));

  const totalPages = Math.ceil(result.total / options.limit);

  return {
    loads,
    pagination: {
      page: options.page,
      limit: options.limit,
      total: result.total,
      totalPages,
      hasNext: options.page < totalPages,
      hasPrev: options.page > 1,
    },
  };
};

/**
 * Update load
 */
export const updateLoad = async (
  loadId: string,
  data: any,
  userId: string
): Promise<any> => {
  const load = await loadModel.findById(loadId);

  if (!load) {
    throw new LoadNotFoundError();
  }

  // Check ownership or moderator permission
  if (load.broker_user_id !== userId && load.created_by !== userId) {
    // TODO: Add proper role/permission check
    throw new ForbiddenError('You do not have permission to update this load');
  }

  const updated = await loadModel.update(loadId, data);

  logger.info('Load updated', { loadId, userId });

  return updated;
};

/**
 * Delete load (soft delete)
 */
export const deleteLoad = async (loadId: string, userId: string): Promise<void> => {
  const load = await loadModel.findById(loadId);

  if (!load) {
    throw new LoadNotFoundError();
  }

  // Check ownership
  if (load.broker_user_id !== userId && load.created_by !== userId) {
    throw new ForbiddenError('You do not have permission to delete this load');
  }

  await loadModel.softDelete(loadId, userId);

  logger.info('Load deleted', { loadId, userId });
};

/**
 * Get load statistics
 */
export const getLoadStatistics = async (): Promise<any> => {
  return loadModel.getStatistics();
};

/**
 * Expire old loads (cron job)
 */
export const expireOldLoads = async (): Promise<number> => {
  const sql = `
    UPDATE loads
    SET status = 'expired',
        status_reason = 'Expired automatically',
        status_changed_at = NOW()
    WHERE status = 'published'
      AND expires_at < NOW()
      AND expires_at IS NOT NULL
  `;

  const result = await query(sql);
  const expiredCount = result.rowCount ?? 0;

  if (expiredCount > 0) {
    logger.info('Loads expired', { count: expiredCount });
  }

  return expiredCount;
};

export default {
  createLoad,
  createLoadFromWhatsapp,
  getLoad,
  listLoads,
  processAiParsing,
  moderateLoad,
  checkForDuplicates,
  getModerationQueue,
  updateLoad,
  deleteLoad,
  getLoadStatistics,
  expireOldLoads,
};
