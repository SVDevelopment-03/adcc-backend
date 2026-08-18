import { z } from 'zod';

const categoryEnum = z.enum([
  'event',
  'community',
  'tracks',
  'store',
  'feed_moderation',
]);

export const listAdminNotificationsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((s) => {
      if (s === undefined || s === '') return 1;
      const n = parseInt(s, 10);
      return Number.isNaN(n) ? 1 : Math.max(1, n);
    }),
  limit: z
    .string()
    .optional()
    .transform((s) => {
      if (s === undefined || s === '') return 20;
      const n = parseInt(s, 10);
      if (Number.isNaN(n)) return 20;
      return Math.min(100, Math.max(1, n));
    }),
  category: categoryEnum.optional(),
  unreadOnly: z
    .string()
    .optional()
    .transform((s) => {
      if (s === undefined || s === '') return false;
      return s === 'true' || s === '1';
    }),
});

export const adminNotificationIdParamSchema = z.object({
  id: z.string().min(1).refine((id) => /^[a-fA-F0-9]{24}$/.test(id), {
    message: 'Invalid notification id',
  }),
});
