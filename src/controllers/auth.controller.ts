import { Request, Response } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import User from '@/models/user.model';
import EventResult from '@/models/eventResult.model';
import CommunityMembership from '@/models/communityMembership.model';
import Community from '@/models/community.model';
import FeedPost from '@/models/feed-post.model';
import CommunityPost from '@/models/community-post.model';
import Event from '@/models/event.model';
import { verifyFirebaseToken } from '@/services/firebase.service';
import { communityMembershipService } from '@/services';
import {
  generateTokens,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
} from '@/utils/jwt.util';
import { t } from '@/utils/i18n';
import { resolveRequestLanguage } from '@/utils/localization';
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
      provider?: string;
      fcmToken?: string;
      userAgent?: string;
      platform?: 'web' | 'android' | 'ios';
      deviceId?: string;
      deviceModel?: string;
      osVersion?: string;
      appVersion?: string;
      appBuild?: string;
    };
    const uid = req.user?.uid; // From JWT (temporary token)
    const phone = req.user?.phone; // Optional phone from JWT (for phone auth)
    const email = req.user?.email; // Optional email from JWT (for email/password auth)

    if (!uid) {
      throw new AppError(t(lang, 'auth.firebase_uid_required'), 400);
    }

    // Check if user already exists by UID
    const existingUser = await User.findOne({ firebaseUid: uid });
    if (existingUser) {
      throw new AppError(t(lang, 'auth.already_registered'), 400);
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

    // delete user's community posts
    await CommunityPost.deleteMany({ createdBy: userId });

    // delete user's created events
    await Event.deleteMany({ createdBy: userId });

    // delete user's created communities
    await Community.deleteMany({ createdBy: userId });

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

    const s = user.stats;
    const hasMaterializedStats =
      s &&
      typeof s.totalDistanceKm === 'number' &&
      typeof s.totalRides === 'number' &&
      typeof s.totalEventsParticipated === 'number' &&
      typeof s.totalPoints === 'number' &&
      typeof s.completedCount === 'number';

    if (hasMaterializedStats) {
      sendSuccess(res, { ...s }, t(lang, 'auth.stats_retrieved'));
      return;
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
        $group: {
          _id: null,
          totalDistanceKm: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$distance', 0] },
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
                    { $eq: ['$status', 'completed'] },
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
                { $eq: ['$status', 'completed'] },
                { $ifNull: ['$pointsEarned', 0] },
                0,
              ],
            },
          },
          completedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
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
    sendSuccess(res, result, t(lang, 'auth.joined_communities_retrieved'));
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
      EventResult.find(filter)
        .select('eventId status distance time createdAt')
        .populate('eventId', 'title titleAr address addressAr eventDate eventTime city status mainImage communityId trackId category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventResult.countDocuments(filter),
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
      EventResult.find(filter)
        .select('eventId status createdAt')
        .populate('eventId', 'title titleAr address addressAr eventDate eventTime city status mainImage communityId trackId category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventResult.countDocuments(filter),
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

    sendSuccess(res, user, t(lang, 'auth.profile_retrieved'));
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
      EventResult.find(filter)
        .select('eventId reason updatedAt')
        .populate('eventId', 'title titleAr address addressAr eventDate eventTime city status mainImage communityId trackId category')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventResult.countDocuments(filter),
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
    const filter = { userId, status: 'completed' };

    const [results, total] = await Promise.all([
      EventResult.find(filter)
        .select('eventId distance time updatedAt')
        .populate('eventId', 'title titleAr address addressAr eventDate eventTime city status mainImage communityId trackId category badgeName badgeImage')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventResult.countDocuments(filter),
    ]);

    const rides: any[] = [];
    const events: any[] = [];

    for (const r of results as any[]) {
      const item: any = {
        event: r.eventId,
        completedAt: r.updatedAt,
        distance: r.distance ?? null,
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
    
    const { fullName, gender, age, dob, country } = req.body;
    const updates: Record<string, unknown> = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (gender !== undefined) updates.gender = gender;
    if (age !== undefined) updates.age = age;
    if (dob !== undefined) updates.dob = dob;
    if (country !== undefined) updates.country = country;

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
        user: {
          id: guestId,
          role: GUEST_ROLE,
          isGuest: true,
        },
        ...tokens,
      },
      t(lang, 'auth.guest_login_success')
    );
  }
);
