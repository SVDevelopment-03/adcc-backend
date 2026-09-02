import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';
import { AppError } from '@/utils/app-error';
import { setOtp, verifyOtp } from '@/services/otp.store';
import { normalizePhone } from '@/utils/phone.util';
import nexusService from '@/services/nexus.service';
import crypto from 'node:crypto';
import User from '@/models/user.model';
import { generateTokens } from '@/utils/jwt.util';
import { t } from '@/utils/i18n';
import { resolveRequestLanguage } from '@/utils/localization';

/**
 * POST /v1/otp/send
 * body: { recipient, sender?, category?, msgTemplate? }
 */
export const sendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { recipient, sender = 'ADDARRAJA', category = 'TXN', msgTemplate } = req.body as {
    recipient: string;
    sender?: string;
    category?: string;
    msgTemplate?: string;
  };

  if (!recipient) throw new AppError('Recipient phone number is required', 400);

  const normalizedRecipient = normalizePhone(recipient) || recipient;


  // Generate 6-digit code
  const code = (Math.floor(100000 + Math.random() * 900000)).toString();

  // TTL in seconds (default 5 minutes)
  const ttlSeconds = 300;
  const ttlMinutes = Math.floor(ttlSeconds / 60);

  // Default Royal Formal bilingual template (Arabic then English)
  //TODO: change this template to your own branding and wording. You can also provide a custom template in the request body.
  const defaultTemplate =
    'دراجة (Darraja): رمز التحقق الخاص بك هو {code} — صالح لمدة {expiry} دقيقة. الرجاء عدم مشاركة هذا الرمز مع أي شخص.\n' +
    'Darraja: Your verification code is {code}. It is valid for {expiry} minutes. Please do not share this code.';

  // Prepare message by replacing placeholders if provided template includes them
  let messageTemplateToUse = msgTemplate && typeof msgTemplate === 'string' && msgTemplate.trim().length > 0
    ? msgTemplate
    : defaultTemplate;

  // Replace placeholders {code} and {expiry}
  const message = messageTemplateToUse
    .replace(/\{code\}/g, code)
    .replace(/\{expiry\}/g, String(ttlMinutes));

  // Store OTP in memory with TTL
  // Store OTP keyed by normalized recipient so verify uses same key
  setOtp(normalizedRecipient, code, ttlSeconds);

  // Send via Nexus
  // TODO: SMS OTP send point — server forwards OTP SMS to Nexus gateway here.
  // If you need to intercept or mock SMS delivery (tests/dev), patch here.
  await nexusService.sendSmsViaNexus({ msg: message, recipient: normalizedRecipient, sender, category });

  sendSuccess(res, { recipient: normalizedRecipient, expiresIn: 300 }, 'OTP sent');
});

/**
 * POST /v1/otp/verify
 * body: { recipient, code }
 */
export const verifyOtpController = asyncHandler(async (req: Request, res: Response) => {
  const { recipient, code } = req.body as { recipient: string; code: string };
  if (!recipient || !code) throw new AppError('Recipient and code are required', 400);

  // Normalize recipient same as sendOtp
  const normalizeRecipient = (r: string) => {
    if (!r) return r;
    const raw = String(r).trim();
    if (raw.startsWith('+')) return raw;
    if (/^971\d{8,9}$/.test(raw)) return `+${raw}`;
    if (/^5\d{8}$/.test(raw)) return `+971${raw}`;
    if (/^0\d{8,9}$/.test(raw)) return `+971${raw.replace(/^0/, '')}`;
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) return digits.startsWith('971') ? `+${digits}` : `+${digits}`;
    return raw;
  };

  const normalizedRecipient = normalizeRecipient(recipient);

  const ok = verifyOtp(normalizedRecipient, code);
  if (!ok) throw new AppError('Invalid or expired OTP', 400);

  // If a user exists with this phone, issue JWT tokens; otherwise return isNewUser
  const user = await User.findOne({ phone: normalizedRecipient });
  if (user) {
    const tokens = generateTokens({ id: user._id.toString(), uid: user._id.toString(), phone: user.phone || '' });

    // Store refresh token in DB (simple expiry adding similar to auth flow)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push({ token: tokens.refreshToken, expiresAt, createdAt: new Date() } as any);
    await user.save();

    const lang = resolveRequestLanguage(req);
    sendSuccess(res, { user: { id: user._id, phone: user.phone, fullName: user.fullName }, ...tokens }, t(lang, 'auth.login_success'));
  } else {
    // New user flow: return isNewUser with temporary tokens
    const uid = crypto.randomUUID();
    const tokens = generateTokens({ uid, phone: recipient });
    const lang = resolveRequestLanguage(req);
    sendSuccess(res, { isNewUser: true, uid, phone: recipient, ...tokens }, t(lang, 'auth.verify_success'));
  }
});
