import { Router } from 'express';
import { otpSendLimiter, otpVerifyLimiter } from '@/middleware/rate-limit.middleware';
import { validate } from '@/middleware/validate.middleware';
import { sendOtp, verifyOtpController } from '@/controllers/otp.controller';
import { sendOtpSchema, verifyOtpSchema } from '@/validators/otp.validator';

const router = Router();

// Invalid bodies get a 400 with field errors (same as every other route).
router.post('/send', otpSendLimiter, validate(sendOtpSchema), sendOtp);
router.post('/verify', otpVerifyLimiter, validate(verifyOtpSchema), verifyOtpController);

export default router;
