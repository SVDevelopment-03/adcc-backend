import { Request, Response } from 'express';
import GlobalSetting from '@/models/global-setting.model';
import { t } from '@/utils/i18n';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';

const normalizeParamValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

const extractUploadedFiles = (req: AuthRequest): Express.Multer.File[] => {
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

  return fileFromSingle ? [fileFromSingle] : flattenedFiles;
};

const attachBannerImage = async (
  req: AuthRequest,
  payload: { image?: string; [key: string]: any },
  folder: string = 'content-sections'
) => {
  const uploadedFiles = extractUploadedFiles(req);
  const imageFile = uploadedFiles.find((file) => (file.fieldname || '').toLowerCase() === 'image') || uploadedFiles[0];

  if (imageFile) {
    const uploaded = await uploadImageBufferToS3(
      imageFile.buffer,
      imageFile.mimetype,
      imageFile.originalname,
      folder
    );

    return {
      ...payload,
      image: uploaded.url,
    };
  }

  // Fallback: some clients send an image as a base64/data-URL string in the
  // request body (not as multipart). Detect and upload that as well so the
  // same endpoint works for both multipart and base64 uploads.
  const maybeImage = payload.image;
  if (typeof maybeImage === 'string') {
    const dataUrlMatch = maybeImage.match(/^data:(image\/[-+\w.]+);base64,(.+)$/i);
    try {
      if (dataUrlMatch) {
        const mimeType = dataUrlMatch[1];
        const base64Body = dataUrlMatch[2];
        const buffer = Buffer.from(base64Body, 'base64');
        const uploaded = await uploadImageBufferToS3(buffer, mimeType, 'upload.png', folder);
        return { ...payload, image: uploaded.url };
      }

      // Also accept plain base64 (no data: prefix) when it's long enough.
      if (/^[A-Za-z0-9+/=\n\r]+$/.test(maybeImage) && maybeImage.length > 100) {
        const buffer = Buffer.from(maybeImage.replace(/\s+/g, ''), 'base64');
        const uploaded = await uploadImageBufferToS3(buffer, 'image/jpeg', 'upload.jpg', folder);
        return { ...payload, image: uploaded.url };
      }
    } catch (err) {
      // Do not fail the whole request on upload fallback errors; leave the
      // original payload untouched so callers can handle the failure.
      // Log for debugging.
      // eslint-disable-next-line no-console
      console.error('Fallback base64 image upload failed:', err);
    }
  }

  // No file found and no valid base64 in body — return payload unchanged.
  // Log for debugging so admins can see why the banner has no image.
  // eslint-disable-next-line no-console
  console.debug('attachBannerImage: no multipart file and no base64 image found on request');
  return payload;
};

