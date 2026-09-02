export const normalizePhone = (input?: string | null): string | null => {
  if (!input) return null;
  const raw = String(input).trim();
  if (raw.startsWith('+')) return raw;
  // If already has country code without plus
  if (/^971\d{8,9}$/.test(raw)) return `+${raw}`;
  // UAE local 5XXXXXXXX
  if (/^5\d{8}$/.test(raw)) return `+971${raw}`;
  // Local with leading zero e.g. 05XXXXXXXX
  if (/^0\d{8,9}$/.test(raw)) return `+971${raw.replace(/^0/, '')}`;
  // Fallback: strip non-digits and prefix + if looks like international
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length <= 15) return digits.startsWith('971') ? `+${digits}` : `+${digits}`;
  return raw;
};

export default normalizePhone;
