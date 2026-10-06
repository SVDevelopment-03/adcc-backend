import { Request } from 'express';
import mongoose from 'mongoose';
import User from '@/models/user.model';
import { AuthRequest } from '@/middleware/auth.middleware';

// True for an active dashboard user (legacy Admin or any RBAC staff role).
// Relies on optionalAuthenticate having populated req.user.
export const isStaffRequest = async (req: Request): Promise<boolean> => {
  const authUser = (req as AuthRequest).user;
  if (!authUser?.id || authUser.isGuest) return false;
  if (!mongoose.Types.ObjectId.isValid(String(authUser.id))) return false;

  const user = await User.findById(authUser.id).select('role roleId isVerified').lean();
  if (!user || !user.isVerified) return false;
  return user.role === 'Admin' || Boolean(user.roleId);
};

// A token was sent but optionalAuthenticate could not verify it (typically expired).
// Answer 401 so the dashboard refreshes its token instead of silently getting the public view.
export const hasUnverifiedToken = (req: Request): boolean =>
  Boolean(req.headers.authorization) && !(req as AuthRequest).user;
