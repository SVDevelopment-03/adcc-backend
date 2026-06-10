import { Request, Response } from 'express';
import AppConfig from '@/models/app-config.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AuthRequest } from '@/middleware/auth.middleware';
import nodemailer from 'nodemailer';

const DEFAULT_APP_CONFIG = {
  appName: 'Abu Dhabi Cycling Club',
  supportEmail: 'support@adcc.ae',
  contactPhone: '+971 2 123 4567',
  defaultLanguage: 'English' as const,
  emailSettings: {
    enabled: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    smtpSecure: false,
    fromEmail: '',
    fromName: 'Abu Dhabi Cycling Club',
    replyTo: '',
  },
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

function sanitizeAppConfig(doc: any) {
  if (!doc?.config?.emailSettings) return doc;

  const config = {
    ...doc.config,
    emailSettings: {
      ...doc.config.emailSettings,
      smtpPassword: '',
    },
  };

  return { ...doc, config };
}

function mergeAppConfig(config: Record<string, any> | undefined) {
  return {
    ...DEFAULT_APP_CONFIG,
    ...(config || {}),
    emailSettings: {
      ...DEFAULT_APP_CONFIG.emailSettings,
      ...(config?.emailSettings || {}),
    },
  };
}

/**
 * Get app configuration (singleton).
 * GET /v1/app-config
 * Public
 */
export const getAppConfig = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await AppConfig.findOne({ key: 'default' }).lean();

  if (!doc) {
    const created = await AppConfig.create({ key: 'default', config: DEFAULT_APP_CONFIG });
    sendSuccess(res, sanitizeAppConfig(created.toObject()), 'App configuration loaded', 200);
    return;
  }

  if (!doc.config?.emailSettings) {
    const updated = await AppConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: { config: mergeAppConfig(doc.config) } },
      { new: true }
    ).lean();

    sendSuccess(res, sanitizeAppConfig(updated || doc), 'App configuration loaded', 200);
    return;
  }

  sendSuccess(res, sanitizeAppConfig(doc), 'App configuration loaded', 200);
});

/**
 * Update app configuration (singleton).
 * PUT /v1/app-config
 * Admin only
 */
export const updateAppConfig = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  const existing = await AppConfig.findOne({ key: 'default' }).lean();
  const incomingConfig = req.body ?? {};
  const existingPassword = existing?.config?.emailSettings?.smtpPassword ?? '';
  const incomingPassword = incomingConfig?.emailSettings?.smtpPassword;

  const config = {
    ...mergeAppConfig(existing?.config),
    ...incomingConfig,
    emailSettings: {
      ...DEFAULT_APP_CONFIG.emailSettings,
      ...(existing?.config?.emailSettings || {}),
      ...(incomingConfig.emailSettings || {}),
      smtpPassword: String(incomingPassword ?? '').trim() ? String(incomingPassword) : existingPassword,
    },
  };

  const update = {
    config,
    updatedBy: userId,
  };

  const doc = await AppConfig.findOneAndUpdate(
    { key: 'default' },
    { $set: update, $setOnInsert: { key: 'default' } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  sendSuccess(res, sanitizeAppConfig(doc), 'App configuration saved', 200);
});

/**
 * Test SMTP connection using current saved settings.
 * POST /v1/app-config/test-email
 * Admin only
 */
export const testSmtpConnection = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const doc = await AppConfig.findOne({ key: 'default' }).lean();
  const emailSettings = (doc as any)?.config?.emailSettings ?? {};

  const host = String(emailSettings.smtpHost || process.env.SMTP_HOST || '').trim();
  const port = Number(emailSettings.smtpPort || process.env.SMTP_PORT || 587);
  const user = String(emailSettings.smtpUser || process.env.SMTP_USER || '').trim();
  const pass = String(emailSettings.smtpPassword || process.env.SMTP_PASS || '').trim();
  const secure: boolean =
    typeof emailSettings.smtpSecure === 'boolean'
      ? emailSettings.smtpSecure
      : (process.env.SMTP_SECURE || 'false') === 'true';

  if (!host || !user || !pass) {
    sendSuccess(
      res,
      { ok: false, message: 'SMTP not configured. Fill in Host, Username, and Password then save.' },
      'SMTP test failed',
      200
    );
    return;
  }

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

  try {
    await transporter.verify();
    sendSuccess(res, { ok: true, message: `Connected to ${host}:${port} successfully.` }, 'SMTP connection OK', 200);
  } catch (err: any) {
    const raw: string = err?.message || 'Unknown error';
    let hint = '';
    if (raw.includes('Greeting never received')) {
      hint = ' → Port/TLS mismatch: try port 465 with TLS ON, or port 587 with TLS OFF.';
    } else if (raw.includes('Invalid login') || raw.includes('authentication')) {
      hint = ' → Check your username/password. For Gmail use an App Password.';
    } else if (raw.includes('ECONNREFUSED')) {
      hint = ` → Connection refused on port ${port}. Check host and port.`;
    } else if (raw.includes('ENOTFOUND')) {
      hint = ' → Host not found. Check the SMTP host address.';
    }
    sendSuccess(
      res,
      { ok: false, message: `${raw}${hint}` },
      'SMTP test failed',
      200
    );
  }
});