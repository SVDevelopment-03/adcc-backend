import { z } from 'zod';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

export const sendOtpSchema = z.object({
  recipient: z.preprocess(firstValue, z.string().min(6, 'Recipient phone is required')),
  sender: z.preprocess(firstValue, z.string().min(1, 'Sender is required')).optional(),
  category: z.preprocess(firstValue, z.string()).optional(),
  msgTemplate: z.preprocess(firstValue, z.string()).optional(),
});

export const verifyOtpSchema = z.object({
  recipient: z.preprocess(firstValue, z.string().min(6, 'Recipient phone is required')),
  code: z.preprocess(firstValue, z.string().min(1, 'Code is required')),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
