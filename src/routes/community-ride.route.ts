import express from 'express';
import {
  createCommunityRide,
  getAllCommunityRides,
  getCommunityRideById,
  updateCommunityRide,
  deleteCommunityRide,
  communityMemberStatus,
  joinCommunityRide,
} from '@/controllers/community-ride.controller';
import { validate } from '@/middleware/validate.middleware';
import {
  createCommunityRideSchema,
  updateCommunityRideSchema,
  getCommunityRidesQuerySchema,
} from '@/validators/community-ride.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';

const router = express.Router();

// Public routes
router.get('/', validate(getCommunityRidesQuerySchema), getAllCommunityRides);
router.get('/:id', getCommunityRideById);
router.get('/:id/member-status', authenticate, communityMemberStatus);
router.post('/:id/join', authenticate, joinCommunityRide);

// Admin only routes
router.post(
  '/',
  authenticate,
  requireStaffPermission('manage_communities'),
  validate(createCommunityRideSchema),
  createCommunityRide
);
router.patch(
  '/:id',
  authenticate,
  requireStaffPermission('manage_communities'),
  validate(updateCommunityRideSchema),
  updateCommunityRide
);
router.delete('/:id', authenticate, requireStaffPermission('manage_communities'), deleteCommunityRide);

export default router;

