import { Response } from 'express';
import User from '@/models/user.model';
import Notification from '@/models/notification.model';
import EventResult from '@/models/eventResult.model';
import CommunityMembership from '@/models/communityMembership.model';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { sendSuccess } from '@/utils/response';
import { AuthRequest } from '@/middleware/auth.middleware';
import notificationService from '@/services/notification.service';
import { sendWebPushNotification } from '@/services/firebase.service';
import emailService from '@/services/email.service';
import { announcementEmail } from '@/services/emailTemplates';
import PushCampaign from '@/models/push-campaign.model';
import mongoose from 'mongoose';

const STAFF_ROLES: Array<'Admin' | 'Vendor' | 'Member'> = ['Vendor'];

const ensureStaff = (role?: string) => {
  if (!role || !STAFF_ROLES.includes(role as 'Admin' | 'Vendor' | 'Member')) {
    throw new AppError('Staff access required', 403);
  }
};

/** Wrap a dashboard-composed message in the branded email layout. */
const buildBroadcastEmail = (params: { title: string; body: string; image?: string; actions?: string }) => {
  let parsedActions: Array<{ title: string; action: string }> | undefined;
  if (params.actions) {
    try {
      const raw = JSON.parse(params.actions);
      if (Array.isArray(raw)) parsedActions = raw;
    } catch {
      parsedActions = undefined;
    }
  }
  return announcementEmail({
    title: params.title,
    body: params.body,
    image: params.image,
    actions: parsedActions,
  });
};

/**
 * Resolve a dashboard audience to the user ids it targets.
 * Returns null for audiences that mean "staff only" (the legacy default).
 */
