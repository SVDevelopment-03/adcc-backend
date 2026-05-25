import Community from '@/models/community.model';
import CommunityMembership from '@/models/communityMembership.model';
import Event from '@/models/event.model';
import notificationService from '@/services/notification.service';

const ADMIN_ROLES = ['admin', 'moderator'] as const;

async function getCommunityRecipientIds(communityId: string): Promise<string[]> {
  const memberships = await CommunityMembership.find({
    communityId,
    status: 'active',
  })
    .select('userId')
    .lean();

  return Array.from(new Set(memberships.map((membership: any) => String(membership.userId))));
}

async function getCommunityAdminIds(communityId: string): Promise<string[]> {
  const community = await Community.findById(communityId).select('createdBy').lean();
  const memberships = await CommunityMembership.find({
    communityId: communityId as any,
    status: 'active',
    role: { $in: ADMIN_ROLES as unknown as string[] } as any,
  })
    .select('userId')
    .lean();

  const ids = [
    ...(community?.createdBy ? [String(community.createdBy)] : []),
    ...memberships.map((membership: any) => String(membership.userId)),
  ];

  return Array.from(new Set(ids));
}

async function sendToCommunityMembers(
  communityId: string,
  title: string,
  body: string,
  url?: string
): Promise<{ successCount: number; failureCount: number }> {
  const recipientIds = await getCommunityRecipientIds(communityId);
  if (recipientIds.length === 0) return { successCount: 0, failureCount: 0 };
  const results = await notificationService.sendNotificationToUsers(recipientIds, { title, body }, { url });
  return results.reduce(
    (totals, entry) => {
      const result = entry.result as { successCount?: number; failureCount?: number } | undefined;
      totals.successCount += result?.successCount ?? 0;
      totals.failureCount += result?.failureCount ?? 0;
      return totals;
    },
    { successCount: 0, failureCount: 0 }
  );
}

async function sendToCommunityAdmins(
  communityId: string,
  title: string,
  body: string,
  url?: string
): Promise<{ successCount: number; failureCount: number }> {
  const recipientIds = await getCommunityAdminIds(communityId);
  if (recipientIds.length === 0) return { successCount: 0, failureCount: 0 };
  const results = await notificationService.sendNotificationToUsers(recipientIds, { title, body }, { url });
  return results.reduce(
    (totals, entry) => {
      const result = entry.result as { successCount?: number; failureCount?: number } | undefined;
      totals.successCount += result?.successCount ?? 0;
      totals.failureCount += result?.failureCount ?? 0;
      return totals;
    },
    { successCount: 0, failureCount: 0 }
  );
}

export async function notifyCommunityAnnouncement(params: {
  communityId: string;
  titleText: string;
  postTitle?: string;
  byName?: string;
  url?: string;
}) {
  const community = await Community.findById(params.communityId).select('title').lean();
  if (!community) return { successCount: 0, failureCount: 0 };

  const title = 'New community announcement';
  const postTitle = params.postTitle?.trim() || params.titleText.trim();
  const author = params.byName?.trim() || community.title;
  const body = `📢 ${author} posted: '${postTitle}'.`;
  return sendToCommunityMembers(params.communityId, title, body, params.url ?? `/communities/${params.communityId}`);
}

export async function notifyCommunityNewMember(params: {
  communityId: string;
  memberName: string;
  url?: string;
}) {
  const community = await Community.findById(params.communityId).select('title').lean();
  if (!community) return { successCount: 0, failureCount: 0 };

  const title = 'New member joined your community';
  const body = `👋 ${params.memberName.trim() || 'A member'} joined ${community.title}.`;
  return sendToCommunityAdmins(params.communityId, title, body, params.url ?? `/communities/${params.communityId}`);
}

export async function notifyCommunityEventCreated(params: {
  communityId: string;
  eventId: string;
  eventTitle: string;
  url?: string;
}) {
  const event = await Event.findById(params.eventId).select('communityNotificationSentAt').lean();
  const community = await Community.findById(params.communityId).select('title').lean();
  if (!community) return { successCount: 0, failureCount: 0 };
  if ((event as any)?.communityNotificationSentAt) return { successCount: 0, failureCount: 0 };

  const title = 'New event in your community';
  const body = `📅 A new event has been added to ${community.title}. Tap to see details.`;
  const result = await sendToCommunityMembers(params.communityId, title, body, params.url ?? `/events/${params.eventId}`);
  if (result.successCount || result.failureCount) {
    await Event.updateOne({ _id: params.eventId }, { $set: { communityNotificationSentAt: new Date() } });
  }
  return result;
}

export async function notifyCommunityGalleryAdded(params: {
  communityId: string;
  imageCount: number;
  url?: string;
}) {
  const community = await Community.findById(params.communityId).select('title').lean();
  if (!community) return { successCount: 0, failureCount: 0 };

  const title = 'New gallery photos added';
  const body = `📸 ${params.imageCount} new photos added to ${community.title} gallery from last weekend's ride.`;
  return sendToCommunityMembers(params.communityId, title, body, params.url ?? `/communities/${params.communityId}`);
}

export default {
  notifyCommunityAnnouncement,
  notifyCommunityNewMember,
  notifyCommunityEventCreated,
  notifyCommunityGalleryAdded,
};
