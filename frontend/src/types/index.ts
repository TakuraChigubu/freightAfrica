// API Types

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  avatar: string | null;
  roleId: string;
  roleName: string;
  organisationId: string | null;
  emailVerified: boolean;
  permissions: string[];
  createdAt: string;
}

export interface Load {
  id: string;
  publicId: string;
  origin: string;
  originCountry: string | null;
  destination: string;
  destinationCountry: string | null;
  cargoType: string | null;
  commodityCategory: string | null;
  description: string | null;
  weightKg: number | null;
  truckType: string | null;
  numberOfTrucks: number;
  pickupDate: string | null;
  deliveryDate: string | null;
  isHazardous: boolean;
  currency: string;
  price: number | null;
  pricePerTon: number | null;
  priceNegotiable: boolean;
  aiConfidence: number | null;
  aiConfidenceLevel: 'high' | 'medium' | 'low' | 'failed' | null;
  status: string;
  publishedAt: string | null;
  expiresAt: string | null;
  viewCount: number;
  unlockCount: number;
  createdAt: string;
  specialInstructions?: string;
}

export interface LoadWithBroker extends Load {
  brokerContact?: {
    phone: string;
    whatsapp: string;
    brokerName: string;
    brokerCompany: string;
    brokerEmail?: string;
  };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string; code: string }[];
  };
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  timestamp: string;
}

export interface ApiPaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: Pagination;
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
export type PaginatedResponse<T> = ApiPaginatedResponse<T> | ApiErrorResponse;

// Auth Types
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone?: string;
  acceptTerms: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Payment Types
export interface PaymentMethod {
  type: 'wallet' | 'ecocash' | 'onemoney' | 'zipit' | 'card';
  phoneNumber?: string;
}

export interface UnlockResult {
  unlockId: string;
  accessExpiresAt: string;
  contact: {
    phone: string;
    whatsapp: string;
    brokerName: string;
    brokerCompany: string;
    brokerEmail?: string;
  };
}

// Pricing Types
export interface PricingBundle {
  id: string;
  name: string;
  unlocks: number;
  price: number;
  pricePerUnlock: number;
  savingsPercent: number;
  description: string;
  isDefault: boolean;
  paynowFeeRatio: number;
}

export interface PricingInfo {
  bundles: PricingBundle[];
  costFloor: {
    costPerLoad: number;
    minimumViablePrice: number;
  };
  paynowFees: {
    flatFee: number;
    percentageFee: number;
    singleUnlockFee: number;
    bundleFee: number;
  };
  unlockDurationHours: number;
}

export interface UserCredits {
  totalCredits: number;
  activeBundles: Array<{
    id: string;
    bundleType: string;
    remaining: number;
    expiresAt: string | null;
  }>;
  bundleHistory: Array<{
    id: string;
    publicId: string;
    bundleType: string;
    bundleName: string;
    totalUnlocks: number;
    unlocksRemaining: number;
    unlocksUsed: number;
    pricePaid: number;
    isActive: boolean;
    expiresAt: string | null;
    createdAt: string;
    paymentStatus: string;
  }>;
}

export interface BundlePurchaseResult {
  bundleId: string;
  publicId: string;
  paymentStatus: 'pending' | 'confirmed';
  paymentId: string;
  paynowPollUrl?: string;
  paynowRedirectUrl?: string;
  message: string;
}

// Form Types
export interface LoadFilters {
  originCountry?: string;
  destinationCountry?: string;
  pickupDateFrom?: string;
  pickupDateTo?: string;
  commodityCategoryId?: string;
  truckTypeId?: string;
  currency?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}
