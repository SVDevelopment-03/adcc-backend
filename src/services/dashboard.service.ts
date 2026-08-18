import dayjs from 'dayjs';
import Community from '@/models/community.model';
import Event from '@/models/event.model';
import EventResult from '@/models/eventResult.model';
import FeedPost from '@/models/feed-post.model';
import GlobalSetting from '@/models/global-setting.model';
import StoreItem from '@/models/store-item.model';
import Track from '@/models/track.model';
import User from '@/models/user.model';

export interface BannerGroupQuery {
  bannerGroup?: string;
  bannerGroups?: string;
  upcomingEventsLimit?: number;
  moderationQueueLimit?: number;
}

export type ModerationQueueItemType = 'feed_post' | 'marketplace_item' | 'user';

export interface ModerationQueueItem {
  id: string;
  type: ModerationQueueItemType;
  title?: string;
  userName: string;
  userId: string;
  statusLabel: string;
  createdAt: Date;
}

function userNameFromPopulated(
  ref: unknown
): { name: string; id: string } {
  if (ref && typeof ref === 'object' && '_id' in ref) {
    const o = ref as { _id?: unknown; fullName?: string };
    const id = String(o._id ?? '');
    const name = typeof o.fullName === 'string' && o.fullName.trim() ? o.fullName.trim() : 'Unknown';
    return { name, id };
  }
  if (typeof ref === 'string' && ref) {
    return { name: 'Unknown', id: ref };
  }
  return { name: 'Unknown', id: '' };
}

async function buildModerationQueue(
  keys: Set<string>,
  limit: number
): Promise<ModerationQueueItem[]> {
  const tasks: Promise<ModerationQueueItem[]>[] = [];

  if (keys.has('moderate_content')) {
    tasks.push(
      (async () => {
        const rows = await FeedPost.find({
          $or: [{ status: 'pending' }, { reported: true }],
        })
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate('createdBy', 'fullName')
          .select('title status reported createdAt createdBy')
          .lean();

        return rows.map((f) => {
          const { name, id } = userNameFromPopulated(f.createdBy);
          let statusLabel = 'Pending Review';
          if (f.reported && f.status === 'pending') {
            statusLabel = 'Reported: Pending review';
          } else if (f.reported) {
            statusLabel = 'Reported: Inappropriate';
          } else if (f.status === 'pending') {
            statusLabel = 'Pending Review';
          }
          return {
            id: String(f._id),
            type: 'feed_post' as const,
            title: f.title,
            userName: name,
            userId: id,
            statusLabel,
            createdAt: f.createdAt as Date,
          };
        });
      })()
    );

    tasks.push(
      (async () => {
        const rows = await StoreItem.find({ status: 'Pending' })
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate('createdBy', 'fullName')
          .select('title createdAt createdBy')
          .lean();

        return rows.map((s) => {
          const { name, id } = userNameFromPopulated(s.createdBy);
          return {
            id: String(s._id),
            type: 'marketplace_item' as const,
            title: s.title,
            userName: name,
            userId: id,
            statusLabel: 'Pending Review',
            createdAt: s.createdAt as Date,
          };
        });
      })()
    );
  }

  if (keys.has('manage_users')) {
    tasks.push(
      (async () => {
        const rows = await User.find({ role: 'Member', banFeedPost: true })
          .sort({ updatedAt: -1 })
          .limit(limit)
          .select('fullName createdAt updatedAt')
          .lean();

        return rows.map((u) => {
          const createdAt =
            (u as { createdAt?: Date }).createdAt ||
            (u.updatedAt as Date) ||
            new Date();
          return {
            id: String(u._id),
            type: 'user' as const,
            title: undefined,
            userName: typeof u.fullName === 'string' && u.fullName.trim() ? u.fullName.trim() : 'Unknown',
            userId: String(u._id),
            statusLabel: 'Multiple Violations',
            createdAt,
          };
        });
      })()
    );
  }

  const chunks = await Promise.all(tasks);
  const merged = chunks.flat();
  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return merged.slice(0, limit);
}

const defaultBannerGroup = (): string =>
  (process.env.CONTENT_BANNER_GROUP || 'homepage-banners').trim() || 'homepage-banners';

