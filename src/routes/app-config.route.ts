import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate } from '@/middleware/validate.middleware';
import { getAppConfig, updateAppConfig } from '@/controllers/app-config.controller';
import { updateAppConfigSchema } from '@/validators/app-config.validator';

const router = Router();

router.get('/', getAppConfig);
router.put('/', authenticate, requireStaffPermission('app_configuration'), validate(updateAppConfigSchema), updateAppConfig);

export default router;

