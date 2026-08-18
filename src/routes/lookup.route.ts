import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate } from '@/middleware/validate.middleware';
import { uploadSettingsImages } from '@/middleware/upload.middleware';
import {
  createLookup,
  deleteLookup,
  getLookups,
  updateLookup,
} from '@/controllers/lookup.controller';
import {
  createLookupSchema,
  listLookupsQuerySchema,
  updateLookupSchema,
} from '@/validators/lookup.validator';

const router = Router();

// Public read (dropdowns/filters); optionalAuthenticate lets admins request includeInactive=true.
router.get('/', optionalAuthenticate, validate(listLookupsQuerySchema), getLookups);

// Mutations share the same "app_configuration" permission as the dashboard's Static Data page.
// uploadSettingsImages only engages multer when the request is multipart (icon upload); plain
// JSON requests (no icon) pass through untouched.
router.post(
  '/',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validate(createLookupSchema),
  createLookup
);
router.patch(
  '/:id',
  authenticate,
  requireStaffPermission('app_configuration'),
  uploadSettingsImages,
  validate(updateLookupSchema),
  updateLookup
);
router.delete('/:id', authenticate, requireStaffPermission('app_configuration'), deleteLookup);

export default router;
