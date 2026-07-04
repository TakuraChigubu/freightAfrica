import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import * as userModel from '../models/user.js';
import * as tokenModel from '../models/token.js';
import * as walletService from '../services/wallet.js';
import * as notificationService from '../services/notification.js';
import { sessionStore, cache } from '../utils/redis.js';
import {
  BadRequestError,
  UnauthorizedError,
  InvalidCredentialsError,
  TokenExpiredError,
  InvalidTokenError,
  EmailNotVerifiedError,
  AccountSuspendedError,
  ConflictError,
  NotFoundError,
} from '../utils/errors.js';

const SALT_ROUNDS = config.security.bcryptRounds;

/**
 * Authentication Service
 * Handles all authentication business logic
 */

/**
 * Register a new user
 */
export const register = async (data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  organisationId?: string;
}): Promise<{ user: any; verificationToken: string }> => {
  // Check if email already exists
  const existingUser = await userModel.findByEmail(data.email);
  if (existingUser) {
    throw new ConflictError('An account with this email already exists', 'EMAIL_EXISTS');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  // Create user
  const user = await userModel.create({
    email: data.email,
    passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    organisationId: data.organisationId,
    status: 'pending',
    emailVerified: false,
  });

  // Create verification token
  const verificationToken = await tokenModel.createEmailVerificationToken(user.id);

  // Create wallet
  await walletService.createWallet(user.id);

  // Create notification preferences
  await notificationService.createNotificationPreferences(user.id);

  logger.info('User registered', { userId: user.id, email: user.email });

  // TODO: Send verification email

  return {
    user: userModel.findByIdWithRole(user.id),
    verificationToken: verificationToken.token,
  };
};

/**
 * Login user
 */
export const login = async (data: {
  email: string;
  password: string;
  deviceId?: string;
  deviceInfo?: any;
  ipAddress?: string;
}): Promise<{
  user: any;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> => {
  // Find user by email
  const user = await userModel.findByEmail(data.email);

  if (!user) {
    throw new InvalidCredentialsError();
  }

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const remainingMinutes = Math.ceil(
      (new Date(user.locked_until).getTime() - Date.now()) / 60000
    );
    throw new AccountSuspendedError(
      `Account locked. Try again in ${remainingMinutes} minutes`
    );
  }

  // Check if user has password (Google OAuth users won't have one)
  if (!user.password_hash) {
    throw new BadRequestError(
      'This account uses Google Sign-In. Please use the Google login option.',
      'GOOGLE_AUTH_ONLY'
    );
  }

  // Verify password
  const passwordValid = await bcrypt.compare(data.password, user.password_hash);

  if (!passwordValid) {
    // Record failed login
    const { locked, attempts } = await userModel.recordFailedLogin(user.id);

    if (locked) {
      throw new AccountSuspendedError(
        'Account locked due to too many failed attempts. Please try again later.'
      );
    }

    const remainingAttempts = 5 - attempts;
    throw new InvalidCredentialsError(
      `Invalid credentials. ${remainingAttempts} attempts remaining.`
    );
  }

  // Check user status
  if (user.status === 'suspended') {
    throw new AccountSuspendedError();
  }

  if (user.status === 'deleted') {
    throw new NotFoundError('Account not found');
  }

  // Get user with permissions
  const userWithPermissions = await userModel.findByIdWithPermissions(user.id);

  // Generate tokens
  const tokens = await generateTokens(userWithPermissions, data.deviceId);

  // Store refresh token session
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
  await sessionStore.storeRefreshToken(
    user.id,
    tokens.tokenId,
    tokens.refreshToken,
    expiresAt,
    data.deviceInfo
  );

  // Store backup in database
  await tokenModel.createRefreshToken(
    user.id,
    tokens.refreshToken,
    expiresAt,
    data.deviceInfo,
    data.ipAddress
  );

  // Record successful login
  await userModel.recordLogin(user.id, data.ipAddress);

  logger.info('User logged in', { userId: user.id, email: user.email });

  return {
    user: userWithPermissions,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: 15 * 60, // 15 minutes
  };
};

/**
 * Google OAuth login/register
 */
export const googleAuth = async (googleUserData: {
  googleId: string;
  email: string;
  verifiedEmail: boolean;
  name: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  locale?: string;
}, deviceInfo?: any, ipAddress?: string): Promise<{
  user: any;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNewUser: boolean;
}> => {
  // Try to find existing user by Google ID
  let user = await userModel.findByGoogleId(googleUserData.googleId);
  let isNewUser = false;

  if (!user) {
    // Try to find by email
    user = await userModel.findByEmail(googleUserData.email);

    if (user) {
      // Link Google account to existing user
      await userModel.update(user.id, {
        googleId: googleUserData.googleId,
        metadata: {
          ...user.metadata,
          google: googleUserData,
        },
      });
      logger.info('Google account linked to existing user', { userId: user.id });
    } else {
      // Create new user
      user = await userModel.create({
        email: googleUserData.email,
        googleId: googleUserData.googleId,
        googleData: googleUserData,
        firstName: googleUserData.givenName || googleUserData.name?.split(' ')[0],
        lastName: googleUserData.familyName || googleUserData.name?.split(' ').slice(1).join(' '),
        avatarUrl: googleUserData.picture,
        locale: googleUserData.locale || 'en',
        status: 'active',
        emailVerified: googleUserData.verifiedEmail,
      });

      // Create wallet and notification preferences
      await walletService.createWallet(user.id);
      await notificationService.createNotificationPreferences(user.id);

      isNewUser = true;
      logger.info('New user created via Google OAuth', { userId: user.id });
    }
  }

  // Check user status
  if (user.status === 'suspended') {
    throw new AccountSuspendedError();
  }

  // Get user with permissions
  const userWithPermissions = await userModel.findByIdWithPermissions(user.id);

  // Generate tokens
  const tokens = await generateTokens(userWithPermissions);

  // Store session
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
  await sessionStore.storeRefreshToken(
    user.id,
    tokens.tokenId,
    tokens.refreshToken,
    expiresAt,
    deviceInfo
  );

  // Store backup in database
  await tokenModel.createRefreshToken(
    user.id,
    tokens.refreshToken,
    expiresAt,
    deviceInfo,
    ipAddress
  );

  // Record login
  await userModel.recordLogin(user.id, ipAddress);

  return {
    user: userWithPermissions,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: 15 * 60,
    isNewUser,
  };
};

/**
 * Refresh access token
 */
export const refreshToken = async (token: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> => {
  // Verify refresh token
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.refreshSecret, {
      issuer: config.jwt.issuer,
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new TokenExpiredError('Refresh token has expired');
    }
    throw new InvalidTokenError('Invalid refresh token');
  }

  // Check session in Redis
  const session = await sessionStore.getRefreshToken(decoded.userId, decoded.jti);

  if (!session) {
    throw new InvalidTokenError('Session not found or expired');
  }

  // Verify token matches
  if (session.refreshToken !== token) {
    // Token reuse - invalidate all sessions
    logger.warn('Refresh token reuse detected', { userId: decoded.userId });
    await sessionStore.removeAllSessions(decoded.userId);
    await tokenModel.revokeAllUserTokens(decoded.userId);
    throw new InvalidTokenError('Invalid session');
  }

  // Get user with permissions
  const user = await userModel.findByIdWithPermissions(decoded.userId);

  if (!user || user.status !== 'active') {
    throw new UnauthorizedError('User not found or inactive');
  }

  // Generate new tokens (token rotation)
  const newTokens = await generateTokens(user);

  // Remove old session and create new one
  await sessionStore.removeSession(decoded.userId, decoded.jti);
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
  await sessionStore.storeRefreshToken(
    user.id,
    newTokens.tokenId,
    newTokens.refreshToken,
    expiresAt,
    session.deviceInfo
  );

  // Update database
  await tokenModel.revokeToken(decoded.jti);
  await tokenModel.createRefreshToken(
    user.id,
    newTokens.refreshToken,
    expiresAt,
    session.deviceInfo
  );

  logger.info('Token refreshed', { userId: user.id });

  return {
    accessToken: newTokens.accessToken,
    refreshToken: newTokens.refreshToken,
    expiresIn: 15 * 60,
  };
};

/**
 * Logout user (single session)
 */
export const logout = async (userId: string, tokenId?: string): Promise<void> => {
  if (tokenId) {
    // Logout from specific session
    await sessionStore.removeSession(userId, tokenId);
    await tokenModel.revokeToken(tokenId);
    logger.info('User logged out from session', { userId, tokenId });
  }
};

/**
 * Logout from all devices
 */
export const logoutAll = async (userId: string): Promise<void> => {
  await sessionStore.removeAllSessions(userId);
  await tokenModel.revokeAllUserTokens(userId);
  logger.info('User logged out from all devices', { userId });
};

/**
 * Request password reset
 */
export const forgotPassword = async (email: string): Promise<string> => {
  const user = await userModel.findByEmail(email);

  if (!user) {
    // Don't reveal that user doesn't exist
    logger.warn('Password reset requested for non-existent email', { email });
    return '';
  }

  // Create reset token
  const resetToken = await tokenModel.createPasswordResetToken(user.id);

  // TODO: Send password reset email

  logger.info('Password reset requested', { userId: user.id });

  return resetToken.token;
};

/**
 * Reset password
 */
export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  // Verify and consume reset token
  const resetToken = await tokenModel.consumePasswordResetToken(token);

  if (!resetToken) {
    throw new BadRequestError('Invalid or expired reset token', 'INVALID_RESET_TOKEN');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update password
  await userModel.updatePassword(resetToken.user_id, passwordHash);

  // Revoke all sessions for security
  await sessionStore.removeAllSessions(resetToken.user_id);
  await tokenModel.revokeAllUserTokens(resetToken.user_id);

  logger.info('Password reset completed', { userId: resetToken.user_id });
};

/**
 * Verify email
 */
export const verifyEmail = async (token: string): Promise<void> => {
  const verificationToken = await tokenModel.consumeEmailVerificationToken(token);

  if (!verificationToken) {
    throw new BadRequestError('Invalid or expired verification token', 'INVALID_VERIFICATION_TOKEN');
  }

  await userModel.verifyEmail(verificationToken.user_id);

  logger.info('Email verified', { userId: verificationToken.user_id });
};

/**
 * Resend verification email
 */
export const resendVerification = async (email: string): Promise<void> => {
  const user = await userModel.findByEmail(email);

  if (!user || user.email_verified) {
    // Don't reveal whether user exists or is already verified
    return;
  }

  const verificationToken = await tokenModel.createEmailVerificationToken(user.id);

  // TODO: Send verification email

  logger.info('Verification email resent', { userId: user.id });
};

/**
 * Change password (authenticated user)
 */
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const user = await userModel.findById(userId);

  if (!user || !user.password_hash) {
    throw new BadRequestError('User not found or uses Google Sign-In');
  }

  // Verify current password
  const passwordValid = await bcrypt.compare(currentPassword, user.password_hash);

  if (!passwordValid) {
    throw new InvalidCredentialsError('Current password is incorrect');
  }

  // Hash and update new password
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userModel.updatePassword(userId, passwordHash);

  logger.info('Password changed', { userId });
};

