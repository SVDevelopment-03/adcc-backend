import mongoose from 'mongoose';
import Permission from '@/models/permission.model';
import Role from '@/models/role.model';
import User from '@/models/user.model';

/** Default permission keys used by the app and seed data */
export const DEFAULT_PERMISSION_DEFINITIONS: Array<{
  key: string;
  name: string;
  description?: string;
  group: string;
  sortOrder: number;
}> = [
  {
    key: 'view_dashboard',
    name: 'View Dashboard',
    group: 'General',
    sortOrder: 10,
  },
  {
    key: 'manage_events',
    name: 'Manage Events',
    group: 'Content',
    sortOrder: 20,
  },
  {
    key: 'manage_users',
    name: 'Manage Users',
    group: 'Users',
    sortOrder: 30,
  },
  {
    key: 'moderate_content',
    name: 'Moderate Content',
    group: 'Content',
    sortOrder: 40,
  },
  {
    key: 'manage_communities',
    name: 'Manage Communities',
    group: 'Community',
    sortOrder: 50,
  },
  {
    key: 'manage_store',
    name: 'Manage Store',
    group: 'Commerce',
    sortOrder: 60,
  },
  {
    key: 'app_configuration',
    name: 'App Configuration',
    group: 'System',
    sortOrder: 70,
  },
  {
    key: 'admin.panel',
    name: 'Admin Panel Access',
    description: 'Broad access to legacy admin-protected APIs (use fine-grained keys when possible)',
    group: 'System',
    sortOrder: 80,
  },
  {
    key: 'admin.manage_roles',
    name: 'Manage Roles & Permissions',
    group: 'System',
    sortOrder: 90,
  },
];

const DEFAULT_ROLE_MATRIX: Array<{
  name: string;
  slug: string;
  description: string;
  isSystem: boolean;
  permissionKeys: string[];
}> = [
  {
    name: 'Super Admin',
    slug: 'super-admin',
    description: 'Full access to all areas',
    isSystem: true,
    permissionKeys: DEFAULT_PERMISSION_DEFINITIONS.map((p) => p.key),
  },
  {
    name: 'Content Manager',
    slug: 'content-manager',
    description: 'Events and content moderation',
    isSystem: true,
    permissionKeys: ['view_dashboard', 'manage_events', 'moderate_content'],
  },
  {
    name: 'Community Manager',
    slug: 'community-manager',
    description: 'Communities and events without global moderation',
    isSystem: true,
    permissionKeys: ['view_dashboard', 'manage_events', 'manage_communities'],
  },
  {
    name: 'Moderator',
    slug: 'moderator',
    description: 'Users and content moderation',
    isSystem: true,
    permissionKeys: ['view_dashboard', 'manage_users', 'moderate_content'],
  },
];

export async function getEffectivePermissionKeys(userId: string): Promise<Set<string>> {
  const user = await User.findById(userId).select('role roleId').lean();

  if (!user) {
    return new Set();
  }

  if (user.role === 'Admin' && !user.roleId) {
    const keys = await Permission.find().select('key').lean();
    return new Set(keys.map((p) => p.key));
  }

  if (!user.roleId) {
    return new Set();
  }

  const role = await Role.findById(user.roleId).populate('permissions').lean();

  if (!role || !Array.isArray(role.permissions)) {
    return new Set();
  }

  const keys = (role.permissions as Array<{ key?: string }>)
    .map((p) => p.key)
    .filter((k): k is string => typeof k === 'string');

  return new Set(keys);
}

export async function userHasAnyPermission(
  userId: string,
  requiredKeys: string[]
): Promise<boolean> {
  if (requiredKeys.length === 0) {
    return true;
  }

  const effective = await getEffectivePermissionKeys(userId);
  return requiredKeys.some((k) => effective.has(k));
}

export async function seedDefaultRbac(): Promise<{
  permissionsCreated: number;
  rolesCreated: number;
}> {
  let permissionsCreated = 0;

  for (const def of DEFAULT_PERMISSION_DEFINITIONS) {
    const existing = await Permission.findOne({ key: def.key });
    if (existing) {
      await Permission.updateOne(
        { key: def.key },
        {
          $set: {
            name: def.name,
            description: def.description,
            group: def.group,
            sortOrder: def.sortOrder,
          },
        }
      );
    } else {
      await Permission.create(def);
      permissionsCreated += 1;
    }
  }

  const keyToId = new Map<string, mongoose.Types.ObjectId>();
  const allPerms = await Permission.find().select('_id key').lean();
  for (const p of allPerms) {
    keyToId.set(p.key, p._id as mongoose.Types.ObjectId);
  }

  let rolesCreated = 0;

  for (const r of DEFAULT_ROLE_MATRIX) {
    const permissionIds = r.permissionKeys
      .map((k) => keyToId.get(k))
      .filter((id): id is mongoose.Types.ObjectId => !!id);

    const existing = await Role.findOne({ slug: r.slug });
    if (existing) {
      await Role.updateOne(
        { slug: r.slug },
        {
          $set: {
            name: r.name,
            description: r.description,
            isSystem: r.isSystem,
            permissions: permissionIds,
          },
        }
      );
    } else {
      await Role.create({
        name: r.name,
        slug: r.slug,
        description: r.description,
        isSystem: r.isSystem,
        permissions: permissionIds,
      });
      rolesCreated += 1;
    }
  }

  return { permissionsCreated, rolesCreated };
}

export async function countUsersWithRole(roleId: string): Promise<number> {
  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    return 0;
  }
  return User.countDocuments({ roleId: new mongoose.Types.ObjectId(roleId) });
}
