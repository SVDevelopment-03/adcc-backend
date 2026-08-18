import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import { uploadSettingsBulkImages, uploadSettingsImages } from '@/middleware/upload.middleware';
import {
  createContentSetting,
  createGlobalSetting,
  bulkUpsertGlobalSettings,
  deleteContentSetting,
  deleteGlobalSetting,
  getGlobalSettingByKey,
  getGlobalSettings,
  listContentSettings,
  updateContentSetting,
  updateGlobalSetting,
  upsertGlobalSetting,
} from '@/controllers/global-setting.controller';
import {
  bulkGlobalSettingsSchema,
  createContentSettingSchema,
  createGlobalSettingSchema,
  getGlobalSettingsQuerySchema,
  globalSettingKeySchema,
  listContentSettingsQuerySchema,
  updateContentSettingSchema,
  updateGlobalSettingSchema,
} from '@/validators/global-setting.validator';

const router = Router();

router.get('/content/list', validate(listContentSettingsQuerySchema), listContentSettings);

router.post(
  '/content',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validate(createContentSettingSchema),
  createContentSetting
);

router.patch(
  '/content/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validateParams(globalSettingKeySchema),
  validate(updateContentSettingSchema),
  updateContentSetting
);

router.delete(
  '/content/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  validateParams(globalSettingKeySchema),
  deleteContentSetting
);

router.get('/', validate(getGlobalSettingsQuerySchema), getGlobalSettings);
router.get('/:key', validateParams(globalSettingKeySchema), getGlobalSettingByKey);

router.post(
  '/',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validate(createGlobalSettingSchema),
  createGlobalSetting
);

router.post(
  '/bulk',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsBulkImages,
  validate(bulkGlobalSettingsSchema),
  bulkUpsertGlobalSettings
);

router.put(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validateParams(globalSettingKeySchema),
  validate(updateGlobalSettingSchema),
  upsertGlobalSetting
);

router.patch(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validateParams(globalSettingKeySchema),
  validate(updateGlobalSettingSchema),
  updateGlobalSetting
);

router.delete(
  '/:key',
  authenticate,
  requireStaffPermission('app_configuration'),
  validateParams(globalSettingKeySchema),
  deleteGlobalSetting
);

export default router;
