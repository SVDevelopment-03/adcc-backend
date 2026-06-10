import { Response } from 'express';
import mongoose from 'mongoose';
import { t } from '@/utils/i18n';
import User from '@/models/user.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { upsertUserFcmToken } from '@/services/push-token.service';
import { createFirebaseUser } from '@/services/firebase.service';

/** Fields to exclude from user response (sensitive data) */
const USER_PROJECTION = '-refreshTokens';

/**
 * Create a new user from the admin panel
 * POST /user
 * Staff only. Creates user in Firebase (email/password) + Mongo user record.
 */
export const createUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;
  const { fullName, email, password, phone, profileImage, gender, role, isVerified } = req.body as {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    profileImage?: string;
    gender: 'Male' | 'Female';
    role?: 'Admin' | 'Vendor' | 'Member';
    isVerified?: boolean;
  };

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await User.findOne({
    $or: [{ email: normalizedEmail }, ...(phone ? [{ phone: phone.trim() }] : [])],
  }).lean();
  if (existing) {
    throw new AppError(t(lang, 'user.already_exists'), 400);
  }

  let userRecordUid = '';
  try {
    const userRecord = await createFirebaseUser(normalizedEmail, password, fullName, true);
    userRecordUid = userRecord.uid;
  } catch (e: any) {
    throw new AppError(e?.message || 'Failed to create Firebase user', 400);
  }

  const user = await User.create({
    fullName: fullName.trim(),
    firebaseUid: userRecordUid,
    email: normalizedEmail,
    phone: phone?.trim() || undefined,
    profileImage: profileImage?.trim() || undefined,
    gender,
    role: role || 'Member',
    isVerified: isVerified ?? true,
    provider: 'admin',
  });

  const safeUser = await User.findById(user._id).select(USER_PROJECTION).lean();

  sendSuccess(res, safeUser, t(lang, 'user.created'), 201);
});

/**
 * Get all users (paginated)
 * GET /user?page=1&limit=10&role=Member
 * Admin only recommended; uses pagination for large sets.
 */
export const getAllUsers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;
  const { page = 1, limit = 10, role, gender } = req.query;

  const filter: Record<string, unknown> = {};
  if (role && ['Admin', 'Vendor', 'Member'].includes(role as string)) {
    filter.role = role;
  }
  // Allow filtering by gender (Male/Female), case-insensitive
  if (typeof gender === 'string') {
    const g = gender.trim();
    if (/^male$/i.test(g) || /^female$/i.test(g)) {
      filter.gender = { $regex: `^${g}$`, $options: 'i' };
    }
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [users, total] = await Promise.all([
    User.find(filter).select(USER_PROJECTION).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    User.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    },
    t(lang, 'user.list_retrieved'),
    200
  );
});

/**
 * Get user by ID
 * GET /user/:userId
 * Authenticated users can fetch a user; typically own profile or admin fetches any.
 */
export const getUserById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;
  const userId = typeof req.params.userId === 'string' ? req.params.userId : req.params.userId?.[0] ?? '';

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }

  const user = await User.findById(userId).select(USER_PROJECTION).lean();

  if (!user) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }

  sendSuccess(res, user, t(lang, 'user.retrieved'), 200);
});

/**
 * Delete user by ID
 * DELETE /user/:userId
 * Admin only.
 */
export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;
  const userId = typeof req.params.userId === 'string' ? req.params.userId : req.params.userId?.[0] ?? '';

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }

  const user = await User.findByIdAndDelete(userId);

  if (!user) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'user.deleted'), 200);
});

/**
 * Update user profile fields (fullName, phone, gender, profileImage, role)
 * PATCH /user/:userId
 * Admin only.
 */
