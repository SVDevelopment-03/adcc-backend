export const normalizePhone = (input?: string | null): string | null => {
  if (!input) return null;

  const raw = String(input).trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;

  // Remove repeated country code if already present, e.g. +9719715... or 9719715...
  const withoutPrefix = digits.startsWith('971') ? digits.slice(3) : digits;
  const dedupedDigits = withoutPrefix.startsWith('971') ? withoutPrefix.slice(3) : withoutPrefix;

  // UAE local formats
  if (/^5\d{8}$/.test(dedupedDigits)) return `+971${dedupedDigits}`;
  if (/^\d{9}$/.test(dedupedDigits) && dedupedDigits.startsWith('5')) return `+971${dedupedDigits}`;
  if (/^\d{9}$/.test(dedupedDigits) && dedupedDigits.startsWith('0')) return `+971${dedupedDigits.slice(1)}`;

  if (/^971\d{8,9}$/.test(digits)) return `+${digits}`;
  if (/^\d{8,9}$/.test(dedupedDigits)) return `+971${dedupedDigits}`;

  return `+${digits}`;
};

export default normalizePhone;
