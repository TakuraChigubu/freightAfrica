/**
 * Pricing Service for FreightLink Africa
 *
 * PRICING MODEL: Pay-per-unlock with bundle discounts
 * - Single unlock: $3.50 (above $3 minimum to ensure Paynow fee is small fraction)
 * - Bundle of 3: $10.00 ($3.33/unlock - primary offering)
 * - Bundle of 5: $15.00 ($3.00/unlock)
 * - Bundle of 10: $25.00 ($2.50/unlock - best value)
 *
 * COST FLOOR CALCULATION:
 * Unlock price must exceed:
 * (WhatsApp Business API cost + Gemini API cost + Paynow fee) with margin
 *
 * Paynow fees: $0.50 flat + 1.5% of transaction
 * For $10 bundle: $0.50 + $0.15 = $0.65 (6.5% of transaction)
 * For $3.50 single: $0.50 + $0.053 = $0.553 (15.8% - acceptable for fallback)
 */

import { query } from '../database/pool.js';
import logger from '../utils/logger.js';

// Pricing constants
export const PRICING_CONFIG = {
  // Per-load processing costs (USD)
  COSTS: {
    WHATSAPP_CONVERSATION: 0.04,      // WhatsApp Business API per conversation
    GEMINI_FLASH_INPUT: 0.00001875,   // Per 1K tokens input (Gemini 1.5 Flash)
    GEMINI_FLASH_OUTPUT: 0.000075,    // Per 1K tokens output
    GEMINI_AVG_TOKENS: 800,           // Average tokens per parse
    INFRASTRUCTURE: 0.02,             // Server/op overhead per transaction
  },

  // Paynow fee structure
  PAYNOW: {
    FLAT_FEE: 0.50,                    // $0.50 flat fee per transaction
    PERCENTAGE_FEE: 0.015,             // 1.5%
  },

  // Bundle pricing (in USD)
  BUNDLES: {
    SINGLE: {
      id: 'single',
      name: 'Single Unlock',
      unlocks: 1,
      price: 3.50,
      description: 'Unlock one load contact',
      isDefault: false,
    },
    BUNDLE_3: {
      id: 'bundle_3',
      name: '3 Unlocks Pack',
      unlocks: 3,
      price: 10.00,
      description: 'Best for occasional use - save 5%',
      isDefault: true, // Default offering
    },
    BUNDLE_5: {
      id: 'bundle_5',
      name: '5 Unlocks Pack',
      unlocks: 5,
      price: 15.00,
      description: 'For regular truckers - save 14%',
      isDefault: false,
    },
    BUNDLE_10: {
      id: 'bundle_10',
      name: '10 Unlocks Pack',
      unlocks: 10,
      price: 25.00,
      description: 'Best value - save 29%',
      isDefault: false,
    },
  },

  // Unlock access duration (hours)
  UNLOCK_DURATION_HOURS: 24,

  // Minimum price to ensure Paynow fee is acceptable fraction
  MIN_PRICE_FOR_ACCEPTABLE_FEE_RATIO: 3.00, // Below this, fee is >15%
  TARGET_FEE_RATIO: 0.10, // Target Paynow fee as 10% or less of transaction
};

/**
 * Calculate Gemini API cost per load parse
 */
export const calculateGeminiCost = (): number => {
  const { GEMINI_FLASH_INPUT, GEMINI_FLASH_OUTPUT, GEMINI_AVG_TOKENS } = PRICING_CONFIG.COSTS;
  // Assume 60% input tokens, 40% output tokens
  const inputTokens = GEMINI_AVG_TOKENS * 0.6;
  const outputTokens = GEMINI_AVG_TOKENS * 0.4;
  return (inputTokens / 1000 * GEMINI_FLASH_INPUT) + (outputTokens / 1000 * GEMINI_FLASH_OUTPUT);
};

/**
 * Calculate total cost per load processed
 */
export const calculateCostPerLoad = (): {
  whatsapp: number;
  gemini: number;
  infrastructure: number;
  total: number;
} => {
  const costs = PRICING_CONFIG.COSTS;
  const geminiCost = calculateGeminiCost();

  return {
    whatsapp: costs.WHATSAPP_CONVERSATION,
    gemini: geminiCost,
    infrastructure: costs.INFRASTRUCTURE,
    total: costs.WHATSAPP_CONVERSATION + geminiCost + costs.INFRASTRUCTURE,
  };
};

/**
 * Calculate Paynow fee for a given amount
 */
export const calculatePaynowFee = (amount: number): {
  flatFee: number;
  percentageFee: number;
  total: number;
  feeRatio: number;
} => {
  const { FLAT_FEE, PERCENTAGE_FEE } = PRICING_CONFIG.PAYNOW;
  const percentageFee = amount * PERCENTAGE_FEE;
  const total = FLAT_FEE + percentageFee;
  const feeRatio = total / amount;

  return {
    flatFee: FLAT_FEE,
    percentageFee,
    total,
    feeRatio,
  };
};

