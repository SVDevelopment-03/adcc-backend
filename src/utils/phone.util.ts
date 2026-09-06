export const normalizePhone = (input?: string | null): string | null => {
  if (!input) return null;

  const raw = String(input).trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;

  const withoutPrefix = digits.startsWith('971') ? digits.slice(3) : digits;
  const dedupedDigits = withoutPrefix.startsWith('971') ? withoutPrefix.slice(3) : withoutPrefix;

  if (/^5\d{8}$/.test(dedupedDigits)) return `+971${dedupedDigits}`;
  if (/^\d{9}$/.test(dedupedDigits) && dedupedDigits.startsWith('5')) return `+971${dedupedDigits}`;
  if (/^\d{9}$/.test(dedupedDigits) && dedupedDigits.startsWith('0')) return `+971${dedupedDigits.slice(1)}`;
  if (/^971\d{8,9}$/.test(digits)) return `+${digits}`;
  if (/^\d{8,9}$/.test(dedupedDigits)) return `+971${dedupedDigits}`;

  return `+${digits}`;
};

export const getPhoneLookupVariants = (input?: string | null): string[] => {
  const normalized = normalizePhone(input);
  if (!normalized) return [];

  const digits = normalized.replace(/\D/g, '');
  const variants = new Set<string>();

  variants.add(normalized);
  variants.add(`+${digits}`);
  variants.add(digits);
  variants.add(digits.replace(/^971/, ''));
  variants.add(`971${digits.replace(/^971/, '')}`);

  if (digits.startsWith('971') && digits.length > 3) {
    variants.add(`+971${digits.slice(3)}`);
    variants.add(`971${digits.slice(3)}`);
  }

  if (digits.length === 9 && digits.startsWith('5')) {
    variants.add(`+971${digits}`);
    variants.add(`971${digits}`);
  }

  if (digits.length === 10 && digits.startsWith('05')) {
    variants.add(`+971${digits.slice(1)}`);
    variants.add(`971${digits.slice(1)}`);
  }

  return [...variants].filter(Boolean);
};

export default normalizePhone;
