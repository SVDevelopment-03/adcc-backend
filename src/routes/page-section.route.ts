import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validateParams } from '@/middleware/validate.middleware';
import { uploadPageSectionImages } from '@/middleware/upload.middleware';
import { getPageSection, upsertPageSection } from '@/controllers/page-section.controller';
import { pageSectionParamsSchema } from '@/validators/page-section.validator';

const router = Router();

router.get('/:page/sections/:section', validateParams(pageSectionParamsSchema), getPageSection);

router.put(
  '/:page/sections/:section',
  authenticate,
  requireStaffPermission('app_configuration'),
  validateParams(pageSectionParamsSchema),
  uploadPageSectionImages,
  upsertPageSection
);

export default router;
