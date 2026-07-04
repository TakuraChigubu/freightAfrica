/**
 * Standard API response utilities
 */

/**
 * Success response
 * @param {Response} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 */
const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Paginated success response
 * @param {Response} res - Express response object
 * @param {Array} data - Array of items
 * @param {object} pagination - Pagination metadata
 */
const paginatedResponse = (res, data, pagination) => {
  const {
    page = 1,
    limit = 20,
    total = 0,
    totalPages = 0,
    hasNext = false,
    hasPrev = false,
  } = pagination;

  return res.status(200).json({
    success: true,
    data,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: parseInt(total, 10),
      totalPages: parseInt(totalPages, 10),
      hasNext,
      hasPrev,
    },
    timestamp: new Date().toISOString(),
  });
};

/**
 * Created response (201)
 * @param {Response} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 */
const createdResponse = (res, data = null, message = 'Resource created successfully') => {
  return successResponse(res, data, message, 201);
};

/**
 * No content response (204)
 * @param {Response} res - Express response object
 */
const noContentResponse = (res) => {
  return res.status(204).send();
};

/**
 * Error response
 * @param {Response} res - Express response object
 * @param {Error|AppError} error - Error object
 */
const errorResponse = (res, error) => {
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';

  const response = {
    success: false,
    error: {
      code,
      message: error.message || 'An unexpected error occurred',
    },
    timestamp: new Date().toISOString(),
  };

  // Include validation errors if present
  if (error.errors) {
    response.error.details = error.errors;
  }

  // Include retry-after for rate limiting
  if (error.retryAfter) {
    response.error.retryAfter = error.retryAfter;
  }

  // Include payment code if present
  if (error.paymentCode) {
    response.error.paymentCode = error.paymentCode;
  }

  // Include similarity score for duplicate detection
  if (error.similarity !== undefined) {
    response.error.similarity = error.similarity;
  }

  return res.status(statusCode).json(response);
};

/**
 * Calculate pagination metadata
 * @param {number} total - Total number of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object} Pagination metadata
 */
const calculatePagination = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  const currentPage = parseInt(page, 10);
  const currentLimit = parseInt(limit, 10);

  return {
    page: currentPage,
    limit: currentLimit,
    total,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
};

/**
 * Parse pagination query parameters
 * @param {object} query - Express query object
 * @param {object} options - Options for default values
 * @returns {object} Parsed pagination parameters
 */
const parsePagination = (query, options = {}) => {
  const {
    defaultLimit = 20,
    maxLimit = 100,
    defaultPage = 1,
  } = options;

  const page = Math.max(1, parseInt(query.page, 10) || defaultPage);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
  };
};

/**
 * Parse sort query parameters
 * @param {object} query - Express query object
 * @param {string} defaultSort - Default sort field
 * @param {string} defaultOrder - Default sort order (asc/desc)
 * @param {Array} allowedFields - Allowed sort fields
 * @returns {object} Sort parameters
 */
const parseSort = (query, defaultSort = 'created_at', defaultOrder = 'desc', allowedFields = []) => {
  const sort = query.sort || defaultSort;
  const order = (query.order || defaultOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Validate sort field
  if (allowedFields.length > 0 && !allowedFields.includes(sort)) {
    return { sort: defaultSort, order: defaultOrder.toUpperCase() };
  }

  return { sort, order };
};

/**
 * Parse filter query parameters
 * @param {object} query - Express query object
 * @param {object} filterConfig - Configuration for allowed filters
 * @returns {object} Filter parameters
 */
const parseFilters = (query, filterConfig = {}) => {
  const filters = {};

  for (const [key, config] of Object.entries(filterConfig)) {
    const value = query[key];

    if (value !== undefined && value !== null && value !== '') {
      // Type conversion
      let parsedValue = value;
      switch (config.type) {
        case 'boolean':
          parsedValue = value === 'true' || value === '1';
          break;
        case 'number':
          parsedValue = parseFloat(value);
          if (isNaN(parsedValue)) continue;
          break;
        case 'array':
          parsedValue = value.split(',').map(v => v.trim()).filter(Boolean);
          break;
        case 'date':
          parsedValue = new Date(value);
          if (isNaN(parsedValue.getTime())) continue;
          break;
      }

      // Apply operator
      const operator = config.operator || 'eq';
      if (operator === 'like') {
        parsedValue = `%${parsedValue}%`;
      }

      filters[key] = {
        value: parsedValue,
        operator,
      };
    }
  }

  return filters;
};

export {
  successResponse,
  paginatedResponse,
  createdResponse,
  noContentResponse,
  errorResponse,
  calculatePagination,
  parsePagination,
  parseSort,
  parseFilters,
};

export default {
  successResponse,
  paginatedResponse,
  createdResponse,
  noContentResponse,
  errorResponse,
  calculatePagination,
  parsePagination,
  parseSort,
  parseFilters,
};
