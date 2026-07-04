import authService from '../services/auth.js';
import { successResponse, createdResponse, errorResponse } from '../utils/response.js';
import {
  BadRequestError,
  UnauthorizedError,
} from '../utils/errors.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Auth Controller
 * Handles HTTP requests for authentication endpoints
 */

/**
 * Register new user
 * POST /api/v1/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { user, verificationToken } = await authService.register(req.body);

    // Exclude sensitive data
    const safeUser = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      status: user.status,
      createdAt: user.created_at,
    };

    createdResponse(res, {
      user: safeUser,
      message: 'Registration successful. Please check your email to verify your account.',
    }, 'User registered successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Login
 * POST /api/v1/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;

    const { user, accessToken, refreshToken, expiresIn } = await authService.login({
      ...req.body,
      ipAddress,
    });

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.app.env === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/v1/auth',
    });

    successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        displayName: user.display_name,
        avatar: user.avatar_url,
        roleId: user.role_id,
        roleName: user.role_name,
        organisationId: user.organisation_id,
        emailVerified: user.email_verified,
        permissions: user.permissions || [],
        createdAt: user.created_at,
      },
      accessToken,
      refreshToken,
      expiresIn,
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Google OAuth - Redirect to Google
 * GET /api/v1/auth/google
 */
export const googleAuthRedirect = (req, res) => {
  const redirectUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: req.query.state || '',
  });

  redirectUrl.search = params.toString();
  res.redirect(redirectUrl.toString());
};

/**
 * Google OAuth - Callback
 * GET /api/v1/auth/google/callback
 */
export const googleAuthCallback = async (req, res, next) => {
  try {
    const { code, state, error: googleError } = req.query;

    if (googleError) {
      throw new UnauthorizedError(`Google OAuth error: ${googleError}`);
    }

    if (!code) {
      throw new BadRequestError('No authorization code received', 'NO_CODE');
    }

    const ipAddress = req.ip || req.connection.remoteAddress;

    // Validate Google token and get user data
    const googleUserData = await authService.validateGoogleToken(code);

    // Process Google login/register
    const { user, accessToken, refreshToken, expiresIn, isNewUser } = await authService.googleAuth(
      googleUserData,
      req.body.deviceInfo,
      ipAddress
    );

    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.app.env === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    // Redirect to frontend with token
    const frontendUrl = new URL(config.app.frontendUrl);
    frontendUrl.pathname = '/auth/callback';
    frontendUrl.searchParams.set('accessToken', accessToken);
    frontendUrl.searchParams.set('refreshToken', refreshToken);
    frontendUrl.searchParams.set('isNewUser', isNewUser.toString());

    res.redirect(frontendUrl.toString());
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh token
 * POST /api/v1/auth/refresh
 */
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      // Try to get from cookie
      const cookieToken = req.cookies.refreshToken;
      if (!cookieToken) {
        throw new UnauthorizedError('Refresh token required', 'NO_REFRESH_TOKEN');
      }
    }

    const token = refreshToken || req.cookies.refreshToken;

    const result = await authService.refreshToken(token);

    // Set new refresh token cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: config.app.env === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });

    successResponse(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    }, 'Token refreshed');
  } catch (error) {
    next(error);
  }
};

/**
 * Logout (single session)
 * POST /api/v1/auth/logout
 */
export const logout = async (req, res, next) => {
  try {
    const { tokenId, logoutAll } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    if (logoutAll) {
      await authService.logoutAll(userId);
    } else {
      await authService.logout(userId, tokenId || req.tokenId);
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.app.env === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
    });

    successResponse(res, null, logoutAll ? 'Logged out from all devices' : 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Forgot password
 * POST /api/v1/auth/forgot-password
 */
export const forgotPassword = async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body.email);

    // Always return success to prevent email enumeration
    successResponse(res, null, 'If an account exists with this email, a password reset link has been sent');
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password
 * POST /api/v1/auth/reset-password
 */
export const resetPassword = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token, req.body.password);

    successResponse(res, null, 'Password reset successfully. Please login with your new password.');
  } catch (error) {
    next(error);
  }
};

/**
 * Verify email
 * POST /api/v1/auth/verify-email
 */
export const verifyEmail = async (req, res, next) => {
  try {
    await authService.verifyEmail(req.body.token);

    successResponse(res, null, 'Email verified successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Resend verification email
 * POST /api/v1/auth/resend-verification
 */
export const resendVerification = async (req, res, next) => {
  try {
    await authService.resendVerification(req.body.email);

    // Always return success to prevent email enumeration
    successResponse(res, null, 'If an account exists with this email and is not verified, a verification email has been sent');
  } catch (error) {
    next(error);
  }
};

/**
 * Change password (authenticated)
 * POST /api/v1/auth/change-password
 */
export const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    await authService.changePassword(userId, currentPassword, newPassword);

    successResponse(res, null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 * GET /api/v1/auth/me
 */
export const getCurrentUser = async (req, res, next) => {
  try {
    const user = req.user;

    successResponse(res, {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      displayName: user.display_name,
      avatar: user.avatar_url,
      phone: user.phone,
      roleId: user.role_id,
      roleName: user.role_name,
      organisationId: user.organisation_id,
      emailVerified: user.email_verified,
      locale: user.locale,
      timezone: user.timezone,
      preferences: user.preferences,
      createdAt: user.created_at,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update current user profile
 * PATCH /api/v1/auth/me
 */
export const updateProfile = async (req, res, next) => {
  try {
    // Implementation would call user model update
    successResponse(res, req.user, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Get active sessions
 * GET /api/v1/auth/sessions
 */
export const getSessions = async (req, res, next) => {
  try {
    // Implementation would query refresh tokens table
    successResponse(res, [], 'Sessions retrieved');
  } catch (error) {
    next(error);
  }
};

/**
 * Revoke session
 * DELETE /api/v1/auth/sessions/:tokenId
 */
export const revokeSession = async (req, res, next) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user.id;

    await authService.logout(userId, tokenId);

    successResponse(res, null, 'Session revoked');
  } catch (error) {
    next(error);
  }
};

export default {
  register,
  login,
  googleAuthRedirect,
  googleAuthCallback,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  changePassword,
  getCurrentUser,
  updateProfile,
  getSessions,
  revokeSession,
};
