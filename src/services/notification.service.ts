import mongoose from 'mongoose';
import User from '@/models/user.model';
import Notification, { INotification } from '@/models/notification.model';
import { sendWebPushNotification } from '@/services/firebase.service';

export type NotificationChannel = 'in_app' | 'web' | 'fcm';

export interface NotificationSendOptions {
  channels?: NotificationChannel[]; // order of preference
  url?: string;
}

export async function createInAppNotification(params: {
  userId: string;
  title: string;
  body: string;
  type?: INotification['type'];
  data?: Record<string, unknown>;
}) {
  return Notification.create({
    userId: new mongoose.Types.ObjectId(params.userId),
    title: params.title,
    body: params.body,
    type: params.type ?? 'general',
    data: params.data,
  });
}

async function gatherTokensForUser(userId: string): Promise<string[]> {
  const user = await User.findById(userId).select('fcmTokens').lean();
  if (!user) return [];
  const tokens: string[] = [];
  const entries = (user as any).fcmTokens || [];
  for (const e of entries) {
    if (e?.token) tokens.push(e.token);
  }
  return tokens;
}

export async function sendNotificationToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    type?: INotification['type'];
    data?: Record<string, unknown>;
  },
  options: NotificationSendOptions = {}
) {
  // Persist in-app notification always
  await createInAppNotification({
    userId,
    title: payload.title,
    body: payload.body,
    type: payload.type,
    data: payload.data,
  });

  const channels = options.channels ?? ['web', 'fcm'];

  // For now both `web` and `fcm` use the same FCM tokens via firebase.service
  if (channels.includes('web') || channels.includes('fcm')) {
    const tokens = await gatherTokensForUser(userId);
    console.log(
      '[PUSH] sendNotificationToUser',
      'userId=' + userId,
      'channels=' + channels.join(','),
      'tokens=' + tokens.length,
      'title=' + payload.title
    );
    if (tokens.length === 0) return { successCount: 0, failureCount: 0 };

    const response = await sendWebPushNotification(tokens, { title: payload.title, body: payload.body, url: options.url });
    console.log(
      '[PUSH] sendNotificationToUser result',
      'userId=' + userId,
      'success=' + response.successCount,
      'failure=' + response.failureCount
    );

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = (resp.error as any).code as string | undefined;
        const message = (resp.error as any).message as string | undefined;
        console.log(
          '[PUSH] token send failed',
          'userId=' + userId,
          'tokenIndex=' + idx,
          'token=' + tokens[idx],
          'code=' + (code ?? '(none)'),
          'message=' + (message ?? '(none)')
        );
      }
    });

    // Cleanup invalid tokens similar to push controller behavior
    const invalidTokensByUser = new Map<string, string[]>();
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = (resp.error as any).code as string | undefined;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/mismatched-credential' ||
          code === 'messaging/third-party-auth-error'
        ) {
          const badToken = tokens[idx];
          const list = invalidTokensByUser.get(userId) || [];
          list.push(badToken);
          invalidTokensByUser.set(userId, list);
        }
      }
    });

    if (invalidTokensByUser.size > 0) {
      const ops = Array.from(invalidTokensByUser.entries()).map(([uid, badTokens]) => ({
        updateOne: {
          filter: { _id: uid },
          update: { $pull: { fcmTokens: { token: { $in: badTokens } } } },
        },
      }));
      await User.bulkWrite(ops, { ordered: false });
    }

    return { successCount: response.successCount, failureCount: response.failureCount };
  }

  return { successCount: 0, failureCount: 0 };
}

export async function sendNotificationToUsers(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    type?: INotification['type'];
    data?: Record<string, unknown>;
  },
  options: NotificationSendOptions = {}
) {
  console.log(
    '[PUSH] sendNotificationToUsers',
    'userCount=' + userIds.length,
    'title=' + payload.title,
    'userIds=' + (userIds.length <= 20 ? userIds.join(',') : userIds.slice(0, 20).join(',') + '...')
  );

  const results = [] as Array<{ userId: string; result: any }>;
  for (const u of userIds) {
    // fire-and-forget per user to keep latency low for caller
    // but await here to surface errors to the caller if needed
    // TODO: batch in larger systems
    // eslint-disable-next-line no-await-in-loop
    const r = await sendNotificationToUser(u, payload, options);
    results.push({ userId: u, result: r });
  }
  return results;
}

export async function sendToStaff(payload: { title: string; body: string; url?: string }, _options: NotificationSendOptions = {}) {
  console.log(
    '[PUSH] sendToStaff',
    'role=Vendor',
    'title=' + payload.title
  );
  const staff = await User.find({ role: { $in: ['Vendor'] }, fcmTokens: { $exists: true, $ne: [] } }, { fcmTokens: 1 }).lean();
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
    console.log('[PUSH] sendToStaff aborted - no staff tokens found');
    return { successCount: 0, failureCount: 0 };
  }

  console.log(
    '[PUSH] sendToStaff targetCount=' + staff.length,
    'tokenCount=' + tokens.length
  );

  const chunkSize = 500;
  let successCount = 0;
  let failureCount = 0;
  const invalidTokensByUser = new Map<string, string[]>();

  for (let i = 0; i < tokens.length; i += chunkSize) {
    const chunk = tokens.slice(i, i + chunkSize);
    // eslint-disable-next-line no-await-in-loop
    const response = await sendWebPushNotification(chunk, { title: payload.title, body: payload.body, url: payload.url });
    successCount += response.successCount;
    failureCount += response.failureCount;
    response.responses.forEach((resp, index) => {
      if (!resp.success && resp.error) {
        const code = (resp.error as any).code as string | undefined;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/mismatched-credential' ||
          code === 'messaging/third-party-auth-error'
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

  if (invalidTokensByUser.size > 0) {
    const ops = Array.from(invalidTokensByUser.entries()).map(([userId, badTokens]) => ({
      updateOne: {
        filter: { _id: userId },
        update: { $pull: { fcmTokens: { token: { $in: badTokens } } } },
      },
    }));
    await User.bulkWrite(ops, { ordered: false });
  }

  return { successCount, failureCount };
}

export default {
  createInAppNotification,
  sendNotificationToUser,
  sendNotificationToUsers,
  sendToStaff,
};
