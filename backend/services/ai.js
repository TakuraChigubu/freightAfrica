import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { query } from '../database/pool.js';
import {
  BadRequestError,
  InternalError,
  ServiceUnavailableError,
} from '../utils/errors.js';

/**
 * AI Service
 * Gemini integration for freight message parsing and AI features
 */

// Initialize Gemini
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const model = genAI.getGenerativeModel({ model: config.gemini.model });

// System prompt for freight parsing
const FREIGHT_PARSING_PROMPT = `You are an expert freight logistics parser for African transport routes. Your task is to extract structured information from freight load messages sent via WhatsApp, emails, or text messages.

You MUST respond with valid JSON only. No markdown, no explanations, just a JSON object.

Extract the following information when available:
- origin: Pickup location (city/town and country if specified)
- destination: Delivery location (city/town and country if specified)
- country: Primary country for the load (Zimbabwe, South Africa, Botswana, Zambia, Mozambique)
- borderCrossing: Border crossing name if mentioned
- countryFrom: Country the load originates from
- countryTo: Country the load is going to
- pickupDate: Pickup date (YYYY-MM-DD format, or relative like "tomorrow")
- deliveryDate: Expected delivery date
- cargoType: Type of cargo/commodity
- commodityCategory: Category (general, mining, agricultural, fuel, chemicals, etc.)
- truckType: Required truck type (tri-axle, super link, flatbed, tanker, etc.)
- weight: Weight in kg if specified
- numberOfTrucks: How many trucks are needed
- isHazardous: true if cargo is dangerous/hazardous
- hazardousClass: Hazard class if applicable
- currency: Currency code (USD, ZAR, ZWL, BWP)
- price: Price/quote amount
- contactPhone: Contact phone number (normalize to +263XXXXXXXXX format for Zimbabwe, +27 for South Africa)
- contactWhatsapp: WhatsApp number if different from phone
- brokerName: Name of the broker/agent
- company: Company name
- specialInstructions: Any special handling or delivery instructions
- estimatedPrice: Your estimated fair market price based on the route and cargo

Confidence scoring rules:
- 95-100%: All critical fields present and clear (origin, destination, contact, price)
- 85-94%: Most fields present, minor ambiguity
- 70-84%: Some fields missing or ambiguous, needs review
- Below 70%: Major information missing, cannot parse reliably

Response format:
{
  "origin": "string or null",
  "destination": "string or null",
  "country": "string or null",
  "borderCrossing": "string or null",
  "countryFrom": "string or null",
  "countryTo": "string or null",
  "pickupDate": "YYYY-MM-DD or null",
  "deliveryDate": "YYYY-MM-DD or null",
  "cargoType": "string or null",
  "commodityCategory": "string or null",
  "truckType": "string or null",
  "weight": number or null,
  "numberOfTrucks": number or null,
  "isHazardous": boolean,
  "hazardousClass": "string or null",
  "currency": "string",
  "price": number or null,
  "contactPhone": "string or null",
  "contactWhatsapp": "string or null",
  "brokerName": "string or null",
  "company": "string or null",
  "specialInstructions": "string or null",
  "estimatedPrice": number or null,
  "confidenceScore": number (0-100),
  "confidenceLevel": "high" | "medium" | "low" | "failed",
  "needsReview": boolean,
  "parsingNotes": "string - any notes about parsing challenges"
}`;

/**
 * Parse freight message using Gemini AI
 */