/**
 * Generate JWT tokens
 */
const generateTokens = async (user: any, deviceId?: string): Promise<{
  tokenId: string;
  accessToken: string;
  refreshToken: string;
}> => {
  const tokenId = uuidv4();

  // Access token payload
  const accessPayload = {
    userId: user.id,
    email: user.email,
    roleId: user.role_id,
    roleName: user.role_name,
    organisationId: user.organisation_id,
    permissions: user.permissions || [],
    type: 'access',
    jti: tokenId,
    deviceId,
  };

  // Refresh token payload
  const refreshPayload = {
    userId: user.id,
    email: user.email,
    type: 'refresh',
    jti: tokenId,
  };

  const accessToken = jwt.sign(accessPayload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: config.jwt.issuer,
  });

  const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
    issuer: config.jwt.issuer,
  });

  return {
    tokenId,
    accessToken,
    refreshToken,
  };
};

/**
 * Validate Google OAuth token and get user info
 */
export const validateGoogleToken = async (code: string): Promise<any> => {
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );

  // Exchange code for tokens
  const { tokens } = await client.getToken(code);

  // Verify and get user info
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.google.clientId,
  });

  const payload = ticket.getPayload();

  return {
    googleId: payload.sub,
    email: payload.email,
    verifiedEmail: payload.email_verified,
    name: payload.name,
    givenName: payload.given_name,
    familyName: payload.family_name,
    picture: payload.picture,
    locale: payload.locale,
  };
};

export default {
  register,
  login,
  googleAuth,
  refreshToken,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  changePassword,
  validateGoogleToken,
};
