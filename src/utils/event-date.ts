import dayjs from 'dayjs';

/**
 * True when the event's calendar day (server local timezone) is strictly before today.
 */
export function isEventCalendarDateInPast(eventDate: Date | string): boolean {
  const d = dayjs(eventDate).startOf('day');
  const today = dayjs().startOf('day');
  return d.isBefore(today);
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
