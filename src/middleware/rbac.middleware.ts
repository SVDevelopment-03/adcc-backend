import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import User from '@/models/user.model';
import { userHasAnyPermission } from '@/services/rbac.service';
import { recordAuditLog } from '@/services/audit-log.service';

const AUDIT_VERBS: Record<string, string> = {
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * Safety net for the audit log: every successful staff write (POST/PUT/PATCH/
 * DELETE on a permission-gated route) is recorded. Controllers that describe
 * their own action in detail call recordAuditLog themselves, which marks the
 * request as logged, so this only fills in for the ones that don't.
 */
const auditStaffActionOnFinish = (req: AuthRequest, res: Response): void => {
  const verb = AUDIT_VERBS[req.method];
  if (!verb || (req as any).auditHooked) return;
  (req as any).auditHooked = true;

  res.on('finish', () => {
    if (res.statusCode >= 400 || (req as any).auditLogged) return;

    // '/v1/challenges' -> 'challenges', '/v1/communities/:id/community-posts' -> 'community-posts'
    const segment = req.baseUrl.split('/').filter(Boolean).pop() || 'dashboard';
    const moduleName = segment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    const paramValues = Object.values(req.params || {}).map(String);
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const label = [body.title, body.name, body.fullName, body.label, body.key].find(
      (value) => typeof value === 'string' && value.trim()
    ) as string | undefined;

    void recordAuditLog({
      req,
      action: `${segment}.${verb}`,
      targetType: moduleName,
      targetId: paramValues[paramValues.length - 1],
      targetLabel: label,
      metadata: { method: req.method, path: req.originalUrl.split('?')[0] },
    });
  });
};

/**
 * Allows access if the user is a legacy Admin (no RBAC role) or holds any of the given permissions.
 */
export const requireStaffPermission =
  (...permissionKeys: string[]) =>
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.user?.isGuest) {
      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }

    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    try {
      const user = await User.findById(userId).select('role roleId isVerified');

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // Deactivated staff accounts lose admin-panel access immediately (on
      // their very next request) rather than waiting out the short-lived
      // access token — this is the enforcement side of "Deactivate & Logout".
      if (!user.isVerified) {
        res.status(401).json({
          success: false,
          message: 'This account has been deactivated',
        });
        return;
      }

      if (!user.roleId && user.role === 'Admin') {
        auditStaffActionOnFinish(req, res);
        next();
        return;
      }

      const allowed = await userHasAnyPermission(userId, permissionKeys);

      if (!allowed) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
        });
        return;
      }

      auditStaffActionOnFinish(req, res);
      next();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Permission check failed';
      res.status(500).json({
        success: false,
        message,
      });
    }
  };
