import { query } from '../database/pool.js';
import logger from '../utils/logger.js';

/**
 * Load Model - Database operations for freight loads
 */

/**
 * Create a new load
 */
export const create = async (data: {
  originRaw: string;
  originCountry?: string;
  destinationRaw: string;
  destinationCountry?: string;
  cargoType?: string;
  commodityCategoryId?: string;
  description?: string;
  weightKg?: number;
  truckTypeId?: string;
  truckTypeRaw?: string;
  numberOfTrucks?: number;
  pickupDate?: Date;
  pickupDateFlexible?: boolean;
  deliveryDate?: Date;
  deliveryDateFlexible?: boolean;
  isHazardous?: boolean;
  hazardousClass?: string;
  hazardousNotes?: string;
  currency?: string;
  price?: number;
  pricePerTon?: number;
  priceNegotiable?: boolean;
  loadSourceId?: string;
  sourceReference?: string;
  sourceRawMessage?: string;
  sourceMessageId?: string;
  rawPhone?: string;
  rawWhatsapp?: string;
  parsedPhone?: string;
  parsedWhatsapp?: string;
  brokerName?: string;
  brokerCompany?: string;
  brokerEmail?: string;
  brokerUserId?: string;
  specialInstructions?: string;
  internalNotes?: string;
  aiParsed?: boolean;
  aiConfidence?: number;
  aiConfidenceLevel?: string;
  aiRawResponse?: object;
  aiModel?: string;
  aiParsedAt?: Date;
  aiNeedsReview?: boolean;
  aiReviewReason?: string;
  status?: string;
  createdBy?: string;
}): Promise<any> => {
  const sql = `
    INSERT INTO loads (
      origin_raw, origin_country, destination_raw, destination_country,
      cargo_type, commodity_category_id, description, weight_kg,
      truck_type_id, truck_type_raw, number_of_trucks,
      pickup_date, pickup_date_flexible, delivery_date, delivery_date_flexible,
      is_hazardous, hazardous_class, hazardous_notes,
      currency, price, price_per_ton, price_negotiable,
      load_source_id, source_reference, source_raw_message, source_message_id,
      raw_phone, raw_whatsapp, parsed_phone, parsed_whatsapp,
      broker_name, broker_company, broker_email, broker_user_id,
      special_instructions, internal_notes,
      ai_parsed, ai_confidence, ai_confidence_level, ai_raw_response,
      ai_model, ai_parsed_at, ai_needs_review, ai_review_reason,
      status, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
      $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47
    ) RETURNING *
  `;

  const params = [
    data.originRaw,
    data.originCountry || null,
    data.destinationRaw,
    data.destinationCountry || null,
    data.cargoType || null,
    data.commodityCategoryId || null,
    data.description || null,
    data.weightKg || null,
    data.truckTypeId || null,
    data.truckTypeRaw || null,
    data.numberOfTrucks || 1,
    data.pickupDate || null,
    data.pickupDateFlexible || false,
    data.deliveryDate || null,
    data.deliveryDateFlexible || false,
    data.isHazardous || false,
    data.hazardousClass || null,
    data.hazardousNotes || null,
    data.currency || 'USD',
    data.price || null,
    data.pricePerTon || null,
    data.priceNegotiable || false,
    data.loadSourceId || null,
    data.sourceReference || null,
    data.sourceRawMessage || null,
    data.sourceMessageId || null,
    data.rawPhone || null,
    data.rawWhatsapp || null,
    data.parsedPhone || null,
    data.parsedWhatsapp || null,
    data.brokerName || null,
    data.brokerCompany || null,
    data.brokerEmail || null,
    data.brokerUserId || null,
    data.specialInstructions || null,
    data.internalNotes || null,
    data.aiParsed || false,
    data.aiConfidence || null,
    data.aiConfidenceLevel || null,
    JSON.stringify(data.aiRawResponse || {}),
    data.aiModel || null,
    data.aiParsedAt || null,
    data.aiNeedsReview || false,
    data.aiReviewReason || null,
    data.status || 'pending_review',
    data.createdBy || null,
  ];

  const result = await query(sql, params);
  logger.info('Load created', { loadId: result.rows[0].id, publicId: result.rows[0].public_id });
  return result.rows[0];
};

/**
 * Find load by ID
 */
export const findById = async (id: string): Promise<any | null> => {
  const sql = `
    SELECT l.*,
           cc.name as commodity_category_name,
           tt.name as truck_type_name,
           bc.name as border_crossing_name,
           bc.code as border_crossing_code
    FROM loads l
    LEFT JOIN commodity_categories cc ON l.commodity_category_id = cc.id
    LEFT JOIN truck_types tt ON l.truck_type_id = tt.id
    LEFT JOIN border_crossings bc ON l.border_crossing_id = bc.id
    WHERE l.id = $1
  `;
  const result = await query(sql, [id]);
  return result.rows[0] || null;
};