const buildBannerFilter = (q: BannerGroupQuery): Record<string, unknown> => {
  const groupsCsv = q.bannerGroups?.trim();
  if (groupsCsv) {
    const groups = groupsCsv
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    if (groups.length > 0) {
      return { active: true, group: { $in: groups } };
    }
  }
  const group = (q.bannerGroup?.trim() || defaultBannerGroup()) || defaultBannerGroup();
  return { active: true, group };
};

/** Content / marketing dashboard (Content Manager, etc.) */
export async function fetchContentMetrics(q: BannerGroupQuery) {
  const bannerFilter = buildBannerFilter(q);
  const [activeBanners, eventsPromoted, feedPosts, featuredStoreItems] = await Promise.all([
    GlobalSetting.countDocuments(bannerFilter),
    Event.countDocuments({
      isFeatured: true,
      status: { $nin: ['Draft', 'Archived'] },
    }),
    FeedPost.countDocuments({ status: 'approved' }),
    StoreItem.countDocuments({ isFeatured: true, status: 'Approved' }),
  ]);
  return { activeBanners, eventsPromoted, feedPosts, featuredStoreItems };
}

const upcomingEventsFilter = (): Record<string, unknown> => ({
  eventDate: { $gte: dayjs().startOf('day').toDate() },
  status: { $in: ['Open', 'Full'] },
});

async function computeMonthlyMemberGrowthPercent(): Promise<number> {
  const now = dayjs();
  const startThis = now.startOf('month').toDate();
  const endThis = now.endOf('month').toDate();
  const startLast = now.subtract(1, 'month').startOf('month').toDate();
  const endLast = now.subtract(1, 'month').endOf('month').toDate();
  const memberCreated = { role: 'Member' as const };

  const [thisMonth, lastMonth] = await Promise.all([
    User.countDocuments({ ...memberCreated, createdAt: { $gte: startThis, $lte: endThis } }),
    User.countDocuments({ ...memberCreated, createdAt: { $gte: startLast, $lte: endLast } }),
  ]);

  if (lastMonth === 0) {
    return thisMonth > 0 ? 100 : 0;
  }
  return Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10;
}

async function fetchCommunityEngagementMetrics(): Promise<{
  averageEventRating: number | null;
  memberSatisfactionPercent: number | null;
  monthlyActiveMembers: number;
}> {
  const since30 = dayjs().subtract(30, 'day').toDate();

  const [avgAgg, monthlyActiveMembers] = await Promise.all([
    EventResult.aggregate<{ avgRating: number }>([
      { $match: { rating: { $exists: true, $ne: null, $gte: 1, $lte: 5 } } },
      { $group: { _id: null, avgRating: { $avg: '$rating' } } },
    ]),
    EventResult.distinct('userId', {
      createdAt: { $gte: since30 },
      status: { $in: ['joined', 'completed', 'checked_in'] },
    }),
  ]);

  const rawAvg = avgAgg[0]?.avgRating;
  const averageEventRating =
    rawAvg != null && !Number.isNaN(rawAvg) ? Math.round(rawAvg * 10) / 10 : null;
  const memberSatisfactionPercent =
    averageEventRating != null ? Math.round((averageEventRating / 5) * 100) : null;

  return {
    averageEventRating,
    memberSatisfactionPercent,
    monthlyActiveMembers: monthlyActiveMembers.length,
  };
}

