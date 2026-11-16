/**
 * Simple in-memory OTP store with TTL.
 * Note: This is ephemeral and will be lost on process restart.
 *
 * Protection against guessing and SMS abuse:
 * - a code is cancelled after MAX_ATTEMPTS wrong tries (a new code must be requested);
 * - a new code for the same number can only be sent once every RESEND_COOLDOWN_MS.
 */
type OtpEntry = {
  code: string;
  expiresAt: number; // epoch ms
  attempts: number;
  sentAt: number; // epoch ms
};

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const store = new Map<string, OtpEntry>();

/** Seconds until another code may be sent to this number (0 = may send now). */
export const getResendWaitSeconds = (phone: string) => {
  const entry = store.get(normalize(phone));
  if (!entry || Date.now() > entry.expiresAt) return 0;
  const wait = entry.sentAt + OTP_RESEND_COOLDOWN_MS - Date.now();
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
};

export const setOtp = (phone: string, code: string, ttlSeconds = 300) => {
  const key = normalize(phone);
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  store.set(key, { code, expiresAt, attempts: 0, sentAt: now });
  // Schedule deletion
  setTimeout(() => {
    const cur = store.get(key);
    if (cur && cur.expiresAt <= Date.now()) store.delete(key);
  }, ttlSeconds * 1000 + 1000).unref?.();
};

export const verifyOtp = (phone: string, code: string) => {
  const key = normalize(phone);
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return false;
  }
  const ok = entry.code === String(code ?? '').trim();
  if (ok) {
    store.delete(key);
    return true;
  }
  entry.attempts += 1;
  if (entry.attempts >= OTP_MAX_ATTEMPTS) store.delete(key);
  return false;
};

export const clearOtp = (phone: string) => {
  store.delete(normalize(phone));
};

const normalize = (phone: string) => {
  if (!phone || typeof phone !== 'string') return '';
  // Remove all non-digit characters so '+971...' and '971...' match
  return phone.replace(/\D+/g, '').trim();
};

export default { setOtp, verifyOtp, clearOtp, getResendWaitSeconds };
