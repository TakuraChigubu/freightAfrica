import logger from '../utils/logger.js';
import { errorResponse } from '../utils/response.js';
import { AppError, ValidationError } from '../utils/errors.js';

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error details
  logger.error('Error occurred', {
    error: err.message,
    code: err.code,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id || 'anonymous',
  });

  // Handle duplicate key violations
  if (err.code === '23505') {
    const constraint = err.constraint || '';
    const field = constraint.replace(/_key$/, '').replace(/_/g, ' ');
    return errorResponse(res, {
      message: `A record with this ${field} already exists`,
      code: 'DUPLICATE_KEY',
      statusCode: 409,
    });
  }

  // Handle foreign key violations
  if (err.code === '23503') {
    return errorResponse(res, {
      message: 'Referenced resource not found',
      code: 'FOREIGN_KEY_VIOLATION',
      statusCode: 400,
    });
  }

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const errors = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    return errorResponse(res, new ValidationError('Validation failed', errors));
  }

  // Handle JSON parsing errors
  if (err.type === 'entity.parse.failed') {
    return errorResponse(res, {
      message: 'Invalid JSON in request body',
      code: 'INVALID_JSON',
      statusCode: 400,
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, {
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
      statusCode: 401,
    });
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, {
      message: 'Token has expired',
      code: 'TOKEN_EXPIRED',
      statusCode: 401,
    });
  }

  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return errorResponse(res, {
      message: 'File size exceeds the maximum allowed limit',
      code: 'FILE_TOO_LARGE',
      statusCode: 400,
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return errorResponse(res, {
      message: 'Unexpected file field',
      code: 'UNEXPECTED_FILE',
      statusCode: 400,
    });
  }

  // Handle rate limit errors
  if (err.status === 429) {
    return errorResponse(res, {
      message: err.message || 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      retryAfter: err.headers?.['retry-after'] || 60,
    });
  }

  // Application-specific errors
  if (err instanceof AppError) {
    return errorResponse(res, err);
  }

  // Generic server error
  return errorResponse(res, {
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    code: 'INTERNAL_ERROR',
    statusCode: 500,
  });
};

export default errorHandler;
