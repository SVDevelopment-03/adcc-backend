import { Response } from 'express';
import crypto from 'node:crypto';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';
import { AppError } from '@/utils/app-error';
import { verifyOtp, clearOtp } from '@/services/otp.store';
import { normalizePhone } from '@/utils/phone.util';
import User from '@/models/user.model';
import PhoneChangeToken from '@/models/phoneChangeToken.model';
import { AuthRequest } from '@/middleware/auth.middleware';
import { t } from '@/utils/i18n';
import { resolveRequestLanguage } from '@/utils/localization';
import { updateFirebasePhone } from '@/services/firebase.service';

/**
 * POST /user/phone-change/confirm
 * body: { newPhone, oldCode, newCode }
 * Authenticated user only. Verifies OTP sent to current (old) phone and to new phone,
 * then updates DB and Firebase (best-effort).
 */
/**
 * Start phone-change flow: verify OTP on current phone and issue a short-lived change token
 * POST /user/phone-change/start { oldCode }
 */
export const startPhoneChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = resolveRequestLanguage(req);
  const userId = req.user?.id;
  if (!userId) throw new AppError(t(lang, 'auth.unauthorized'), 401);

  const { oldCode } = req.body as { oldCode: string };

  const user = await User.findById(userId);
  if (!user) throw new AppError(t(lang, 'user.not_found'), 404);
  if (!user.phone) throw new AppError('Current phone not set for user', 400);

  const okOld = verifyOtp(user.phone, oldCode);
  if (!okOld) throw new AppError('Invalid or expired OTP for current (old) phone', 400);

  // Generate token and persist
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await PhoneChangeToken.create({ userId: user._id, token, expiresAt, used: false });

  sendSuccess(res, { changeToken: token, expiresIn: 15 * 60 }, 'Change token issued');
});


/**
 * Confirm phone-change: provide changeToken, newPhone, newCode
 * POST /user/phone-change/confirm { changeToken, newPhone, newCode }
 */
export const confirmPhoneChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = resolveRequestLanguage(req);
  const userId = req.user?.id;
  if (!userId) throw new AppError(t(lang, 'auth.unauthorized'), 401);

  const { changeToken, newPhone, newCode } = req.body as {
    changeToken: string;
    newPhone: string;
    newCode: string;
  };

  const normalizedNewPhone = normalizePhone(newPhone) || newPhone;

  const tokenDoc = await PhoneChangeToken.findOne({ token: changeToken });
  if (!tokenDoc) throw new AppError('Invalid change token', 400);
  if (tokenDoc.used) throw new AppError('Change token already used', 400);
  if (tokenDoc.expiresAt < new Date()) throw new AppError('Change token expired', 400);
  if (tokenDoc.userId.toString() !== userId) throw new AppError('Change token does not belong to user', 403);

  // Verify OTP for new phone (use normalized format)
  const okNew = verifyOtp(normalizedNewPhone, newCode);
  if (!okNew) throw new AppError('Invalid or expired OTP for new phone', 400);

  // Ensure new phone not already used by another user
  const existing = await User.findOne({ phone: normalizedNewPhone });
  if (existing && existing._id.toString() !== userId) {
    throw new AppError('Phone number already in use', 400);
  }

  // Update user phone and mark token used
  const user = await User.findById(userId);
  if (!user) throw new AppError(t(lang, 'user.not_found'), 404);

  user.phone = normalizedNewPhone;
  user.isVerified = true;
  await user.save();

  tokenDoc.used = true;
  await tokenDoc.save();

  // Best-effort update to Firebase auth profile if linked
  if (user.firebaseUid) {
    try {
      await updateFirebasePhone(user.firebaseUid, newPhone);
    } catch (err) {
      console.error('Failed to update Firebase phone for user', user._id, err);
    }
  }

  // Clear OTP entries for newPhone just in case
  try {
    clearOtp(normalizedNewPhone);
  } catch (e) {
    // ignore
  }

  sendSuccess(res, { id: user._id, phone: user.phone }, t(lang, 'user.updated'));
});

// exported functions: startPhoneChange, confirmPhoneChange
