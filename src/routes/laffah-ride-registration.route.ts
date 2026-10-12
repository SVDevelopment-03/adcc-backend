import { Router } from 'express';
import {
  createLaffahRideRegistration,
  getLaffahRideRegistrations,
  exportLaffahRideRegistrations,
} from '@/controllers/laffah-ride-registration.controller';
import { validate } from '@/middleware/validate.middleware';
import { createLaffahRideRegistrationSchema } from '@/validators/laffah-ride-registration.validator';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';

const router = Router();
const requireCmsManagement = requireStaffPermission('manage_cms', 'admin.panel');

// Public: Laffah Ride registration form submission
router.post('/', validate(createLaffahRideRegistrationSchema), createLaffahRideRegistration);

// Admin dashboard: view + export registrations
router.get('/export', authenticate, requireCmsManagement, exportLaffahRideRegistrations);
router.get('/', authenticate, requireCmsManagement, getLaffahRideRegistrations);

export default router;
