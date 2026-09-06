import { Request, Response } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '@/models/user.model';
import EventResult from '@/models/eventResult.model';
import CommunityMembership from '@/models/communityMembership.model';
import Community from '@/models/community.model';
import FeedPost from '@/models/feed-post.model';
import CommunityPost from '@/models/community-post.model';
import Event from '@/models/event.model';
import Track from '@/models/track.model';
import Challenge from '@/models/challenge.model';
import ChallengeJoin from '@/models/challengeJoin.model';
import StoreItem from '@/models/store-item.model';
import CommunityRide from '@/models/community-ride.model';
import Notification from '@/models/notification.model';
import AdminNotification from '@/models/admin-notification.model';
import { verifyFirebaseToken } from '@/services/firebase.service';
import { communityMembershipService } from '@/services';
import {
  generateTokens,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
} from '@/utils/jwt.util';
import { t } from '@/utils/i18n';
import {
  localizeDocumentFields,
  resolveRequestLanguage,
  localizeCommunityStatic,
} from '@/utils/localization';
import { getCachedLookupMap, LOOKUP_TYPE_CITY } from '@/services/lookup.service';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { upsertUserFcmToken } from '@/services/push-token.service';

/** Guest role and ID prefix - guest users are stateless (no DB record) */
const GUEST_ROLE = 'Guest';
const GUEST_ID_PREFIX = 'guest_';

function isGuestPayload(id?: string, role?: string): boolean {
  return role === GUEST_ROLE && typeof id === 'string' && id.startsWith(GUEST_ID_PREFIX);
}

/**
 * Verify Firebase authentication
 * POST /v1/auth/verify
 * Supports both mobile (phone OTP) and web (email/password) authentication
 * Returns JWT if user exists, or isNewUser flag if new
 */
export const verifyFirebaseAuth = asyncHandler(
  async (req: Request, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const {
      idToken,
      fcmToken,
      userAgent,
      platform,
      deviceId,
      deviceModel,
      osVersion,
      appVersion,
      appBuild,
    } = req.body as {
      idToken: string;
      fcmToken?: string;
      userAgent?: string;
      platform?: 'web' | 'android' | 'ios';
      deviceId?: string;
      deviceModel?: string;
      osVersion?: string;
      appVersion?: string;
      appBuild?: string;
    };

    // Verify Firebase token - get UID, phone (for phone auth), email (for email/password auth)
    const { uid, phone, email } = await verifyFirebaseToken(idToken);

    // Find user by Firebase UID (primary lookup)
    let user = await User.findOne({ firebaseUid: uid });

    // If no user found by firebaseUid, try to find an existing user by email or phone
    // This helps when users sign up via one provider and later sign in with another
    // provider that resolves to the same email/phone but a different Firebase UID.
    if (!user) {
      if (email) {
        user = await User.findOne({ email: email });
      }
      if (!user && phone) {
        user = await User.findOne({ phone: phone });
      }

      // If we found a matching user by email/phone, attach the firebaseUid so
      // subsequent verifies recognise the account as existing.
      if (user) {
        user.firebaseUid = uid;
        // Do not overwrite other fields (provider/role) unless needed
        await user.save();
      }
    }

    if (user) {
      if (fcmToken) {
        await upsertUserFcmToken(user._id.toString(), {
          token: fcmToken,
          userAgent,
          platform,
          deviceId,
          deviceModel,
          osVersion,
          appVersion,
          appBuild,
        });
      }

      // Clean up expired tokens first
      const now = new Date();
      user.refreshTokens = user.refreshTokens.filter(
        (token) => token.expiresAt >= now
      );

      // Check if user has reached the maximum number of active devices
      if (user.refreshTokens.length >= Number(process.env.MAX_REFRESH_TOKENS)) {
        throw new AppError(
          t(lang, 'auth.max_devices_reached', { max: process.env.MAX_REFRESH_TOKENS! }),
          403
        );
      }

      // Existing user - return tokens + user
      const tokens = generateTokens({
        id: user._id.toString(),
        uid: user.firebaseUid,
        phone: user.phone || phone || '',
        email: user.email || email || '',
        role: user.role,
      });

      // Store refresh token in database
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3); // 3 days

      user.refreshTokens.push({
        token: tokens.refreshToken,
        expiresAt,
        createdAt: new Date(),
      });
      await user.save();

      sendSuccess(
        res,
        {
          user: {
            id: user._id,
            fullName: user.fullName,
            phone: user.phone,
            email: user.email,
            gender: user.gender,
            age: user.age,
            dob: user.dob,
            country: user.country,
            provider: user.provider,
            role: user.role,
            isVerified: user.isVerified,
          },
          ...tokens,
        },
        t(lang, 'auth.login_success')
      );
    } else {
      // New user - return temporary token (with UID, no user ID)
      const tokens = generateTokens({
        uid,
        phone: phone || '',
        email: email || '',
      });

      sendSuccess(
        res,
        {
          isNewUser: true,
          uid,
          phone: phone || undefined,
          email: email || undefined,
          ...tokens,
        },
        t(lang, 'auth.verify_success')
      );
    }
  }
);

