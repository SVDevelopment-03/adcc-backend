import { Request, Response } from 'express';
import ContactMessage from '@/models/contact-message.model';
import AppConfig from '@/models/app-config.model';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';
import { sendEmail } from '@/services/email.service';
import { AppError } from '@/utils/app-error';
import { buildCsv, sendCsv } from '@/utils/csv';
import dayjs from 'dayjs';

const FALLBACK_CONTACT_EMAIL = process.env.CONTACT_NOTIFICATION_EMAIL || 'info@adcyclingclub.ae';

/** Admin-configurable via App Configuration → General Settings → Support Email. */
async function resolveNotificationRecipient(): Promise<string> {
  const doc = await AppConfig.findOne({ key: 'default' }).select('config.supportEmail').lean();
  const supportEmail = String((doc as any)?.config?.supportEmail || '').trim();
  return supportEmail || FALLBACK_CONTACT_EMAIL;
}

export const createContactMessage = asyncHandler(async (req: Request, res: Response) => {
  const { firstName, email, phone, message } = req.body as {
    firstName: string;
    email: string;
    phone?: string;
    message: string;
  };

  const contactMessage = await ContactMessage.create({ firstName, email, phone, message });

  // Best-effort admin notification — SMTP may not be configured (e.g. local
  // dev), so a failure here must never fail the submission itself.
  try {
    const recipient = await resolveNotificationRecipient();
    await sendEmail({
      to: [recipient],
      subject: `New contact form enquiry from ${firstName}`,
      text: [
        `Name: ${firstName}`,
        `Email: ${email}`,
        phone ? `Phone: ${phone}` : null,
        '',
        message,
      ]
        .filter(Boolean)
        .join('\n'),
      html: `
        <p><strong>Name:</strong> ${firstName}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br/>')}</p>
      `,
    });
  } catch (err) {
    console.error('[CONTACT] Failed to send notification email:', (err as Error)?.message);
  }

  sendSuccess(res, { id: contactMessage._id }, 'Your message has been sent successfully.', 201);
});

/**
 * List contact form submissions (dashboard).
 * GET /v1/contact?status=&page=&limit=
 * Admin only (route-gated)
 */
export const getContactMessages = asyncHandler(async (req: Request, res: Response) => {
  const { status, page = 1, limit = 20 } = req.query as { status?: string; page?: string; limit?: string };

  const filter: Record<string, any> = {};
  if (status) filter.status = status;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [items, total, newCount] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
    ContactMessage.countDocuments(filter),
    ContactMessage.countDocuments({ status: 'New' }),
  ]);

  sendSuccess(
    res,
    {
      items,
      newCount,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    'Contact messages loaded',
    200
  );
});

/**
 * Export contact form submissions as CSV (same status filter as the list, no pagination).
 * GET /v1/contact/export?status=
 * Admin only (route-gated)
 */
export const exportContactMessages = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };

  const filter: Record<string, any> = {};
  if (status) filter.status = status;

  const items = await ContactMessage.find(filter).sort({ createdAt: -1 }).lean();

  const headers = ['Name', 'Email', 'Phone', 'Message', 'Status', 'SubmittedAt'];
  const rows = items.map((item: any) => [
    item.firstName ?? '',
    item.email ?? '',
    item.phone ?? '',
    item.message ?? '',
    item.status ?? '',
    item.createdAt ? new Date(item.createdAt).toISOString() : '',
  ]);

  sendCsv(res, `contact_messages_${dayjs().format('YYYY-MM-DD')}.csv`, buildCsv(headers, rows));
});

/**
 * Update a contact message's status (New / Read / Resolved).
 * PATCH /v1/contact/:id/status
 * Admin only (route-gated)
 */
export const updateContactMessageStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status: 'New' | 'Read' | 'Resolved' };

  if (!['New', 'Read', 'Resolved'].includes(status)) {
    throw new AppError('Invalid status', 400);
  }

  const updated = await ContactMessage.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
  if (!updated) {
    throw new AppError('Contact message not found', 404);
  }

  sendSuccess(res, updated, 'Contact message updated', 200);
});