const resolveAudienceUserIds = async (
  audienceType: string | undefined,
  selectedIds: string[]
): Promise<string[] | null> => {
  if (selectedIds.length > 0) {
    const users = await User.find({ _id: { $in: selectedIds } }).select('_id').lean();
    return users.map((u: any) => String(u._id));
  }

  switch (audienceType) {
    case 'all':
    case 'all_devices': {
      const users = await User.find({}).select('_id').lean();
      return users.map((u: any) => String(u._id));
    }
    case 'active': {
      const users = await User.find({ isVerified: true }).select('_id').lean();
      return users.map((u: any) => String(u._id));
    }
    case 'event': {
      const ids = await EventResult.distinct('userId', {
        status: { $in: ['joined', 'checked_in', 'completed'] },
      });
      return ids.map((id: any) => String(id));
    }
    case 'chapter': {
      const ids = await CommunityMembership.distinct('userId', { status: 'active' });
      return ids.map((id: any) => String(id));
    }
    default:
      return null;
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
    const { title, body, url, audienceType, scheduleDate, scheduleTime, image, actions } = req.body as {
      title: string;
      body: string;
      url?: string;
      audienceType?: string;
      scheduleDate?: string;
      scheduleTime?: string;
      image?: string; // optional image URL
      actions?: string; // JSON stringified actions array
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
      let parsedActions: any = undefined;
      if (actions) {
        try {
          parsedActions = JSON.parse(actions);
        } catch {
          parsedActions = undefined;
        }
      }

      const response = await sendWebPushNotification(chunk, { title, body, url, image, actions: parsedActions });

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
          image: image ?? null,
          actions: actions ? actions : null,
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
      const { title, body, url, audienceType, deliveryType, externalEmails, selectedUserIds, communityId, image, actions } = req.body as {
        title: string;
        body: string;
        url?: string;
        audienceType?: string;
        deliveryType?: 'app' | 'email' | 'both';
        externalEmails?: string; // comma separated
        selectedUserIds?: string; // comma separated
        communityId?: string;
        image?: string;
        actions?: string;
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

    if (audienceType === 'selected_users' && selectedIds.length === 0) {
      throw new AppError('Select at least one user', 400);
    }

    // null => staff-only audience
    const audienceUserIds = await resolveAudienceUserIds(audienceType, selectedIds);

    // If deliveryType includes email, handle email sending first (externalEmails or audience-based)
    let emailsSentCount = 0;
    if (deliveryType === 'email' || deliveryType === 'both') {
      let emailTargets: string[] = [];

      if (audienceUserIds) {
        const users = await User.find({ _id: { $in: audienceUserIds } }).select('email').lean();
        emailTargets = users.map((u: any) => u.email).filter(Boolean) as string[];
      } else {
        const staffUsers = await User.find({ role: { $in: STAFF_ROLES } }).select('email').lean();
        emailTargets = staffUsers.map((u: any) => u.email).filter(Boolean) as string[];
      }

      emailTargets = Array.from(new Set([...emailTargets, ...externalEmailList]));

      if (emailTargets.length === 0 && deliveryType === 'email') {
        sendSuccess(res, { sentTo: 0 }, 'No email recipients found');
        return;
      }

      if (emailTargets.length > 0) {
        try {
          const mail = buildBroadcastEmail({ title, body, image, actions });
          await emailService.sendEmail({ to: emailTargets, subject: mail.subject, text: mail.text, html: mail.html });
          emailsSentCount = emailTargets.length;
        } catch (err: any) {
          const reason = err?.message || 'Unknown error';
          console.error('[push] failed to send email recipients', err);
          const hint = reason.includes('Greeting never received')
            ? ' (Port/TLS mismatch — try port 465 with TLS ON, or port 587 with TLS OFF)'
            : reason.includes('Invalid login') || reason.includes('authentication')
              ? ' (Check username/password — Gmail requires an App Password)'
              : '';
          throw new AppError(`Failed to send emails: ${reason}${hint}`, 422);
        }
      }

      if (deliveryType === 'email') {
        await PushCampaign.create({
          title,
          body,
          audienceType: audienceType || 'staff',
          deliveryType: 'email',
          emailCount: emailsSentCount,
          createdBy: req.user?.id,
        }).catch((err: any) => console.error('[push] failed to record campaign', err?.message ?? err));
        sendSuccess(res, { sentTo: emailsSentCount }, 'Test broadcast emails sent');
        return;
      }
    }

    // If deliveryType includes app or default, send in-app/web push
    if (deliveryType === 'app' || deliveryType === 'both' || !deliveryType) {
      if (audienceUserIds) {
        if (audienceUserIds.length === 0) {
          sendSuccess(res, { sentToUserCount: 0 }, 'No users found for this audience');
          return;
        }

        const parsedActions = actions ? (() => { try { return JSON.parse(actions); } catch { return undefined; } })() : undefined;
        // Recorded first so each inbox entry can point back to its campaign (read tracking)
        const campaignId = new mongoose.Types.ObjectId();
        const data: Record<string, unknown> = {
          campaignId: String(campaignId),
          ...(communityId ? { communityId } : {}),
          ...(image ? { image } : {}),
          ...(actions ? { actions } : {}),
          ...(url ? { url } : {}),
        };

        // Every targeted user gets an inbox entry; push goes to those with registered devices
        const result = await notificationService.broadcastNotificationToUsers(
          audienceUserIds,
          {
            title,
            body,
            type: communityId ? 'community' : undefined,
            data,
          },
          { url, image, actions: parsedActions }
        );
        await PushCampaign.create({
          _id: campaignId,
          title,
          body,
          audienceType: audienceType || 'all',
          deliveryType: deliveryType === 'both' ? 'both' : 'app',
          recipientCount: result.userCount,
          pushSuccessCount: result.successCount,
          pushFailureCount: result.failureCount,
          emailCount: emailsSentCount,
          createdBy: req.user?.id,
        }).catch((err: any) => console.error('[push] failed to record campaign', err?.message ?? err));
        sendSuccess(
          res,
          {
            sentToUserCount: result.userCount,
            pushSuccessCount: result.successCount,
            pushFailureCount: result.failureCount,
          },
          'Notification sent'
        );
        return;
      }

      // default: staff
      const parsedActionsStaff = req.body.actions ? (() => { try { return JSON.parse(String(req.body.actions)); } catch { return undefined; } })() : undefined;
      const r = await notificationService.sendToStaff({ title, body, url, data: (image || req.body.actions) ? { ...(image ? { image } : {}), ...(req.body.actions ? { actions: req.body.actions } : {}) } : undefined }, { image, actions: parsedActionsStaff });
      sendSuccess(res, { result: r }, 'Test broadcast sent to staff');
      return;
    }
  }
);

export const sendCampaignBroadcast = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { message, url, audienceType, deliveryType, externalEmails, selectedUserIds, communityId, image } = req.body as {
        message: string;
        url?: string;
        audienceType?: string;
        deliveryType?: 'app' | 'email' | 'both';
        externalEmails?: string; // comma separated
        selectedUserIds?: string; // comma separated
        communityId?: string;
        image?: string;
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

    const title = 'Admin broadcast';
    const body = `Exciting update from ADCC: ${message?.trim()}`;

    if (!message || !message.trim()) {
      throw new AppError('Campaign message is required', 400);
    }

    let emailsSentCount = 0;
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

      if (emailTargets.length === 0 && deliveryType === 'email') {
        sendSuccess(res, { sentTo: 0 }, 'No email recipients found');
        return;
      }

      if (emailTargets.length > 0) {
        try {
          const mail = buildBroadcastEmail({ title, body, image });
          await emailService.sendEmail({ to: emailTargets, subject: mail.subject, text: mail.text, html: mail.html });
          emailsSentCount = emailTargets.length;
        } catch (err: any) {
          const reason = err?.message || 'Unknown error';
          console.error('[push] failed to send campaign emails', err);
          const hint = reason.includes('Greeting never received')
            ? ' (Port/TLS mismatch — try port 465 with TLS ON, or port 587 with TLS OFF)'
            : reason.includes('Invalid login') || reason.includes('authentication')
              ? ' (Check username/password — Gmail requires an App Password)'
              : '';
          throw new AppError(`Failed to send emails: ${reason}${hint}`, 422);
        }
      }

      if (deliveryType === 'email') {
        sendSuccess(res, { sentTo: emailsSentCount }, 'Campaign broadcast emails sent');
        return;
      }
    }

    if (deliveryType === 'app' || deliveryType === 'both' || !deliveryType) {
      if (selectedIds.length > 0) {
        const selectedUsers = await User.find({ _id: { $in: selectedIds } }).select('_id fcmTokens').lean();
        const selectedUserIds = selectedUsers.map((user: any) => String(user._id));

        if (selectedUserIds.length === 0) {
          sendSuccess(res, { sentToUserCount: 0 }, 'No selected users found');
          return;
        }

        const results = await notificationService.sendNotificationToUsers(
          selectedUserIds,
          {
            title,
            body,
            type: communityId ? 'community' : undefined,
            data: communityId ? { communityId, image } : (image ? { image } : undefined),
          },
          { url, image }
        );
        sendSuccess(res, { sentToUserCount: results.length }, 'Campaign broadcast sent to selected users');
        return;
      }

      if (audienceType === 'all') {
        const users = await User.find({}).select('_id fcmTokens').lean();
        const userIdsWithTokens = users.filter((u: any) => Array.isArray(u.fcmTokens) && u.fcmTokens.length > 0).map((u: any) => String(u._id));

        const results = await notificationService.sendNotificationToUsers(userIdsWithTokens, { title, body, data: image ? { image } : undefined }, { url, image });
        sendSuccess(res, { sentToUserCount: results.length }, 'Campaign broadcast sent to all users (with tokens)');
        return;
      }

      const r = await notificationService.sendToStaff({ title, body, url }, { image });
      sendSuccess(res, { result: r }, 'Campaign broadcast sent to staff');
      return;
    }
  }
);

/**
 * Recent dashboard broadcasts with delivery and read counts
 * GET /v1/push-notifications/campaigns?limit=5
 */
export const getPushCampaigns = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5, 1), 50);
  const campaigns = await PushCampaign.find({}).sort({ createdAt: -1 }).limit(limit).lean();

  const ids = campaigns.map((c) => String(c._id));
  const readRows = ids.length
    ? await Notification.aggregate<{ _id: string; count: number }>([
        { $match: { 'data.campaignId': { $in: ids }, isRead: true } },
        { $group: { _id: '$data.campaignId', count: { $sum: 1 } } },
      ])
    : [];
  const readById = new Map(readRows.map((row) => [String(row._id), Number(row.count || 0)]));

  sendSuccess(
    res,
    {
      campaigns: campaigns.map((c) => ({
        id: String(c._id),
        title: c.title,
        audienceType: c.audienceType,
        deliveryType: c.deliveryType,
        recipientCount: c.recipientCount,
        pushSuccessCount: c.pushSuccessCount,
        pushFailureCount: c.pushFailureCount,
        emailCount: c.emailCount,
        readCount: readById.get(String(c._id)) ?? 0,
        createdAt: c.createdAt,
      })),
    },
    'Push campaigns retrieved'
  );
});

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