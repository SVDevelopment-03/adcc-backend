import express from 'express';
import {
  createCommunityPost,
  getCommunityPosts,
  getCommunityPostById,
  updateCommunityPost,
  deleteCommunityPost,
} from '@/controllers/community-post.controller';
import { validate } from '@/middleware/validate.middleware';
import {
  createCommunityPostSchema,
  updateCommunityPostSchema,
  getCommunityPostsQuerySchema,
} from '@/validators/community-post.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import {
  uploadCommunityPostImageIfMultipart,
  requireParsedMultipartBody,
} from '@/middleware/upload.middleware';

const router = express.Router({ mergeParams: true });

router.get('/', authenticate, validate(getCommunityPostsQuerySchema), getCommunityPosts);
router.get('/:id', authenticate, getCommunityPostById);

router.post(
  '/',
  authenticate,
  requireStaffPermission('manage_communities'),
  uploadCommunityPostImageIfMultipart,
  requireParsedMultipartBody,
  validate(createCommunityPostSchema),
  createCommunityPost
);

router.patch(
  '/:id',
  authenticate,
  requireStaffPermission('manage_communities'),
  uploadCommunityPostImageIfMultipart,
  validate(updateCommunityPostSchema),
  updateCommunityPost
);

router.delete('/:id', authenticate, requireStaffPermission('manage_communities'), deleteCommunityPost);

export default router;
