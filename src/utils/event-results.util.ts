/**
 * Parse a time string (HH:MM:SS or MM:SS) to total seconds.
 * Used for avg speed calculation and consistent ranking.
 */
export function parseTimeToSeconds(value: string | null | undefined): number | null {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const segments = trimmed.split(':').map((segment) => Number(segment));
  if (segments.some((segment) => Number.isNaN(segment) || segment < 0)) {
    return null;
  }

  if (segments.length === 3) {
    const [hours, minutes, seconds] = segments;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (segments.length === 2) {
    const [minutes, seconds] = segments;
    return minutes * 60 + seconds;
  }

  return null;
}