export const parseFreightMessage = async (
  message: string,
  options: { retries?: number } = {}
): Promise<any> => {
  const maxRetries = options.retries ?? config.gemini.maxRetries;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug('AI parsing attempt', { attempt, messageLength: message.length });

      const result = await model.generateContent([
        { text: FREIGHT_PARSING_PROMPT },
        { text: `Parse this freight message:\n\n${message}` }
      ]);

      const response = result.response;
      const text = response.text();

      // Parse JSON response
      let parsed;
      try {
        // Remove any markdown code blocks if present
        const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
        parsed = JSON.parse(cleanedText);
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON', {
          response: text.substring(0, 500),
          error: parseError.message
        });
        throw new Error('AI returned invalid JSON');
      }

      // Calculate confidence level
      const confidenceScore = parsed.confidenceScore ?? calculateConfidenceScore(parsed);
      const confidenceLevel = getConfidenceLevel(confidenceScore);
      const needsReview = confidenceScore < 85 || parsed.needsReview;

      // Add metadata
      const result_with_meta = {
        ...parsed,
        _confidence: confidenceScore,
        _confidenceLevel: confidenceLevel,
        _needsReview: needsReview,
        _model: config.gemini.model,
        _rawResponse: parsed,
        _parsedAt: new Date().toISOString(),
      };

      logger.info('AI parsing successful', {
        confidence: confidenceScore,
        level: confidenceLevel,
        needsReview,
        origin: parsed.origin,
        destination: parsed.destination,
      });

      return result_with_meta;

    } catch (error) {
      lastError = error;
      logger.warn('AI parsing attempt failed', {
        attempt,
        error: error.message,
      });

      // Exponential backoff
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  // All retries failed
  logger.error('AI parsing failed after all retries', {
    error: lastError?.message,
    message: message.substring(0, 200),
  });

  // Return low-confidence result instead of throwing
  return {
    origin: null,
    destination: null,
    confidenceScore: 0,
    _confidence: 0,
    _confidenceLevel: 'failed',
    _needsReview: true,
    _model: config.gemini.model,
    _rawResponse: null,
    _error: lastError?.message,
  };
};

/**
 * Calculate confidence score based on parsed data completeness
 */
const calculateConfidenceScore = (data: any): number => {
  let score = 0;

  // Critical fields (25 points each)
  if (data.origin) score += 25;
  if (data.destination) score += 25;
  if (data.contactPhone || data.contactWhatsapp) score += 25;

  // Important fields (10 points each)
  if (data.cargoType) score += 10;
  if (data.pickupDate) score += 10;

  // Supporting fields (5 points each)
  if (data.price) score += 5;
  if (data.truckType) score += 5;
  if (data.brokerName) score += 3;
  if (data.company) score += 2;

  return Math.min(100, score);
};

/**
 * Get confidence level from score
 */
const getConfidenceLevel = (score: number): 'high' | 'medium' | 'low' | 'failed' => {
  if (score >= 95) return 'high';
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  if (score >= 50) return 'low';
  return 'failed';
};

/**
 * Natural language load search
 */
export const naturalLanguageSearch = async (
  query: string
): Promise<{ filters: any; interpretation: string }> => {
  const SEARCH_PROMPT = `You are a search query parser for a freight load marketplace. Convert natural language queries into structured search filters.

Respond with JSON only:
{
  "filters": {
    "originCountry": "country code or null",
    "destinationCountry": "country code or null",
    "originCity": "city name or null",
    "destinationCity": "city name or null",
    "cargoType": "cargo type or null",
    "truckType": "truck type or null",
    "minPrice": number or null,
    "maxPrice": number or null,
    "pickupDateFrom": "YYYY-MM-DD or null",
    "pickupDateTo": "YYYY-MM-DD or null",
    "isHazardous": boolean or null,
    "currency": "currency code or null"
  },
  "interpretation": "Brief explanation of what the user is looking for"
}`;

  try {
    const result = await model.generateContent([
      { text: SEARCH_PROMPT },
      { text: `Parse this search query: "${query}"` }
    ]);

    const text = result.response.text();
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanedText);

    logger.info('Natural language search parsed', { query, filters: parsed.filters });

    return {
      filters: parsed.filters,
      interpretation: parsed.interpretation,
    };
  } catch (error) {
    logger.error('Natural language search failed', { error: error.message, query });
    return {
      filters: {},
      interpretation: 'Could not understand the search query',
    };
  }
};

/**
 * Generate price suggestion
 */
