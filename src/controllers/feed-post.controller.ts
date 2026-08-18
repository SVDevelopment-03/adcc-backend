import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '@/middleware/auth.middleware';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { t } from '@/utils/i18n';
import FeedPost from '@/models/feed-post.model';
import User from '@/models/user.model';
import feedStoreNotificationService from '@/services/feed-store-notification.service';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import { notifyAdminFeedPostPending } from '@/services/admin-notification.service';

const getLang = (req: Request) => (((req as any).lang || 'en') as string) ?? 'en';

const getParamString = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const ensureObjectId = (id: string | string[] | undefined, message: string) => {
  const raw = getParamString(id) || '';
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new AppError(message, 400);
  }
  return new mongoose.Types.ObjectId(raw);
};

const attachOptionalImage = async (
  req: AuthRequest,
  data: Record<string, any>,
  folderKey: string
) => {
  const fileFromSingle = (req as any).file as Express.Multer.File | undefined;
  const filesFromAny = (req as any).files as
    | Express.Multer.File[]
    | Record<string, Express.Multer.File[]>
    | undefined;

  const fileFromAnyKey =
    fileFromSingle ||
    (Array.isArray(filesFromAny)
      ? filesFromAny.find((f) => Boolean(f))
      : filesFromAny
        ? Object.values(filesFromAny)
            .flat()
            .find((f) => Boolean(f))
        : undefined);

  if (!fileFromAnyKey) {
    return data;
  }

  const upload = await uploadImageBufferToS3(
    fileFromAnyKey.buffer,
    fileFromAnyKey.mimetype,
    fileFromAnyKey.originalname,
    folderKey
  );
  data.image = upload.url;
  return data;
};

const feedPostSelect = 'fullName profileImage banFeedPost';

const mapFeedPostForClient = (post: any, currentUserId?: string) => {
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const currentUserIdString = currentUserId ? String(currentUserId) : '';
  const mappedComments = comments.map((comment: any) => {
    const commentUserId = String(comment.user?._id ?? comment.user ?? '');
    return {
      ...comment,
      canDeleteByMe: Boolean(currentUserIdString && commentUserId === currentUserIdString),
    };
  });

  return {
    ...post,
    comments: mappedComments,
    likesCount: likes.length,
    commentsCount: comments.length,
    likedByMe: currentUserIdString
      ? likes.some((like: any) => String(like?._id ?? like) === currentUserIdString)
      : false,
  };
};

/**
 * Create feed post (user submits to moderation queue)
 * POST /v1/feed-posts
 */
export const createFeedPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const user = await User.findById(userId).select('banFeedPost').lean();
  if (!user) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }
  if (user.banFeedPost) {
    throw new AppError(t(lang, 'feedPost.user_banned'), 403);
  }

  const data: Record<string, any> = {
    ...req.body,
    createdBy: userId,
  };

  // Users submit into moderation regardless of any client-provided status.
  data.status = 'pending';
  data.reported = false;

  await attachOptionalImage(req, data, 'feed-posts');

  const created = await FeedPost.create(data);
  const populated = await FeedPost.findById(created._id)
    .populate('createdBy', 'fullName profileImage')
    .lean();

  const author = populated?.createdBy as { fullName?: string } | undefined;
  void notifyAdminFeedPostPending({
    postTitle: created.title,
    postId: created._id.toString(),
    authorName: author?.fullName?.trim() || 'Member',
  });

  sendSuccess(res, populated, t(lang, 'feedPost.created'), 201);
});

/**
 * Public approved feed for mobile and guests.
 * GET /v1/feed
 */
