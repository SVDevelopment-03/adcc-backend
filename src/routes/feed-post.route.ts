import express from 'express';
import { validate } from '@/middleware/validate.middleware';
import { authenticate, optionalAuthenticate } from '@/middleware/auth.middleware';
import { isAdmin, authenticatedOnly } from '@/middleware/role.middleware';
import {
  uploadFeedPostImageIfMultipart,
  uploadBodyIfMultipart,
  requireMultipartFormData,
  requireParsedMultipartBody,
} from '@/middleware/upload.middleware';
import {
  createFeedCommentSchema,
  createFeedPostSchema,
  getFeedPostsQuerySchema,
  updateFeedPostModerationSchema,
  updateUserFeedPostBanSchema,
} from '@/validators/feed-post.validator';
import {
  addFeedComment,
  createFeedPost,
  deleteFeedComment,
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

router.get('/', authenticate, validate(getFeedPostsQuerySchema), getFeedPosts);
router.get('/:id', authenticate, getFeedPostById);

router.post(
  '/',
  authenticate,
  authenticatedOnly,
  uploadFeedPostImageIfMultipart,
  requireParsedMultipartBody,
  validate(createFeedPostSchema),
  createFeedPost
);

router.patch(
  '/:id/moderation',
  authenticate,
  isAdmin,
  requireMultipartFormData,
  uploadBodyIfMultipart,
  requireParsedMultipartBody,
  validate(updateFeedPostModerationSchema),
  updateFeedPostModeration
);

router.patch(
  '/moderation/users/:userId/ban-feed-post',
  authenticate,
  isAdmin,
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
