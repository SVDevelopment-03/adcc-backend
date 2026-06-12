import nodemailer from 'nodemailer';
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

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in env or configure email settings in App Configuration.');
  }

  return { host, port, user, pass, secure, from };
}

async function getTransporter() {
  const smtp = await resolveSmtpConfig();

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    // Force IPv4 — Vercel serverless blocks outbound IPv6 SMTP connections
    family: 4,
    tls: { rejectUnauthorized: false },
  });
}

export async function sendEmail(options: EmailOptions) {
  const smtp = await resolveSmtpConfig();
  const transporter = await getTransporter();
  const from = smtp.from;
  const results: Array<any> = [];

  // Send in batches to avoid giant recipients list
  const chunkSize = 100;
  for (let i = 0; i < options.to.length; i += chunkSize) {
    const chunk = options.to.slice(i, i + chunkSize);
    const mail = {
      from,
      to: chunk.join(','),
      subject: options.subject,
      text: options.text,
      html: options.html,
    };
    // eslint-disable-next-line no-await-in-loop
    const res = await transporter.sendMail(mail);
    results.push(res);
  }
  return results;
}

export default {
  sendEmail,
};