const createBannerEntries = async (
  files: Express.Multer.File[],
  group: string,
  folder: string
) => {
  return Promise.all(
    files.map(async (file, index) => {
      const uploaded = await uploadImageBufferToS3(
        file.buffer,
        file.mimetype,
        file.originalname,
        folder
      );
      const key = `product_banner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const label = file.originalname || `Product Banner ${index + 1}`;
      const title = label;

      return GlobalSetting.create({
        group,
        key,
        label,
        title,
        image: uploaded.url,
        active: true,
      });
    })
  );
};

const getBannersByGroup = async (group: string, active?: boolean) => {
  const filter: Record<string, any> = { group };
  if (typeof active === 'boolean') {
    filter.active = active;
  }

  return GlobalSetting.find(filter)
    .select('group key label title description image targetScreen active createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();
};

// ─── Generic app-banner CRUD, parameterized by group ───
// Used for both the English ('app_banner') and Arabic ('app_banner_ar') banner tabs,
// which are otherwise identical (image-only banners, no localized text fields).

const listAppBannersForGroup = async (req: Request, res: Response, group: string) => {
  const { active } = req.query as { active?: boolean };
  const banners = await getBannersByGroup(group, active);
  sendSuccess(res, { banners }, t((req as any).lang || 'en', 'contentSetting.list'), 200);
};

const createAppBannerForGroup = async (req: AuthRequest, res: Response, group: string, keyPrefix: string) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const bodyWithUploadedImage = await attachBannerImage(req, req.body as Record<string, any>);
  const { key: rawKey, label: rawLabel, title, description, image, targetScreen, active } = bodyWithUploadedImage as {
    key?: string;
    label?: string;
    title?: string;
    description?: string;
    image?: string;
    targetScreen?: string;
    active?: boolean;
  };

  const key = rawKey?.trim() || `${keyPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const label = rawLabel?.trim() || title?.trim() || 'App Banner';

  const existing = await GlobalSetting.findOne({ key, group });
  if (existing) {
    const updatedBanner = await GlobalSetting.findOneAndUpdate(
      { key, group },
      {
        label,
        title,
        description,
        ...(image !== undefined ? { image } : {}),
        ...(targetScreen !== undefined ? { targetScreen } : {}),
        active: active ?? existing.active,
      },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updatedBanner, t(lang, 'contentSetting.updated'), 200);
    return;
  }

  const banner = await GlobalSetting.create({
    group,
    key,
    label,
    title,
    description,
    image,
    targetScreen,
    active: active ?? true,
  });

  sendSuccess(res, banner, t(lang, 'contentSetting.created'), 201);
};

const updateAppBannerForGroup = async (req: AuthRequest, res: Response, group: string) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);
  const bodyWithUploadedImage = await attachBannerImage(req, req.body as Record<string, any>);
  const { label, title, description, image, targetScreen, active } = bodyWithUploadedImage as {
    label?: string;
    title?: string;
    description?: string;
    image?: string;
    targetScreen?: string;
    active?: boolean;
  };

  const updates: Record<string, any> = {};
  if (label !== undefined) updates.label = label;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (image !== undefined) updates.image = image;
  if (targetScreen !== undefined) updates.targetScreen = targetScreen;
  if (active !== undefined) updates.active = active;

  if (Object.keys(updates).length === 0) {
    throw new AppError('At least one field is required to update', 400);
  }

  const banner = await GlobalSetting.findOneAndUpdate(
    { key, group },
    updates,
    { new: true, runValidators: true }
  );

  if (!banner) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, banner, t(lang, 'contentSetting.updated'), 200);
};

const deleteAppBannerForGroup = async (req: AuthRequest, res: Response, group: string) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);

  const banner = await GlobalSetting.findOneAndDelete({ key, group });
  if (!banner) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'contentSetting.deleted'), 200);
};

export const listAppBanners = asyncHandler((req: Request, res: Response) =>
  listAppBannersForGroup(req, res, 'app_banner')
);
export const createAppBanner = asyncHandler((req: AuthRequest, res: Response) =>
  createAppBannerForGroup(req, res, 'app_banner', 'app_banner')
);
export const updateAppBanner = asyncHandler((req: AuthRequest, res: Response) =>
  updateAppBannerForGroup(req, res, 'app_banner')
);
export const deleteAppBanner = asyncHandler((req: AuthRequest, res: Response) =>
  deleteAppBannerForGroup(req, res, 'app_banner')
);

export const listAppBannersAr = asyncHandler((req: Request, res: Response) =>
  listAppBannersForGroup(req, res, 'app_banner_ar')
);
export const createAppBannerAr = asyncHandler((req: AuthRequest, res: Response) =>
  createAppBannerForGroup(req, res, 'app_banner_ar', 'app_banner_ar')
);
export const updateAppBannerAr = asyncHandler((req: AuthRequest, res: Response) =>
  updateAppBannerForGroup(req, res, 'app_banner_ar')
);
export const deleteAppBannerAr = asyncHandler((req: AuthRequest, res: Response) =>
  deleteAppBannerForGroup(req, res, 'app_banner_ar')
);

export const listProductBanners = asyncHandler(async (req: Request, res: Response) => {
  const { active } = req.query as { active?: boolean };
  const banners = await getBannersByGroup('product_banner', active);
  sendSuccess(res, { banners }, t((req as any).lang || 'en', 'contentSetting.list'), 200);
});

export const createProductBanners = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const files = extractUploadedFiles(req);
  if (!files.length) {
    throw new AppError('At least one image file is required.', 400);
  }

  const banners = await createBannerEntries(files, 'product_banner', 'product-banners');
  sendSuccess(res, { banners }, t(lang, 'contentSetting.created'), 201);
});

