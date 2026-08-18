import { Request, Response } from 'express';
import Challenge from '@/models/challenge.model';
import Community from '@/models/community.model';
import Event from '@/models/event.model';
import StoreItem from '@/models/store-item.model';
import Track from '@/models/track.model';
import User from '@/models/user.model';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';

export const getPublicStats = asyncHandler(async (_req: Request, res: Response) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalMembers,
    activeMembers,
    upcomingEvents,
    completedEvents,
    activeTracks,
    activeCommunities,
    activeChallenges,
    approvedStoreItems,
    rideTotals,
  ] = await Promise.all([
    User.countDocuments({ role: 'Member' }),
    User.countDocuments({ role: 'Member', isVerified: true }),
    Event.countDocuments({
      status: { $in: ['Open', 'Full'] },
      eventDate: { $gte: todayStart },
    }),
    Event.countDocuments({ status: 'Completed' }),
    Track.countDocuments({ status: { $in: ['open', 'limited'] } }),
    Community.countDocuments({ isActive: true, isPublic: true }),
    Challenge.countDocuments({ status: { $in: ['Active', 'Upcoming'] } }),
    StoreItem.countDocuments({ status: 'Approved' }),
    User.aggregate<{ totalDistanceKm: number; totalRides: number }>([
      { $match: { role: 'Member', isVerified: true } },
      {
        $group: {
          _id: null,
          totalDistanceKm: { $sum: '$stats.totalDistanceKm' },
          totalRides: { $sum: '$stats.totalRides' },
        },
      },
    ]),
  ]);

  sendSuccess(
    res,
    {
      members: {
        total: totalMembers,
        active: activeMembers,
      },
      events: {
        upcoming: upcomingEvents,
        completed: completedEvents,
      },
      tracks: {
        active: activeTracks,
      },
      communities: {
        active: activeCommunities,
      },
      challenges: {
        active: activeChallenges,
      },
      storeItems: {
        approved: approvedStoreItems,
      },
      rides: {
        total: rideTotals[0]?.totalRides ?? 0,
        totalDistanceKm: rideTotals[0]?.totalDistanceKm ?? 0,
      },
    },
    'Public stats retrieved',
    200
  );
});