export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;
  const userId =
    typeof req.params.userId === 'string' ? req.params.userId : req.params.userId?.[0] ?? '';

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }

  const { fullName, phone, gender, profileImage, role } = req.body as {
    fullName?: string;
    phone?: string;
    gender?: 'Male' | 'Female';
    profileImage?: string;
    role?: 'Admin' | 'Vendor' | 'Member';
  };

  const update: Record<string, unknown> = {};
  if (fullName !== undefined) update.fullName = fullName.trim();
  if (phone !== undefined) update.phone = phone.trim() || undefined;
  if (gender !== undefined) update.gender = gender;
  if (profileImage !== undefined) update.profileImage = profileImage;
  if (role !== undefined && ['Admin', 'Vendor', 'Member'].includes(role)) update.role = role;

  if (Object.keys(update).length === 0) {
    throw new AppError(t(lang, 'common.bad_request'), 400);
  }

  const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true })
    .select(USER_PROJECTION)
    .lean();

  if (!user) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }

  sendSuccess(res, user, t(lang, 'user.updated'), 200);
});

/**
 * Update user's verification status
 * PATCH /user/:userId/verified
 * Admin only.
 */
export const updateUserVerified = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;
  const userId =
    typeof req.params.userId === 'string' ? req.params.userId : req.params.userId?.[0] ?? '';

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }

  const { isVerified } = req.body as { isVerified: boolean };

  const user = await User.findByIdAndUpdate(
    userId,
    { isVerified },
    { new: true, runValidators: true }
  )
    .select(USER_PROJECTION)
    .lean();

  if (!user) {
    throw new AppError(t(lang, 'user.not found'), 404);
  }

  sendSuccess(res, user, t(lang, 'user.verified_updated'), 200);
});

/**
 * Register/refresh FCM token for current user (Member/Vendor/Admin)
 * POST /user/fcm-token
 */
export const registerFcmToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const {
    token,
    userAgent,
    platform,
    deviceId,
    deviceModel,
    osVersion,
    appVersion,
    appBuild,
  } = req.body as {
    token: string;
    userAgent?: string;
    platform?: 'web' | 'android' | 'ios';
    deviceId?: string;
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
    appBuild?: string;
  };
  await upsertUserFcmToken(userId, {
    token,
    userAgent,
    platform,
    deviceId,
    deviceModel,
    osVersion,
    appVersion,
    appBuild,
  });

  sendSuccess(res, { token }, 'FCM token registered', 201);
});

/**
 * Unregister FCM token for current user
 * POST /user/fcm-token/unregister
 */
export const unregisterFcmToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const { token } = req.body as { token: string };

  await User.findByIdAndUpdate(userId, {
    $pull: { fcmTokens: { token } },
  });

  sendSuccess(res, { token }, 'FCM token unregistered');
});

/**
 * Get registration analytics for graphing in frontend.
 * GET /user/registration-stats?from=2026-01-01&to=2026-04-01&groupBy=day
 * Staff only.
 */
export const getUserRegistrationStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as AuthRequest & { lang?: string }).lang || 'en') as string;

  const fromQuery = typeof req.query.from === 'string' ? req.query.from : undefined;
  const toQuery = typeof req.query.to === 'string' ? req.query.to : undefined;
  const groupByQuery = typeof req.query.groupBy === 'string' ? req.query.groupBy : 'day';

  const groupBy = groupByQuery === 'month' ? 'month' : 'day';
  const toDate = toQuery ? new Date(toQuery) : new Date();
  const fromDate = fromQuery
    ? new Date(fromQuery)
    : new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new AppError(t(lang, 'common.bad_request'), 400);
  }
  if (fromDate > toDate) {
    throw new AppError(t(lang, 'common.bad_request'), 400);
  }

  const matchStage = {
    createdAt: {
      $gte: fromDate,
      $lte: toDate,
    },
  };

  const format = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const trend = await User.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: {
            format,
            date: '$createdAt',
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const [totalRegisteredUsers, rangeRegisteredUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments(matchStage),
  ]);

  sendSuccess(
    res,
    {
      summary: {
        totalRegisteredUsers,
        rangeRegisteredUsers,
      },
      range: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        groupBy,
      },
      series: trend.map((item) => ({
        label: String(item._id),
        count: Number(item.count || 0),
      })),
    },
    'User registration stats retrieved',
    200
  );
});
