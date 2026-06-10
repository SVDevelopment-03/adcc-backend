import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate } from '@/middleware/validate.middleware';
import { getAppConfig, updateAppConfig, testSmtpConnection } from '@/controllers/app-config.controller';
import { updateAppConfigSchema } from '@/validators/app-config.validator';

const router = Router();

router.get('/', getAppConfig);
router.put('/', authenticate, requireStaffPermission('app_configuration'), validate(updateAppConfigSchema), updateAppConfig);
router.post('/test-email', authenticate, requireStaffPermission('app_configuration'), testSmtpConnection);

export default router;

