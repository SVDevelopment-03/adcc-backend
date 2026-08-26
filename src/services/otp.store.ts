/**
 * Simple in-memory OTP store with TTL.
 * Note: This is ephemeral and will be lost on process restart. Suitable for quick testing.
 */
type OtpEntry = {
  code: string;
  expiresAt: number; // epoch ms
};

const store = new Map<string, OtpEntry>();

export const setOtp = (phone: string, code: string, ttlSeconds = 300) => {
  const key = normalize(phone);
  const expiresAt = Date.now() + ttlSeconds * 1000;
  store.set(key, { code, expiresAt });
  // Schedule deletion
  setTimeout(() => {
    const cur = store.get(key);
    if (cur && cur.expiresAt <= Date.now()) store.delete(key);
  }, ttlSeconds * 1000 + 1000);
};

export const verifyOtp = (phone: string, code: string) => {
  const key = normalize(phone);
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return false;
  }
  const ok = entry.code === code;
  if (ok) store.delete(key);
  return ok;
};

export const clearOtp = (phone: string) => {
  store.delete(normalize(phone));
};

const normalize = (phone: string) => {
  if (!phone || typeof phone !== 'string') return '';
  // Remove all non-digit characters so '+971...' and '971...' match
  return phone.replace(/\D+/g, '').trim();
};

export default { setOtp, verifyOtp, clearOtp };
