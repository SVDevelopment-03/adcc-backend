import { Request, Response } from 'express';
import AppConfig from '@/models/app-config.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AuthRequest } from '@/middleware/auth.middleware';

const DEFAULT_APP_CONFIG = {
  appName: 'Abu Dhabi Cycling Club',
  supportEmail: 'support@adcc.ae',
  contactPhone: '+971 2 123 4567',
  defaultLanguage: 'English' as const,
  features: {
    marketplace: true,
    communities: true,
    events: false,
    challenges: false,
    feed: true,
    notifications: true,
    pushNotifications: true,
    userRegistration: true,
  },
  notifications: {
    eventReminders: true,
    communityUpdates: true,
    marketingUpdates: true,
  },
  security: {
    requireEmailVerification: true,
    requireStrongPasswords: true,
    forceLogoutOnPasswordChange: false,
  },
};

/**
 * Get app configuration (singleton).
 * GET /v1/app-config
 * Public
 */
export const getAppConfig = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await AppConfig.findOne({ key: 'default' }).lean();

  if (!doc) {
    const created = await AppConfig.create({ key: 'default', config: DEFAULT_APP_CONFIG });
    sendSuccess(res, created.toObject(), 'App configuration loaded', 200);
    return;
  }

  sendSuccess(res, doc, 'App configuration loaded', 200);
});

/**
 * Update app configuration (singleton).
 * PUT /v1/app-config
 * Admin only
 */
export const updateAppConfig = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const update = {
    config: req.body,
    updatedBy: userId,
  };

  const doc = await AppConfig.findOneAndUpdate(
    { key: 'default' },
    { $set: update, $setOnInsert: { key: 'default' } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  sendSuccess(res, doc, 'App configuration saved', 200);
});

