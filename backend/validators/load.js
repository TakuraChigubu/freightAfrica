import { z } from 'zod';

// UUID validation
const uuidSchema = z.string().uuid('Invalid ID format');

// Date string validation
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)');

// ============================================
// Load Schemas
// ============================================

// Create load schema (public)
export const createLoadSchema = z.object({
  originRaw: z.string().min(2, 'Origin is required').max(255),
  originCountry: z.string().max(100).optional(),
  destinationRaw: z.string().min(2, 'Destination is required').max(255),
  destinationCountry: z.string().max(100).optional(),
  cargoType: z.string().max(200).optional(),
  commodityCategoryId: uuidSchema.optional(),
  description: z.string().max(2000).optional(),
  weightKg: z.number().positive().max(1000000).optional(),
  truckTypeId: uuidSchema.optional(),
  truckTypeRaw: z.string().max(100).optional(),
  numberOfTrucks: z.number().int().min(1).max(100).default(1),
  pickupDate: dateStringSchema.optional(),
  pickupDateFlexible: z.boolean().default(false),
  deliveryDate: dateStringSchema.optional(),
  deliveryDateFlexible: z.boolean().default(false),
  isHazardous: z.boolean().default(false),
  hazardousClass: z.string().max(50).optional(),
  hazardousNotes: z.string().max(500).optional(),
  currency: z.string().length(3).default('USD'),
  price: z.number().positive().max(1000000).optional(),
  pricePerTon: z.number().positive().max(100000).optional(),
  priceNegotiable: z.boolean().default(false),
  contactPhone: z.string().max(50).optional(),
  contactWhatsapp: z.string().max(50).optional(),
  brokerName: z.string().max(255).optional(),
  brokerCompany: z.string().max(255).optional(),
  brokerEmail: z.string().email().optional(),
  specialInstructions: z.string().max(1000).optional(),
});

// Update load schema
export const updateLoadSchema = createLoadSchema.partial();

// Load query schema
export const loadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.union([
    z.enum(['pending_review', 'moderation', 'published', 'expired', 'allocated', 'rejected', 'fraud']),
    z.array(z.enum(['pending_review', 'moderation', 'published', 'expired', 'allocated', 'rejected', 'fraud'])),
  ]).optional(),
  originCountry: z.string().max(100).optional(),
  destinationCountry: z.string().max(100).optional(),
  pickupDateFrom: dateStringSchema.optional(),
  pickupDateTo: dateStringSchema.optional(),
  commodityCategoryId: uuidSchema.optional(),
  truckTypeId: uuidSchema.optional(),
  currency: z.string().length(3).optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'pickup_date', 'price', 'view_count']).default('created_at'),
  sortOrder: z.enum(['ASC', 'DESC', 'asc', 'desc']).transform(v => v.toUpperCase()).default('DESC'),
});

// Moderate load schema
export const moderateLoadSchema = z.object({
  action: z.enum(['approve', 'reject', 'mark_fraud']),
  notes: z.string().max(1000).optional(),
});

// Load ID param schema
export const loadIdParamSchema = z.object({
  id: z.union([
    z.string().uuid(),
    z.string().regex(/^FL-[A-Z0-9]{6}$/)
  ]),
});

// Bulk update status schema
export const bulkStatusSchema = z.object({
  loadIds: z.array(uuidSchema).min(1).max(100),
  status: z.enum(['approved', 'rejected', 'archived']),
  reason: z.string().max(500).optional(),
});

// Create load from WhatsApp schema
export const createLoadFromWhatsappSchema = z.object({
  messageId: uuidSchema,
  rawData: z.object({
    from: z.string(),
    body: z.string(),
    timestamp: z.union([z.string(), z.number()]),
  }),
});

// Export types
export type CreateLoadInput = z.infer<typeof createLoadSchema>;
export type UpdateLoadInput = z.infer<typeof updateLoadSchema>;
export type LoadQueryInput = z.infer<typeof loadQuerySchema>;
export type ModerateLoadInput = z.infer<typeof moderateLoadSchema>;
export type LoadIdParam = z.infer<typeof loadIdParamSchema>;
