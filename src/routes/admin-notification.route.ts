import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import {
  getAdminNotifications,
  getAdminNotificationsUnreadCount,
  markOneAdminNotificationRead,
  markAllAdminNotificationsReadHandler,
} from '@/controllers/admin-notification.controller';
import {
  listAdminNotificationsQuerySchema,
  adminNotificationIdParamSchema,
} from '@/validators/admin-notification.validator';

const router = Router();

router.get(
  '/unread-count',
  authenticate,
  requireStaffPermission('view_dashboard'),
  getAdminNotificationsUnreadCount
);

router.get(
  '/',
  authenticate,
  requireStaffPermission('view_dashboard'),
  validate(listAdminNotificationsQuerySchema),
  getAdminNotifications
);

router.post(
  '/mark-all-read',
  authenticate,
  requireStaffPermission('view_dashboard'),
  markAllAdminNotificationsReadHandler
);

router.patch(
  '/:id/read',
  authenticate,
  requireStaffPermission('view_dashboard'),
  validateParams(adminNotificationIdParamSchema),
  markOneAdminNotificationRead
);

export default router;