/**
 * Email/password register
 * POST /v1/auth/email/register
 * Creates a user with an email/password pair using the app's own backend auth flow.
 */
export const emailRegister = asyncHandler(
  async (req: Request, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const {
      fullName,
      email,
      password,
      gender = 'Male',
      age,
      dob,
      country,
      city,
      provider = 'email',
    } = req.body as {
      fullName: string;
      email: string;
      password: string;
      gender?: 'Male' | 'Female';
      age?: number;
      dob?: string;
      country?: string;
      city?: string;
      provider?: string;
    };

    const normalizedEmail = email?.toString().trim().toLowerCase();

    if (!normalizedEmail || !fullName?.trim()) {
      throw new AppError('Full name and email are required', 400);
    }

    if (!password || password.trim().length < 6) {
      throw new AppError('Password must be at least 6 characters', 400);
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new AppError('Email already in use', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      gender,
      age,
      dob: dob ? new Date(dob) : undefined,
      country,
      city,
      provider,
      isVerified: true,
    });

    const tokens = generateTokens({
      id: user._id.toString(),
      email: user.email || '',
      role: user.role,
      phone: user.phone || '',
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    user.refreshTokens.push({
      token: tokens.refreshToken,
      expiresAt,
      createdAt: new Date(),
    });
    await user.save();

    sendSuccess(
      res,
      {
        isNewUser: true,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          gender: user.gender,
          age: user.age,
          dob: user.dob,
          country: user.country,
          city: user.city,
          provider: user.provider,
          role: user.role,
          isVerified: user.isVerified,
        },
        ...tokens,
      },
      t(lang, 'auth.register_success')
    );
  }
);

/**
 * Email/password login
 * POST /v1/auth/email/login
 * Authenticates using the app's backend email/password flow.
 */
export const emailLogin = asyncHandler(
  async (req: Request, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const {
      email,
      password,
    } = req.body as {
      email: string;
      password: string;
    };

    const normalizedEmail = email?.toString().trim().toLowerCase();

    if (!normalizedEmail || !password || password.trim().length < 6) {
      throw new AppError('Invalid email or password', 401);
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.passwordHash) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const now = new Date();
    user.refreshTokens = user.refreshTokens.filter((token) => token.expiresAt >= now);

    if (user.refreshTokens.length >= Number(process.env.MAX_REFRESH_TOKENS || 5)) {
      throw new AppError(t(lang, 'auth.max_devices_reached', { max: process.env.MAX_REFRESH_TOKENS || '5' }), 403);
    }

    const tokens = generateTokens({
      id: user._id.toString(),
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    user.refreshTokens.push({
      token: tokens.refreshToken,
      expiresAt,
      createdAt: new Date(),
    });
    await user.save();

    sendSuccess(
      res,
      {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          gender: user.gender,
          age: user.age,
          dob: user.dob,
          country: user.country,
          city: user.city,
          provider: user.provider,
          role: user.role,
          isVerified: user.isVerified,
        },
        ...tokens,
      },
      t(lang, 'auth.login_success')
    );
  }
);

/**
 * Register new user
 * POST /v1/auth/register
 * Creates user with fullName and gender
 * Supports both phone OTP (mobile) and email/password (web) authentication
 */
export const registerUser = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const {
      fullName,
      gender,
      age,
      dob,
      country,
      city,
      provider,
      fcmToken,
      userAgent,
      platform,
      deviceId,
      deviceModel,
      osVersion,
      appVersion,
      appBuild,
    } = req.body as {
      fullName: string;
      gender: 'Male' | 'Female';
      age?: number;
      dob: Date;
      country?: string;
      city?: string;
      provider?: string;
      fcmToken?: string;
      userAgent?: string;
      platform?: 'web' | 'android' | 'ios';
      deviceId?: string;
      deviceModel?: string;
      osVersion?: string;
      appVersion?: string;
      appBuild?: string;
      email?: string;
      phone?: string;
    };
    const uid = req.user?.uid; // From JWT (temporary token)
    const phoneFromToken = req.user?.phone; // Optional phone from JWT (for phone auth)
    const emailFromToken = req.user?.email; // Optional email from JWT (for email/password auth)
    const emailFromBody = (req.body as any).email
      ? (req.body as any).email.toString().toLowerCase().trim()
      : undefined;
    const phoneFromBody = (req.body as any).phone
      ? (req.body as any).phone.toString().trim()
      : undefined;
    const phone = phoneFromBody || phoneFromToken;
    const email = emailFromBody || emailFromToken;

    if (!uid) {
      throw new AppError(t(lang, 'auth.firebase_uid_required'), 400);
    }

    // Check if user already exists by UID
    const existingUser = await User.findOne({ firebaseUid: uid });
    if (existingUser) {
      throw new AppError(t(lang, 'auth.already_registered'), 400);
    }

    // If email provided in body, ensure it's not already taken
    if (emailFromBody) {
      const byEmail = await User.findOne({ email: emailFromBody });
      if (byEmail) {
        throw new AppError('Email already in use', 400);
      }
    }

    if (phoneFromBody) {
      const byPhone = await User.findOne({ phone: phoneFromBody });
      if (byPhone) {
        throw new AppError('Phone number already in use', 400);
      }
    }

    // Create user with Firebase UID
    const user = await User.create({
      fullName,
      firebaseUid: uid,
      phone: phone || undefined,
      email: email || undefined,
      gender,
      age,
      dob,
      country,
      city,
      provider,
      isVerified: true,
    });

    if (fcmToken) {
      await upsertUserFcmToken(user._id.toString(), {
        token: fcmToken,
        userAgent,
        platform,
        deviceId,
        deviceModel,
        osVersion,
        appVersion,
        appBuild,
      });
    }

    // Generate new tokens with user ID
    const tokens = generateTokens({
      id: user._id.toString(),
      uid: user.firebaseUid,
      phone: user.phone || phone || '',
      email: user.email || email || '',
      role: user.role,
    });

    // For new users, they start with 0 tokens, so no need to check limit
    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3); // 3 days

    user.refreshTokens.push({
      token: tokens.refreshToken,
      expiresAt,
      createdAt: new Date(),
    });
    await user.save();

    sendSuccess(
      res,
      {
        user: {
          id: user._id,
          fullName: user.fullName,
          phone: user.phone,
          email: user.email,
          gender: user.gender,
          age: user.age,
          dob: user.dob,
          country: user.country,
          city: user.city,
          provider: user.provider,
          role: user.role,
          isVerified: user.isVerified,
        },
        ...tokens,
      },
      t(lang, 'auth.register_success')
    );
  }
);

