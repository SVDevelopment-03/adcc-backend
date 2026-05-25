import dayjs from 'dayjs';
import Event from '@/models/event.model';
import EventResult from '@/models/eventResult.model';
import User from '@/models/user.model';
import AppConfig from '@/models/app-config.model';
import notificationService from '@/services/notification.service';

const REMINDER_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const REMINDER_WINDOW_MS = 5 * 60 * 1000;

const STARTED_FLAG = Symbol.for('adcc.eventNotificationSchedulerStarted');

function getEventStartDate(eventDate?: Date | string, eventTime?: string): Date | null {
  if (!eventDate) return null;

  const datePart = dayjs(eventDate).format('YYYY-MM-DD');
  if (!datePart || !eventTime) {
    const fallback = new Date(eventDate);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const start = new Date(`${datePart}T${eventTime}:00`);
  return Number.isNaN(start.getTime()) ? new Date(eventDate) : start;
}

function formatEventTime(eventDate?: Date | string, eventTime?: string): string {
  const start = getEventStartDate(eventDate, eventTime);
  if (!start) return '';
  return start.toLocaleString();
}

async function getAllUserIds(): Promise<string[]> {
  const users = await User.find({}).select('_id').lean();
  return users.map((user: any) => String(user._id));
}

async function getParticipantIds(eventId: string, statuses: Array<'joined' | 'checked_in' | 'no_show' | 'completed'> = ['joined', 'checked_in', 'no_show', 'completed']): Promise<string[]> {
  const rows = await EventResult.find({ eventId, status: { $in: statuses } }).select('userId').lean();
  return Array.from(new Set(rows.map((row: any) => String(row.userId))));
}

async function sendToUsers(userIds: string[], title: string, body: string, url?: string) {
  if (userIds.length === 0) return false;
  try {
    await notificationService.sendNotificationToUsers(userIds, { title, body }, { url });
    return true;
  } catch (error) {
    console.error('[event-notification] sendToUsers failed', error);
    return false;
  }
}

export async function notifyEventPublished(eventId: string): Promise<boolean> {
  const event = await Event.findById(eventId).select('title eventDate eventTime publishedNotificationSentAt status').lean();
  if (!event) return false;
  if ((event as any).publishedNotificationSentAt) return false;

  const title = 'New event published';
  const body = `🚴 New event: ${event.title} is now open. Tap to register before spots fill up!`;
  const sent = await sendToUsers(await getAllUserIds(), title, body, `/events/${eventId}`);
  if (sent) {
    await Event.updateOne({ _id: eventId }, { $set: { publishedNotificationSentAt: new Date() } });
  }
  return sent;
}

export async function notifyEventRegistrationConfirmed(params: { eventId: string; userId: string }): Promise<boolean> {
  const event = await Event.findById(params.eventId).select('title eventDate eventTime').lean();
  if (!event) return false;

  const title = 'Registration confirmed';
  const when = formatEventTime(event.eventDate, event.eventTime);
  const body = when
    ? `✅ You're registered for ${event.title} on ${when}. See you there!`
    : `✅ You're registered for ${event.title}. See you there!`;

  return sendToUsers([params.userId], title, body, `/events/${params.eventId}`);
}

export async function notifyEventResultsPublished(eventId: string): Promise<boolean> {
  const event = await Event.findById(eventId).select('title resultsNotificationSentAt').lean();
  if (!event) return false;
  if ((event as any).resultsNotificationSentAt) return false;

  const participantIds = await getParticipantIds(eventId);
  const title = 'Results published';
  const body = `🏆 Results are in! Check your ranking and time for ${event.title}.`;
  const sent = await sendToUsers(participantIds, title, body, `/events/${eventId}/results`);
  if (sent) {
    await Event.updateOne({ _id: eventId }, { $set: { resultsNotificationSentAt: new Date() } });
  }
  return sent;
}

export async function notifyEventCancelled(eventId: string): Promise<boolean> {
  const event = await Event.findById(eventId).select('title cancelledNotificationSentAt').lean();
  if (!event) return false;
  if ((event as any).cancelledNotificationSentAt) return false;

  const participantIds = await getParticipantIds(eventId, ['joined', 'checked_in']);
  const title = 'Event cancelled';
  const body = `❌ ${event.title} has been cancelled. We apologise for the inconvenience.`;
  const sent = await sendToUsers(participantIds, title, body, `/events/${eventId}`);
  if (sent) {
    await Event.updateOne({ _id: eventId }, { $set: { cancelledNotificationSentAt: new Date() } });
  }
  return sent;
}

export async function notifyEventJoined(userId: string, eventId: string): Promise<boolean> {
  const event = await Event.findById(eventId).select('title eventDate eventTime').lean();
  if (!event) return false;

  const title = 'Registration confirmed';
  const when = formatEventTime(event.eventDate, event.eventTime);
  const body = when
    ? `✅ You're registered for ${event.title} on ${when}. See you there!`
    : `✅ You're registered for ${event.title}. See you there!`;

  return sendToUsers([userId], title, body, `/events/${eventId}`);
}

export async function sweepEventReminders(): Promise<void> {
  const config = await AppConfig.findOne({ key: 'default' }).select('config.notifications.eventReminders').lean();
  const remindersEnabled = (config as any)?.config?.notifications?.eventReminders ?? true;
  if (!remindersEnabled) return;

  const now = new Date();
  const minDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const events = await Event.find({
    status: { $in: ['Open', 'Full', 'Closed'] },
    eventDate: { $gte: minDate, $lte: maxDate },
  })
    .select('title eventDate eventTime reminder24hSentAt reminder1hSentAt status')
    .lean();

  for (const event of events as any[]) {
    const start = getEventStartDate(event.eventDate, event.eventTime);
    if (!start) continue;

    const diffMs = start.getTime() - now.getTime();
    if (diffMs <= 0) continue;

    const within24h = diffMs <= 24 * 60 * 60 * 1000 && diffMs > 24 * 60 * 60 * 1000 - REMINDER_WINDOW_MS;
    const within1h = diffMs <= 60 * 60 * 1000 && diffMs > 60 * 60 * 1000 - REMINDER_WINDOW_MS;

    if (within24h && !(event as any).reminder24hSentAt) {
      const participantIds = await getParticipantIds(String(event._id));
      const sent = await sendToUsers(
        participantIds,
        'Event reminder',
        `⏰ Reminder: ${event.title} is tomorrow at ${event.eventTime}. Don't forget your gear!`,
        `/events/${event._id}`
      );
      if (sent) {
        await Event.updateOne({ _id: event._id }, { $set: { reminder24hSentAt: new Date() } });
      }
    }

    if (within1h && !(event as any).reminder1hSentAt) {
      const participantIds = await getParticipantIds(String(event._id));
      const sent = await sendToUsers(
        participantIds,
        'Event reminder',
        `🏁 Your event starts in 1 hour. Head to the check-in point now!`,
        `/events/${event._id}`
      );
      if (sent) {
        await Event.updateOne({ _id: event._id }, { $set: { reminder1hSentAt: new Date() } });
      }
    }
  }
}

export function startEventNotificationScheduler(): void {
  if ((globalThis as any)[STARTED_FLAG]) return;
  (globalThis as any)[STARTED_FLAG] = true;

  const runSweep = async () => {
    try {
      await sweepEventReminders();
    } catch (error) {
      console.error('[event-notification] reminder sweep failed', error);
    }
  };

  void runSweep();
  setInterval(runSweep, REMINDER_SWEEP_INTERVAL_MS);
}
