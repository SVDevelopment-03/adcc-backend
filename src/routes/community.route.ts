import express from 'express';
import {
  createCommunity,
  getAvailableCities,
  getAllCommunities,
  getCommunityById,
  updateCommunity,
  deleteCommunity,
  joinCommunity,
  leaveCommunity,
  getCommunityMembers,
  getBannedUsersInCommunity,
  isMemberOfCommunity,
  getGalleryImages,
  addGalleryImages,
  removeGalleryImages,
  featureCommunity,
  // getFeaturedCommunities,
} from '@/controllers/community.controller';
import { validate } from '@/middleware/validate.middleware';
import {
  createCommunitySchema,
  updateCommunitySchema,
  getCommunitiesQuerySchema,
  featureCommunitySchema,
  removeGalleryImagesSchema,
} from '@/validators/community.validator';
import { authenticate, optionalAuthenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { requireMultipartFormData, uploadCommunityImages, requireParsedMultipartBody, uploadCommunityGalleryImages } from '@/middleware/upload.middleware';

const router = express.Router();



// Authenticated routes

// Public routes
router.get('/metadata/cities', getAvailableCities);
router.get('/', validate(getCommunitiesQuerySchema), getAllCommunities);
router.get('/:id/gallery', getGalleryImages);
router.get('/:id', getCommunityById);
router.get('/', optionalAuthenticate, validate(getCommunitiesQuerySchema), getAllCommunities);


// Authenticated routes
router.get('/:id/communityMembers',  authenticate, getCommunityMembers);
router.post('/:id/join', authenticate, joinCommunity);
router.post('/:id/leave', authenticate, leaveCommunity);
router.get('/:id/bannedMembers',authenticate, getBannedUsersInCommunity);
router.post('/:id/isMemberOfCommunity', authenticate, isMemberOfCommunity);


// Admin only routes
router.post(
  '/',
  authenticate,
  requireStaffPermission('manage_communities'),
  uploadCommunityImages,
  requireParsedMultipartBody,
  validate(createCommunitySchema),
  createCommunity
);
router.patch('/:id', authenticate, requireStaffPermission('manage_communities'), uploadCommunityImages, validate(updateCommunitySchema), updateCommunity);
router.delete('/:id', authenticate, requireStaffPermission('manage_communities'), deleteCommunity);
router.post('/:id/gallery', authenticate, requireStaffPermission('manage_communities'), requireMultipartFormData, uploadCommunityGalleryImages, addGalleryImages);
router.delete(
  '/:id/gallery',
  authenticate,
  requireStaffPermission('manage_communities'),
  uploadCommunityGalleryImages,
  requireParsedMultipartBody,
  validate(removeGalleryImagesSchema),
  removeGalleryImages
);

// admin controls for featuring
router.patch('/:id/feature', authenticate, requireStaffPermission('manage_communities'), validate(featureCommunitySchema), featureCommunity);
// router.patch('/:id/members/:userId/role', authenticate, updateMemberRole);
// router.patch('/:id/members/:userId/ban', authenticate, banMember);

export default router;
