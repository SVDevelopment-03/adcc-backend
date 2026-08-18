import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import User from '@/models/user.model';
import { userHasAnyPermission } from '@/services/rbac.service';

/**
 * Middleware for legacy “admin panel” access: legacy `Admin` users without an RBAC role,
 * or users with the `admin.panel` permission on their assigned role.
 */
export const isAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.user?.isGuest) {
    res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
    return;
  }

  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

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

    if (user.roleId && (await userHasAnyPermission(userId, ['admin.panel']))) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error checking admin status';
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * Middleware to check if user is vendor
 */
export const isVendor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    if (user.role !== 'Vendor') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Vendor privileges required.',
      });
      return;
    }

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error checking vendor status',
    });
  }
};

/**
 * Middleware to check if user is admin or vendor
 */
export const isAdminOrVendor = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const user = await User.findById(userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    if (user.role !== 'Admin' && user.role !== 'Vendor') {
      res.status(403).json({
        success: false,
        message: 'Access denied. Admin or vendor privileges required.',
      });
      return;
    }

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Error checking role',
    });
  }
};



// In role.middleware.ts - Add new middleware
// export const allowGuests = (
//   req: AuthRequest,
//   res: Response,
//   next: NextFunction
// ): void => {
//   // Allow both authenticated users and guests
//   next();
// };


export const authenticatedOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  // Only authenticated users (not guests)
  if (req.user?.isGuest) {
    res.status(403).json({
      success: false,
      message: 'This action requires user registration',
    });
    return;
  }
  next();
};
