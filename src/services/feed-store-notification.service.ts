import FeedPost from '@/models/feed-post.model';
import StoreItem from '@/models/store-item.model';
import User from '@/models/user.model';
import notificationService from '@/services/notification.service';

async function getUserName(userId: string): Promise<string> {
  const user = await User.findById(userId).select('fullName').lean();
  return (user as any)?.fullName?.trim() || 'Someone';
}

async function notifyUser(userId: string, title: string, body: string, url?: string) {
  return notificationService.sendNotificationToUser(userId, { title, body }, { url });
}

export async function notifyFeedPostApproved(postId: string): Promise<boolean> {
  const post = await FeedPost.findById(postId).select('title createdBy status approvedNotificationSentAt').lean();
  if (!post || (post as any).status !== 'approved' || (post as any).approvedNotificationSentAt) return false;

  const result = await notifyUser(
    String((post as any).createdBy),
    'Feed post approved',
    `✅ Your post has been approved and is now live on the ADCC feed!`,
    `/feed/${postId}`
  );

  if (result.successCount || result.failureCount) {
    await FeedPost.updateOne({ _id: postId }, { $set: { approvedNotificationSentAt: new Date() } });
    return true;
  }

  return false;
}

export async function notifyFeedPostRejected(postId: string, reason?: string): Promise<boolean> {
  const post = await FeedPost.findById(postId).select('title createdBy status rejectedNotificationSentAt').lean();
  if (!post || (post as any).status !== 'rejected' || (post as any).rejectedNotificationSentAt) return false;

  const reasonText = reason?.trim();
  const body = reasonText
    ? `❌ Your post was not approved. Reason: ${reasonText} Please review our community guidelines and resubmit.`
    : `❌ Your post was not approved. Please review our community guidelines and resubmit.`;

  const result = await notifyUser(
    String((post as any).createdBy),
    'Feed post rejected',
    body,
    `/feed/${postId}`
  );

  if (result.successCount || result.failureCount) {
    await FeedPost.updateOne({ _id: postId }, { $set: { rejectedNotificationSentAt: new Date() } });
    return true;
  }

  return false;
}

export async function notifyFeedPostLiked(params: { postId: string; likerId: string; authorId: string }): Promise<boolean> {
  if (params.likerId === params.authorId) return false;
  const likerName = await getUserName(params.likerId);
  const result = await notifyUser(
    params.authorId,
    'Someone liked your post',
    `❤️ ${likerName} liked your post.`,
    `/feed/${params.postId}`
  );

  return result.successCount > 0 || result.failureCount > 0;
}

export async function notifyStoreItemApproved(itemId: string): Promise<boolean> {
  const item = await StoreItem.findById(itemId).select('title createdBy status approvedNotificationSentAt').lean();
  if (!item || (item as any).status !== 'Approved' || (item as any).approvedNotificationSentAt) return false;

  const result = await notifyUser(
    String((item as any).createdBy),
    'Store listing approved',
    `🛒 Your listing '${(item as any).title}' is now live on the ADCC marketplace!`,
    `/store/items/${itemId}`
  );

  if (result.successCount || result.failureCount) {
    await StoreItem.updateOne({ _id: itemId }, { $set: { approvedNotificationSentAt: new Date() } });
    return true;
  }

  return false;
}

export async function notifyStoreItemRejected(itemId: string, reason?: string): Promise<boolean> {
  const item = await StoreItem.findById(itemId).select('createdBy status rejectedNotificationSentAt').lean();
  if (!item || (item as any).status !== 'Rejected' || (item as any).rejectedNotificationSentAt) return false;

  const reasonText = reason?.trim();
  const body = reasonText
    ? `❌ Your listing was not approved. Reason: ${reasonText} Tap to view the reason and resubmit.`
    : `❌ Your listing was not approved. Tap to view the reason and resubmit.`;

  const result = await notifyUser(
    String((item as any).createdBy),
    'Store listing rejected',
    body,
    `/store/items/${itemId}`
  );

  if (result.successCount || result.failureCount) {
    await StoreItem.updateOne({ _id: itemId }, { $set: { rejectedNotificationSentAt: new Date() } });
    return true;
  }

  return false;
}

export default {
  notifyFeedPostApproved,
  notifyFeedPostRejected,
  notifyFeedPostLiked,
  notifyStoreItemApproved,
  notifyStoreItemRejected,
};