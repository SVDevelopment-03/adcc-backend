import { z } from 'zod';

const featuresSchema = z.object({
  marketplace: z.boolean(),
  communities: z.boolean(),
  events: z.boolean(),
  challenges: z.boolean(),
  feed: z.boolean(),
  notifications: z.boolean(),
  pushNotifications: z.boolean(),
  userRegistration: z.boolean(),
});

const notificationsSchema = z.object({
  eventReminders: z.boolean(),
  communityUpdates: z.boolean(),
  marketingUpdates: z.boolean(),
});

const securitySchema = z.object({
  requireEmailVerification: z.boolean(),
  requireStrongPasswords: z.boolean(),
  forceLogoutOnPasswordChange: z.boolean(),
});

export const appConfigSchema = z.object({
  appName: z.string().trim().min(1),
  supportEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(3),
  defaultLanguage: z.enum(['English', 'Arabic']),
  features: featuresSchema,
  notifications: notificationsSchema,
  security: securitySchema,
});

export const updateAppConfigSchema = appConfigSchema;