/**
 * Find load by public ID (FL-XXXXX)
 */
export const findByPublicId = async (publicId: string): Promise<any | null> => {
  const sql = `
    SELECT l.*,
           cc.name as commodity_category_name,
           tt.name as truck_type_name,
           bc.name as border_crossing_name,
           bc.code as border_crossing_code
    FROM loads l
    LEFT JOIN commodity_categories cc ON l.commodity_category_id = cc.id
    LEFT JOIN truck_types tt ON l.truck_type_id = tt.id
    LEFT JOIN border_crossings bc ON l.border_crossing_id = bc.id
    WHERE l.public_id = $1
  `;
  const result = await query(sql, [publicId]);
  return result.rows[0] || null;
};

/**
 * Update load
 */
export const update = async (id: string, data: Partial<{
  originRaw: string;
  destinationRaw: string;
  cargoType: string;
  description: string;
  weightKg: number;
  pickupDate: Date;
  deliveryDate: Date;
  price: number;
  status: string;
  statusReason: string;
  moderatedBy: string;
  moderatedAt: Date;
  moderatorNotes: string;
  publishedAt: Date;
  expiresAt: Date;
  aiConfidence: number;
  aiConfidenceLevel: string;
  aiNeedsReview: boolean;
  duplicateOfId: string;
  duplicateScore: number;
}>): Promise<any | null> => {
  const allowedFields: Record<string, string> = {
    originRaw: 'origin_raw',
    destinationRaw: 'destination_raw',
    cargoType: 'cargo_type',
    description: 'description',
    weightKg: 'weight_kg',
    pickupDate: 'pickup_date',
    deliveryDate: 'delivery_date',
    price: 'price',
    status: 'status',
    statusReason: 'status_reason',
    moderatedBy: 'moderated_by',
    moderatedAt: 'moderated_at',
    moderatorNotes: 'moderator_notes',
    publishedAt: 'published_at',
    expiresAt: 'expires_at',
    aiConfidence: 'ai_confidence',
    aiConfidenceLevel: 'ai_confidence_level',
    aiNeedsReview: 'ai_needs_review',
    duplicateOfId: 'duplicate_of_id',
    duplicateScore: 'duplicate_score',
    duplicateCheckedAt: 'duplicate_checked_at',
  };

  const updates: string[] = ['updated_at = NOW()'];
  const params: any[] = [id];
  let paramCount = 2;

  for (const [key, value] of Object.entries(data)) {
    const dbField = allowedFields[key];
    if (dbField) {
      updates.push(`${dbField} = $${paramCount++}`);
      params.push(value);
    }
  }

  if (updates.length === 1) {
    return findById(id);
  }

  const sql = `
    UPDATE loads
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, params);
  return result.rows[0] || null;
};

/**
 * Update load status
 */
export const updateStatus = async (
  id: string,
  status: string,
  reason?: string,
  changedBy?: string
): Promise<any | null> => {
  const sql = `
    UPDATE loads
    SET status = $2,
        status_reason = $3,
        status_changed_at = NOW(),
        status_changed_by = $4,
        published_at = CASE WHEN $2 = 'published' THEN NOW() ELSE published_at END,
        expires_at = CASE WHEN $2 = 'published' THEN NOW() + INTERVAL '7 days' ELSE expires_at END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [id, status, reason || null, changedBy || null]);
  return result.rows[0] || null;
};

/**
 * Increment view count
 */
export const incrementViewCount = async (id: string): Promise<void> => {
  const sql = `
    UPDATE loads SET view_count = view_count + 1 WHERE id = $1
  `;
  await query(sql, [id]);
};

/**
 * Increment unlock count
 */
export const incrementUnlockCount = async (id: string): Promise<void> => {
  const sql = `
    UPDATE loads SET unlock_count = unlock_count + 1 WHERE id = $1
  `;
  await query(sql, [id]);
};

/**
 * List loads with filtering and pagination
 */