/**
 * Refresh access token
 * POST /v1/auth/refresh
 * Implements token rotation: issues new refresh token and revokes old one
 * Also cleans up expired tokens from database
 */
export const refreshAccessToken = asyncHandler(
  async (req: Request, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Guest refresh: stateless; no DB lookup (check before id guard)
    if (decoded.role === GUEST_ROLE || isGuestPayload(decoded.id, decoded.role)) {
      const guestId = decoded.id ?? GUEST_ID_PREFIX + crypto.randomUUID();
      const tokens = generateTokens({
        id: guestId,
        role: GUEST_ROLE,
      });
      sendSuccess(
        res,
        { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
        t(lang, 'auth.token_refreshed')
      );
      return;
    }

    if (!decoded.id) {
      throw new AppError(t(lang, 'auth.invalid_refresh_token'), 401);
    }

    // Check if refresh token exists in database
    const user = await User.findOne({
      _id: decoded.id,
      'refreshTokens.token': refreshToken,
      'refreshTokens.expiresAt': { $gt: new Date() },
    });

    if (!user) {
      throw new AppError(t(lang, 'auth.invalid_expired_token'), 401);
    }

    // Generate new access token
    const accessToken = generateAccessToken({
      id: user._id.toString(),
      uid: user.firebaseUid,
      phone: user.phone || '',
      email: user.email || '',
      role: user.role,
    });

    // Token rotation: Generate new refresh token
    const newRefreshToken = generateRefreshToken({
      id: user._id.toString(),
      uid: user.firebaseUid,
      phone: user.phone || '',
      email: user.email || '',
      role: user.role,
    });

    // Calculate expiry date for new refresh token (3 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    // Filter out expired tokens and the old refresh token, then add new one
    const now = new Date();
    const filteredTokens = user.refreshTokens.filter(
      (token) =>
        token.expiresAt >= now && token.token !== refreshToken
    );

    // Add new refresh token
    filteredTokens.push({
      token: newRefreshToken,
      expiresAt,
      createdAt: new Date(),
    });

    // Update user with filtered tokens array (atomic operation)
    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          refreshTokens: filteredTokens,
        },
      },
      { new: true }
    );

    sendSuccess(
      res,
      { accessToken, refreshToken: newRefreshToken },
      t(lang, 'auth.token_refreshed')
    );
  }
);

/**
 * Logout - Revoke refresh token
 * POST /v1/auth/logout
 * For Guest: no-op (no DB state to revoke).
 */
