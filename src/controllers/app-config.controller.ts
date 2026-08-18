import { Request, Response } from 'express';
import AppConfig from '@/models/app-config.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AuthRequest } from '@/middleware/auth.middleware';
import nodemailer from 'nodemailer';
import dns from 'dns/promises';

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

  console.log('[SMTP-TEST] ── starting SMTP test ──────────────────────');
  console.log('[SMTP-TEST] host    :', host || '(empty)');
  console.log('[SMTP-TEST] port    :', port);
  console.log('[SMTP-TEST] user    :', user || '(empty)');
  console.log('[SMTP-TEST] pass    :', pass ? `(set, ${pass.length} chars)` : '(empty)');
  console.log('[SMTP-TEST] secure  :', secure);
  console.log('[SMTP-TEST] NODE_ENV:', process.env.NODE_ENV ?? '(not set)');

  if (!host || !user || !pass) {
    console.log('[SMTP-TEST] ✗ missing required fields — aborting');
    sendSuccess(
      res,
      { ok: false, message: 'SMTP not configured. Fill in Host, Username, and Password then save.' },
      'SMTP test failed',
      200
    );
    return;
  }

  // DNS lookup — log which IP address the host resolves to
  try {
    const [ipv4, ipv6] = await Promise.allSettled([
      dns.resolve4(host),
      dns.resolve6(host),
    ]);
    if (ipv4.status === 'fulfilled') console.log('[SMTP-TEST] DNS IPv4 :', ipv4.value.join(', '));
    else console.log('[SMTP-TEST] DNS IPv4 : failed —', (ipv4 as any).reason?.message);
    if (ipv6.status === 'fulfilled') console.log('[SMTP-TEST] DNS IPv6 :', ipv6.value.join(', '));
    else console.log('[SMTP-TEST] DNS IPv6 : failed —', (ipv6 as any).reason?.message);
  } catch (dnsErr: any) {
    console.log('[SMTP-TEST] DNS lookup error:', dnsErr?.message);
  }

  // Pre-resolve hostname to IPv4 — nodemailer ignores family:4 on Render and
  // connects to the IPv6 address which is blocked. Passing the IP directly
  // bypasses nodemailer's internal DNS resolution entirely.
  let connectHost = host;
  try {
    const v4addrs = await dns.resolve4(host);
    if (v4addrs.length > 0) {
      connectHost = v4addrs[0];
      console.log(`[SMTP-TEST] pre-resolved ${host} → ${connectHost} (IPv4 direct)`);
    }
  } catch (e: any) {
    console.log('[SMTP-TEST] IPv4 pre-resolve failed:', e?.message, '— using hostname');
  }

  console.log('[SMTP-TEST] creating transporter → host:', connectHost, 'port:', port, 'secure:', secure);
  const transporter = nodemailer.createTransport({
    host: connectHost,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
      servername: host, // original hostname for TLS SNI
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  } as any);

  const t0 = Date.now();
  try {
    console.log('[SMTP-TEST] calling transporter.verify() …');
    await transporter.verify();
    const ms = Date.now() - t0;
    console.log(`[SMTP-TEST] ✓ verify() succeeded in ${ms}ms`);
    sendSuccess(res, { ok: true, message: `Connected to ${host}:${port} successfully (${ms}ms).` }, 'SMTP connection OK', 200);
  } catch (err: any) {
    const ms = Date.now() - t0;
    const raw: string = err?.message || 'Unknown error';
    console.log(`[SMTP-TEST] ✗ verify() failed after ${ms}ms`);
    console.log('[SMTP-TEST] error code   :', err?.code ?? '(none)');
    console.log('[SMTP-TEST] error message:', raw);
    console.log('[SMTP-TEST] error stack  :', err?.stack ?? '(none)');

    let hint = '';
    if (raw.includes('ETIMEDOUT') || raw.includes('timeout') || raw.includes('Timed out')) {
      hint = ` → Connection timed out after ${ms}ms. Port ${port} is blocked by the hosting platform. For Gmail use port 465 with TLS ON (already the default preset). For Outlook use port 587.`;
    } else if (raw.includes('ENETUNREACH')) {
      hint = ' → Network unreachable. Platform is blocking IPv6 SMTP — ensure family:4 fix is deployed.';
    } else if (raw.includes('Greeting never received')) {
      hint = ' → Port/TLS mismatch: try port 465 with TLS ON, or port 587 with TLS OFF.';
    } else if (raw.includes('Invalid login') || raw.includes('authentication') || raw.includes('Username and Password')) {
      hint = ' → Authentication failed. For Gmail use a 16-character App Password (not your regular password).';
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