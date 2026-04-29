import { Response } from 'express';
import dayjs from 'dayjs';
import User from '@/models/user.model';
import Event from '@/models/event.model';
import Track from '@/models/track.model';
import Community from '@/models/community.model';
import FeedPost from '@/models/feed-post.model';
import StoreItem from '@/models/store-item.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AuthRequest } from '@/middleware/auth.middleware';
import { t } from '@/utils/i18n';
import { SupportedLanguage } from '@/utils/localization';
import { localizeEventPayload } from '@/utils/event-payload';
import { localizeTrack } from '@/utils/track-payload';
import { AppError } from '@/utils/app-error';
import { getEffectivePermissionKeys } from '@/services/rbac.service';
import type { StaffDashboardQuery } from '@/validators/dashboard.validator';
import {
  BannerGroupQuery,
  canSeeAdminOverview,
  canSeeCommunity,
  canSeeContent,
  canSeeModeration,
  fetchAdminOverviewMetrics,
  fetchCommunityMetrics,
  fetchContentMetrics,
  fetchModerationMetrics,
} from '@/services/dashboard.service';

function parseDashboardYear(queryYear: unknown): number {
  const raw = Array.isArray(queryYear) ? queryYear[0] : queryYear;
  const y =
    typeof raw === 'string'
      ? Number.parseInt(raw, 10)
      : typeof raw === 'number'
        ? raw
        : NaN;
  if (Number.isFinite(y) && y >= 2000 && y <= 2100) {
    return y;
  }
  return dayjs().year();
}

