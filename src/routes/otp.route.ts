import { Router } from 'express';
import { sendOtp, verifyOtpController } from '@/controllers/otp.controller';
import { asyncHandler } from '@/utils/async-handler';
import { sendOtpSchema, verifyOtpSchema } from '@/validators/otp.validator';
import { z } from 'zod';

const router = Router();

router.post('/send', asyncHandler(async (req, res, next) => {
  // Basic validation
  const parsed = sendOtpSchema.parse(req.body);
  req.body = parsed as any;
  return sendOtp(req, res as any);
}));

router.post('/verify', asyncHandler(async (req, res, next) => {
  const parsed = verifyOtpSchema.parse(req.body);
  req.body = parsed as any;
  return verifyOtpController(req, res as any);
}));

export default router;
