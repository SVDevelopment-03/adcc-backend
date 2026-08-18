import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import { uploadSettingsImages } from '@/middleware/upload.middleware';
import {
  createAppBanner,
  deleteAppBanner,
  listAppBanners,
  updateAppBanner,
} from '@/controllers/banner.controller';
import {
  bannerKeySchema,
  createAppBannerSchema,
  listAppBannerQuerySchema,
  updateAppBannerSchema,
} from '@/validators/banner.validator';

const router = Router();

router.get('/', validate(listAppBannerQuerySchema), listAppBanners);

router.post(
  '/',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validate(createAppBannerSchema),
  createAppBanner
);

router.patch(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validateParams(bannerKeySchema),
  validate(updateAppBannerSchema),
  updateAppBanner
);

router.delete(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  validateParams(bannerKeySchema),
  deleteAppBanner
);

export default router;
