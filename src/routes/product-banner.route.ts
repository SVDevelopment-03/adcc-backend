import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import { uploadSettingsImages } from '@/middleware/upload.middleware';
import {
  createProductBanners,
  deleteProductBanner,
  listProductBanners,
  updateProductBanner,
} from '@/controllers/banner.controller';
import {
  bannerKeySchema,
  createAppBannerSchema,
  listAppBannerQuerySchema,
  updateAppBannerSchema,
} from '@/validators/banner.validator';

const router = Router();

router.get('/', validate(listAppBannerQuerySchema), listProductBanners);

router.post(
  '/',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validate(createAppBannerSchema),
  createProductBanners
);

router.patch(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validateParams(bannerKeySchema),
  validate(updateAppBannerSchema),
  updateProductBanner
);

router.delete(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  validateParams(bannerKeySchema),
  deleteProductBanner
);

export default router;
