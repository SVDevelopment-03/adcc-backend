import { z } from 'zod';

export const createNewsletterSubscriptionSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'Email is required')
      .email('Please enter a valid email address')
      .transform((email) => email.toLowerCase()),
    source: z.string().trim().min(1).optional(),
  })
  .strict();

export type CreateNewsletterSubscriptionInput = z.infer<
  typeof createNewsletterSubscriptionSchema
>;
