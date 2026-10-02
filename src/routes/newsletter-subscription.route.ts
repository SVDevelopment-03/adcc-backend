import { Router } from 'express';
import {
  createNewsletterSubscription,
  getNewsletterSubscriptions,
  exportNewsletterSubscriptions,
} from '@/controllers/newsletter-subscription.controller';
import { validate } from '@/middleware/validate.middleware';
import { createNewsletterSubscriptionSchema } from '@/validators/newsletter-subscription.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';

const router = Router();
const requireCmsManagement = requireStaffPermission('manage_cms', 'admin.panel');

// Public: newsletter signup (footer / home)
router.post('/', validate(createNewsletterSubscriptionSchema), createNewsletterSubscription);

// Admin dashboard: view + export subscribers
router.get('/export', authenticate, requireCmsManagement, exportNewsletterSubscriptions);
router.get('/', authenticate, requireCmsManagement, getNewsletterSubscriptions);

export default router;