export const list = async (options: {
  page?: number;
  limit?: number;
  status?: string | string[];
  originCountry?: string;
  destinationCountry?: string;
  pickupDateFrom?: Date;
  pickupDateTo?: Date;
  commodityCategoryId?: string;
  truckTypeId?: string;
  currency?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  brokerUserId?: string;
  createdById?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  excludeExpired?: boolean;
}): Promise<{ loads: any[]; total: number }> => {
  const {
    page = 1,
    limit = 20,
    status,
    originCountry,
    destinationCountry,
    pickupDateFrom,
    pickupDateTo,
    commodityCategoryId,
    truckTypeId,
    currency,
    minPrice,
    maxPrice,
    search,
    brokerUserId,
    createdById,
    sortBy = 'created_at',
    sortOrder = 'DESC',
    excludeExpired = true,
  } = options;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramCount = 1;

  // Status filter
  if (status) {
    if (Array.isArray(status)) {
      conditions.push(`l.status = ANY($${paramCount++})`);
      params.push(status);
    } else {
      conditions.push(`l.status = $${paramCount++}`);
      params.push(status);
    }
  }

  // Exclude expired loads by default
  if (excludeExpired) {
    conditions.push(`(l.expires_at IS NULL OR l.expires_at > NOW())`);
  }

  // Origin country
  if (originCountry) {
    conditions.push(`l.origin_country = $${paramCount++}`);
    params.push(originCountry);
  }

  // Destination country
  if (destinationCountry) {
    conditions.push(`l.destination_country = $${paramCount++}`);
    params.push(destinationCountry);
  }

  // Pickup date range
  if (pickupDateFrom) {
    conditions.push(`l.pickup_date >= $${paramCount++}`);
    params.push(pickupDateFrom);
  }
  if (pickupDateTo) {
    conditions.push(`l.pickup_date <= $${paramCount++}`);
    params.push(pickupDateTo);
  }

  // Commodity category
  if (commodityCategoryId) {
    conditions.push(`l.commodity_category_id = $${paramCount++}`);
    params.push(commodityCategoryId);
  }

  // Truck type
  if (truckTypeId) {
    conditions.push(`l.truck_type_id = $${paramCount++}`);
    params.push(truckTypeId);
  }

  // Currency
  if (currency) {
    conditions.push(`l.currency = $${paramCount++}`);
    params.push(currency);
  }

  // Price range
  if (minPrice) {
    conditions.push(`l.price >= $${paramCount++}`);
    params.push(minPrice);
  }
  if (maxPrice) {
    conditions.push(`l.price <= $${paramCount++}`);
    params.push(maxPrice);
  }

  // Search (full-text search)
  if (search) {
    conditions.push(`(
      l.origin_raw ILIKE $${paramCount} OR
      l.destination_raw ILIKE $${paramCount} OR
      l.cargo_type ILIKE $${paramCount} OR
      l.description ILIKE $${paramCount} OR
      l.broker_name ILIKE $${paramCount} OR
      l.broker_company ILIKE $${paramCount}
    )`);
    params.push(`%${search}%`);
    paramCount++;
  }

  // Broker user
  if (brokerUserId) {
    conditions.push(`l.broker_user_id = $${paramCount++}`);
    params.push(brokerUserId);
  }

  // Created by
  if (createdById) {
    conditions.push(`l.created_by = $${paramCount++}`);
    params.push(createdById);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // Validate sort column
  const validSortColumns = [
    'created_at', 'updated_at', 'pickup_date', 'price', 'view_count',
    'unlock_count', 'ai_confidence'
  ];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const offset = (page - 1) * limit;

  // Get total count
  const countSql = `
    SELECT COUNT(*) as total FROM loads l
    ${whereClause}
  `;
  const countResult = await query(countSql, params);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get loads
  const sql = `
    SELECT l.*,
           cc.name as commodity_category_name,
           tt.name as truck_type_name,
           bc.name as border_crossing_name
    FROM loads l
    LEFT JOIN commodity_categories cc ON l.commodity_category_id = cc.id
    LEFT JOIN truck_types tt ON l.truck_type_id = tt.id
    LEFT JOIN border_crossings bc ON l.border_crossing_id = bc.id
    ${whereClause}
    ORDER BY l.${sortColumn} ${order}
    LIMIT $${paramCount++} OFFSET $${paramCount}
  `;

  params.push(limit, offset);
  const result = await query(sql, params);

  return {
    loads: result.rows,
    total,
  };
};

/**
 * Get loads pending moderation
 */
export const getPendingModeration = async (options: {
  page?: number;
  limit?: number;
  category?: string;
  minConfidence?: number;
  maxConfidence?: number;
}): Promise<{ loads: any[]; total: number }> => {
  const { page = 1, limit = 50, category, minConfidence, maxConfidence } = options;

  const conditions = [`l.status IN ('pending_review', 'moderation')`];

  if (minConfidence !== undefined) {
    conditions.push(`l.ai_confidence >= ${minConfidence}`);
  }
  if (maxConfidence !== undefined) {
    conditions.push(`l.ai_confidence <= ${maxConfidence}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Get count
  const countSql = `SELECT COUNT(*) as total FROM loads l ${whereClause}`;
  const countResult = await query(countSql);
  const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Get loads
  const offset = (page - 1) * limit;
  const sql = `
    SELECT l.*, cc.name as commodity_category_name
    FROM loads l
    LEFT JOIN commodity_categories cc ON l.commodity_category_id = cc.id
    ${whereClause}
    ORDER BY l.ai_confidence ASC, l.created_at ASC
    LIMIT $1 OFFSET $2
  `;

  const result = await query(sql, [limit, offset]);

  return { loads: result.rows, total };
};

/**
 * Find potential duplicates
 */
export const findPotentialDuplicates = async (load: {
  parsedPhone?: string;
  originRaw: string;
  destinationRaw: string;
  cargoType?: string;
  price?: number;
}): Promise<any[]> => {
  // Look for loads with similar characteristics in the last 7 days
  const sql = `
    SELECT l.*,
           CASE
             WHEN l.parsed_phone = $1 THEN 30
             ELSE 0
           END +
           CASE
             WHEN SIMILARITY(l.origin_raw, $2) > 0.7 THEN 25
             ELSE 0
           END +
           CASE
             WHEN SIMILARITY(l.destination_raw, $3) > 0.7 THEN 25
             ELSE 0
           END +
           CASE
             WHEN $4 IS NOT NULL AND l.cargo_type = $4 THEN 10
             ELSE 0
           END +
           CASE
             WHEN $5 IS NOT NULL AND l.price IS NOT NULL AND ABS(l.price - $5) < ($5 * 0.1) THEN 10
             ELSE 0
           END as duplicate_score
    FROM loads l
    WHERE l.status = 'published'
      AND l.created_at > NOW() - INTERVAL '7 days'
      AND l.parsed_phone = $1 OR (
        SIMILARITY(l.origin_raw, $2) > 0.5
        AND SIMILARITY(l.destination_raw, $3) > 0.5
      )
    HAVING duplicate_score > 50
    ORDER BY duplicate_score DESC
    LIMIT 5
  `;

  const result = await query(sql, [
    load.parsedPhone || null,
    load.originRaw,
    load.destinationRaw,
    load.cargoType || null,
    load.price || null,
  ]);

  return result.rows;
};

/**
 * Get load statistics
 */
export const getStatistics = async (): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byCountry: Record<string, { origin: number; destination: number }>;
  avgPrice: number;
  avgConfidence: number;
}> => {
  // Total count
  const totalSql = `SELECT COUNT(*) as total FROM loads`;
  const totalResult = await query(totalSql);
  const total = parseInt(totalResult.rows[0]?.total ?? '0', 10);

  // By status
  const statusSql = `
    SELECT status, COUNT(*) as count
    FROM loads
    GROUP BY status
  `;
  const statusResult = await query(statusSql);
  const byStatus: Record<string, number> = {};
  for (const row of statusResult.rows) {
    byStatus[row.status] = parseInt(row.count, 10);
  }

  // By country
  const countrySql = `
    SELECT origin_country, destination_country, COUNT(*) as count
    FROM loads
    WHERE status = 'published'
    GROUP BY origin_country, destination_country
  `;
  const countryResult = await query(countrySql);
  const byCountry: Record<string, { origin: number; destination: number }> = {};
  for (const row of countryResult.rows) {
    const origin = row.origin_country || 'Unknown';
    const dest = row.destination_country || 'Unknown';
    if (!byCountry[origin]) byCountry[origin] = { origin: 0, destination: 0 };
    if (!byCountry[dest]) byCountry[dest] = { origin: 0, destination: 0 };
    byCountry[origin].origin += parseInt(row.count, 10);
    byCountry[dest].destination += parseInt(row.count, 10);
  }

  // Average price
  const priceSql = `
    SELECT AVG(price) as avg_price
    FROM loads
    WHERE status = 'published' AND price IS NOT NULL
  `;
  const priceResult = await query(priceSql);
  const avgPrice = parseFloat(priceResult.rows[0]?.avg_price ?? '0');

  // Average AI confidence
  const confSql = `
    SELECT AVG(ai_confidence) as avg_confidence
    FROM loads
    WHERE ai_confidence IS NOT NULL
  `;
  const confResult = await query(confSql);
  const avgConfidence = parseFloat(confResult.rows[0]?.avg_confidence ?? '0');

  return {
    total,
    byStatus,
    byCountry,
    avgPrice,
    avgConfidence,
  };
};

/**
 * Delete load (soft delete by updating status)
 */
export const softDelete = async (id: string, deletedBy: string): Promise<boolean> => {
  const sql = `
    UPDATE loads
    SET status = 'deleted',
        status_reason = 'Deleted by user',
        status_changed_by = $2,
        status_changed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
  `;
  const result = await query(sql, [id, deletedBy]);
  return (result.rowCount ?? 0) > 0;
};

export default {
  create,
  findById,
  findByPublicId,
  update,
  updateStatus,
  incrementViewCount,
  incrementUnlockCount,
  list,
  getPendingModeration,
  findPotentialDuplicates,
  getStatistics,
  softDelete,
};
