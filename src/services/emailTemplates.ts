type TemplateVars = { [key: string]: string | number | undefined };

function render(template: string, vars: TemplateVars = {}) {
  return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_, key) => {
    const v = (vars as any)[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

export function welcomeEmail(vars: {
  name?: string;
  loginLink?: string;
  supportEmail?: string;
  lang?: 'en' | 'ar';
}) {
  const lang = vars.lang || 'en';
  const subject = lang === 'ar' ? `مرحبًا بك في نادي أبوظبي لركوب الدراجات${vars.name ? `، ${vars.name}` : ''}` : `Welcome to Abu Dhabi Cycling Club${vars.name ? `, ${vars.name}` : ''}`;
  const html = render(`
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Welcome</title>
    <style>
      body{margin:0;padding:0;background:#f5f7fb;font-family:Helvetica,Arial,sans-serif}
      .container{max-width:640px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden}
      .header{background:linear-gradient(90deg,#00a3ff,#7a00ff);color:#fff;padding:28px;text-align:center}
      .logo{font-weight:700;font-size:20px}
      .content{padding:28px;color:#0b1220;line-height:1.45}
      .cta{display:inline-block;margin-top:18px;padding:12px 20px;background:#00a3ff;color:#fff;border-radius:6px;text-decoration:none}
      .meta{margin-top:18px;color:#6b7280;font-size:13px}
      .footer{padding:18px;text-align:center;font-size:13px;color:#98a0b3}
      @media (max-width:520px){.content{padding:18px}.header{padding:20px}}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">Abu Dhabi Cycling Club</div>
      </div>
      <div class="content">
        <h1 style="margin:0 0 8px 0">Welcome{{namePart}}</h1>
        <p>You're all set. Thanks for joining the Abu Dhabi Cycling Club community — we're excited to have you with us.</p>
        <p class="meta">Here are a few helpful links to get you started.</p>
        <a href="{{loginLink}}" class="cta">Get started</a>
        <p class="meta">If you need help, email us at <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
      </div>
      <div class="footer">© Abu Dhabi Cycling Club</div>
    </div>
  </body>
  </html>
  `, {
    namePart: vars.name ? (lang === 'ar' ? `، ${vars.name}` : `, ${vars.name}`) : '',
    loginLink: vars.loginLink || 'https://adcc-neon.vercel.app',
    supportEmail: vars.supportEmail || 'support@adcc.ae',
  });

  const text = render(
    lang === 'ar'
      ? `مرحبًا{{namePart}}\n\nمرحبًا بك في نادي أبوظبي لركوب الدراجات.\n\nابدأ هنا: {{loginLink}}\n\nالدعم: {{supportEmail}}\n`
      : `Welcome{{namePart}}\n\nThanks for joining Abu Dhabi Cycling Club.\n\nGet started: {{loginLink}}\n\nSupport: {{supportEmail}}\n`,
    {
      namePart: vars.name ? (lang === 'ar' ? `، ${vars.name}` : `, ${vars.name}`) : '',
      loginLink: vars.loginLink || 'https://adcc-neon.vercel.app',
      supportEmail: vars.supportEmail || 'support@adcc.ae',
    }
  );

  return { subject, html, text };
}

export function eventRegistrationEmail(vars: {
  name?: string;
  eventName?: string;
  eventDate?: string;
  eventLocation?: string;
  detailsLink?: string;
  calendarLink?: string;
  supportEmail?: string;
  lang?: 'en' | 'ar';
}) {
  const lang = vars.lang || 'en';
  const subject = lang === 'ar' ? `تم تأكيد التسجيل: ${vars.eventName || 'الفعالية'}` : `Registration confirmed: ${vars.eventName || 'Event'}`;
  const html = render(`
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Registration</title>
    <style>
      body{margin:0;padding:0;background:#f5f7fb;font-family:Helvetica,Arial,sans-serif}
      .wrap{max-width:640px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden}
      .top{background:#0b1220;color:#fff;padding:22px;text-align:center}
      .top h2{margin:0;font-size:20px}
      .body{padding:24px;color:#0b1220}
      .detail{background:#f8fafc;padding:14px;border-radius:6px;margin:14px 0}
      .btn{display:inline-block;padding:10px 16px;background:#7a00ff;color:#fff;border-radius:6px;text-decoration:none}
      .muted{color:#6b7280;font-size:13px}
      @media (max-width:520px){.body{padding:16px}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top"><h2>Registration Confirmed</h2></div>
      <div class="body">
        <p>Hi {{name}},</p>
        <p>You're registered for <strong>{{eventName}}</strong>.</p>
        <div class="detail">
          <div><strong>Date:</strong> {{eventDate}}</div>
          <div><strong>Location:</strong> {{eventLocation}}</div>
        </div>
        <a href="{{detailsLink}}" class="btn">View event details</a>
        {{calendarBlock}}
        <p class="muted">If you need to change your registration, contact <a href="mailto:{{supportEmail}}">{{supportEmail}}</a>.</p>
      </div>
    </div>
  </body>
  </html>
  `, {
    name: vars.name || '',
    eventName: vars.eventName || '',
    eventDate: vars.eventDate || '',
    eventLocation: vars.eventLocation || '',
    detailsLink: vars.detailsLink || 'https://adcc-neon.vercel.app',
    calendarBlock: vars.calendarLink
      ? `<p style="margin-top:14px"><a href="${vars.calendarLink}" class="btn">${lang === 'ar' ? 'أضف إلى التقويم' : 'Add to calendar'}</a></p>`
      : '',
    supportEmail: vars.supportEmail || 'support@adcc.ae',
  });

  const text = render(
    lang === 'ar'
      ? `مرحبًا {{name}}،\n\nتم التسجيل في: {{eventName}}\nالتاريخ: {{eventDate}}\nالموقع: {{eventLocation}}\nالتفاصيل: {{detailsLink}}\n\nالدعم: {{supportEmail}}\n`
      : `Hi {{name}},\n\nYou're registered for: {{eventName}}\nDate: {{eventDate}}\nLocation: {{eventLocation}}\nDetails: {{detailsLink}}\n\nSupport: {{supportEmail}}\n`,
    {
      name: vars.name || '',
      eventName: vars.eventName || '',
      eventDate: vars.eventDate || '',
      eventLocation: vars.eventLocation || '',
      detailsLink: vars.detailsLink || 'https://adcc-neon.vercel.app',
      supportEmail: vars.supportEmail || 'support@adcc.ae',
    }
  );

  return { subject, html, text };
}

// Usage example (backend):
// import { welcomeEmail, eventRegistrationEmail } from '@/services/emailTemplates';
// import EmailService from '@/services/email.service';
// const mail = welcomeEmail({ name: 'Ali', loginLink: 'https://adcc-neon.vercel.app/app' });
// await EmailService.sendEmail({ to: ['ali@example.com'], subject: mail.subject, html: mail.html, text: mail.text });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const isHttpUrl = (value?: string) => !!value && /^https?:\/\//i.test(value);

/**
 * Newsletter layout for dashboard-composed messages (push/email broadcasts and
 * other one-off notices): logo header, optional image, title, body, optional
 * buttons, standing club strip, dark footer.
 */
export function announcementEmail(vars: {
  title: string;
  body: string;
  image?: string;
  /** Buttons; only absolute http(s) links are rendered. */
  actions?: Array<{ title: string; action: string }>;
  /** Small line above the header, e.g. "Club announcement". */
  label?: string;
  contactEmail?: string;
}) {
  const siteUrl = (process.env.FRONTEND_BASE_URL || 'https://adcyclingclub.ae').replace(/\/$/, '');
  const siteLabel = siteUrl.replace(/^https?:\/\//, '');
  const contactEmail = vars.contactEmail || 'info@adcyclingclub.ae';
  const label = vars.label || 'Club announcement';
  const now = new Date();
  const year = now.getFullYear();
  const sentOn = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
  const font = 'font-family:Helvetica,Arial,sans-serif';

  const bodyHtml = escapeHtml(vars.body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0">${p.replace(/\n/g, '<br />')}</p>`)
    .join('');

  const preheader = escapeHtml(vars.body.replace(/\s+/g, ' ').trim().slice(0, 140));

  const imageHtml = isHttpUrl(vars.image)
    ? `<tr><td style="background:#ffffff;font-size:0;line-height:0">
          <img src="${escapeHtml(vars.image as string)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0" />
        </td></tr>`
    : '';

  const buttons = (vars.actions || []).filter((a) => a?.title && isHttpUrl(a.action));
  const buttonsHtml = buttons.length
    ? `<tr><td style="background:#ffffff;padding:4px 36px 24px 36px">${buttons
        .map((a, i) => {
          const solid = i === 0;
          return `<a href="${escapeHtml(a.action)}" style="display:inline-block;margin:0 10px 8px 0;padding:13px 26px;background:${solid ? '#C12D32' : '#ffffff'};border:1px solid #C12D32;border-radius:6px;${font};font-size:15px;line-height:20px;font-weight:700;color:${solid ? '#ffffff' : '#C12D32'};text-decoration:none">${escapeHtml(a.title)}</a>`;
        })
        .join('')}</td></tr>`
    : '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(vars.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f1ed;${font}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f1ed;font-size:1px;line-height:1px">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f1ed">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;${font}">
        <tr><td style="padding:0 4px 10px 4px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#7a756c">${escapeHtml(label)}</td>
            <td align="right" style="font-size:11px;line-height:16px;color:#7a756c">${sentOn}</td>
          </tr></table>
        </td></tr>
        <tr><td align="center" style="background:#ffffff;padding:26px 24px 22px 24px;border-radius:12px 12px 0 0">
          <a href="${siteUrl}" style="text-decoration:none">
            <img src="${siteUrl}/images/adcc-logo.png" alt="Abu Dhabi Cycling Club" width="176" style="display:block;width:176px;max-width:60%;height:auto;border:0" />
          </a>
        </td></tr>
        <tr><td style="font-size:0;line-height:0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="50%" height="4" style="background:#04944a;font-size:0;line-height:0">&nbsp;</td>
            <td width="50%" height="4" style="background:#e01a38;font-size:0;line-height:0">&nbsp;</td>
          </tr></table>
        </td></tr>
        ${imageHtml}
        <tr><td style="background:#ffffff;padding:32px 36px 8px 36px">
          <h1 dir="auto" style="margin:0 0 16px 0;${font};font-size:26px;line-height:32px;font-weight:700;color:#111118">${escapeHtml(vars.title)}</h1>
          <div dir="auto" style="font-size:16px;line-height:26px;color:#3a3a44">${bodyHtml}</div>
        </td></tr>
        ${buttonsHtml}
        <tr><td style="background:#ffffff;padding:8px 36px 0 36px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" style="background:#e9e5de;font-size:0;line-height:0">&nbsp;</td></tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;padding:20px 36px 26px 36px;font-size:14px;line-height:22px;color:#5c5a63">
          <strong style="color:#111118">Ride with the club.</strong>
          Events, communities and challenges are all in the ADCC app and at
          <a href="${siteUrl}" style="color:#C12D32;text-decoration:underline">${siteLabel}</a>.
        </td></tr>
        <tr><td align="center" style="background:#111118;padding:30px 28px 28px 28px;border-radius:0 0 12px 12px">
          <img src="${siteUrl}/images/adcc-logo-header.png" alt="Abu Dhabi Cycling Club" width="132" style="display:block;width:132px;height:auto;border:0;margin:0 auto 18px auto" />
          <p style="margin:0 0 14px 0;font-size:13px;line-height:20px;color:#d9d7dc">
            <a href="${siteUrl}" style="color:#ffffff;text-decoration:none;font-weight:700">${siteLabel}</a>
            <span style="color:#5e5c66">&nbsp;&nbsp;|&nbsp;&nbsp;</span>
            <a href="mailto:${escapeHtml(contactEmail)}" style="color:#ffffff;text-decoration:none;font-weight:700">${escapeHtml(contactEmail)}</a>
          </p>
          <p style="margin:0;font-size:12px;line-height:18px;color:#8f8c98">
            You are receiving this email because you have an Abu Dhabi Cycling Club account.<br />
            &copy; ${year} Abu Dhabi Cycling Club. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    vars.title,
    '',
    vars.body,
    ...(buttons.length ? ['', ...buttons.map((a) => `${a.title}: ${a.action}`)] : []),
    '',
    `Abu Dhabi Cycling Club - ${siteUrl}`,
    `Contact: ${contactEmail}`,
  ].join('\n');

  return { subject: vars.title, html, text };
}
