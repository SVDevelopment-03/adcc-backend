import { Router } from 'express';
import {
  createNewsletterSubscription,
  getNewsletterSubscriptions,
  exportNewsletterSubscriptions,
} from '@/controllers/newsletter-subscription.controller';
import { validate } from '@/middleware/validate.middleware';
import { createNewsletterSubscriptionSchema } from '@/validators/newsletter-subscription.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { isAdmin } from '@/middleware/role.middleware';

const router = Router();

// Public: newsletter signup (footer / home)
router.post('/', validate(createNewsletterSubscriptionSchema), createNewsletterSubscription);

// Admin dashboard: view + export subscribers
router.get('/export', authenticate, isAdmin, exportNewsletterSubscriptions);
router.get('/', authenticate, isAdmin, getNewsletterSubscriptions);

export default router;
