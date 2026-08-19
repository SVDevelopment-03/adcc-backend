import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Community from '@/models/community.model';
import CommunityPost from '@/models/community-post.model';
import User from '@/models/user.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { t } from '@/utils/i18n';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import { notifyCommunityAnnouncement } from '@/services/community-notification.service';
import { localizeCommunityPostStatic, SupportedLanguage } from '@/utils/localization';
import { translateFieldsToArabic } from '@/services/translation.service';

const localizePost = (post: Record<string, any>, lang: string) => {
  const localized = { ...post };
  localizeCommunityPostStatic(localized, lang as SupportedLanguage);
  if (
    localized.communityId &&
    typeof localized.communityId === 'object' &&
    localized.communityId.titleAr
  ) {
    localized.communityId = {
      ...localized.communityId,
      title: lang === 'ar' ? localized.communityId.titleAr : localized.communityId.title,
    };
  }
  return localized;
};

const getParamString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const ensureObjectId = (id: string | string[] | undefined, message: string) => {
  const raw = getParamString(id) || '';
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new AppError(message, 400);
  }
  return new mongoose.Types.ObjectId(raw);
};

const ensureCommunityExists = async (communityId: mongoose.Types.ObjectId, lang: string) => {
  const community = await Community.findById(communityId).select('_id allowPosts');
  if (!community) {
    throw new AppError(t(lang, 'community.not_found'), 404);
  }
  return community;
};

const attachPostImage = async (req: AuthRequest, data: Record<string, any>) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return data;

  const upload = await uploadImageBufferToS3(
    file.buffer,
    file.mimetype,
    file.originalname,
    'community-posts'
  );
  data.image = upload.url;
  return data;
};

/**
 * Create community post
 * POST /v1/communities/:communityId/community-posts
 * Admin only
 */
export const createCommunityPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const { communityId } = req.params;
  const communityObjectId = ensureObjectId(communityId, 'Invalid community ID');
  await ensureCommunityExists(communityObjectId, lang);

  const data: Record<string, any> = {
    ...req.body,
    communityId: communityObjectId,
    createdBy: userId,
  };

  // Auto-translate English → Arabic when the Arabic fields weren't provided.
  if (!data.titleAr || !data.captionAr) {
    const translations = await translateFieldsToArabic({
      title: !data.titleAr ? data.title : undefined,
      caption: !data.captionAr ? data.caption : undefined,
    });
    Object.assign(data, translations);
  }

  await attachPostImage(req, data);

  const post = await CommunityPost.create(data);
  const populated = await post.populate('createdBy', 'fullName profileImage');

  if (post.postType === 'Announcement') {
    const author = await User.findById(userId).select('fullName').lean();
    void notifyCommunityAnnouncement({
      communityId: String(communityObjectId),
      titleText: post.title,
      postTitle: post.title,
      byName: author?.fullName?.trim() || 'Admin',
      url: `/communities/${communityObjectId}`,
    });
  }

  sendSuccess(res, localizePost(populated.toObject(), lang), t(lang, 'communityPost.created'), 201);
});

/**
 * Get community posts
 * GET /v1/communities/:communityId/community-posts
 * Authenticated
 */
export const getCommunityPosts = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { communityId } = req.params;
  const { page = 1, limit = 10, postType, q } = req.query as any;

  const communityObjectId = ensureObjectId(communityId, 'Invalid community ID');
  await ensureCommunityExists(communityObjectId, lang);

  const filter: any = { communityId: communityObjectId };
  if (postType) filter.postType = postType;
  if (q) {
    filter.$or = [
      { title: { $regex: String(q), $options: 'i' } },
      { caption: { $regex: String(q), $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [posts, total] = await Promise.all([
    CommunityPost.find(filter)
      .populate('createdBy', 'fullName profileImage')
      .populate('communityId', 'title titleAr status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    CommunityPost.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      posts: posts.map((post) => localizePost(post as Record<string, any>, lang)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'communityPost.list')
  );
});

/**
 * Get community post by ID
 * GET /v1/communities/:communityId/community-posts/:id
 * Authenticated
 */
export const getCommunityPostById = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { communityId, id } = req.params;

  const communityObjectId = ensureObjectId(communityId, 'Invalid community ID');
  await ensureCommunityExists(communityObjectId, lang);

  const post = await CommunityPost.findOne({
    _id: ensureObjectId(id, 'Invalid post ID'),
    communityId: communityObjectId,
  })
    .populate('createdBy', 'fullName profileImage')
    .populate('communityId', 'title titleAr status')
    .lean();

  if (!post) {
    throw new AppError(t(lang, 'communityPost.not_found'), 404);
  }

  sendSuccess(res, localizePost(post as Record<string, any>, lang), t(lang, 'communityPost.retrieved'));
});

/**
 * Update community post
 * PATCH /v1/communities/:communityId/community-posts/:id
 * Admin only
 */
export const updateCommunityPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { communityId, id } = req.params;

  const communityObjectId = ensureObjectId(communityId, 'Invalid community ID');
  await ensureCommunityExists(communityObjectId, lang);

  const updates: Record<string, any> = { ...req.body };
  await attachPostImage(req, updates);

  const post = await CommunityPost.findOneAndUpdate(
    { _id: ensureObjectId(id, 'Invalid post ID'), communityId: communityObjectId },
    updates,
    { new: true, runValidators: true }
  )
    .populate('createdBy', 'fullName profileImage')
    .lean();

  if (!post) {
    throw new AppError(t(lang, 'communityPost.not_found'), 404);
  }

  sendSuccess(res, localizePost(post.toObject(), lang), t(lang, 'communityPost.updated'));
});

/**
 * Delete community post
 * DELETE /v1/communities/:communityId/community-posts/:id
 * Admin only
 */
export const deleteCommunityPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { communityId, id } = req.params;

  const communityObjectId = ensureObjectId(communityId, 'Invalid community ID');
  await ensureCommunityExists(communityObjectId, lang);

  const post = await CommunityPost.findOneAndDelete({
    _id: ensureObjectId(id, 'Invalid post ID'),
    communityId: communityObjectId,
  });

  if (!post) {
    throw new AppError(t(lang, 'communityPost.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'communityPost.deleted'));
});