/** Communities created per calendar month for a year (Jan–Dec), zeros where none. */
async function getCommunityCreatedByMonth(year: number) {
  const yearStart = dayjs().year(year).startOf('year').toDate();
  const yearEnd = dayjs().year(year).endOf('year').toDate();

  const grouped = await Community.aggregate<{ _id: number; count: number }>([
    {
      $match: {
        createdAt: { $gte: yearStart, $lte: yearEnd },
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const countByMonth = new Map<number, number>();
  for (const row of grouped) {
    countByMonth.set(row._id, Number(row.count || 0));
  }

  const series = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return {
      month,
      label: `${year}-${String(month).padStart(2, '0')}`,
      count: countByMonth.get(month) ?? 0,
    };
  });

  return {
    year,
    range: {
      from: yearStart.toISOString(),
      to: yearEnd.toISOString(),
    },
    series,
  };
}

function parseTracksLimit(queryLimit: unknown): number {
  const raw = Array.isArray(queryLimit) ? queryLimit[0] : queryLimit;
  const n =
    typeof raw === 'string'
      ? Number.parseInt(raw, 10)
      : typeof raw === 'number'
        ? raw
        : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 500) {
    return Math.floor(n);
  }
  return 200;
}

/**
 * Full track detail (same localization as GET /tracks/:id), plus total events using this track, highest first.
 */
async function getTracksRankedByEventCount(lang: SupportedLanguage, limit: number) {
  const countsAgg = await Event.aggregate<{ _id: unknown; eventCount: number }>([
    { $match: { trackId: { $exists: true, $ne: null } } },
    { $group: { _id: '$trackId', eventCount: { $sum: 1 } } },
  ]);

  const countByTrackId = new Map<string, number>();
  for (const row of countsAgg) {
    if (row._id != null) {
      countByTrackId.set(String(row._id), Number(row.eventCount || 0));
    }
  }

  const allTracks = await Track.find({}).populate('createdBy', 'fullName email').lean();

  const ranked = allTracks
    .map((tr) => {
      const id = String(tr._id);
      return {
        eventCount: countByTrackId.get(id) ?? 0,
        track: localizeTrack(tr as Record<string, any>, lang),
      };
    })
    .sort((a, b) => {
      if (b.eventCount !== a.eventCount) {
        return b.eventCount - a.eventCount;
      }
      return String(a.track.title || '').localeCompare(String(b.track.title || ''));
    });

  return ranked.slice(0, limit);
}

/**
 * Admin/staff dashboard landing: aggregate counts and next upcoming event (same shape as GET /events/:id).
 * GET /v1/dashboard/landing
 * Optional query: `year` (2000–2100) — calendar year for community monthly stats (default: current year).
 * Optional query: `tracksLimit` (1–500) — max tracks in `tracksRankedByEvents` (default: 200).
 */
export const getDashboardLanding = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as { lang?: string }).lang || 'en') as SupportedLanguage;
  const statsYear = parseDashboardYear(req.query?.year);
  const tracksLimit = parseTracksLimit(req.query?.tracksLimit);

  const monthStart = dayjs().startOf('month').toDate();
  const monthEnd = dayjs().endOf('month').toDate();
  const todayStart = dayjs().startOf('day').toDate();

  const upcomingFilter = {
    status: { $in: ['Open', 'Full'] as const },
    eventDate: { $gte: todayStart },
  };

  const [
    totalUsers,
    maleUsers,
    femaleUsers,
    activeUsers,
    eventsThisMonth,
    activeTracks,
    activeCommunities,
    pendingFeedPosts,
    pendingStoreItems,
    reportedFeedPosts,
    upcomingEventDoc,
    communityStatsByMonth,
    tracksRankedByEvents,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ gender: 'Male' }),
    User.countDocuments({ gender: 'Female' }),
    User.countDocuments({ isVerified: true }),
    Event.countDocuments({
      eventDate: { $gte: monthStart, $lte: monthEnd },
    }),
    Track.countDocuments({ status: { $in: ['open', 'limited'] } }),
    Community.countDocuments({ isActive: true }),
    FeedPost.countDocuments({ status: 'pending' }),
    StoreItem.countDocuments({ status: 'Pending' }),
    FeedPost.countDocuments({ reported: true }),
    Event.findOne(upcomingFilter)
      .populate('createdBy', 'fullName email profileImage')
      .populate('trackId')
      .populate('communityId')
      .sort({ eventDate: 1, createdAt: -1 })
      .lean(),
    getCommunityCreatedByMonth(statsYear),
    getTracksRankedByEventCount(lang, tracksLimit),
  ]);

  const upcomingEvent = upcomingEventDoc
    ? localizeEventPayload(upcomingEventDoc as Record<string, any>, lang)
    : null;

  sendSuccess(
    res,
    {
      stats: {
        totalUsers,
        maleUsers,
        femaleUsers,
        /** Verified users (`isVerified`). */
        activeUsers,
        eventsThisMonth,
        /** Tracks open for riding (status open or limited). */
        activeTracks,
        /** Communities with isActive true. */
        activeCommunities,
        pendingFeedPosts,
        pendingStoreItems,
        reportedFeedPosts,
      },
      upcomingEvent,
      /** New communities per month for the selected calendar year (by `createdAt`). */
      communityStatsByMonth,
      /** Tracks with full localized detail; `eventCount` = all events referencing `trackId`; highest first. */
      tracksRankedByEvents,
      meta: {
        eventsThisMonthRange: {
          from: monthStart.toISOString(),
          to: monthEnd.toISOString(),
        },
        tracksLimit,
      },
    },
    t(lang, 'dashboard.landing_retrieved'),
    200
  );
});

/**
 * Staff dashboard: one response, sections filled from RBAC (community-manager, moderator, admin, etc.).
 * GET /v1/dashboard/summary
 */
export const getStaffDashboardSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = (((req as any).lang || 'en') as string) ?? 'en';
  const userId = req.user?.id;

  if (!userId || req.user?.isGuest) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const keys = await getEffectivePermissionKeys(userId);
  const q = req.query as unknown as StaffDashboardQuery & BannerGroupQuery;

  const [content, community, moderation, admin] = await Promise.all([
    canSeeContent(keys) ? fetchContentMetrics(q) : Promise.resolve(undefined),
    canSeeCommunity(keys) ? fetchCommunityMetrics(q) : Promise.resolve(undefined),
    canSeeModeration(keys) ? fetchModerationMetrics(keys, q) : Promise.resolve(undefined),
    canSeeAdminOverview(keys) ? fetchAdminOverviewMetrics() : Promise.resolve(undefined),
  ]);

  const sections: Record<string, unknown> = {};
  if (content !== undefined) sections.content = content;
  if (community !== undefined) sections.community = community;
  if (moderation !== undefined) sections.moderation = moderation;
  if (admin !== undefined) sections.admin = admin;


  sendSuccess(
    res,
    {
permissionKeys: [...keys].sort(),
      sections,
    },
    t(lang, 'dashboard.summary'),

200
  );
});
