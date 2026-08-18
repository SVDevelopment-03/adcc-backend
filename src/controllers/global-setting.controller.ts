import { Request, Response } from 'express';
import GlobalSetting from '@/models/global-setting.model';
import { t } from '@/utils/i18n';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';

const normalizeStringArray = (value: unknown): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean);
        }
      } catch {
        return [];
      }
    }

    return [trimmed];
  }

  return [];
};

const normalizeParamValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

const parseItemsInput = (value: unknown): Array<Record<string, any>> => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const parseBulkFileField = (fieldname: string): { key: string; type: 'image' | 'images' } | null => {
  if (fieldname.startsWith('image.')) {
    return { key: fieldname.slice('image.'.length), type: 'image' };
  }
  if (fieldname.startsWith('images.')) {
    const raw = fieldname.slice('images.'.length);
    const key = raw.endsWith('[]') ? raw.slice(0, -2) : raw;
    return { key, type: 'images' };
  }
  return null;
};

const attachContentSettingImage = async (
  req: AuthRequest,
  payload: { image?: string; [key: string]: any }
) => {
  const fileFromSingle = (req as any).file as Express.Multer.File | undefined;
  const filesFromAny = (req as any).files as
    | Express.Multer.File[]
    | Record<string, Express.Multer.File[]>
    | undefined;

  const flattenedFiles = Array.isArray(filesFromAny)
    ? filesFromAny
    : filesFromAny
      ? Object.values(filesFromAny).flat()
      : [];

  const imageFile =
    fileFromSingle ||
    flattenedFiles.find((file) => (file.fieldname || '').toLowerCase() === 'image') ||
    flattenedFiles[0];

  if (!imageFile) return payload;

  const uploaded = await uploadImageBufferToS3(
    imageFile.buffer,
    imageFile.mimetype,
    imageFile.originalname,
    'content-sections'
  );

  return {
    ...payload,
    image: uploaded.url,
  };
};

/**
 * Create global setting
 * POST /v1/settings
 * Admin only
 */
export const createGlobalSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const existing = await GlobalSetting.findOne({ key: req.body.key });
  if (existing) {
    throw new AppError('Setting key already exists', 400);
  }

  const setting = await GlobalSetting.create(req.body);
  sendSuccess(res, setting, t(lang, 'contentSetting.created'), 201);
});

/**
 * Upsert global setting by key
 * PUT /v1/settings/:key
 * Admin only
 */
export const upsertGlobalSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);
  const updateData = { ...req.body, key };

  const setting = await GlobalSetting.findOneAndUpdate(
    { key },
    updateData,
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  sendSuccess(res, setting, t(lang, 'contentSetting.updated'), 200);
});

/**
 * Get global settings
 * GET /v1/settings
 * Public
 */
export const getGlobalSettings = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { group, key, keys, active, q, page = 1, limit = 50 } = req.query as any;

  const filter: Record<string, any> = {};
  if (group) filter.group = group;
  if (key) filter.key = key;
  if (typeof active === 'boolean') filter.active = active;

  const keyList = normalizeStringArray(keys);
  if (keyList.length) filter.key = { $in: keyList };

  if (q) {
    filter.$or = [
      { key: { $regex: String(q), $options: 'i' } },
      { label: { $regex: String(q), $options: 'i' } },
      { description: { $regex: String(q), $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [settings, total] = await Promise.all([
    GlobalSetting.find(filter).sort({ group: 1, key: 1 }).skip(skip).limit(limitNum).lean(),
    GlobalSetting.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      settings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'contentSetting.list'),
    200
  );
});

/**
 * Get global setting by key
 * GET /v1/settings/:key
 * Public
 */
export const getGlobalSettingByKey = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { key } = req.params;

  const setting = await GlobalSetting.findOne({ key });
  if (!setting) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, setting, t(lang, 'contentSetting.details'));
});

/**
 * Update global setting
 * PATCH /v1/settings/:key
 * Admin only
 */
export const updateGlobalSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const key = normalizeParamValue(req.params.key);

  const setting = await GlobalSetting.findOneAndUpdate(
    { key },
    req.body,
    { new: true, runValidators: true }
  );

  if (!setting) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, setting, t(lang, 'contentSetting.updated'));
});

/**
 * Delete global setting
 * DELETE /v1/settings/:key
 * Admin only
 */
export const deleteGlobalSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { key } = req.params;

  const setting = await GlobalSetting.findOneAndDelete({ key });
  if (!setting) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'contentSetting.deleted'));
});

/**
 * Bulk upsert global settings
 * POST /v1/settings/bulk
 * Admin only
 */
