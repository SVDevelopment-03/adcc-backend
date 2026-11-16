import express, { NextFunction, Response } from 'express';
import mongoose from 'mongoose';
import User from '@/models/user.model';
import { userHasAnyPermission } from '@/services/rbac.service';
import { authenticate, AuthRequest } from '@/middleware/auth.middleware';
import { authenticatedOnly } from '@/middleware/role.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate } from '@/middleware/validate.middleware';
import {
  createUser,
  getUserRegistrationStats,
  registerFcmToken,
  unregisterFcmToken,
  updateUserVerified,
  updateUserPassword,
  updateUser,
} from '@/controllers/user.controller';
import { startPhoneChange, confirmPhoneChange } from '@/controllers/phone-change.controller';
import { getAllUsers, getUserById, getUserActivity, deleteUser } from '@/controllers/user.controller';
import {
  createUserSchema,
  registerFcmTokenSchema,
  unregisterFcmTokenSchema,
  updateUserVerifiedSchema,
  updateUserPasswordSchema,
} from '@/validators/user.validator';

const router = express.Router();

/**
 * manage_users covers members. Acting on a staff or vendor account (edit,
 * delete, deactivate, reset password) also needs admin.manage_roles —
 * otherwise a Moderator could reset the full Admin's password and sign in
 * as them, or deactivate/delete other staff.
 */
const protectStaffAccounts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const target = mongoose.Types.ObjectId.isValid(String(req.params.userId))
      ? await User.findById(req.params.userId).select('role roleId').lean()
      : null;
    const isStaffTarget = !!target && (target.role === 'Admin' || target.role === 'Vendor' || !!target.roleId);
    if (isStaffTarget && !(await userHasAnyPermission(String(req.user?.id || ''), ['admin.manage_roles']))) {
      res.status(403).json({ success: false, message: 'You do not have permission to manage staff accounts' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

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
router.get('/:userId/activity', authenticate, requireStaffPermission('manage_users'), getUserActivity);
router.patch('/:userId', authenticate, requireStaffPermission('manage_users'), protectStaffAccounts, updateUser);
router.delete('/:userId', authenticate, requireStaffPermission('manage_users'), protectStaffAccounts, deleteUser);
router.patch(
  '/:userId/verified',
  authenticate,
  requireStaffPermission('manage_users'),
  protectStaffAccounts,
  validate(updateUserVerifiedSchema),
  updateUserVerified
);
router.patch(
  '/:userId/password',
  authenticate,
  requireStaffPermission('manage_users'),
  protectStaffAccounts,
  validate(updateUserPasswordSchema),
  updateUserPassword
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

// Phone change start: verify old phone OTP and issue change token
router.post(
  '/phone-change/start',
  authenticate,
  authenticatedOnly,
  (req, res, next) => {
    const { changePhoneStartSchema } = require('@/validators/user.validator');
    return (require('@/middleware/validate.middleware').validate(changePhoneStartSchema))(req, res, next);
  },
  startPhoneChange
);

// Phone change confirm: provide changeToken + newPhone + newCode
router.post(
  '/phone-change/confirm',
  authenticate,
  authenticatedOnly,
  (req, res, next) => {
    const { changePhoneConfirmSchema } = require('@/validators/user.validator');
    return (require('@/middleware/validate.middleware').validate(changePhoneConfirmSchema))(req, res, next);
  },
  confirmPhoneChange
);

export default router;