export const updateProductBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);
  const bodyWithUploadedImage = await attachBannerImage(
    req,
    req.body as Record<string, any>,
    'product-banners'
  );
  const { label, title, description, image, targetScreen, active } = bodyWithUploadedImage as {
    label?: string;
    title?: string;
    description?: string;
    image?: string;
    targetScreen?: string;
    active?: boolean;
  };

  const updates: Record<string, any> = {};
  if (label !== undefined) updates.label = label;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (image !== undefined) updates.image = image;
  if (targetScreen !== undefined) updates.targetScreen = targetScreen;
  if (active !== undefined) updates.active = active;

  if (Object.keys(updates).length === 0) {
    throw new AppError('At least one field is required to update', 400);
  }

  const banner = await GlobalSetting.findOneAndUpdate(
    { key, group: 'product_banner' },
    updates,
    { new: true, runValidators: true }
  );

  if (!banner) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, banner, t(lang, 'contentSetting.updated'), 200);
});

export const deleteProductBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);

  const banner = await GlobalSetting.findOneAndDelete({ key, group: 'product_banner' });
  if (!banner) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'contentSetting.deleted'), 200);
});

// ─── Arabic product banners ('product_banner_ar') ───
// Mirrors the English product-banner endpoints above, kept separate so the
// two banner sets (used for the club Merchandise Banner Upload sections) can
// be managed independently, same pattern as app_banner / app_banner_ar.

export const listProductBannersAr = asyncHandler(async (req: Request, res: Response) => {
  const { active } = req.query as { active?: boolean };
  const banners = await getBannersByGroup('product_banner_ar', active);
  sendSuccess(res, { banners }, t((req as any).lang || 'en', 'contentSetting.list'), 200);
});

export const createProductBannersAr = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const files = extractUploadedFiles(req);
  if (!files.length) {
    throw new AppError('At least one image file is required.', 400);
  }

  const banners = await createBannerEntries(files, 'product_banner_ar', 'product-banners');
  sendSuccess(res, { banners }, t(lang, 'contentSetting.created'), 201);
});

export const updateProductBannerAr = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);
  const bodyWithUploadedImage = await attachBannerImage(
    req,
    req.body as Record<string, any>,
    'product-banners'
  );
  const { label, title, description, image, targetScreen, active } = bodyWithUploadedImage as {
    label?: string;
    title?: string;
    description?: string;
    image?: string;
    targetScreen?: string;
    active?: boolean;
  };

  const updates: Record<string, any> = {};
  if (label !== undefined) updates.label = label;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (image !== undefined) updates.image = image;
  if (targetScreen !== undefined) updates.targetScreen = targetScreen;
  if (active !== undefined) updates.active = active;

  if (Object.keys(updates).length === 0) {
    throw new AppError('At least one field is required to update', 400);
  }

  const banner = await GlobalSetting.findOneAndUpdate(
    { key, group: 'product_banner_ar' },
    updates,
    { new: true, runValidators: true }
  );

  if (!banner) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, banner, t(lang, 'contentSetting.updated'), 200);
});

export const deleteProductBannerAr = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);

  const banner = await GlobalSetting.findOneAndDelete({ key, group: 'product_banner_ar' });
  if (!banner) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'contentSetting.deleted'), 200);
});

/**
 * DELETE /v1/app-banners-ar/bulk
 * DELETE /v1/product-banners-ar/bulk
 * Admin-only: remove all banners for the given Arabic banner group.
 * Temporary helper for maintenance — requires staff permission in the route.
 */
const deleteAllBannersForGroup = async (req: AuthRequest, res: Response, group: string) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const result = await GlobalSetting.deleteMany({ group });
  sendSuccess(res, { deleted: result.deletedCount ?? 0 }, t(lang, 'contentSetting.deleted'), 200);
};

export const deleteAllAppBannersAr = asyncHandler((req: AuthRequest, res: Response) =>
  deleteAllBannersForGroup(req, res, 'app_banner_ar')
);

export const deleteAllProductBannersAr = asyncHandler((req: AuthRequest, res: Response) =>
  deleteAllBannersForGroup(req, res, 'product_banner_ar')
);