export const bulkUpsertGlobalSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const items: Array<Record<string, any>> = parseItemsInput(req.body.items);
  if (items.length === 0) {
    throw new AppError('Items are required', 400);
  }

  const files = (req.files as Express.Multer.File[] | undefined) || [];
  const uploadsByKey = new Map<string, { image?: string; images: string[] }>();

  if (files.length > 0) {
    for (const file of files) {
      const mapping = parseBulkFileField(file.fieldname);
      if (!mapping) {
        throw new AppError(`Unrecognized file field: ${file.fieldname}`, 400);
      }

      const uploaded = await uploadImageBufferToS3(
        file.buffer,
        file.mimetype,
        file.originalname,
        'content-sections'
      );

      const current = uploadsByKey.get(mapping.key) || { images: [] };
      if (mapping.type === 'image') {
        current.image = uploaded.url;
      } else {
        current.images.push(uploaded.url);
      }
      uploadsByKey.set(mapping.key, current);
    }
  }

  const ops = items.map((item) => {
    const key = String(item.key || '').trim();
    if (!key) {
      throw new AppError('Key is required', 400);
    }

    const uploads = uploadsByKey.get(key);
    if (uploads) {
      if (uploads.image) {
        item.image = uploads.image;
      }
    }

    const updateDoc: Record<string, any> = {};
    ['group', 'label', 'title', 'description', 'image', 'active'].forEach((field) => {
      if (item[field] !== undefined) updateDoc[field] = item[field];
    });

    return {
      updateOne: {
        filter: { key: item.key },
        update: { $set: updateDoc },
        upsert: true,
      },
    };
  });

  if (ops.length > 0) {
    await GlobalSetting.bulkWrite(ops, { ordered: true });
  }

  const keys = items.map((item) => item.key);
  const settings = await GlobalSetting.find({ key: { $in: keys } }).lean();

  sendSuccess(res, { settings }, t(lang, 'contentSetting.updated'), 200);
});

/**
 * Create predefined content setting item
 * POST /v1/settings/content
 * Admin only
 */
export const createContentSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const bodyWithUploadedImage = await attachContentSettingImage(req, req.body as Record<string, any>);
  const { group, key, label, title, description, image, active } = bodyWithUploadedImage as {
    group: string;
    key: string;
    label: string;
    title: string;
    description?: string;
    image?: string;
    active?: boolean;
  };

  const existing = await GlobalSetting.findOne({ key }).lean();
  if (existing) {
    throw new AppError('Setting key already exists', 400);
  }

  const setting = await GlobalSetting.create({
    group,
    key,
    label,
    title,
    description,
    image,
    active: active ?? true,
  });

  sendSuccess(res, setting, t(lang, 'contentSetting.created'), 201);
});

/**
 * List content settings for CMS-like screens.
 * GET /v1/settings/content?group=splash-screen
 * Public
 */
export const listContentSettings = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { group, key, active } = req.query as {
    group?: string;
    key?: string;
    active?: boolean;
  };

  const filter: Record<string, any> = {};
  if (group) filter.group = group;
  if (key) filter.key = key;
  if (typeof active === 'boolean') filter.active = active;

  const settings = await GlobalSetting.find(filter)
    .select('group key label title description image active createdAt updatedAt')
    .sort({ group: 1, key: 1 })
    .lean();

  sendSuccess(res, { settings }, t(lang, 'contentSetting.list'), 200);
});

/**
 * Update content setting editable fields only.
 * PATCH /v1/settings/content/:key
 * Admin only
 */
export const updateContentSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);
  const bodyWithUploadedImage = await attachContentSettingImage(req, req.body as Record<string, any>);
  const { title, description, image, active } = bodyWithUploadedImage as {
    title?: string;
    description?: string;
    image?: string;
    active?: boolean;
  };

  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (image !== undefined) updates.image = image;
  if (active !== undefined) updates.active = active;

  if (Object.keys(updates).length === 0) {
    throw new AppError('At least one editable field is required: title, description, image, active', 400);
  }

  const setting = await GlobalSetting.findOne({ key }).lean();
  if (!setting) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  // Keep the original immutable fields.
  const immutableFields = {
    group: setting.group,
    key: setting.key,
    label: setting.label,
  };

  const updated = await GlobalSetting.findOneAndUpdate(
    { key },
    {
      ...updates,
      ...immutableFields,
    },
    { new: true, runValidators: true }
  )
    .select('group key label title description image active createdAt updatedAt')
    .lean();

  sendSuccess(res, updated, t(lang, 'contentSetting.updated'), 200);
});

/**
 * Delete content setting by key
 * DELETE /v1/settings/content/:key
 * Admin only
 */
export const deleteContentSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);
  const setting = await GlobalSetting.findOneAndDelete({ key });
  if (!setting) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'contentSetting.deleted'), 200);
});
