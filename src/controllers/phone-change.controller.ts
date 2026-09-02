import { Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';
import { AppError } from '@/utils/app-error';
import { verifyOtp, clearOtp } from '@/services/otp.store';
import User from '@/models/user.model';
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
export const confirmPhoneChange = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = resolveRequestLanguage(req);
  const userId = req.user?.id;
  if (!userId) throw new AppError(t(lang, 'auth.unauthorized'), 401);

  const { newPhone, oldCode, newCode } = req.body as {
    newPhone: string;
    oldCode: string;
    newCode: string;
  };

  const user = await User.findById(userId);
  if (!user) throw new AppError(t(lang, 'user.not_found'), 404);

  if (!user.phone) throw new AppError('Current phone not set for user', 400);

  // Verify OTP for old phone
  const okOld = verifyOtp(user.phone, oldCode);
  if (!okOld) throw new AppError('Invalid or expired OTP for current (old) phone', 400);

  // Verify OTP for new phone
  const okNew = verifyOtp(newPhone, newCode);
  if (!okNew) {
    // Clear old OTP only if new fails? old already consumed by verifyOtp when okOld true.
    throw new AppError('Invalid or expired OTP for new phone', 400);
  }

  // Ensure new phone not already used by another user
  const existing = await User.findOne({ phone: newPhone });
  if (existing && existing._id.toString() !== user._id.toString()) {
    throw new AppError('Phone number already in use', 400);
  }

  // Update user phone and set isVerified true (phone verified)
  user.phone = newPhone;
  user.isVerified = true;
  await user.save();

  // Best-effort update to Firebase auth profile if linked
  if (user.firebaseUid) {
    try {
      await updateFirebasePhone(user.firebaseUid, newPhone);
    } catch (err) {
      // Log but do not fail the request
      console.error('Failed to update Firebase phone for user', user._id, err);
    }
  }

  // Clear OTP entries for newPhone just in case
  try {
    clearOtp(newPhone);
  } catch (e) {
    // ignore
  }

  sendSuccess(res, { id: user._id, phone: user.phone }, t(lang, 'user.updated'));
});

export default { confirmPhoneChange };
