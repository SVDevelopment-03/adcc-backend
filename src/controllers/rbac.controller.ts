import { Response } from 'express';
import mongoose from 'mongoose';
import Permission from '@/models/permission.model';
import Role from '@/models/role.model';
import User from '@/models/user.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import {
  countUsersWithRole,
  getEffectivePermissionKeys,
  seedDefaultRbac,
} from '@/services/rbac.service';

const toId = (id: string) => new mongoose.Types.ObjectId(id);

const getRouteParam = (v: string | string[] | undefined): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';

export const listPermissions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const items = await Permission.find().sort({ sortOrder: 1, name: 1 }).lean();
  sendSuccess(res, { permissions: items }, 'Permissions retrieved');
});

export const createPermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { key, name, description, group, sortOrder } = req.body as {
    key: string;
    name: string;
    description?: string;
    group?: string;
    sortOrder?: number;
  };

  const created = await Permission.create({
    key: key.toLowerCase().trim(),
    name: name.trim(),
    description: description?.trim(),
    group: group?.trim(),
    sortOrder: sortOrder ?? 0,
  });

  sendSuccess(res, created.toObject(), 'Permission created', 201);
});

export const updatePermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const permissionId = getRouteParam(req.params.permissionId);
  const body = req.body as {
    name?: string;
    description?: string | null;
    group?: string | null;
    sortOrder?: number;
  };

  const updated = await Permission.findByIdAndUpdate(
    permissionId,
    {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description ?? undefined }),
      ...(body.group !== undefined && { group: body.group ?? undefined }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    throw new AppError('Permission not found', 404);
  }

  sendSuccess(res, updated, 'Permission updated');
});

export const deletePermission = asyncHandler(async (req: AuthRequest, res: Response) => {
  const permissionId = getRouteParam(req.params.permissionId);

  const inRoles = await Role.countDocuments({ permissions: toId(permissionId) });
  if (inRoles > 0) {
    throw new AppError('Permission is assigned to one or more roles', 409);
  }

  const deleted = await Permission.findByIdAndDelete(permissionId);
  if (!deleted) {
    throw new AppError('Permission not found', 404);
  }

  sendSuccess(res, null, 'Permission deleted');
});

export const listRoles = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const roles = await Role.find().sort({ name: 1 }).populate('permissions').lean();
  sendSuccess(res, { roles }, 'Roles retrieved');
});

export const getRoleById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = getRouteParam(req.params.roleId);
  const role = await Role.findById(roleId).populate('permissions').lean();
  if (!role) {
    throw new AppError('Role not found', 404);
  }
  sendSuccess(res, role, 'Role retrieved');
});

export const createRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, slug, description, permissionIds } = req.body as {
    name: string;
    slug: string;
    description?: string;
    permissionIds?: string[];
  };

  const role = await Role.create({
    name: name.trim(),
    slug: slug.toLowerCase().trim(),
    description: description?.trim(),
    isSystem: false,
    permissions: (permissionIds ?? []).map((id) => toId(id)),
  });

  const populated = await Role.findById(role._id).populate('permissions').lean();
  sendSuccess(res, populated, 'Role created', 201);
});

export const updateRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = getRouteParam(req.params.roleId);
  const body = req.body as { name?: string; description?: string | null };

  const role = await Role.findById(roleId);
  if (!role) {
    throw new AppError('Role not found', 404);
  }

  if (body.name !== undefined) role.name = body.name;
  if (body.description !== undefined) role.description = body.description ?? undefined;

  await role.save();

  const populated = await Role.findById(role._id).populate('permissions').lean();
  sendSuccess(res, populated, 'Role updated');
});

export const deleteRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = getRouteParam(req.params.roleId);

  const role = await Role.findById(roleId);
  if (!role) {
    throw new AppError('Role not found', 404);
  }

  if (role.isSystem) {
    throw new AppError('System roles cannot be deleted', 403);
  }

  const usersCount = await countUsersWithRole(roleId);
  if (usersCount > 0) {
    throw new AppError('Role is assigned to users; reassign them first', 409);
  }

  await Role.findByIdAndDelete(roleId);
  sendSuccess(res, null, 'Role deleted');
});

export const setRolePermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = getRouteParam(req.params.roleId);
  const { permissionIds } = req.body as { permissionIds: string[] };

  const role = await Role.findById(roleId);
  if (!role) {
    throw new AppError('Role not found', 404);
  }

  const count = await Permission.countDocuments({
    _id: { $in: permissionIds.map((id) => toId(id)) },
  });
  if (count !== permissionIds.length) {
    throw new AppError('One or more permission ids are invalid', 400);
  }

  role.permissions = permissionIds.map((id) => toId(id));
  await role.save();

  const populated = await Role.findById(role._id).populate('permissions').lean();
  sendSuccess(res, populated, 'Role permissions updated');
});

