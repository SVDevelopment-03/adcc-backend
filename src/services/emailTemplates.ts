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