export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = resolveRequestLanguage(req);
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  if (isGuestPayload(userId, req.user?.role)) {
    sendSuccess(res, null, t(lang, 'auth.logout_success'));
    return;
  }

  const { refreshToken, fcmToken } = req.body as { refreshToken: string; fcmToken?: string };
  const update: Record<string, unknown> = {
    $pull: { refreshTokens: { token: refreshToken } },
  };
  if (fcmToken) {
    (update.$pull as any).webPushTokens = { token: fcmToken };
    (update.$pull as any).fcmTokens = { token: fcmToken };
  }
  await User.findByIdAndUpdate(userId, update);

  sendSuccess(res, null, t(lang, 'auth.logout_success'));
});

/**
 * Delete current user's account
 * DELETE /v1/auth/delete-account
 */
export const deleteMyAccount = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);

    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }

    if (req.user?.isGuest) {
      throw new AppError(t(lang, 'guest.access_denied'), 403);
    }

    const user = await User.findById(userId);

    if (!user) {
      throw new AppError(t(lang, 'auth.user_not_found'), 404);
    }

    // delete event participations
    await EventResult.deleteMany({ userId });

    // remove user from all community members arrays
    await Community.updateMany(
      { members: userId },
      { $pull: { members: userId } }
    );

    // delete community memberships
    await CommunityMembership.deleteMany({ userId });

    // delete user's feed posts
    await FeedPost.deleteMany({ createdBy: userId });

    // remove user's likes and comments from feed posts
    await FeedPost.updateMany({}, { $pull: { likes: userId, comments: { user: userId } } });

    // delete user's community posts
    await CommunityPost.deleteMany({ createdBy: userId });

    // delete user's created events
    await Event.deleteMany({ createdBy: userId });

    // delete user's created communities
    await Community.deleteMany({ createdBy: userId });

    // delete tracks created by user
    await Track.deleteMany({ createdBy: userId });

    // delete challenges created by user and their joins
    await Challenge.deleteMany({ createdBy: userId });
    await ChallengeJoin.deleteMany({ userId });

    // delete community rides created by user
    await CommunityRide.deleteMany({ createdBy: userId });

    // delete store items created by user; unset approvals/rejections made by this user
    await StoreItem.deleteMany({ createdBy: userId });
    await StoreItem.updateMany({ approvedBy: userId }, { $unset: { approvedBy: '' } });
    await StoreItem.updateMany({ rejectedBy: userId }, { $unset: { rejectedBy: '' } });

    // delete notifications for user and remove read references from admin notifications
    await Notification.deleteMany({ userId });
    await AdminNotification.updateMany({}, { $pull: { readByUserIds: userId } });

    await User.findByIdAndDelete(userId);

    sendSuccess(
      res,
      null,
      'Account deleted successfully'
    );
  }
);
/**
 * Delete account
 * DELETE /v1/auth/delete-account
 * Deletes the current authenticated user (or no-op for guests)
 */
export const deleteAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = resolveRequestLanguage(req);
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  // Guest users are stateless - nothing to delete
  if (isGuestPayload(userId, req.user?.role)) {
    sendSuccess(res, null, t(lang, 'auth.delete_success'));
    return;
  }

  // Delete the user record from the database
  // Perform cascade cleanup similar to deleteMyAccount
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(t(lang, 'auth.user_not_found'), 404);
  }

  // delete event participations
  await EventResult.deleteMany({ userId });

  // remove user from all community members arrays
  await Community.updateMany({ members: userId }, { $pull: { members: userId } });

  // delete community memberships
  await CommunityMembership.deleteMany({ userId });

  // delete user's feed posts
  await FeedPost.deleteMany({ createdBy: userId });

  // remove user's likes and comments from feed posts
  await FeedPost.updateMany({}, { $pull: { likes: userId, comments: { user: userId } } });

  // delete user's community posts
  await CommunityPost.deleteMany({ createdBy: userId });

  // delete user's created events
  await Event.deleteMany({ createdBy: userId });

  // delete user's created communities
  await Community.deleteMany({ createdBy: userId });

  // delete tracks created by user
  await Track.deleteMany({ createdBy: userId });

  // delete challenges created by user and their joins
  await Challenge.deleteMany({ createdBy: userId });
  await ChallengeJoin.deleteMany({ userId });

  // delete community rides created by user
  await CommunityRide.deleteMany({ createdBy: userId });

  // delete store items created by user; unset approvals/rejections made by this user
  await StoreItem.deleteMany({ createdBy: userId });
  await StoreItem.updateMany({ approvedBy: userId }, { $unset: { approvedBy: '' } });
  await StoreItem.updateMany({ rejectedBy: userId }, { $unset: { rejectedBy: '' } });

  // delete notifications for user and remove read references from admin notifications
  await Notification.deleteMany({ userId });
  await AdminNotification.updateMany({}, { $pull: { readByUserIds: userId } });

  await User.findByIdAndDelete(userId);

  sendSuccess(res, null, t(lang, 'auth.delete_success'));
});