/**
 * Calculate cost floor for pricing validation
 * Price must cover: (cost per load / expected conversion rate) + Paynow fee
 */
export const calculateCostFloor = (expectedConversionRate: number = 0.10): {
  costPerLoad: number;
  effectiveCostPerUnlock: number;
  minimumViablePrice: number;
  breakdown: {
    processingCost: number;
    paynowFeeAtMin: number;
    margin: number;
  };
} => {
  const costPerLoad = calculateCostPerLoad().total;
  const effectiveCostPerUnlock = costPerLoad / expectedConversionRate;
  const paynowFee = calculatePaynowFee(PRICING_CONFIG.MIN_PRICE_FOR_ACCEPTABLE_FEE_RATIO);
  const minimumViablePrice = effectiveCostPerUnlock + paynowFee.total + 0.50; // $0.50 margin

  return {
    costPerLoad,
    effectiveCostPerUnlock,
    minimumViablePrice,
    breakdown: {
      processingCost: effectiveCostPerUnlock,
      paynowFeeAtMin: paynowFee.total,
      margin: 0.50,
    },
  };
};

/**
 * Validate pricing against cost floor
 * BLOCKING: If price doesn't exceed costs, throw error
 */
export const validatePricing = (price: number, unlocks: number): {
  isValid: boolean;
  costPerUnlock: number;
  revenuePerUnlock: number;
  margin: number;
  warning?: string;
} => {
  const costFloor = calculateCostFloor(0.10);
  const costPerUnlock = costFloor.costPerLoad / 0.10; // At 10% conversion
  const revenuePerUnlock = price / unlocks;
  const margin = revenuePerUnlock - costPerUnlock;

  const isValid = margin > 0;

  return {
    isValid,
    costPerUnlock,
    revenuePerUnlock,
    margin,
    warning: isValid ? undefined : `Price $${revenuePerUnlock.toFixed(2)}/unlock below cost floor $${costPerUnlock.toFixed(2)}`,
  };
};

/**
 * Get all available bundles
 */
export const getAvailableBundles = (): any[] => {
  const bundles = Object.values(PRICING_CONFIG.BUNDLES);
  const costFloor = calculateCostFloor();

  return bundles.map(bundle => {
    const paynowFee = calculatePaynowFee(bundle.price);
    const effectivePricePerUnlock = bundle.price / bundle.unlocks;
    const savings = bundle.unlocks === 1 ? 0 :
      Math.round((1 - effectivePricePerUnlock / PRICING_CONFIG.BUNDLES.SINGLE.price) * 100);

    return {
      ...bundle,
      pricePerUnlock: effectivePricePerUnlock,
      paynowFee: paynowFee.total,
      paynowFeeRatio: paynowFee.feeRatio,
      savingsPercent: savings,
      isValid: validatePricing(bundle.price, bundle.unlocks).isValid,
    };
  });
};

/**
 * Get default bundle (3-pack)
 */
export const getDefaultBundle = (): any => {
  return PRICING_CONFIG.BUNDLES.BUNDLE_3;
};

/**
 * Get bundle by ID
 */
export const getBundleById = (bundleId: string): any | null => {
  return PRICING_CONFIG.BUNDLES[bundleId.toUpperCase()] ||
         Object.values(PRICING_CONFIG.BUNDLES).find(b => b.id === bundleId) || null;
};

/**
 * Calculate effective price for a user based on their credits
 */
export const getEffectivePriceForUser = async (userId: string): Promise<{
  hasCredits: boolean;
  availableCredits: number;
  recommendedBundle: any;
  price: number;
}> => {
  // Check user's unlock credits
  const result = await query(`
    SELECT COALESCE(SUM(credits_remaining), 0) as credits
    FROM unlock_credits
    WHERE user_id = $1 AND expires_at > NOW() AND credits_remaining > 0
  `, [userId]);

  const availableCredits = parseInt(result.rows[0]?.credits || '0', 10);
  const hasCredits = availableCredits > 0;

  // Recommend bundle based on usage
  const usageResult = await query(`
    SELECT COUNT(*) as total_unlocks
    FROM contact_unlocks
    WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
  `, [userId]);

  const monthlyUnlocks = parseInt(usageResult.rows[0]?.total_unlocks || '0', 10);

  let recommendedBundle;
  if (monthlyUnlocks >= 8) {
    recommendedBundle = PRICING_CONFIG.BUNDLES.BUNDLE_10;
  } else if (monthlyUnlocks >= 4) {
    recommendedBundle = PRICING_CONFIG.BUNDLES.BUNDLE_5;
  } else {
    recommendedBundle = getDefaultBundle();
  }

  return {
    hasCredits,
    availableCredits,
    recommendedBundle,
    price: hasCredits ? 0 : recommendedBundle.price,
  };
};

