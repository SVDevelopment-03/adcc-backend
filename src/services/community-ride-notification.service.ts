import CommunityRide from '@/models/community-ride.model';
import CommunityRideParticipation from '@/models/community-ride-participation.model';
import User from '@/models/user.model';
import notificationService from '@/services/notification.service';

const REMINDER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_WINDOW_MS = 5 * 60 * 1000;
const STARTED_FLAG = Symbol.for('adcc.communityRideNotificationSchedulerStarted');

function getRideStartDate(date?: Date | string, time?: string): Date | null {
  if (!date) return null;

  const rideDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(rideDate.getTime())) return null;

  if (!time) return rideDate;

  const datePart = rideDate.toISOString().slice(0, 10);
  const start = new Date(`${datePart}T${time}:00`);
  return Number.isNaN(start.getTime()) ? rideDate : start;
}

async function getAllUserIds(): Promise<string[]> {
  const users = await User.find({}).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function getRideParticipantIds(rideId: string): Promise<string[]> {
  const rows = await CommunityRideParticipation.find({ rideId, status: 'joined' }).select('userId').lean();
  return Array.from(new Set(rows.map((row: any) => String(row.userId))));
}

async function sendToUsers(userIds: string[], title: string, body: string, url?: string) {
  if (userIds.length === 0) return { successCount: 0, failureCount: 0 };
  try {
    const results = await notificationService.sendNotificationToUsers(userIds, { title, body }, { url });
    return results.reduce(
      (totals, entry) => {
        const result = entry.result as { successCount?: number; failureCount?: number } | undefined;
        totals.successCount += result?.successCount ?? 0;
        totals.failureCount += result?.failureCount ?? 0;
        return totals;
      },
      { successCount: 0, failureCount: 0 }
    );
  } catch (error) {
    console.error('[community-ride-notification] sendToUsers failed', error);
    return { successCount: 0, failureCount: 0 };
  }
}

export async function notifyCommunityRidePublished(rideId: string): Promise<boolean> {
  const ride = await CommunityRide.findById(rideId).select('title status publishedNotificationSentAt').lean();
  if (!ride) return false;
  if ((ride as any).publishedNotificationSentAt) return false;
  if ((ride as any).status !== 'active') return false;

  const recipients = await getAllUserIds();
  const result = await sendToUsers(
    recipients,
    'New ride added near you',
    `🗓 A new community ride has been scheduled. Tap to view details and join!`,
    `/community-rides/${rideId}`
  );

  if (result.successCount || result.failureCount) {
    await CommunityRide.updateOne({ _id: rideId }, { $set: { publishedNotificationSentAt: new Date() } });
    return true;
  }

  return false;
}

function formatRideWhen(start: Date): string {
  const datePart = start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const timePart = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${datePart} at ${timePart}`;
}

export async function notifyCommunityRideJoined(params: { rideId: string; userId: string }): Promise<boolean> {
  const ride = await CommunityRide.findById(params.rideId).select('title date time').lean();
  if (!ride) return false;

  const start = getRideStartDate((ride as any).date, (ride as any).time);
  const when = start ? formatRideWhen(start) : '';
  const body = when
    ? `✅ You're registered for ${ride.title} on ${when}. See you on the road!`
    : `✅ You're registered for ${ride.title}. See you on the road!`;

  const result = await sendToUsers([params.userId], 'Ride registration confirmed', body, `/community-rides/${params.rideId}`);
  return result.successCount > 0 || result.failureCount > 0;
}

export async function sweepCommunityRideReminders(): Promise<void> {
  const now = new Date();
  const minDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const rides = await CommunityRide.find({
    status: 'active',
    date: { $gte: minDate, $lte: maxDate },
  })
    .select('title date time reminder24hSentAt status')
    .lean();

  for (const ride of rides as any[]) {
    const start = getRideStartDate(ride.date, ride.time);
    if (!start) continue;
    if (ride.reminder24hSentAt) continue;

    const diffMs = start.getTime() - now.getTime();
    if (diffMs <= 0) continue;

    const within24h = diffMs <= 24 * 60 * 60 * 1000 && diffMs > 24 * 60 * 60 * 1000 - REMINDER_WINDOW_MS;
    if (!within24h) continue;

    const participantIds = await getRideParticipantIds(String(ride._id));
    const result = await sendToUsers(
      participantIds,
      'Ride starts tomorrow',
      `🚴 Your community ride starts tomorrow at ${ride.time}. Check the meeting point in the app!`,
      `/community-rides/${ride._id}`
    );

    if (result.successCount || result.failureCount) {
      await CommunityRide.updateOne({ _id: ride._id }, { $set: { reminder24hSentAt: new Date() } });
    }
  }
}

export function startCommunityRideNotificationScheduler(): void {
  if ((globalThis as any)[STARTED_FLAG]) return;
  (globalThis as any)[STARTED_FLAG] = true;

  const runSweep = async () => {
    try {
      await sweepCommunityRideReminders();
    } catch (error) {
      console.error('[community-ride-notification] reminder sweep failed', error);
    }
  };

  void runSweep();
  setInterval(runSweep, REMINDER_SWEEP_INTERVAL_MS);
}

export default {
  notifyCommunityRidePublished,
  notifyCommunityRideJoined,
  sweepCommunityRideReminders,
  startCommunityRideNotificationScheduler,
};