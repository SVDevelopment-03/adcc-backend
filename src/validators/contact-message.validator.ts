import { z } from 'zod';

export const createContactMessageSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(120, 'First name is too long'),
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .max(254, 'Email is too long')
      .email('Please enter a valid email address')
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().max(30, 'Phone number is too long').optional(),
    message: z.string().trim().min(1, 'Message is required').max(4000, 'Message is too long'),
  })
  .strict();

export type CreateContactMessageInput = z.infer<typeof createContactMessageSchema>;
