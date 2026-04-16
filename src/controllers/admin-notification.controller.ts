import { Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { sendSuccess } from '@/utils/response';
import { AuthRequest } from '@/middleware/auth.middleware';
import { 
  countUnreadAdminNotifications,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from '@/services/admin-notification.service';
import { t } from '@/utils/i18n';

/**
 * GET /v1/admin-notifications
 * Paginated list for admin topbar; includes isRead for the current user.
 */
export const getAdminNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const q = req.query as {
    page?: number;
    limit?: number;
    category?: string;
    unreadOnly?: boolean;
  };

  const data = await listAdminNotifications({
    userId,
    page: q.page ?? 1,
    limit: q.limit ?? 20,
    category: q.category as any,
    unreadOnly: q.unreadOnly,
  });

  sendSuccess(res, data, 'Notifications retrieved', 200);
});

/**
 * GET /v1/admin-notifications/unread-count
 */
export const getAdminNotificationsUnreadCount = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = ((req as any).lang || 'en') as string;
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }

    const unreadCount = await countUnreadAdminNotifications(userId);
    sendSuccess(res, { unreadCount }, 'Unread count retrieved', 200);
  }
);

/**
 * PATCH /v1/admin-notifications/:id/read
 */
export const markOneAdminNotificationRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const ok = await markAdminNotificationRead(id, userId);
  if (!ok) {
    throw new AppError('Notification not found', 404);
  }

  sendSuccess(res, { id }, 'Notification marked read', 200);
});

/**
 * POST /v1/admin-notifications/mark-all-read
 */
export const markAllAdminNotificationsReadHandler = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const lang = ((req as any).lang || 'en') as string;
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(t(lang, 'auth.unauthorized'), 401);
    }

    const modified = await markAllAdminNotificationsRead(userId);
    sendSuccess(res, { modified }, 'All notifications marked read', 200);
  }
);
