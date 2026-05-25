import { Response } from 'express';
import User from '@/models/user.model';
import Notification from '@/models/notification.model';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { sendSuccess } from '@/utils/response';
import { AuthRequest } from '@/middleware/auth.middleware';
import notificationService from '@/services/notification.service';
import { sendWebPushNotification } from '@/services/firebase.service';
import emailService from '@/services/email.service';

const STAFF_ROLES: Array<'Admin' | 'Vendor' | 'Member'> = ['Vendor'];

const ensureStaff = (role?: string) => {
  if (!role || !STAFF_ROLES.includes(role as 'Admin' | 'Vendor' | 'Member')) {
    throw new AppError('Staff access required', 403);
  }
};

/**
 * Register a web push token for the authenticated staff member
 * POST /v1/push-notifications/web/register
 */
export const registerWebPushToken = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }
    console.log('user', req.user);
    console.log('userRole', req.user?.role);
    // ensureStaff(req.user?.role);

    const { token, userAgent, platform, deviceId, deviceModel, osVersion, appVersion, appBuild } =
      req.body as {
      token: string;
      userAgent?: string;
      platform?: 'web' | 'android' | 'ios';
      deviceId?: string;
      deviceModel?: string;
      osVersion?: string;
      appVersion?: string;
      appBuild?: string;
    };
    const now = new Date();

    const updateExisting = await User.updateOne(
      { _id: userId, 'fcmTokens.token': token },
      {
        $set: {
          'fcmTokens.$.lastSeenAt': now,
          'fcmTokens.$.userAgent': userAgent,
          'fcmTokens.$.platform': platform,
          'fcmTokens.$.deviceId': deviceId,
          'fcmTokens.$.deviceModel': deviceModel,
          'fcmTokens.$.osVersion': osVersion,
          'fcmTokens.$.appVersion': appVersion,
          'fcmTokens.$.appBuild': appBuild,
        },
      }
    );

    if (updateExisting.matchedCount === 0) {
      await User.findByIdAndUpdate(
        userId,
        {
          $push: {
            fcmTokens: {
              token,
              userAgent,
              platform,
              deviceId,
              deviceModel,
              osVersion,
              appVersion,
              appBuild,
              createdAt: now,
              lastSeenAt: now,
            },
          },
        },
        { new: true }
      );
    }

    sendSuccess(res, { token }, 'Web push token registered', 201);
  }
);

/**
 * Unregister a web push token for the authenticated staff member
 * POST /v1/push-notifications/web/unregister
 */
export const unregisterWebPushToken = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }
    ensureStaff(req.user?.role);

    const { token } = req.body as { token: string };

    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token } },
    });

    sendSuccess(res, { token }, 'Web push token unregistered');
  }
);

/**
 * Send a web push notification to all staff members
 * POST /v1/push-notifications/web/send-to-staff
 * Admin only
 */
export const sendWebPushToStaff = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { title, body, url, audienceType, scheduleDate, scheduleTime } = req.body as {
      title: string;
      body: string;
      url?: string;
      audienceType?: string;
      scheduleDate?: string;
      scheduleTime?: string;
    };
    const staff = await User.find(
      {
        role: { $in: STAFF_ROLES },
        fcmTokens: { $exists: true, $ne: [] },
      },
      { fcmTokens: 1 }
    ).lean();
    // console.log(STAFF_ROLES);
    // console.log('staff', staff);
    const tokenOwners = new Map<string, string>();
    const tokens: string[] = [];

    for (const user of staff) {
      const userTokens = (user as any).fcmTokens || [];
      for (const entry of userTokens) {
        if (entry?.token) {
          tokens.push(entry.token);
          tokenOwners.set(entry.token, user._id.toString());
        }
      }
    }

    if (tokens.length === 0) {
      sendSuccess(
        res,
        {
          successCount: 0,
          failureCount: 0,
          request: {
            title,
            body,
            url: url ?? null,
            audienceType: audienceType ?? null,
            scheduleDate: scheduleDate ?? null,
            scheduleTime: scheduleTime ?? null,
          },
        },
        'No staff web push tokens found'
      );
      return;
    }

    const chunkSize = 500;
    let successCount = 0;
    let failureCount = 0;
    const invalidTokensByUser = new Map<string, string[]>();

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);
      const response = await sendWebPushNotification(chunk, { title, body, url });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((resp, index) => {
        if (!resp.success && resp.error) {
          const code = (resp.error as any).code as string | undefined;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            const badToken = chunk[index];
            const ownerId = tokenOwners.get(badToken);
            if (ownerId) {
              const list = invalidTokensByUser.get(ownerId) || [];
              list.push(badToken);
              invalidTokensByUser.set(ownerId, list);
            }
          }
        }
      });
    }

    // Cleanup invalid tokens
    if (invalidTokensByUser.size > 0) {
      const ops = Array.from(invalidTokensByUser.entries()).map(([userId, badTokens]) => ({
        updateOne: {
          filter: { _id: userId },
          update: { $pull: { fcmTokens: { token: { $in: badTokens } } } },
        },
      }));
      await User.bulkWrite(ops, { ordered: false });
    }

    sendSuccess(
      res,
      {
        successCount,
        failureCount,
        invalidTokensRemoved: Array.from(invalidTokensByUser.values()).reduce(
          (acc, list) => acc + list.length,
          0
        ),
        request: {
          title,
          body,
          url: url ?? null,
          audienceType: audienceType ?? null,
          scheduleDate: scheduleDate ?? null,
          scheduleTime: scheduleTime ?? null,
        },
      },
      'Staff web push notification sent'
    );
  }
);

