import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import { uploadSettingsImages } from '@/middleware/upload.middleware';
import {
  createProductBannersAr,
  deleteProductBannerAr,
  listProductBannersAr,
  updateProductBannerAr,
} from '@/controllers/banner.controller';
import {
  bannerKeySchema,
  createAppBannerSchema,
  listAppBannerQuerySchema,
  updateAppBannerSchema,
} from '@/validators/banner.validator';

const router = Router();

router.get('/', validate(listAppBannerQuerySchema), listProductBannersAr);

router.post(
  '/',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validate(createAppBannerSchema),
  createProductBannersAr
);

router.patch(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validateParams(bannerKeySchema),
  validate(updateAppBannerSchema),
  updateProductBannerAr
);

router.delete(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  validateParams(bannerKeySchema),
  deleteProductBannerAr
);

export default router;