/**
 * Get current user stats (distance, rides, events participated)
 * GET /v1/auth/me/stats
 * Requires member (guest gets 403).
 * Reads from materialized User.stats; runs aggregation once for legacy users and backfills.
 */
export const getCurrentUserStats = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }

    const user = await User.findById(userId).select('stats').lean();
    if (!user) {
      throw new AppError(t(lang, 'auth.user_not_found'), 404);
    }

    const objectIdUserId = new mongoose.Types.ObjectId(userId);
    const results = await EventResult.aggregate([
      {
        $match: {
          userId: objectIdUserId,
          status: { $in: ['joined', 'checked_in', 'no_show', 'completed'] },
        },
      },
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'event',
        },
      },
      { $unwind: { path: '$event', preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: 'tracks',
          localField: 'event.trackId',
          foreignField: '_id',
          as: 'track',
        },
      },
      { $unwind: { path: '$track', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          isCompleted: {
            $or: [
              { $eq: ['$status', 'completed'] },
              { $and: [ { $ne: ['$time', null] }, { $ne: ['$time', ''] } ] },
              { $ne: ['$pointsEarned', null] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalDistanceKm: {
            $sum: {
              $cond: [
                '$isCompleted',
                { $ifNull: ['$distance', { $ifNull: ['$event.distance', '$track.distance'] }] },
                0,
              ],
            },
          },
          totalEventsParticipated: { $sum: 1 },
          totalRides: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$isCompleted',
                    { $ne: ['$event.trackId', null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalPoints: {
            $sum: {
              $cond: [
                '$isCompleted',
                { $ifNull: ['$pointsEarned', 0] },
                0,
              ],
            },
          },
          completedCount: {
            $sum: {
              $cond: ['$isCompleted', 1, 0],
            },
          },
        },
      },
    ]);

    const stats = results[0]
      ? {
          totalDistanceKm: Number(results[0].totalDistanceKm ?? 0),
          totalRides: Number(results[0].totalRides ?? 0),
          totalEventsParticipated: Number(results[0].totalEventsParticipated ?? 0),
          totalPoints: Number(results[0].totalPoints ?? 0),
          completedCount: Number(results[0].completedCount ?? 0),
        }
      : {
          totalDistanceKm: 0,
          totalRides: 0,
          totalEventsParticipated: 0,
          totalPoints: 0,
          completedCount: 0,
        };

    await User.findByIdAndUpdate(userId, { $set: { stats } });

    sendSuccess(res, stats, t(lang, 'auth.stats_retrieved'));
  }
);

/**
 * Get current user monthly stats (distance, rides, rank change)
 * GET /v1/auth/me/monthly-stats
 */
export const getCurrentUserMonthlyStats = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }

    const objectIdUserId = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = currentMonthStart;

    const currentStatsResults = await EventResult.aggregate([
      {
        $match: {
          userId: objectIdUserId,
          status: { $in: ['joined', 'checked_in', 'no_show', 'completed'] },
          updatedAt: { $gte: currentMonthStart, $lt: nextMonthStart },
        },
      },
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'event',
        },
      },
      { $unwind: { path: '$event', preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: 'tracks',
          localField: 'event.trackId',
          foreignField: '_id',
          as: 'track',
        },
      },
      { $unwind: { path: '$track', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          isCompleted: {
            $or: [
              { $eq: ['$status', 'completed'] },
              { $and: [ { $ne: ['$time', null] }, { $ne: ['$time', ''] } ] },
              { $ne: ['$pointsEarned', null] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalDistanceKm: {
            $sum: {
              $cond: [
                '$isCompleted',
                { $ifNull: ['$distance', { $ifNull: ['$event.distance', '$track.distance'] }] },
                0,
              ],
            },
          },
          totalRides: {
            $sum: {
              $cond: [
                {
                  $and: [
                    '$isCompleted',
                    { $ne: ['$event.trackId', null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalPoints: {
            $sum: {
              $cond: ['$isCompleted', { $ifNull: ['$pointsEarned', 0] }, 0],
            },
          },
        },
      },
    ]);

    const currentStats = currentStatsResults[0]
      ? {
          totalDistanceKm: Number(currentStatsResults[0].totalDistanceKm ?? 0),
          totalRides: Number(currentStatsResults[0].totalRides ?? 0),
          totalPoints: Number(currentStatsResults[0].totalPoints ?? 0),
        }
      : { totalDistanceKm: 0, totalRides: 0, totalPoints: 0 };

    const currentRanking = await EventResult.aggregate([
      {
        $match: {
          status: { $in: ['joined', 'checked_in', 'no_show', 'completed'] },
          updatedAt: { $gte: currentMonthStart, $lt: nextMonthStart },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalPoints: { $sum: { $ifNull: ['$pointsEarned', 0] } },
        },
      },
      { $sort: { totalPoints: -1 } },
    ]);

    const previousRanking = await EventResult.aggregate([
      {
        $match: {
          status: { $in: ['joined', 'checked_in', 'no_show', 'completed'] },
          updatedAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
        },
      },
      {
        $group: {
          _id: '$userId',
          totalPoints: { $sum: { $ifNull: ['$pointsEarned', 0] } },
        },
      },
      { $sort: { totalPoints: -1 } },
    ]);

    const currentRank = currentRanking.findIndex(
      (item: any) => String(item._id) === String(objectIdUserId)
    );
    const previousRank = previousRanking.findIndex(
      (item: any) => String(item._id) === String(objectIdUserId)
    );

    const rankChange =
      currentRank >= 0 && previousRank >= 0
        ? previousRank - currentRank
        : 0;

    sendSuccess(
      res,
      {
        totalDistanceKm: currentStats.totalDistanceKm,
        totalRides: currentStats.totalRides,
        rankChange,
      },
      t(lang, 'auth.stats_retrieved')
    );
  }
);

/**
 * Get Performance Insights for event history (average completion rate, average event distance, best category).
 * GET /v1/auth/me/performance-insights
 * Uses pre-computed User.stats for rate and distance; runs one aggregation for best category.
 */
export const getPerformanceInsights = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }

    const user = await User.findById(userId).select('stats').lean();
    if (!user?.stats) {
      return sendSuccess(
        res,
        {
          averageCompletionRate: null,
          averageEventDistanceKm: null,
          bestCategory: null,
        },
        t(lang, 'auth.performance_insights_retrieved'),
        200
      );
    }

    const { totalEventsParticipated, completedCount, totalDistanceKm } = user.stats;
    const participated = Number(totalEventsParticipated ?? 0);
    const completed = Number(completedCount ?? 0);
    const totalKm = Number(totalDistanceKm ?? 0);

    const averageCompletionRate =
      participated > 0 ? Math.round((completed / participated) * 1000) / 10 : null;
    const averageEventDistanceKm =
      completed > 0 ? Math.round((totalKm / completed) * 10) / 10 : null;

    const objectIdUserId = new mongoose.Types.ObjectId(userId);
    const bestCategoryResult = await EventResult.aggregate([
      { $match: { userId: objectIdUserId, status: { $in: ['joined', 'checked_in', 'no_show', 'completed'] } } },
      { $lookup: { from: 'events', localField: 'eventId', foreignField: '_id', as: 'event' } },
      { $unwind: { path: '$event', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$event.category', 'Other'] },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          participatedCount: { $sum: 1 },
        },
      },
      {
        $addFields: {
          rate: {
            $multiply: [{ $divide: ['$completedCount', '$participatedCount'] }, 100],
          },
        },
      },
      { $sort: { rate: -1 } },
      { $limit: 1 },
      { $project: { category: '$_id', rate: 1, _id: 0 } },
    ]);

    const bestCategory =
      bestCategoryResult.length > 0
        ? {
            category: bestCategoryResult[0].category,
            rate: Math.round(bestCategoryResult[0].rate * 10) / 10,
          }
        : null;

    return sendSuccess(
      res,
      {
        averageCompletionRate,
        averageEventDistanceKm,
        bestCategory,
      },
      t(lang, 'auth.performance_insights_retrieved'),
      200
    );
  }
);

/**
 * Get current user's joined communities (paginated)
 * GET /v1/auth/me/joined-communities
 * Member only.
 */
export const getMyJoinedCommunities = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const result = await communityMembershipService.getMyJoinedCommunities(userId, page, limit);

    const localizedCommunities = (result.communities ?? []).map((item: any) => {
      if (!item || typeof item !== 'object' || !item.community || typeof item.community !== 'object') {
        return item;
      }

      const community = { ...item.community };
      const localizedCommunity = localizeDocumentFields(community, lang, {
        title: 'titleAr',
        description: 'descriptionAr',
      });
      localizeCommunityStatic(localizedCommunity, lang);

      return {
        ...item,
        community: localizedCommunity,
      };
    });

    sendSuccess(
      res,
      {
        ...result,
        communities: localizedCommunities,
      },
      t(lang, 'auth.joined_communities_retrieved')
    );
  }
);

/**
 * Get current user's joined events (paginated)
 * GET /v1/auth/me/joined-events
 * Member only.
 */
export const getMyJoinedEvents = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const filter = { userId, status: { $in: ['joined', 'checked_in', 'no_show', 'completed'] } };

    const [results, total] = await Promise.all([
      EventResult.find(filter as any)
        .select('eventId status distance time createdAt')
        .populate('eventId', 'title titleAr address addressAr eventDate eventTime city status mainImage communityId trackId category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventResult.countDocuments(filter as any),
    ]);

    const events = results.map((r: any) => {
      const item: any = {
        event: r.eventId,
        participationStatus: r.status,
        joinedAt: r.createdAt,
      };
      if (r.status === 'completed') {
        item.distance = r.distance;
        item.time = r.time;
      }
      return item;
    });

    sendSuccess(
      res,
      {
        events,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      t(lang, 'auth.joined_events_retrieved')
    );
  }
);

/**
 * Get current user's active (joined, not yet completed) rides and events
 * GET /v1/auth/me/active-participations
 * Member only.
 */
export const getMyActiveParticipations = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter = { userId, status: { $in: ['joined', 'checked_in'] } };

    const [results, total] = await Promise.all([
      EventResult.find(filter as any)
        .select('eventId status createdAt')
        .populate('eventId', 'title titleAr address addressAr eventDate eventTime city status mainImage communityId trackId category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventResult.countDocuments(filter as any),
    ]);

    const rides: any[] = [];
    const events: any[] = [];

    for (const r of results as any[]) {
      const item = {
        event: r.eventId,
        joinedAt: r.createdAt,
        status: r.status,
      };
      if (r.eventId?.trackId) {
        rides.push(item);
      } else {
        events.push(item);
      }
    }

    sendSuccess(
      res,
      {
        rides,
        events,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
      t(lang, 'auth.active_participations_retrieved')
    );
  }
);

/**
 * Get current user
 * GET /v1/auth/me
 * For Guest: returns minimal profile from JWT (no DB).
 */
export const getCurrentUser = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }

    if (isGuestPayload(userId, req.user?.role)) {
      sendSuccess(
        res,
        {
          id: userId,
          role: GUEST_ROLE,
          isGuest: true,
        },
        t(lang, 'auth.profile_retrieved')
      );
      return;
    }

    const user = await User.findById(userId).select('-refreshTokens -__v');

    if (!user) {
      throw new AppError(t(lang, 'auth.user_not_found'), 404);
    }

    // Convert to plain object so we can adjust localized fields without
    // mutating the mongoose document directly.
    const payload: any = typeof user.toObject === 'function' ? user.toObject() : { ...user };

    // Localize `city` using the dashboard-managed lookup cache when possible.
    if (payload.city && typeof payload.city === 'string') {
      const entry = getCachedLookupMap(LOOKUP_TYPE_CITY)[payload.city];
      if (entry) {
        payload.city = lang === 'ar' ? (entry.labelAr || entry.label) : entry.label;
      }
    }

    // Map common skill-level text to localized translations
    if (payload.skillLevel && typeof payload.skillLevel === 'string') {
      const lvl = payload.skillLevel.toLowerCase();
      if (lvl.includes('beginner')) {
        payload.skillLevel = t(lang, 'beginner');
      } else if (lvl.includes('intermediate')) {
        payload.skillLevel = t(lang, 'intermediate');
      } else if (lvl.includes('advanced')) {
        payload.skillLevel = t(lang, 'advanced');
      } else if (lvl.includes('ambassador')) {
        payload.skillLevel = t(lang, 'ambassador');
      }
    }

    sendSuccess(res, payload, t(lang, 'auth.profile_retrieved'));
  }
);