export const getPublicFeedPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const { q, page, limit } = req.query as any;

  const filter: any = { status: 'approved' };

  if (q) {
    const qStr = String(q);
    filter.$or = [
      { title: { $regex: qStr, $options: 'i' } },
      { description: { $regex: qStr, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [posts, total] = await Promise.all([
    FeedPost.find(filter)
      .populate('createdBy', feedPostSelect)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    FeedPost.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      posts: posts.map((post) =>
        mapFeedPostForClient(post, req.user?.isGuest ? undefined : req.user?.id)
      ),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'feedPost.list')
  );
});

/**
 * Current user's feed posts, including pending moderation items.
 * GET /v1/feed/my-posts
 */
export const getMyFeedPosts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const userId = req.user?.id;

  if (!userId || req.user?.isGuest) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const { page, limit } = req.query as any;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [posts, total] = await Promise.all([
    FeedPost.find({ createdBy: userId })
      .populate('createdBy', feedPostSelect)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    FeedPost.countDocuments({ createdBy: userId }),
  ]);

  sendSuccess(
    res,
    {
      posts: posts.map((post) => mapFeedPostForClient(post, userId)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'feedPost.list')
  );
});

/**
 * Get feed posts with filtering for moderation tabs.
 * GET /v1/feed-posts?status=pending|approved&reported=true|false
 */
export const getFeedPosts = asyncHandler(async (req: Request, res: Response) => {
  const lang = getLang(req);
  const { status, reported, q, page, limit } = req.query as any;

  const filter: any = {};
  if (status) filter.status = status;
  if (reported !== undefined) filter.reported = reported;

  if (q) {
    const qStr = String(q);
    filter.$or = [
      { title: { $regex: qStr, $options: 'i' } },
      { description: { $regex: qStr, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [posts, total] = await Promise.all([
    FeedPost.find(filter)
      .populate('createdBy', feedPostSelect)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    FeedPost.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      posts: posts.map((post) => mapFeedPostForClient(post)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'feedPost.list')
  );
});

/**
 * Get feed post by ID
 * GET /v1/feed-posts/:id
 */
export const getFeedPostById = asyncHandler(async (req: Request, res: Response) => {
  const lang = getLang(req);
  const { id } = req.params;

  const post = await FeedPost.findOne({ _id: ensureObjectId(id, 'Invalid post ID') })
    .populate('createdBy', 'fullName profileImage')
    .lean();

  if (!post) {
    throw new AppError(t(lang, 'feedPost.not_found'), 404);
  }

  sendSuccess(
    res,
    mapFeedPostForClient(post, (req as AuthRequest).user?.id),
    t(lang, 'feedPost.retrieved')
  );
});

/**
 * Public approved feed detail.
 * GET /v1/feed/:id
 */
export const getPublicFeedPostById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const { id } = req.params;

  const post = await FeedPost.findOne({
    _id: ensureObjectId(id, 'Invalid post ID'),
    status: 'approved',
  })
    .populate('createdBy', 'fullName profileImage')
    .populate('comments.user', 'fullName profileImage')
    .lean();

  if (!post) {
    throw new AppError(t(lang, 'feedPost.not_found'), 404);
  }

  sendSuccess(
    res,
    mapFeedPostForClient(post, req.user?.isGuest ? undefined : req.user?.id),
    t(lang, 'feedPost.retrieved')
  );
});

/**
 * Toggle like on a feed post.
 * POST /v1/feed/:id/like
 */
export const likeFeedPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId || req.user?.isGuest) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const postId = ensureObjectId(id, 'Invalid post ID');
  const post = await FeedPost.findOne({ _id: postId, status: 'approved' }).select('likes');

  if (!post) {
    throw new AppError(t(lang, 'feedPost.not_found'), 404);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const liked = (post.likes || []).some((like) => like.toString() === userObjectId.toString());

  const updated = await FeedPost.findByIdAndUpdate(
    postId,
    liked ? { $pull: { likes: userObjectId } } : { $addToSet: { likes: userObjectId } },
    { new: true }
  )
    .populate('createdBy', 'fullName profileImage')
    .lean();

  if (updated && !liked) {
    const authorRef = updated.createdBy as any;
    const authorId = authorRef?._id ? String(authorRef._id) : String(authorRef || '');
    if (authorId) {
      void feedStoreNotificationService.notifyFeedPostLiked({
        postId: String(postId),
        likerId: userId,
        authorId,
      });
    }
  }

  sendSuccess(res, mapFeedPostForClient(updated, userId), t(lang, 'feedPost.updated'));
});

/**
 * Add a comment on an approved feed post.
 * POST /v1/feed/:id/comments
 */
export const addFeedComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId || req.user?.isGuest) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const postId = ensureObjectId(id, 'Invalid post ID');
  const post = await FeedPost.findOneAndUpdate(
    { _id: postId, status: 'approved' },
    {
      $push: {
        comments: {
          user: new mongoose.Types.ObjectId(userId),
          text: String(req.body.text).trim(),
        },
      },
    },
    { new: true, runValidators: true }
  )
    .populate('createdBy', 'fullName profileImage')
    .populate('comments.user', 'fullName profileImage')
    .lean();

  if (!post) {
    throw new AppError(t(lang, 'feedPost.not_found'), 404);
  }

  sendSuccess(res, mapFeedPostForClient(post, userId), t(lang, 'feedPost.updated'), 201);
});

