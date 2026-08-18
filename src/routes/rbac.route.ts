import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { authenticate } from '@/middleware/auth.middleware';
import { authenticatedOnly } from '@/middleware/role.middleware';
import { requireStaffPermission } from '@/middleware/rbac.middleware';
import { validate, validateParams } from '@/middleware/validate.middleware';
import {
  assignUserRole,
  createPermission,
  createRole,
  deletePermission,
  deleteRole,
  getMyRbacContext,
  getMyPermissions,
  getPermissionMatrix,
  getRoleById,
  listPermissions,
  listRoles,
  seedRbacDefaults,
  setRolePermissions,
  addPermissionToRole,
  removePermissionFromRole,
  updatePermission,
  updateRole,
} from '@/controllers/rbac.controller';
import {
  assignUserRoleSchema,
  createPermissionSchema,
  createRoleSchema,
  permissionIdParamsSchema,
  roleIdParamsSchema,
  rolePermissionParamsSchema,
  setRolePermissionsSchema,
  updatePermissionSchema,
  updateRoleSchema,
  userIdParamsSchema,
} from '@/validators/rbac.validator';

const router = Router();
const upload = multer();

/**
 * Parses multipart/form-data into `req.body`. Skips JSON/urlencoded so `express.json()` output is kept.
 */
const parseMultipartFields = (req: Request, res: Response, next: NextFunction): void => {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('multipart/form-data')) {
    upload.none()(req, res, next);
    return;
  }
  next();
};

const rbacManage = [authenticate, requireStaffPermission('admin.manage_roles')];

router.get('/me', authenticate, authenticatedOnly, getMyRbacContext);
router.get('/me/permissions', authenticate, authenticatedOnly, getMyPermissions);

router.get('/matrix', ...rbacManage, getPermissionMatrix);

router.get('/permissions', ...rbacManage, listPermissions);
router.post('/permissions', ...rbacManage, parseMultipartFields, validate(createPermissionSchema), createPermission);
router.patch(
  '/permissions/:permissionId',
  ...rbacManage,
  validateParams(permissionIdParamsSchema),
  parseMultipartFields,
  validate(updatePermissionSchema),
  updatePermission
);
router.delete(
  '/permissions/:permissionId',
  ...rbacManage,
  validateParams(permissionIdParamsSchema),
  deletePermission
);

router.get('/roles', ...rbacManage, listRoles);
router.post('/roles', ...rbacManage, parseMultipartFields, validate(createRoleSchema), createRole);
router.get('/roles/:roleId', ...rbacManage, validateParams(roleIdParamsSchema), getRoleById);
router.patch(
  '/roles/:roleId',
  ...rbacManage,
  validateParams(roleIdParamsSchema),
  parseMultipartFields,
  validate(updateRoleSchema),
  updateRole
);
router.delete('/roles/:roleId', ...rbacManage, validateParams(roleIdParamsSchema), deleteRole);
router.put(
  '/roles/:roleId/permissions',
  ...rbacManage,
  validateParams(roleIdParamsSchema),
  parseMultipartFields,
  validate(setRolePermissionsSchema),
  setRolePermissions
);

router.post(
  '/roles/:roleId/permissions/:permissionId',
  ...rbacManage,
  validateParams(rolePermissionParamsSchema),
  addPermissionToRole
);

router.delete(
  '/roles/:roleId/permissions/:permissionId',
  ...rbacManage,
  validateParams(rolePermissionParamsSchema),
  removePermissionFromRole
);

router.patch(
  '/users/:userId/role',
  ...rbacManage,
  validateParams(userIdParamsSchema),
  parseMultipartFields,
  validate(assignUserRoleSchema),
  assignUserRole
);

router.post('/seed', authenticate, seedRbacDefaults);

export default router;