/**
 * Get current user's upcoming events (joined + event date in the future)
 * GET /v1/auth/me/upcoming-events
 * Member only. Guests get 403.
 */
export const getMyUpcomingEvents = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }
    if (req.user?.isGuest) {
      throw new AppError(t(lang, 'guest.access_denied'), 403);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const now = new Date();
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const basePipeline = [
      { $match: { userId: userObjectId, status: { $in: ['joined', 'checked_in'] } } },
      {
        $lookup: {
          from: 'events',
          localField: 'eventId',
          foreignField: '_id',
          as: 'event',
        },
      },
      { $unwind: { path: '$event', preserveNullAndEmptyArrays: false } },
      { $match: { 'event.eventDate': { $gt: now } } },
      {
        $project: {
          createdAt: 1,
          event: 1,
        },
      },
    ];

    const [results, countResult] = await Promise.all([
      EventResult.aggregate([
        ...basePipeline,
        { $sort: { 'event.eventDate': 1 } },
        { $skip: skip },
        { $limit: limit },
      ]),
      EventResult.aggregate([
        ...basePipeline,
        { $count: 'total' },
      ]),
    ]);

    const total = countResult[0]?.total ?? 0;
    const rides: any[] = [];
    const events: any[] = [];

    for (const r of results) {
      const item = { event: r.event, joinedAt: r.createdAt };
      if (r.event?.trackId) {
        rides.push(item);
      } else {
        events.push(item);
      }
    }

    sendSuccess(
      res,
      {
        rides,
        events,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      },
      t(lang, 'auth.upcoming_events_retrieved')
    );
  }
);