/**
 * Test broadcast endpoint for admins — can target 'staff' (default) or 'all'
 * POST /v1/push-notifications/test-broadcast
 */
export const sendTestBroadcast = asyncHandler(
  async (req: AuthRequest, res: Response) => {
      const { title, body, url, audienceType, deliveryType, externalEmails, selectedUserIds } = req.body as {
        title: string;
        body: string;
        url?: string;
        audienceType?: string;
        deliveryType?: 'app' | 'email' | 'both';
        externalEmails?: string; // comma separated
        selectedUserIds?: string; // comma separated
      };

    const parseIdList = (value?: string) =>
      value
        ? Array.from(
            new Set(
              value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            )
          )
        : [];

    const selectedIds = audienceType === 'selected_users' ? parseIdList(selectedUserIds) : [];
    const externalEmailList = parseIdList(externalEmails);

    if (!title || !body) {
      throw new AppError('Title and body are required', 400);
    }

    // If deliveryType includes email, handle email sending first (externalEmails or audience-based)
    if (deliveryType === 'email' || deliveryType === 'both') {
      let emailTargets: string[] = [];

      if (selectedIds.length > 0) {
        const selectedUsers = await User.find({ _id: { $in: selectedIds } }).select('email').lean();
        emailTargets = selectedUsers.map((u: any) => u.email).filter(Boolean) as string[];
      } else if (audienceType === 'all') {
        const users = await User.find({}).select('email').lean();
        emailTargets = users.map((u: any) => u.email).filter(Boolean) as string[];
      } else {
        const staffUsers = await User.find({ role: { $in: STAFF_ROLES } }).select('email').lean();
        emailTargets = staffUsers.map((u: any) => u.email).filter(Boolean) as string[];
      }

      emailTargets = Array.from(new Set([...emailTargets, ...externalEmailList]));

      if (emailTargets.length === 0) {
        sendSuccess(res, { sentTo: 0 }, 'No email recipients found');
        if (deliveryType === 'email') {
          return;
        }
      } else {
        try {
          await emailService.sendEmail({ to: emailTargets, subject: title, text: body });
        } catch (err) {
          console.error('[push] failed to send email recipients', err);
          throw new AppError('Failed to send email recipients', 500);
        }

        if (deliveryType === 'email') {
          sendSuccess(res, { sentTo: emailTargets.length }, 'Test broadcast emails sent');
          return;
        }
      }
    }

    // If deliveryType includes app or default, send in-app/web push
    if (deliveryType === 'app' || deliveryType === 'both' || !deliveryType) {
      if (selectedIds.length > 0) {
        const selectedUsers = await User.find({ _id: { $in: selectedIds } }).select('_id fcmTokens').lean();
        const selectedUserIds = selectedUsers.map((user: any) => String(user._id));

        if (selectedUserIds.length === 0) {
          sendSuccess(res, { sentToUserCount: 0 }, 'No selected users found');
          return;
        }

        const results = await notificationService.sendNotificationToUsers(selectedUserIds, { title, body }, { url });
        sendSuccess(res, { sentToUserCount: results.length }, 'Test broadcast sent to selected users');
        return;
      }

      if (audienceType === 'all') {
        // send to all users who have tokens or simply create in-app notifications for all users
        const users = await User.find({}).select('_id fcmTokens').lean();
        const userIdsWithTokens = users.filter((u: any) => Array.isArray(u.fcmTokens) && u.fcmTokens.length > 0).map((u: any) => String(u._id));

        // create in-app notifications + attempt push per user with tokens
        const results = await notificationService.sendNotificationToUsers(userIdsWithTokens, { title, body }, { url });

        sendSuccess(res, { sentToUserCount: results.length }, 'Test broadcast sent to all users (with tokens)');
        return;
      }

      // default: staff
      const r = await notificationService.sendToStaff({ title, body, url });
      sendSuccess(res, { result: r }, 'Test broadcast sent to staff');
      return;
    }
  }
);

/**
 * Get user's notification inbox
 * GET /v1/push-notifications/inbox
 */
export const getNotificationsInbox = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments({ userId });

    sendSuccess(
      res,
      {
        notifications,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
      'Notifications retrieved'
    );
  }
);

/**
 * Mark a single notification as read
 * PATCH /v1/push-notifications/inbox/:id/read
 */
export const markNotificationAsRead = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
      { new: true }
    );

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    sendSuccess(res, notification, 'Notification marked as read');
  }
);

/**
 * Mark all notifications as read
 * PATCH /v1/push-notifications/inbox/read-all
 */
export const markAllNotificationsAsRead = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError('Unauthorized', 401);
    }

    const result = await Notification.updateMany(
      { userId, isRead: false },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    sendSuccess(
      res,
      {
        modifiedCount: result.modifiedCount,
      },
      'All notifications marked as read'
    );
  }
);