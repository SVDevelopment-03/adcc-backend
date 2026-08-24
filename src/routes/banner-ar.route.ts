import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import { uploadSettingsImages } from '@/middleware/upload.middleware';
import {
  createAppBannerAr,
  deleteAppBannerAr,
  deleteAllAppBannersAr,
  listAppBannersAr,
  updateAppBannerAr,
} from '@/controllers/banner.controller';
import {
  bannerKeySchema,
  createAppBannerSchema,
  listAppBannerQuerySchema,
  updateAppBannerSchema,
} from '@/validators/banner.validator';

const router = Router();

router.get('/', validate(listAppBannerQuerySchema), listAppBannersAr);

router.post(
  '/',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validate(createAppBannerSchema),
  createAppBannerAr
);

router.patch(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validateParams(bannerKeySchema),
  validate(updateAppBannerSchema),
  updateAppBannerAr
);

router.delete(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  validateParams(bannerKeySchema),
  deleteAppBannerAr
);

// Temporary: delete all Arabic app banners
router.delete(
  '/bulk',
  authenticate,
  requireStaffPermission('app_configuration'),
  deleteAllAppBannersAr
);

export default router;