/**
 * Get current user's cancelled events (user cancelled their registration)
 * GET /v1/auth/me/cancelled-events
 * Member only. Guests get 403.
 */
export const getMyCancelledEvents = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }
    if (req.user?.isGuest) {
      throw new AppError(t(lang, 'guest.access_denied'), 403);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const filter = { userId, status: 'cancelled' };

    const [results, total] = await Promise.all([
      EventResult.find(filter as any)
        .select('eventId reason updatedAt')
        .populate('eventId', 'title titleAr address addressAr eventDate eventTime city status mainImage communityId trackId category')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventResult.countDocuments(filter as any),
    ]);

    const rides: any[] = [];
    const events: any[] = [];

    for (const r of results as any[]) {
      const item = {
        event: r.eventId,
        cancelledAt: r.updatedAt,
        reason: r.reason ?? null,
      };
      if (r.eventId?.trackId) {
        rides.push(item);
      } else {
        events.push(item);
      }
    }

    sendSuccess(
      res,
      {
        rides,
        events,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      },
      t(lang, 'auth.cancelled_events_retrieved')
    );
  }
);

/**
 * Get current user's completed events
 * GET /v1/auth/me/completed-events
 * Member only. Guests get 403.
 */
export const getMyCompletedEvents = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }
    if (req.user?.isGuest) {
      throw new AppError(t(lang, 'guest.access_denied'), 403);
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const filter = {
      userId,
      $or: [
        { status: 'completed' },
        { time: { $nin: [null, ''] } },
        { pointsEarned: { $ne: null } },
      ],
    };

    const [results, total] = await Promise.all([
      EventResult.find(filter as any)
        .select('eventId distance time updatedAt')
        .populate(
          'eventId',
          'title titleAr address addressAr eventDate eventTime city status mainImage communityId trackId category rewards.badgeName rewards.badgeImage'
        )
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventResult.countDocuments(filter as any),
    ]);

    const rides: any[] = [];
    const events: any[] = [];

    for (const r of results as any[]) {
      const item: any = {
        event: r.eventId,
        completedAt: r.updatedAt,
        distance: r.distance ?? r.eventId?.distance ?? null,
        time: r.time ?? null,
      };
      if (r.eventId?.trackId) {
        rides.push(item);
      } else {
        events.push(item);
      }
    }

    sendSuccess(
      res,
      {
        rides,
        events,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      },
      t(lang, 'auth.completed_events_retrieved')
    );
  }
);