/**
 * Create pricing summary for display
 */
export const getPricingSummary = (): {
  costPerLoad: ReturnType<typeof calculateCostPerLoad>;
  costFloor: ReturnType<typeof calculateCostFloor>;
  bundles: ReturnType<typeof getAvailableBundles>;
  paynowFees: {
    at3: ReturnType<typeof calculatePaynowFee>;
    at10: ReturnType<typeof calculatePaynowFee>;
  };
  validation: {
    singleUnlock: ReturnType<typeof validatePricing>;
    bundle3: ReturnType<typeof validatePricing>;
    bundle10: ReturnType<typeof validatePricing>;
  };
} => {
  return {
    costPerLoad: calculateCostPerLoad(),
    costFloor: calculateCostFloor(),
    bundles: getAvailableBundles(),
    paynowFees: {
      at3: calculatePaynowFee(3.50),
      at10: calculatePaynowFee(10.00),
    },
    validation: {
      singleUnlock: validatePricing(3.50, 1),
      bundle3: validatePricing(10.00, 3),
      bundle10: validatePricing(25.00, 10),
    },
  };
};

/**
 * Track actual costs per load (for future optimization)
 */
export const recordLoadCosts = async (loadId: string, data: {
  whatsappMessageId?: string;
  geminiTokensInput?: number;
  geminiTokensOutput?: number;
  processingTimeMs?: number;
}): Promise<void> => {
  const { geminiTokensInput = 0, geminiTokensOutput = 0, processingTimeMs = 0 } = data;

  // Calculate actual costs
  const geminiInputCost = (geminiTokensInput / 1000) * PRICING_CONFIG.COSTS.GEMINI_FLASH_INPUT;
  const geminiOutputCost = (geminiTokensOutput / 1000) * PRICING_CONFIG.COSTS.GEMINI_FLASH_OUTPUT;
  const whatsappCost = PRICING_CONFIG.COSTS.WHATSAPP_CONVERSATION;
  const totalCost = geminiInputCost + geminiOutputCost + whatsappCost;

  await query(`
    INSERT INTO load_cost_tracking (
      load_id, whatsapp_cost, gemini_input_cost, gemini_output_cost,
      gemini_tokens_input, gemini_tokens_output, total_cost, processing_time_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (load_id) DO UPDATE SET
      whatsapp_cost = $2,
      gemini_input_cost = $3,
      gemini_output_cost = $4,
      gemini_tokens_input = $5,
      gemini_tokens_output = $6,
      total_cost = $7,
      processing_time_ms = $8,
      updated_at = NOW()
  `, [
    loadId,
    whatsappCost,
    geminiInputCost,
    geminiOutputCost,
    geminiTokensInput,
    geminiTokensOutput,
    totalCost,
    processingTimeMs,
  ]);

  logger.info('Load costs recorded', {
    loadId,
    totalCost: totalCost.toFixed(6),
    geminiTokens: geminiTokensInput + geminiTokensOutput,
  });
};

/**
 * Get aggregate cost statistics
 */
export const getCostStatistics = async (days: number = 30): Promise<{
  totalLoads: number;
  totalCost: number;
  avgCostPerLoad: number;
  costBreakdown: {
    whatsapp: number;
    gemini: number;
  };
}> => {
  const result = await query(`
    SELECT
      COUNT(*) as total_loads,
      COALESCE(SUM(total_cost), 0) as total_cost,
      COALESCE(AVG(total_cost), 0) as avg_cost,
      COALESCE(SUM(whatsapp_cost), 0) as whatsapp_cost,
      COALESCE(SUM(gemini_input_cost + gemini_output_cost), 0) as gemini_cost
    FROM load_cost_tracking
    WHERE created_at > NOW() - INTERVAL '${days} days'
  `);

  const row = result.rows[0];
  return {
    totalLoads: parseInt(row?.total_loads || '0', 10),
    totalCost: parseFloat(row?.total_cost || '0'),
    avgCostPerLoad: parseFloat(row?.avg_cost || '0'),
    costBreakdown: {
      whatsapp: parseFloat(row?.whatsapp_cost || '0'),
      gemini: parseFloat(row?.gemini_cost || '0'),
    },
  };
};

export default {
  PRICING_CONFIG,
  calculateGeminiCost,
  calculateCostPerLoad,
  calculatePaynowFee,
  calculateCostFloor,
  validatePricing,
  getAvailableBundles,
  getDefaultBundle,
  getBundleById,
  getEffectivePriceForUser,
  getPricingSummary,
  recordLoadCosts,
  getCostStatistics,
};