/**
 * Delete user's own comment from a feed post.
 * DELETE /v1/feed/:id/comments/:commentId
 */
export const deleteFeedComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const { id, commentId } = req.params;
  const userId = req.user?.id;

  if (!userId || req.user?.isGuest) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const postId = ensureObjectId(id, 'Invalid post ID');
  const parsedCommentId = ensureObjectId(commentId, 'Invalid comment ID');
  const post = await FeedPost.findOne({ _id: postId, status: 'approved' }).select('comments');

  if (!post) {
    throw new AppError(t(lang, 'feedPost.not_found'), 404);
  }

  const comment = (post.comments as any).id(parsedCommentId);
  if (!comment) {
    throw new AppError('Comment not found', 404);
  }

  if (String(comment.user) !== String(userId)) {
    throw new AppError('You can delete only your own comments', 403);
  }

  const updated = await FeedPost.findByIdAndUpdate(
    postId,
    { $pull: { comments: { _id: parsedCommentId } } },
    { new: true }
  )
    .populate('createdBy', 'fullName profileImage')
    .populate('comments.user', 'fullName profileImage')
    .lean();

  sendSuccess(res, mapFeedPostForClient(updated, userId), t(lang, 'feedPost.updated'));
});

/**
 * Admin moderation endpoint (change status and/or mark as reported)
 * PATCH /v1/feed-posts/:id/moderation
 *
 * - if `reported=true`, the `reported` field becomes true
 * - if `status` is provided, `status` is updated
 */
export const updateFeedPostModeration = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const { id } = req.params;

  const updates: Record<string, any> = {};
  if (req.body.status !== undefined) updates.status = req.body.status;
  if (req.body.reported !== undefined) updates.reported = req.body.reported;
  if (req.body.status === 'approved') {
    updates.rejectedReason = undefined;
  }
  if (req.body.status === 'rejected') {
    const rejectionReason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (rejectionReason) {
      updates.rejectedReason = rejectionReason;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('Either "status" or "reported" must be provided', 400);
  }

  const updated = await FeedPost.findOneAndUpdate(
    { _id: ensureObjectId(id, 'Invalid post ID') },
    updates,
    { new: true, runValidators: true }
  )
    .populate('createdBy', 'fullName profileImage')
    .lean();

  if (!updated) {
    throw new AppError(t(lang, 'feedPost.not_found'), 404);
  }

  try {
    const newStatus = String((updates.status as string) || updated.status || '').toLowerCase();
    const authorRef = updated.createdBy as any;
    const authorId = authorRef?._id ? String(authorRef._id) : String(authorRef || '');

    if (newStatus === 'approved') {
      void feedStoreNotificationService.notifyFeedPostApproved(String(updated._id));
    }

    if (newStatus === 'rejected' && authorId) {
      const reason = typeof req.body.reason === 'string' ? req.body.reason : undefined;
      void feedStoreNotificationService.notifyFeedPostRejected(String(updated._id), reason);
    }
  } catch (err) {
    console.error('[feed-post] moderation notification failed', err);
  }

  sendSuccess(res, updated, t(lang, 'feedPost.updated'));
});

/**
 * Admin endpoint to ban/unban user from creating feed posts.
 * PATCH /v1/feed-posts/moderation/users/:userId/ban-feed-post
 */
export const updateUserFeedPostBan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const { userId } = req.params;
  const parsedUserId = ensureObjectId(userId, 'Invalid user ID');
  const { banFeedPost } = req.body as { banFeedPost: boolean };

  const user = await User.findByIdAndUpdate(
    parsedUserId,
    { banFeedPost },
    { new: true, runValidators: true }
  )
    .select('fullName email phone role banFeedPost')
    .lean();

  if (!user) {
    throw new AppError(t(lang, 'user.not_found'), 404);
  }

  sendSuccess(res, user, t(lang, 'feedPost.user_ban_updated'));
});

/**
 * Admin hard-delete a feed post.
 * DELETE /v1/feed-posts/:id
 */
export const deleteFeedPost = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = getLang(req);
  const { id } = req.params;

  const deleted = await FeedPost.findByIdAndDelete(
    ensureObjectId(id, 'Invalid post ID')
  );

  if (!deleted) {
    throw new AppError(t(lang, 'feedPost.not_found'), 404);
  }

  sendSuccess(res, { id }, 'Feed post deleted successfully');
});
