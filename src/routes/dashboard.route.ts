import express from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate } from '@/middleware/validate.middleware';
import { getDashboardLanding, getStaffDashboardSummary } from '@/controllers/dashboard.controller';
import { staffDashboardQuerySchema } from '@/validators/dashboard.validator';

// const router = Router();

const router = express.Router();

router.get(
  '/landing',
  authenticate,
  requireStaffPermission('view_dashboard'),
  getDashboardLanding
);


router.get(
  '/summary',
  authenticate,
  requireStaffPermission('view_dashboard'),
  validate(staffDashboardQuerySchema),
  getStaffDashboardSummary
);

export default router;
