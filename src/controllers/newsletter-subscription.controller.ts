import { Request, Response } from 'express';
import NewsletterSubscription from '@/models/newsletter-subscription.model';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';
import { buildCsv, sendCsv } from '@/utils/csv';
import dayjs from 'dayjs';

export const createNewsletterSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, source = 'home-footer' } = req.body as {
      email: string;
      source?: string;
    };

    const subscription = await NewsletterSubscription.findOneAndUpdate(
      { email },
      { $set: { email, source, isActive: true } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    sendSuccess(
      res,
      { email: subscription?.email },
      'Thanks for subscribing.',
      201
    );
  }
);

/**
 * List newsletter subscribers (dashboard).
 * GET /v1/newsletter-subscriptions?isActive=&page=&limit=
 * Admin only (route-gated)
 */
export const getNewsletterSubscriptions = asyncHandler(
  async (req: Request, res: Response) => {
    const { isActive, page = 1, limit = 20 } = req.query as {
      isActive?: string;
      page?: string;
      limit?: string;
    };

    const filter: Record<string, any> = {};
    if (isActive === 'true') filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total, activeCount] = await Promise.all([
      NewsletterSubscription.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      NewsletterSubscription.countDocuments(filter),
      NewsletterSubscription.countDocuments({ isActive: true }),
    ]);

    sendSuccess(
      res,
      {
        items,
        activeCount,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
      'Newsletter subscribers loaded',
      200
    );
  }
);

/**
 * Export newsletter subscribers as CSV (same isActive filter as the list, no pagination).
 * GET /v1/newsletter-subscriptions/export?isActive=
 * Admin only (route-gated)
 */
export const exportNewsletterSubscriptions = asyncHandler(
  async (req: Request, res: Response) => {
    const { isActive } = req.query as { isActive?: string };

    const filter: Record<string, any> = {};
    if (isActive === 'true') filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;

    const items = await NewsletterSubscription.find(filter).sort({ createdAt: -1 }).lean();

    const headers = ['Email', 'Source', 'Status', 'SubscribedAt'];
    const rows = items.map((item: any) => [
      item.email ?? '',
      item.source ?? '',
      item.isActive ? 'Active' : 'Unsubscribed',
      item.createdAt ? new Date(item.createdAt).toISOString() : '',
    ]);

    sendCsv(res, `newsletter_subscribers_${dayjs().format('YYYY-MM-DD')}.csv`, buildCsv(headers, rows));
  }
);
