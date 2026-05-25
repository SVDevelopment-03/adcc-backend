import express from 'express';
import multer from 'multer';
import { authenticate } from '@/middleware/auth.middleware';
import { authenticatedOnly } from '@/middleware/role.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate } from '@/middleware/validate.middleware';
import {
  registerWebPushTokenSchema,
  unregisterWebPushTokenSchema,
  sendStaffWebPushSchema,
} from '@/validators/push-notification.validator';
import {
  registerWebPushToken,
  unregisterWebPushToken,
  sendWebPushToStaff,
  sendTestBroadcast,
  getNotificationsInbox,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '@/controllers/push-notification.controller';

const router = express.Router();
const upload = multer();

router.post(
  '/web/register',
  authenticate,
  authenticatedOnly,
  upload.none(),
  validate(registerWebPushTokenSchema),
  registerWebPushToken
);

// Platform-agnostic endpoint (web/android/ios)
router.post(
  '/register',
  authenticate,
  authenticatedOnly,
  upload.none(),
  validate(registerWebPushTokenSchema),
  registerWebPushToken
);

// Mobile-specific aliases for clarity
router.post(
  '/mobile/register',
  authenticate,
  authenticatedOnly,
  upload.none(),
  validate(registerWebPushTokenSchema),
  registerWebPushToken
);

router.post(
  '/web/unregister',
  authenticate,
  authenticatedOnly,
  upload.none(),
  validate(unregisterWebPushTokenSchema),
  unregisterWebPushToken
);

// Platform-agnostic endpoint (web/android/ios)
router.post(
  '/unregister',
  authenticate,
  authenticatedOnly,
  upload.none(),
  validate(unregisterWebPushTokenSchema),
  unregisterWebPushToken
);

// Mobile-specific aliases for clarity
router.post(
  '/mobile/unregister',
  authenticate,
  authenticatedOnly,
  upload.none(),
  validate(unregisterWebPushTokenSchema),
  unregisterWebPushToken
);

router.post(
  '/web/send-to-staff',
  authenticate,
  requireStaffPermission('app_configuration'),
  upload.none(),
  validate(sendStaffWebPushSchema),
  sendWebPushToStaff
);

router.post(
  '/test-broadcast',
  authenticate,
  requireStaffPermission('app_configuration'),
  upload.none(),
  validate(sendStaffWebPushSchema),
  sendTestBroadcast
);

router.get(
  '/inbox',
  authenticate,
  authenticatedOnly,
  getNotificationsInbox
);

router.patch(
  '/inbox/read-all',
  authenticate,
  authenticatedOnly,
  markAllNotificationsAsRead
);

router.patch(
  '/inbox/:id/read',
  authenticate,
  authenticatedOnly,
  markNotificationAsRead
);

export default router;
