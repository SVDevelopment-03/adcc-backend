import mongoose from 'mongoose';
import EventResult from '@/models/eventResult.model';
import EventLead from '@/models/event-lead.model';

/** EventResult statuses that mean the rider is (or was) registered for the event. */
export const ACTIVE_PARTICIPANT_STATUSES = ['joined', 'checked_in', 'no_show', 'completed'] as const;

const toObjectIds = (ids: string[]) =>
  ids.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));

/**
 * Per event: app registrations (EventResult) and website registration-form
 * submissions (EventLead), in two queries.
 */
export const getParticipantCounts = async (
  eventIds: string[]
): Promise<{ app: Map<string, number>; form: Map<string, number> }> => {
  const app = new Map<string, number>();
  const form = new Map<string, number>();
  const ids = toObjectIds(eventIds);
  if (ids.length === 0) return { app, form };

  const [appCounts, websiteCounts] = await Promise.all([
    EventResult.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { eventId: { $in: ids }, status: { $in: [...ACTIVE_PARTICIPANT_STATUSES] } } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ]),
    EventLead.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { eventId: { $in: ids } } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ]),
  ]);

  for (const { _id, count } of appCounts) app.set(String(_id), count);
  for (const { _id, count } of websiteCounts) form.set(String(_id), count);
  return { app, form };
};

/**
 * On localized event payloads sets:
 * - `currentParticipants`: app registrations (used by the mobile app and spot counts)
 * - `formParticipants`: website registration-form submissions (the website's participant count)
 * - `showParticipants`: true only when the website form has registrations; otherwise the
 *   website hides the participant count and list.
 */
export const attachParticipantCounts = async <T extends Record<string, any>>(events: T[]): Promise<T[]> => {
  const { app, form } = await getParticipantCounts(events.map((event) => String(event._id)));
  for (const event of events as Record<string, any>[]) {
    const key = String(event._id);
    event.currentParticipants = app.get(key) ?? 0;
    event.formParticipants = form.get(key) ?? 0;
    event.showParticipants = event.formParticipants > 0;
  }
  return events;
};

