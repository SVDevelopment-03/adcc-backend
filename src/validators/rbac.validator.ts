import { z } from 'zod';

const objectIdString = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid id');

/** Form-data sends one string, repeated keys, or a JSON array string */
const parsePermissionIdsInput = (val: unknown): unknown => {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return t.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
};

const permissionIdArray = z.array(objectIdString);

export const createPermissionSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_.-]*$/, 'Use lowercase letters, numbers, dots, underscores, hyphens'),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  group: z.string().max(80).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const updatePermissionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  group: z.string().max(80).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
});

export const permissionIdParamsSchema = z.object({
  permissionId: objectIdString,
});

export const createRoleSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use lowercase letters, numbers, underscores, hyphens'),
  description: z.string().max(500).optional(),
  permissionIds: z.preprocess(parsePermissionIdsInput, permissionIdArray.optional().default([])),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
});

export const roleIdParamsSchema = z.object({
  roleId: objectIdString,
});

/** Path: /roles/:roleId/permissions/:permissionId */
export const rolePermissionParamsSchema = z.object({
  roleId: objectIdString,
  permissionId: objectIdString,
});

export const setRolePermissionsSchema = z.object({
  permissionIds: z.preprocess(parsePermissionIdsInput, permissionIdArray),
});

const parseNullableRoleId = (val: unknown): unknown => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') {
    const t = val.trim();
    if (t === '' || t.toLowerCase() === 'null') return null;
    return t;
  }
  return val;
};

export const assignUserRoleSchema = z.object({
  roleId: z.preprocess(parseNullableRoleId, z.union([objectIdString, z.null()])),
});

export const userIdParamsSchema = z.object({
  userId: objectIdString,
});
