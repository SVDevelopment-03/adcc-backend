import { Router } from 'express';
import { createNewsletterSubscription } from '@/controllers/newsletter-subscription.controller';
import { validate } from '@/middleware/validate.middleware';
import { createNewsletterSubscriptionSchema } from '@/validators/newsletter-subscription.validator';

const router = Router();

router.post('/', validate(createNewsletterSubscriptionSchema), createNewsletterSubscription);

export default router;
