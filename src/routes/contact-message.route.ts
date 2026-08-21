import { Router } from 'express';
import {
  createContactMessage,
  getContactMessages,
  exportContactMessages,
  updateContactMessageStatus,
} from '@/controllers/contact-message.controller';
import { validate } from '@/middleware/validate.middleware';
import { createContactMessageSchema } from '@/validators/contact-message.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { isAdmin } from '@/middleware/role.middleware';

const router = Router();

// Public: Contact Us form submission
router.post('/', validate(createContactMessageSchema), createContactMessage);

// Admin dashboard: view + triage + export submissions
router.get('/export', authenticate, isAdmin, exportContactMessages);
router.get('/', authenticate, isAdmin, getContactMessages);
router.patch('/:id/status', authenticate, isAdmin, updateContactMessageStatus);

export default router;
