import mongoose from 'mongoose';
import AdminNotification, {
  AdminNotificationCategory,
} from '@/models/admin-notification.model';

export async function createAdminNotification(params: {
  category: AdminNotificationCategory;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await AdminNotification.create({
      category: params.category,
      title: params.title,
      body: params.body,
      metadata: params.metadata,
      readByUserIds: [],
    });
  } catch (err) {
    console.error('[admin-notification] createAdminNotification failed', err);
  }
}

function toObjectId(userId: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(userId);
}

export async function countUnreadAdminNotifications(userId: string): Promise<number> {
  const oid = toObjectId(userId);
  return AdminNotification.countDocuments({
    $expr: {
      $not: {
        $in: [oid, { $ifNull: ['$readByUserIds', []] }],
      },
    },
  });
}

export async function listAdminNotifications(params: {
  userId: string;
  page: number;
  limit: number;
  category?: AdminNotificationCategory;
  unreadOnly?: boolean;
}) {
  const { userId, page, limit, category, unreadOnly } = params;
  const skip = (page - 1) * limit;
  const oid = toObjectId(userId);

  const filter: Record<string, unknown> = {};
  if (category) filter.category = category;

  if (unreadOnly) {
    filter.$expr = {
      $not: {
        $in: [oid, { $ifNull: ['$readByUserIds', []] }],
      },
    };
  }

  const [rows, total] = await Promise.all([
    AdminNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AdminNotification.countDocuments(filter),
  ]);

  const notifications = rows.map((doc) => {
    const readByUserIds = (doc.readByUserIds || []).map((id) => id.toString());
    const isRead = readByUserIds.includes(userId);
    return {
      id: doc._id.toString(),
      category: doc.category,
      title: doc.title,
      body: doc.body,
      metadata: doc.metadata ?? null,
      createdAt: doc.createdAt,
      isRead,
    };
  });

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function markAdminNotificationRead(
  notificationId: string,
  userId: string
): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return false;
  }
  const res = await AdminNotification.updateOne(
    { _id: notificationId },
    { $addToSet: { readByUserIds: toObjectId(userId) } }
  );
  return res.matchedCount > 0;
}

export async function markAllAdminNotificationsRead(userId: string): Promise<number> {
  const oid = toObjectId(userId);
  const res = await AdminNotification.updateMany(
    {
      $expr: {
        $not: {
          $in: [oid, { $ifNull: ['$readByUserIds', []] }],
        },
      },
    },
    { $addToSet: { readByUserIds: oid } }
  );
  return res.modifiedCount ?? 0;
}

/** New event registration (member joined). */
export async function notifyAdminEventRegistration(params: {
  eventTitle: string;
  participantName: string;
  eventId: string;
}): Promise<void> {
  const { eventTitle, participantName, eventId } = params;
  await createAdminNotification({
    category: 'event',
    title: 'New event registration',
    body: `${participantName} registered for ${eventTitle}.`,
    metadata: { eventId },
  });
}

/** New or returning community member (active membership). */
export async function notifyAdminCommunityMember(params: {
  communityTitle: string;
  memberName: string;
  communityId: string;
}): Promise<void> {
  const { communityTitle, memberName, communityId } = params;
  await createAdminNotification({
    category: 'community',
    title: 'New community member',
    body: `${memberName} joined ${communityTitle}.`,
    metadata: { communityId },
  });
}

/** User completed a track / ride result for an event. */
export async function notifyAdminTrackRideCompleted(params: {
  participantName: string;
  eventTitle: string;
  eventId: string;
}): Promise<void> {
  const { participantName, eventTitle, eventId } = params;
  await createAdminNotification({
    category: 'tracks',
    title: 'Ride completed',
    body: `${participantName} completed their ride for ${eventTitle}.`,
    metadata: { eventId },
  });
}

/** New marketplace listing pending review. */
export async function notifyAdminStoreItemPending(params: {
  itemTitle: string;
  itemId: string;
  sellerName: string;
}): Promise<void> {
  const { itemTitle, itemId, sellerName } = params;
  await createAdminNotification({
    category: 'store',
    title: 'New store listing',
    body: `${sellerName} listed "${itemTitle}" (pending approval).`,
    metadata: { storeItemId: itemId },
  });
}

/** New feed post awaiting moderation. */
export async function notifyAdminFeedPostPending(params: {
  postTitle: string;
  postId: string;
  authorName: string;
}): Promise<void> {
  const { postTitle, postId, authorName } = params;
  await createAdminNotification({
    category: 'feed_moderation',
    title: 'Feed post pending review',
    body: `${authorName} submitted "${postTitle}" for moderation.`,
    metadata: { feedPostId: postId },
  });
}
