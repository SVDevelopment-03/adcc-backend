import { NextFunction, Response } from 'express';
import { AuthRequest } from '@/middleware/auth.middleware';
import { isStaffRequest } from '@/utils/staff-request';

/**
 * Any dashboard staff account (Admin, or a user with an RBAC role), whatever
 * its permissions. Use after `authenticate` for tools every staff member
 * shares, such as the media library; members and guests get 403.
 */
export const requireStaff = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (await isStaffRequest(req)) {
    next();
    return;
  }
  res.status(403).json({ success: false, message: 'Access denied' });
};
