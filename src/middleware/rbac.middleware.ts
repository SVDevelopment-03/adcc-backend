import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import User from '@/models/user.model';
import { userHasAnyPermission } from '@/services/rbac.service';

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
      const user = await User.findById(userId).select('role roleId');

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      if (!user.roleId && user.role === 'Admin') {
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

      next();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Permission check failed';
      res.status(500).json({
        success: false,
        message,
      });
    }
  };