/**
 * Update current user's profile (fullName, gender, age)
 * PATCH /v1/auth/me
 * Member only. Guests get 403.
 */
export const updateMyProfile = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }
    if (req.user?.isGuest) {
      throw new AppError(t(lang, 'guest.access_denied'), 403);
    }
    
    const { fullName, email, gender, age, dob, country, city, profileImage } = req.body;
    const updates: Record<string, unknown> = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (email !== undefined) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const existingUserWithEmail = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: userId },
      }).select('_id');

      if (existingUserWithEmail) {
        throw new AppError('Email already in use', 400);
      }

      updates.email = normalizedEmail;
    }
    if (gender !== undefined) updates.gender = gender;
    if (age !== undefined) updates.age = age;
    if (dob !== undefined) updates.dob = dob;
    if (country !== undefined) updates.country = country;
    if (city !== undefined) updates.city = city;
    if (profileImage !== undefined) updates.profileImage = profileImage;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-refreshTokens -__v');

    if (!user) {
      throw new AppError(t(lang, 'auth.user_not_found'), 404);
    }

    sendSuccess(res, user, t(lang, 'auth.profile_updated'));
  }
);

/**
 * Update current user profile image URL
 * PATCH /v1/auth/me/profile-image
 */
export const updateProfileImage = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    if (req.user?.isGuest) {
      throw new AppError('Guest users cannot update profile', 403);
    }

    const { profileImage } = req.body as { profileImage: string };

    const user = await User.findByIdAndUpdate(
      userId,
      { profileImage },
      { new: true, runValidators: true }
    ).select('-refreshTokens -__v');

    if (!user) {
      throw new AppError('User not found', 404);
    }

    sendSuccess(res, user, 'Profile image updated successfully');
  }
);

/**
 * Guest login - for users who want to try the app without registration
 * POST /v1/auth/guestLogin
 * Issues a stateless JWT with a unique guest ID and role Guest; no DB write.
 */
export const guestLogin = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = resolveRequestLanguage(req);
    const guestId = GUEST_ID_PREFIX + crypto.randomUUID();
    const tokens = generateTokens({
      id: guestId,
      role: GUEST_ROLE,
    });
    sendSuccess(
      res,
      {
        user: {id: guestId,
          role: GUEST_ROLE,
          isGuest: true,
        },
        ...tokens,
      },
      t(lang, 'auth.guest_login_success')
    );
  }
          
);