import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import { uploadPartnerLogos } from '@/middleware/upload.middleware';
import {
  createPartners,
  deletePartner,
  listPartners,
  reorderPartners,
  updatePartner,
} from '@/controllers/partner.controller';
import {
  createPartnerSchema,
  listPartnersQuerySchema,
  partnerIdSchema,
  reorderPartnersSchema,
  updatePartnerSchema,
} from '@/validators/partner.validator';

const router = Router();

router.get('/', validate(listPartnersQuerySchema), listPartners);

router.post(
  '/',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadPartnerLogos,
  validate(createPartnerSchema),
  createPartners
);

// Registered before '/:id' so "reorder" is never captured as an id.
router.put(
  '/reorder',
  authenticate,
  requireStaffPermission('app_configuration'),
  validate(reorderPartnersSchema),
  reorderPartners
);

router.patch(
  '/:id',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadPartnerLogos,
  validateParams(partnerIdSchema),
  validate(updatePartnerSchema),
  updatePartner
);

router.delete(
  '/:id',
  authenticate,
  requireStaffPermission('app_configuration'),
  validateParams(partnerIdSchema),
  deletePartner
);

export default router;
