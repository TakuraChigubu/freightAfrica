import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { UnauthorizedError, InvalidTokenError, TokenExpiredError, ForbiddenError } from '../utils/errors.js';
import { sessionStore } from '../utils/redis.js';
import logger from '../utils/logger.js';

/**
 * Authentication middleware - verifies JWT access token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No access token provided', 'NO_TOKEN');
    }

    const accessToken = authHeader.split(' ')[1];

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(accessToken, config.jwt.secret, {
        issuer: config.jwt.issuer,
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new TokenExpiredError();
      }
      throw new InvalidTokenError('Invalid access token');
    }

    // Check token type
    if (decoded.type !== 'access') {
      throw new InvalidTokenError('Invalid token type');
    }

    // Attach user to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      roleId: decoded.roleId,
      roleName: decoded.roleName,
      organisationId: decoded.organisationId,
      permissions: decoded.permissions || [],
    };

    req.tokenId = decoded.jti;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token, but that's okay for optional auth
      return next();
    }

    const accessToken = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(accessToken, config.jwt.secret, {
        issuer: config.jwt.issuer,
      });

      if (decoded.type === 'access') {
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          roleId: decoded.roleId,
          roleName: decoded.roleName,
          organisationId: decoded.organisationId,
          permissions: decoded.permissions || [],
        };
      }
    } catch (error) {
      // Invalid or expired token, but that's okay for optional auth
      logger.debug('Optional auth failed', { error: error.message });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh token authentication
 */
const authenticateRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required', 'NO_REFRESH_TOKEN');
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, {
        issuer: config.jwt.issuer,
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new TokenExpiredError('Refresh token has expired');
      }
      throw new InvalidTokenError('Invalid refresh token');
    }

    // Check token type
    if (decoded.type !== 'refresh') {
      throw new InvalidTokenError('Invalid token type');
    }

    // Check if session exists in Redis
    const session = await sessionStore.getRefreshToken(decoded.userId, decoded.jti);

    if (!session) {
      throw new InvalidTokenError('Session not found or expired');
    }

    // Verify token matches stored token
    if (session.refreshToken !== refreshToken) {
      // Token reuse detected - invalidate all sessions
      logger.warn('Refresh token reuse detected, invalidating all sessions', {
        userId: decoded.userId,
      });
      await sessionStore.removeAllSessions(decoded.userId);
      throw new InvalidTokenError('Invalid session');
    }

    // Attach user and token info
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };
    req.tokenId = decoded.jti;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Authorization middleware - checks if user has required permission
 * @param {string|string[]} permissions - Required permission(s)
 * @param {'any'|'all'} mode - 'any' requires at least one permission, 'all' requires all
 */
const authorize = (permissions, mode = 'any') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const userPermissions = req.user.permissions || [];
      const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

      let hasPermission = false;

      if (mode === 'all') {
        hasPermission = requiredPermissions.every(p => userPermissions.includes(p));
      } else {
        hasPermission = requiredPermissions.some(p => userPermissions.includes(p));
      }

      if (!hasPermission) {
        logger.warn('Authorization denied', {
          userId: req.user.id,
          required: requiredPermissions,
          granted: userPermissions,
        });
        throw new ForbiddenError('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Role-based authorization - checks if user has required role
 * @param {string|string[]} roles - Required role(s)
 */
const requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      const userRole = req.user.roleName;

      // Super Admin has all permissions
      if (userRole === 'Super Admin') {
        return next();
      }

      if (!allowedRoles.includes(userRole)) {
        logger.warn('Role check denied', {
          userId: req.user.id,
          required: allowedRoles,
          actual: userRole,
        });
        throw new ForbiddenError('Insufficient role permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user owns the resource or has admin permissions
 * @param {Function} getResourceOwnerId - Function to extract owner ID from request
 */
const requireOwnership = (getResourceOwnerId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      // Super Admin and Admin can access any resource
      if (['Super Admin', 'Admin'].includes(req.user.roleName)) {
        return next();
      }

      // Get the owner ID from the request
      const ownerId = await getResourceOwnerId(req);

      if (ownerId !== req.user.id) {
        throw new ForbiddenError('You do not have permission to access this resource');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user belongs to the same organisation
 * @param {Function} getResourceOrganisationId - Function to extract organisation ID from request
 */
const requireSameOrganisation = (getResourceOrganisationId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      // Super Admin can access any organisation
      if (req.user.roleName === 'Super Admin') {
        return next();
      }

      const resourceOrgId = await getResourceOrganisationId(req);

      if (resourceOrgId !== req.user.organisationId) {
        throw new ForbiddenError('Access denied to this organisation\'s resources');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export {
  authenticate,
  optionalAuth,
  authenticateRefreshToken,
  authorize,
  requireRole,
  requireOwnership,
  requireSameOrganisation,
};

export default {
  authenticate,
  optionalAuth,
  authenticateRefreshToken,
  authorize,
  requireRole,
  requireOwnership,
  requireSameOrganisation,
};
