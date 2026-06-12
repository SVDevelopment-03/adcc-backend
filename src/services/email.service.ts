import nodemailer from 'nodemailer';
import dns from 'dns/promises';
import AppConfig from '@/models/app-config.model';

interface EmailOptions {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
}

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  from: string;
};

async function resolveSmtpConfig(): Promise<SmtpConfig> {
  const doc = await AppConfig.findOne({ key: 'default' }).lean();
  const emailSettings = (doc as any)?.config?.emailSettings ?? {};

  const host = String(emailSettings.smtpHost || process.env.SMTP_HOST || '').trim();
  const port = Number(emailSettings.smtpPort || process.env.SMTP_PORT || 587);
  const user = String(emailSettings.smtpUser || process.env.SMTP_USER || '').trim();
  const pass = String(emailSettings.smtpPassword || process.env.SMTP_PASS || '').trim();
  const secure =
    typeof emailSettings.smtpSecure === 'boolean'
      ? emailSettings.smtpSecure
      : (process.env.SMTP_SECURE || 'false') === 'true';
  const from = String(emailSettings.fromEmail || process.env.FROM_EMAIL || process.env.SMTP_USER || '').trim();

  console.log('[EMAIL] resolveSmtpConfig → host:', host || '(empty)', '| port:', port, '| user:', user || '(empty)', '| secure:', secure, '| from:', from || '(empty)');

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in env or configure email settings in App Configuration.');
  }

  return { host, port, user, pass, secure, from };
}

async function resolveIPv4(hostname: string): Promise<string> {
  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses.length > 0) {
      console.log(`[EMAIL] resolved ${hostname} → IPv4 ${addresses[0]} (bypassing nodemailer DNS)`);
      return addresses[0];
    }
  } catch (e: any) {
    console.log(`[EMAIL] IPv4 resolve failed for ${hostname}:`, e?.message, '— falling back to hostname');
  }
  return hostname;
}

async function getTransporter() {
  const smtp = await resolveSmtpConfig();

  // Pre-resolve to IPv4 and pass the IP directly so nodemailer never does its own
  // DNS lookup (which picks IPv6 on Render/Vercel and hits ENETUNREACH).
  const host = await resolveIPv4(smtp.host);

  console.log('[EMAIL] creating transporter → host:', host, 'port:', smtp.port, 'secure:', smtp.secure);
  return nodemailer.createTransport({
    host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: {
      rejectUnauthorized: false,
      servername: smtp.host, // keep original hostname for TLS SNI
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  } as any);
}

export async function sendEmail(options: EmailOptions) {
  console.log('[EMAIL] sendEmail called → to:', options.to.length, 'recipient(s), subject:', options.subject);
  const smtp = await resolveSmtpConfig();
  const transporter = await getTransporter();
  const from = smtp.from;
  const results: Array<any> = [];

  const chunkSize = 100;
  for (let i = 0; i < options.to.length; i += chunkSize) {
    const chunk = options.to.slice(i, i + chunkSize);
    const mail = { from, to: chunk.join(','), subject: options.subject, text: options.text, html: options.html };
    console.log(`[EMAIL] sending chunk ${Math.floor(i / chunkSize) + 1} → ${chunk.length} address(es)`);
    const t0 = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await transporter.sendMail(mail);
      console.log(`[EMAIL] ✓ chunk sent in ${Date.now() - t0}ms, messageId:`, res.messageId);
      results.push(res);
    } catch (err: any) {
      console.log(`[EMAIL] ✗ chunk failed after ${Date.now() - t0}ms:`, err?.message);
      throw err;
    }
  }
  return results;
}

export default {
  sendEmail,
};
