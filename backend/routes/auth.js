import { Router } from 'express';
import authController from '../controllers/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authenticate, authenticateRefreshToken } from '../middleware/auth.js';
import { authLimiter, passwordResetLimiter } from '../middleware/security.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  changePasswordSchema,
  googleOAuthSchema,
} from '../validators/auth.js';

const router = Router();

/**
 * Auth Routes
 * Base path: /api/v1/auth
 */

// Public routes (no authentication required)

/**
 * @route POST /auth/register
 * @desc Register a new user
 * @access Public
 */
router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  authController.register
);

/**
 * @route POST /auth/login
 * @desc Login with email and password
 * @access Public
 */
router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  authController.login
);

/**
 * @route GET /auth/google
 * @desc Redirect to Google OAuth consent screen
 * @access Public
 */
router.get('/google', authController.googleAuthRedirect);

/**
 * @route GET /auth/google/callback
 * @desc Handle Google OAuth callback
 * @access Public
 */
router.get(
  '/google/callback',
  validateQuery(googleOAuthSchema),
  authController.googleAuthCallback
);

/**
 * @route POST /auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post(
  '/refresh',
  validateBody(refreshTokenSchema),
  authController.refreshToken
);

/**
 * @route POST /auth/forgot-password
 * @desc Request password reset email
 * @access Public
 */
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @route POST /auth/reset-password
 * @desc Reset password with token
 * @access Public
 */
router.post(
  '/reset-password',
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  authController.resetPassword
);

/**
 * @route POST /auth/verify-email
 * @desc Verify email address with token
 * @access Public
 */
router.post(
  '/verify-email',
  validateBody(verifyEmailSchema),
  authController.verifyEmail
);

/**
 * @route POST /auth/resend-verification
 * @desc Resend email verification
 * @access Public
 */
router.post(
  '/resend-verification',
  authLimiter,
  validateBody(resendVerificationSchema),
  authController.resendVerification
);

// Protected routes (authentication required)

/**
 * @route POST /auth/logout
 * @desc Logout current session or all sessions
 * @access Protected
 */
router.post(
  '/logout',
  authenticate,
  authController.logout
);

/**
 * @route POST /auth/change-password
 * @desc Change password for authenticated user
 * @access Protected
 */
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  authController.changePassword
);

/**
 * @route GET /auth/me
 * @desc Get current user profile
 * @access Protected
 */
router.get(
  '/me',
  authenticate,
  authController.getCurrentUser
);

/**
 * @route PATCH /auth/me
 * @desc Update current user profile
 * @access Protected
 */
router.patch(
  '/me',
  authenticate,
  authController.updateProfile
);

/**
 * @route GET /auth/sessions
 * @desc Get all active sessions for current user
 * @access Protected
 */
router.get(
  '/sessions',
  authenticate,
  authController.getSessions
);

/**
 * @route DELETE /auth/sessions/:tokenId
 * @desc Revoke a specific session
 * @access Protected
 */
router.delete(
  '/sessions/:tokenId',
  authenticate,
  authController.revokeSession
);

export default router;