/**
 * Add one permission to a role (idempotent if already present).
 * POST /rbac/roles/:roleId/permissions/:permissionId
 */
export const addPermissionToRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = getRouteParam(req.params.roleId);
  const permissionId = getRouteParam(req.params.permissionId);

  const perm = await Permission.findById(permissionId);
  if (!perm) {
    throw new AppError('Permission not found', 404);
  }

  const role = await Role.findById(roleId);
  if (!role) {
    throw new AppError('Role not found', 404);
  }

  const pid = toId(permissionId);
  await Role.updateOne({ _id: role._id }, { $addToSet: { permissions: pid } });

  const populated = await Role.findById(role._id).populate('permissions').lean();
  sendSuccess(res, populated, 'Permission added to role');
});

/**
 * Remove one permission from a role (does not delete the Permission document).
 * DELETE /rbac/roles/:roleId/permissions/:permissionId
 */
export const removePermissionFromRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const roleId = getRouteParam(req.params.roleId);
  const permissionId = getRouteParam(req.params.permissionId);

  const perm = await Permission.findById(permissionId);
  if (!perm) {
    throw new AppError('Permission not found', 404);
  }

  const role = await Role.findById(roleId);
  if (!role) {
    throw new AppError('Role not found', 404);
  }

  const pid = toId(permissionId);
  const had = role.permissions.some((id) => id.equals(pid));
  if (!had) {
    throw new AppError('This permission is not assigned to the role', 404);
  }

  await Role.updateOne({ _id: role._id }, { $pull: { permissions: pid } });

  const populated = await Role.findById(role._id).populate('permissions').lean();
  sendSuccess(res, populated, 'Permission removed from role');
});

export const getPermissionMatrix = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [permissions, roles] = await Promise.all([
    Permission.find().sort({ sortOrder: 1, name: 1 }).lean(),
    Role.find().sort({ name: 1 }).lean(),
  ]);

  const permIds = permissions.map((p) => p._id.toString());
  const matrix = roles.map((r) => {
    const allowed = new Set(r.permissions.map((id) => id.toString()));
    const cells: Record<string, boolean> = {};
    for (let i = 0; i < permIds.length; i++) {
      cells[permIds[i]] = allowed.has(permIds[i]);
    }
    return {
      id: r._id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      isSystem: r.isSystem,
      permissions: cells,
    };
  });

  sendSuccess(
    res,
    {
      permissions,
      matrix,
    },
    'Matrix retrieved'
  );
});

/**
 * Current user’s RBAC context: legacy `role` string, assigned RBAC role (if any), effective keys.
 * GET /rbac/me
 */
export const getMyRbacContext = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId || req.user?.isGuest) {
    throw new AppError('Unauthorized', 401);
  }

  const user = await User.findById(userId)
    .select('role roleId')
    .populate({
      path: 'roleId',
      populate: { path: 'permissions' },
    })
    .lean();

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const permissionKeys = [...(await getEffectivePermissionKeys(userId))].sort();

  const roleDoc = user.roleId;
  const role =
    roleDoc && typeof roleDoc === 'object' && '_id' in roleDoc ? roleDoc : null;

  sendSuccess(
    res,
    {
      legacyRole: user.role,
      role,
      permissionKeys,
    },
    'Current role and permissions retrieved'
  );
});

export const getMyPermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId || req.user?.isGuest) {
    throw new AppError('Unauthorized', 401);
  }

  const keys = await getEffectivePermissionKeys(userId);
  sendSuccess(res, { permissionKeys: [...keys].sort() }, 'Permissions retrieved');
});

export const assignUserRole = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = getRouteParam(req.params.userId);
  const { roleId } = req.body as { roleId: string | null };

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new AppError('Invalid user id', 400);
  }

  const target = await User.findById(userId);
  if (!target) {
    throw new AppError('User not found', 404);
  }

  if (roleId === null) {
    await User.findByIdAndUpdate(userId, { $unset: { roleId: 1 } }, { runValidators: true });
  } else {
    const role = await Role.findById(roleId);
    if (!role) {
      throw new AppError('Role not found', 404);
    }
    // RBAC role assignment is separate from legacy `role` enum (Admin/Vendor/Member).
    // Keep legacy role compatible with schema while RBAC permissions drive authorization.
    await User.findByIdAndUpdate(
      userId,
      { roleId: role._id, role: 'Admin' },
      { runValidators: true }
    );
  }

  const updated = await User.findById(userId)
    .select('-refreshTokens')
    .populate('roleId')
    .lean();

  sendSuccess(res, updated, 'User role updated');
});

export const seedRbacDefaults = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Unauthorized', 401);
  }

  const user = await User.findById(userId).select('role');
  if (!user || user.role !== 'Admin') {
    throw new AppError('Only legacy Admin accounts can run seed', 403);
  }

  const result = await seedDefaultRbac();
  sendSuccess(res, result, 'Seed completed', 201);
});
