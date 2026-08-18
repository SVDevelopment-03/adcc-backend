import express from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { authenticatedOnly } from '@/middleware/role.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate } from '@/middleware/validate.middleware';
import {
  createUser,
  getUserRegistrationStats,
  registerFcmToken,
  unregisterFcmToken,
  updateUserVerified,
  updateUser,
} from '@/controllers/user.controller';
import { getAllUsers, getUserById, deleteUser } from '@/controllers/user.controller';
import {
  createUserSchema,
  registerFcmTokenSchema,
  unregisterFcmTokenSchema,
  updateUserVerifiedSchema,
} from '@/validators/user.validator';

const router = express.Router();

router.get('/', authenticate, requireStaffPermission('manage_users'), getAllUsers);
router.post(
  '/',
  authenticate,
  requireStaffPermission('manage_users'),
  validate(createUserSchema),
  createUser
);
router.get(
  '/registration-stats',
  authenticate,
  // requireStaffPermission('manage_users'),
  getUserRegistrationStats
);
router.get('/:userId', authenticate, getUserById);
router.patch('/:userId', authenticate, requireStaffPermission('manage_users'), updateUser);
router.delete('/:userId', authenticate, requireStaffPermission('manage_users'), deleteUser);
router.patch(
  '/:userId/verified',
  authenticate,
  requireStaffPermission('manage_users'),
  validate(updateUserVerifiedSchema),
  updateUserVerified
);

// FCM token registration for authenticated users
router.post(
  '/fcm-token',
  authenticate,
  authenticatedOnly,
  validate(registerFcmTokenSchema),
  registerFcmToken
);

router.post(
  '/fcm-token/unregister',
  authenticate,
  authenticatedOnly,
  validate(unregisterFcmTokenSchema),
  unregisterFcmToken
);

export default router;