/** Community Manager — communities, events, members, engagement */
export async function fetchCommunityMetrics(q?: BannerGroupQuery) {
  const upcomingLimit = q?.upcomingEventsLimit ?? 10;

  const [
    totalCommunities,
    featuredCommunities,
    activeCommunities,
    openEventsCount,
    featuredEventsCount,
    totalMembers,
    upcomingEventsCount,
    monthlyGrowthPercent,
    communityEngagement,
    upcomingEventsRaw,
  ] = await Promise.all([
    Community.countDocuments(),
    Community.countDocuments({ isFeatured: true }),
    Community.countDocuments({ isActive: true }),
    Event.countDocuments({ status: 'Open' }),
    Event.countDocuments({
      isFeatured: true,
      status: { $nin: ['Draft', 'Archived'] },
    }),
    User.countDocuments({ role: 'Member' }),
    Event.countDocuments(upcomingEventsFilter()),
    computeMonthlyMemberGrowthPercent(),
    fetchCommunityEngagementMetrics(),
    Event.find(upcomingEventsFilter())
      .sort({ eventDate: 1, createdAt: -1 })
      .limit(upcomingLimit)
      .populate('trackId', 'title city')
      .select('title eventDate city currentParticipants maxParticipants mainImage eventImage trackId')
      .lean(),
  ]);

  const upcomingEvents = upcomingEventsRaw.map((e) => {
    const tr = e.trackId;
    const track =
      tr && typeof tr === 'object' && 'title' in tr
        ? (tr as { title?: string; city?: string })
        : null;
    return {
      id: String(e._id),
      title: e.title,
      eventDate: e.eventDate,
      city: (e.city as string | undefined) || track?.city || '',
      registeredCount: e.currentParticipants ?? 0,
      maxParticipants: e.maxParticipants ?? 0,
      image: (e.mainImage as string | undefined) || (e.eventImage as string | undefined) || null,
      trackTitle: track?.title,
    };
  });

  return {
    totalCommunities,
    featuredCommunities,
    activeCommunities,
    openEventsCount,
    featuredEventsCount,
    totalMembers,
    upcomingEventsCount,
    monthlyGrowthPercent,
    upcomingEvents,
    communityEngagement,
  };
}

/** Moderator — summary cards + merged Moderation Queue (feed, marketplace, restricted users) */
export async function fetchModerationMetrics(keys: Set<string>, q?: BannerGroupQuery) {
  const queueLimit = q?.moderationQueueLimit ?? 20;
  const out: Record<string, unknown> = {};

  if (keys.has('moderate_content')) {
    const [pendingPosts, reportedContent, marketplaceQueue] = await Promise.all([
      FeedPost.countDocuments({ status: 'pending' }),
      FeedPost.countDocuments({ reported: true }),
      StoreItem.countDocuments({ status: 'Pending' }),
    ]);
    out.pendingPosts = pendingPosts;
    out.reportedContent = reportedContent;
    out.marketplaceQueue = marketplaceQueue;
  }

  if (keys.has('manage_users')) {
    out.userReports = await User.countDocuments({ role: 'Member', banFeedPost: true });
  }

  if (keys.has('moderate_content') || keys.has('manage_users')) {
    const moderationQueue = await buildModerationQueue(keys, queueLimit);
    out.moderationQueue = moderationQueue;
    out.queueItemsPending = moderationQueue.length;
  }

  return out;
}

/** Super Admin / full app overview (`banUserMember` = members with `banFeedPost: true`) */
export async function fetchAdminOverviewMetrics() {
  const start = dayjs().startOf('month').toDate();
  const end = dayjs().endOf('month').toDate();

  const [
    totalUsers,
    eventsThisMonth,
    activeTracks,
    communities,
    pendingFeedPosts,
    pendingStoreItems,
    banUserMember,
  ] = await Promise.all([
    User.countDocuments({ role: 'Member' }),
    Event.countDocuments({ eventDate: { $gte: start, $lte: end } }),
    Track.countDocuments({ status: { $nin: ['archived', 'disabled'] } }),
    Community.countDocuments(),
    FeedPost.countDocuments({ status: 'pending' }),
    StoreItem.countDocuments({ status: 'Pending' }),
    User.countDocuments({ role: 'Member', banFeedPost: true }),
  ]);

  return {
    totalUsers,
    eventsThisMonth,
    activeTracks,
    communities,
    pendingFeedPosts,
    pendingStoreItems,
    banUserMember,
  };
}

export function canSeeContent(keys: Set<string>): boolean {
  return keys.has('moderate_content') || keys.has('app_configuration');
}

export function canSeeCommunity(keys: Set<string>): boolean {
  return keys.has('manage_communities');
}

export function canSeeModeration(keys: Set<string>): boolean {
  return keys.has('moderate_content') || keys.has('manage_users');
}

export function canSeeAdminOverview(keys: Set<string>): boolean {
  return keys.has('admin.panel') || keys.has('app_configuration');
}
