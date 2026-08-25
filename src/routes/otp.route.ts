import { Router } from 'express';
import { sendOtp, verifyOtpController } from '@/controllers/otp.controller';
import { sendOtpSchema, verifyOtpSchema } from '@/validators/otp.validator';

const router = Router();

// Validate bodies before calling controllers
router.post('/send', (req, res, next) => {
  try {
    const parsed = sendOtpSchema.parse(req.body);
    req.body = parsed as any;
    return sendOtp(req, res, next);
  } catch (err) {
    return next(err);
  }
});

router.post('/verify', (req, res, next) => {
  try {
    const parsed = verifyOtpSchema.parse(req.body);
    req.body = parsed as any;
    return verifyOtpController(req, res, next);
  } catch (err) {
    return next(err);
  }
});

export default router;