export const getPriceSuggestion = async (data: {
  origin: string;
  destination: string;
  cargoType?: string;
  weightKg?: number;
  truckType?: string;
}): Promise<{ suggestedPrice: number; currency: string; confidence: number }> => {
  const PRICE_PROMPT = `You are a freight pricing expert for African logistics routes. Suggest a fair market price for this load.

Consider:
- Distance between origin and destination
- Fuel costs and road tolls
- Border crossing fees
- Current market rates for this route
- Cargo type and weight
- Truck type requirements

Respond with JSON only:
{
  "suggestedPrice": number,
  "currency": "USD",
  "confidence": number (0-100),
  "factors": ["list of pricing factors considered"]
}`;

  try {
    const result = await model.generateContent([
      { text: PRICE_PROMPT },
      { text: `Suggest a price for:
Origin: ${data.origin}
Destination: ${data.destination}
Cargo: ${data.cargoType || 'General cargo'}
Weight: ${data.weightKg ? `${data.weightKg} kg` : 'Not specified'}
Truck type: ${data.truckType || 'Not specified'}` }
    ]);

    const text = result.response.text();
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanedText);

    return {
      suggestedPrice: parsed.suggestedPrice,
      currency: parsed.currency || 'USD',
      confidence: parsed.confidence || 50,
    };
  } catch (error) {
    logger.error('Price suggestion failed', { error: error.message, data });
    // Return a fallback price
    return {
      suggestedPrice: 0,
      currency: 'USD',
      confidence: 0,
    };
  }
};

/**
 * Fraud detection analysis
 */
export const analyzeForFraud = async (data: {
  message: string;
  phone?: string;
  brokerName?: string;
  company?: string;
  price?: number;
}): Promise<{
  fraudScore: number;
  flags: string[];
  recommendation: 'approve' | 'review' | 'reject';
}> => {
  const FRAUD_PROMPT = `You are a fraud detection specialist for a freight load marketplace. Analyze this load submission for potential fraud indicators.

Look for:
- Unrealistic pricing (too high or too low)
- Suspicious contact information patterns
- Known scam patterns in logistics
- Inconsistent route/cargo combinations
- Pressure tactics in message
- Vague or inconsistent details

Respond with JSON only:
{
  "fraudScore": number (0-100, higher = more suspicious),
  "flags": ["list of specific fraud indicators found"],
  "recommendation": "approve" | "review" | "reject"
}`;

  try {
    const result = await model.generateContent([
      { text: FRAUD_PROMPT },
      { text: `Analyze this load:
Message: ${data.message}
Phone: ${data.phone || 'Not provided'}
Broker: ${data.brokerName || 'Not provided'}
Company: ${data.company || 'Not provided'}
Price: ${data.price || 'Not provided'}` }
    ]);

    const text = result.response.text();
    const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanedText);

    logger.info('Fraud analysis complete', {
      fraudScore: parsed.fraudScore,
      flags: parsed.flags.length,
    });

    return {
      fraudScore: parsed.fraudScore,
      flags: parsed.flags,
      recommendation: parsed.recommendation,
    };
  } catch (error) {
    logger.error('Fraud analysis failed', { error: error.message });
    // Default to review on error
    return {
      fraudScore: 50,
      flags: ['Analysis failed - manual review required'],
      recommendation: 'review',
    };
  }
};

/**
 * Generate route summary
 */
export const generateRouteSummary = async (
  origin: string,
  destination: string
): Promise<string> => {
  try {
    const result = await model.generateContent([
      { text: 'You are a logistics expert. Provide a brief 1-2 sentence summary of a freight route between two locations, mentioning key road names, border crossings, estimated distance, and typical transit time. Be concise.' },
      { text: `Route from ${origin} to ${destination}:` }
    ]);

    return result.response.text();
  } catch (error) {
    logger.error('Route summary failed', { error: error.message });
    return `Route from ${origin} to ${destination}`;
  }
};

/**
 * Log AI parsing usage
 */
export const logParsingUsage = async (
  loadId: string,
  inputText: string,
  model: string,
  tokensUsed?: number,
  success: boolean = true
): Promise<void> => {
  try {
    await query(`
      INSERT INTO ai_parsing_logs (
        load_id, input_text, input_type, model,
        prompt_tokens, completion_tokens, total_tokens,
        parsing_success, processing_time_ms
      ) VALUES ($1, $2, 'whatsapp', $3, $4, $5, $6, $7, $8)
    `, [
      loadId,
      inputText.substring(0, 10000),
      model,
      null, // prompt tokens not tracked
      null, // completion tokens not tracked
      tokensUsed || null,
      success,
      null,
    ]);
  } catch (error) {
    logger.error('Failed to log AI usage', { error: error.message });
  }
};

export default {
  parseFreightMessage,
  naturalLanguageSearch,
  getPriceSuggestion,
  analyzeForFraud,
  generateRouteSummary,
  logParsingUsage,
};
