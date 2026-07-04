/**
 * Custom error classes for FreightLink Africa
 */

// Base application error
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Bad Request (400)
class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST', errors = null) {
    super(message, 400, code);
    this.errors = errors;
  }
}

// Unauthorized (401)
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

// Forbidden (403)
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

// Not Found (404)
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

// Conflict (409)
class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT') {
    super(message, 409, code);
  }
}

// Validation Error (422)
class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 422, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

// Too Many Requests (429)
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

// Internal Server Error (500)
class InternalError extends AppError {
  constructor(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    super(message, 500, code);
  }
}

// Service Unavailable (503)
class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code);
  }
}

// Database Error
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', code = 'DATABASE_ERROR') {
    super(message, 500, code);
  }
}

// Authentication specific errors
class InvalidCredentialsError extends UnauthorizedError {
  constructor(message = 'Invalid email or password') {
    super(message, 'INVALID_CREDENTIALS');
  }
}

class TokenExpiredError extends UnauthorizedError {
  constructor(message = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED');
  }
}

class InvalidTokenError extends UnauthorizedError {
  constructor(message = 'Invalid token') {
    super(message, 'INVALID_TOKEN');
  }
}

class EmailNotVerifiedError extends ForbiddenError {
  constructor(message = 'Email address not verified') {
    super(message, 'EMAIL_NOT_VERIFIED');
  }
}

class AccountSuspendedError extends ForbiddenError {
  constructor(message = 'Account has been suspended') {
    super(message, 'ACCOUNT_SUSPENDED');
  }
}

// Payment specific errors
class PaymentError extends AppError {
  constructor(message = 'Payment failed', code = 'PAYMENT_ERROR', paymentCode = null) {
    super(message, 400, code);
    this.paymentCode = paymentCode;
  }
}

class PaymentDeclinedError extends PaymentError {
  constructor(message = 'Payment declined', paymentCode = null) {
    super(message, 'PAYMENT_DECLINED', paymentCode);
  }
}

class PaymentProcessingError extends PaymentError {
  constructor(message = 'Payment processing failed') {
    super(message, 'PAYMENT_PROCESSING_ERROR');
  }
}

// Unlock specific errors
class UnlockError extends AppError {
  constructor(message = 'Unlock failed', code = 'UNLOCK_ERROR') {
    super(message, 400, code);
  }
}

class InsufficientFundsError extends UnlockError {
  constructor(message = 'Insufficient funds') {
    super(message, 'INSUFFICIENT_FUNDS');
  }
}

class AlreadyUnlockedError extends UnlockError {
  constructor(message = 'Load already unlocked') {
    super(message, 'ALREADY_UNLOCKED');
  }
}

// Load specific errors
class LoadError extends AppError {
  constructor(message = 'Load operation failed', code = 'LOAD_ERROR') {
    super(message, 400, code);
  }
}

class LoadNotFoundError extends NotFoundError {
  constructor(message = 'Load not found') {
    super(message, 'LOAD_NOT_FOUND');
  }
}

class LoadExpiredError extends LoadError {
  constructor(message = 'Load has expired') {
    super(message, 'LOAD_EXPIRED');
  }
}

// Duplicate detection error
class DuplicateLoadError extends ConflictError {
  constructor(message = 'Similar load already exists', similarity = 0) {
    super(message, 'DUPLICATE_LOAD');
    this.similarity = similarity;
  }
}

// Export all error classes
export {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  ServiceUnavailableError,
  DatabaseError,
  InvalidCredentialsError,
  TokenExpiredError,
  InvalidTokenError,
  EmailNotVerifiedError,
  AccountSuspendedError,
  PaymentError,
  PaymentDeclinedError,
  PaymentProcessingError,
  UnlockError,
  InsufficientFundsError,
  AlreadyUnlockedError,
  LoadError,
  LoadNotFoundError,
  LoadExpiredError,
  DuplicateLoadError,
};

export default AppError;
