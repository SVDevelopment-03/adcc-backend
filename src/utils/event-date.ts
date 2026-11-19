import dayjs from 'dayjs';

/**
 * True when the event's calendar day (server local timezone) is strictly before today.
 */
export function isEventCalendarDateInPast(eventDate: Date | string): boolean {
  const d = dayjs(eventDate).startOf('day');
  const today = dayjs().startOf('day');
  return d.isBefore(today);
}

const ABU_DHABI_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4, no DST
const HOUR_MS = 60 * 60 * 1000;

/**
 * Event dates are calendar days, but they are stored as midnight UTC. Clients that
 * format them in a timezone behind UTC (e.g. respond.io's crawler, visitors from the
 * Americas) see the previous day. Anchoring the date at 10:00 UTC of its Abu Dhabi
 * calendar day keeps it on the same day for every timezone from UTC-10 (Hawaii) to UTC+13 (NZ summer).
 */
export function toDisplayEventDate(eventDate: Date | string): Date | string {
  const time = new Date(eventDate).getTime();
  if (Number.isNaN(time)) return eventDate;
  const abuDhabiDay = new Date(time + ABU_DHABI_OFFSET_MS);
  return new Date(
    Date.UTC(abuDhabiDay.getUTCFullYear(), abuDhabiDay.getUTCMonth(), abuDhabiDay.getUTCDate()) + 10 * HOUR_MS
  );
}

/**
 * Past events must not appear as Open/Full for registration; treat as Closed in API responses.
 */
export function getEffectiveEventStatus(
  eventDate: Date | string | undefined,
  status: string | undefined
): string | undefined {
  if (!status) return status;
  if (
    eventDate &&
    isEventCalendarDateInPast(new Date(eventDate)) &&
    (status === 'Open' || status === 'Full')
  ) {
    return 'Closed';
  }
  return status;
}
