import { Request, Response } from 'express';
import NewsletterSubscription from '@/models/newsletter-subscription.model';
import { asyncHandler } from '@/utils/async-handler';
import { sendSuccess } from '@/utils/response';

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
