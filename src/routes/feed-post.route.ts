import express from 'express';
import { validate } from '@/middleware/validate.middleware';
import { authenticate, optionalAuthenticate } from '@/middleware/auth.middleware';
import { authenticatedOnly } from '@/middleware/role.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import {
  uploadFeedAdminMedia,
  uploadFeedPostImageIfMultipart,
  uploadBodyIfMultipart,
  requireMultipartFormData,
  requireParsedMultipartBody,
} from '@/middleware/upload.middleware';
import {
  createAdminFeedPostSchema,
  createFeedCommentSchema,
  createFeedPostSchema,
  getFeedPostsQuerySchema,
  updateFeedPostModerationSchema,
  updateUserFeedPostBanSchema,
} from '@/validators/feed-post.validator';
import {
  addFeedComment,
  createFeedPost,
  createFeedPostAsAdmin,
  deleteFeedComment,
  deleteFeedCommentAsAdmin,
  deleteFeedPost,
  getMyFeedPosts,
  getPublicFeedPostById,
  getPublicFeedPosts,
  getFeedPostById,
  getFeedPosts,
  likeFeedPost,
  updateFeedPostModeration,
  updateUserFeedPostBan,
} from '@/controllers/feed-post.controller';
import { getPublicFeedQuerySchema } from '@/validators/feed-post.validator';

const router = express.Router();

const requireFeedModeration = requireStaffPermission('moderate_content', 'admin.panel');

// The moderation queue (every status, every author) is staff-only. Members and
// guests read approved posts through the public /v1/feed routes instead.
router.get('/', authenticate, requireFeedModeration, validate(getFeedPostsQuerySchema), getFeedPosts);
router.get('/:id', authenticate, requireFeedModeration, getFeedPostById);

router.post(
  '/',
  authenticate,
  authenticatedOnly,
  uploadFeedPostImageIfMultipart,
  requireParsedMultipartBody,
  validate(createFeedPostSchema),
  createFeedPost
);

router.post(
  '/admin',
  authenticate,
  requireFeedModeration,
  requireMultipartFormData,
  uploadFeedAdminMedia,
  requireParsedMultipartBody,
  validate(createAdminFeedPostSchema),
  createFeedPostAsAdmin
);

router.delete('/:id', authenticate, requireFeedModeration, deleteFeedPost);
router.delete(
  '/:id/comments/:commentId',
  authenticate,
  requireFeedModeration,
  deleteFeedCommentAsAdmin
);

router.patch(
  '/:id/moderation',
  authenticate,
  requireFeedModeration,
  requireMultipartFormData,
  uploadBodyIfMultipart,
  requireParsedMultipartBody,
  validate(updateFeedPostModerationSchema),
  updateFeedPostModeration
);

router.patch(
  '/moderation/users/:userId/ban-feed-post',
  authenticate,
  requireFeedModeration,
  requireMultipartFormData,
  uploadBodyIfMultipart,
  requireParsedMultipartBody,
  validate(updateUserFeedPostBanSchema),
  updateUserFeedPostBan
);

export default router;

export const publicFeedRouter = express.Router();

publicFeedRouter.get(
  '/',
  optionalAuthenticate,
  validate(getPublicFeedQuerySchema),
  getPublicFeedPosts
);
publicFeedRouter.get(
  '/my-posts',
  authenticate,
  authenticatedOnly,
  validate(getPublicFeedQuerySchema),
  getMyFeedPosts
);
publicFeedRouter.get('/:id', optionalAuthenticate, getPublicFeedPostById);
publicFeedRouter.post('/:id/like', authenticate, authenticatedOnly, likeFeedPost);
publicFeedRouter.post(
  '/:id/comments',
  authenticate,
  authenticatedOnly,
  validate(createFeedCommentSchema),
  addFeedComment
);
publicFeedRouter.delete(
  '/:id/comments/:commentId',
  authenticate,
  authenticatedOnly,
  deleteFeedComment
);
publicFeedRouter.post(
  '/',
  authenticate,
  authenticatedOnly,
  uploadFeedPostImageIfMultipart,
  requireParsedMultipartBody,
  validate(createFeedPostSchema),
  createFeedPost
);
