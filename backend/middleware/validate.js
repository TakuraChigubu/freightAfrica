import { ValidationError } from '../utils/errors.js';

/**
 * Validation middleware using Zod schemas
 * @param {ZodSchema} schema - Zod schema to validate against
 * @param {'body'|'query'|'params'} source - Source of data to validate
 */
const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const data = req[source];

      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        return next(new ValidationError('Validation failed', errors));
      }

      // Replace with parsed/transformed data
      req[source] = result.data;

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Validate request body
 */
const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate query parameters
 */
const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate route parameters
 */
const validateParams = (schema) => validate(schema, 'params');

/**
 * Sanitize user input - remove potentially dangerous characters
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item));
    }

    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }

  if (req.query) {
    req.query = sanitize(req.query);
  }

  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

/**
 * Validate file upload parameters
 */
const validateFile = (options = {}) => {
  const {
    maxSize = 5 * 1024 * 1024,
    allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    required = false,
    fieldName = 'file',
  } = options;

  return (req, res, next) => {
    const file = req.file;

    if (!file) {
      if (required) {
        return next(new ValidationError('Validation failed', [{
          field: fieldName,
          message: 'File is required',
          code: 'required',
        }]));
      }
      return next();
    }

    if (file.size > maxSize) {
      return next(new ValidationError('Validation failed', [{
        field: fieldName,
        message: `File size exceeds maximum of ${Math.round(maxSize / 1024 / 1024)}MB`,
        code: 'file_too_large',
      }]));
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return next(new ValidationError('Validation failed', [{
        field: fieldName,
        message: `File type ${file.mimetype} is not allowed`,
        code: 'invalid_mime_type',
      }]));
    }

    next();
  };
};

export {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  sanitizeInput,
  validateFile,
};

export default {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  sanitizeInput,
  validateFile,
};
