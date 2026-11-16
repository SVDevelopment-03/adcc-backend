import { rateLimit, type Options } from 'express-rate-limit';

/**
 * Per-IP request limits for sign-in, OTP and public forms.
 * The API runs behind nginx, so server.ts sets `trust proxy` to read the real client IP.
 * Set RATE_LIMIT_DISABLED=true to switch these off (local test runs only).
 */
const disabled = () => process.env.RATE_LIMIT_DISABLED === 'true';

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

const build = (limit: number, message: string, extra: Partial<Options> = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => disabled() || req.method === 'OPTIONS',
    handler: (_req, res) => {
      res.status(429).json({ success: false, message });
    },
    ...extra,
  });

/** Email login, register, Firebase verify, forgot/reset password. */
export const authLimiter = build(
  Number(process.env.RATE_LIMIT_AUTH_MAX) || 30,
  'Too many sign-in attempts. Please wait a few minutes and try again.'
);

/** Sending an SMS code (each one costs money). */
export const otpSendLimiter = build(
  Number(process.env.RATE_LIMIT_OTP_SEND_MAX) || 5,
  'Too many verification codes requested. Please wait a few minutes and try again.'
);

/** Checking an SMS code. */
export const otpVerifyLimiter = build(
  Number(process.env.RATE_LIMIT_OTP_VERIFY_MAX) || 20,
  'Too many verification attempts. Please wait a few minutes and try again.'
);

/** Public forms: contact, newsletter, Laffah registration. Only POSTs count. */
export const publicFormLimiter = build(
  Number(process.env.RATE_LIMIT_FORM_MAX) || 10,
  'Too many submissions. Please wait a few minutes and try again.',
  { skip: (req) => disabled() || req.method !== 'POST' }
);
