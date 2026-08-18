import { z } from 'zod';

/** Query for GET /dashboard/summary (banner filters for content section) */
export const staffDashboardQuerySchema = z.object({
  bannerGroup: z.string().optional(),
  bannerGroups: z.string().optional(),
  /** Max rows for community dashboard upcoming events (default 10, max 50) */
  upcomingEventsLimit: z
    .string()
    .optional()
    .transform((s) => {
      if (s === undefined || s === '') return 10;
      const n = parseInt(s, 10);
      if (Number.isNaN(n)) return 10;
      return Math.min(50, Math.max(1, n));
    }),
  /** Max merged rows for moderator dashboard queue (default 20, max 50) */
  moderationQueueLimit: z
    .string()
    .optional()
    .transform((s) => {
      if (s === undefined || s === '') return 20;
      const n = parseInt(s, 10);
      if (Number.isNaN(n)) return 20;
      return Math.min(50, Math.max(1, n));
    }),
});

export type StaffDashboardQuery = z.infer<typeof staffDashboardQuerySchema>;
