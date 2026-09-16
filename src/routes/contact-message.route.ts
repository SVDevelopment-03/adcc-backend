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
import { requireStaffPermission } from '@/middleware/rbac.middleware';

const router = Router();
const requireCmsManagement = requireStaffPermission('manage_cms', 'admin.panel');

// Public: Contact Us form submission
router.post('/', validate(createContactMessageSchema), createContactMessage);

// Admin dashboard: view + triage + export submissions
router.get('/export', authenticate, requireCmsManagement, exportContactMessages);
router.get('/', authenticate, requireCmsManagement, getContactMessages);
router.patch('/:id/status', authenticate, requireCmsManagement, updateContactMessageStatus);

export default router;
