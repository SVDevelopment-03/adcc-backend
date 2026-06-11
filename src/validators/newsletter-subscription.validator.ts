import { z } from 'zod';

export const createNewsletterSubscriptionSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .max(254, 'Email is too long')
      .email('Please enter a valid email address')
      .transform((value) => value.toLowerCase()),
    source: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type CreateNewsletterSubscriptionInput = z.infer<
  typeof createNewsletterSubscriptionSchema
>;
