import { Router } from 'express';
import { authenticate } from '@/middleware/auth.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { listAuditLogs, listAuditLogActions } from '@/controllers/audit-log.controller';

const router = Router();
const requireAuditLogAccess = requireStaffPermission('view_audit_log', 'admin.panel');

router.get('/', authenticate, requireAuditLogAccess, listAuditLogs);
router.get('/actions', authenticate, requireAuditLogAccess, listAuditLogActions);

export default router;
