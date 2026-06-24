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

  if (!imageFile) return payload;

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
    .select('group key label title description image active createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();
};

export const listAppBanners = asyncHandler(async (req: Request, res: Response) => {
  const { active } = req.query as { active?: boolean };

  const filter: Record<string, any> = { group: 'app_banner' };
  if (typeof active === 'boolean') {
    filter.active = active;
  }

  const banners = await GlobalSetting.find(filter)
    .select('group key label title description image active createdAt updatedAt')
    .sort({ createdAt: -1 })
    .lean();

  sendSuccess(res, { banners }, t((req as any).lang || 'en', 'contentSetting.list'), 200);
});

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
  const { label, title, description, image, active } = bodyWithUploadedImage as {
    label?: string;
    title?: string;
    description?: string;
    image?: string;
    active?: boolean;
  };

  const updates: Record<string, any> = {};
  if (label !== undefined) updates.label = label;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (image !== undefined) updates.image = image;
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

export const createAppBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const bodyWithUploadedImage = await attachBannerImage(req, req.body as Record<string, any>);
  const { key: rawKey, label: rawLabel, title, description, image, active } = bodyWithUploadedImage as {
    key?: string;
    label?: string;
    title?: string;
    description?: string;
    image?: string;
    active?: boolean;
  };

  const key = rawKey?.trim() || `app_banner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const label = rawLabel?.trim() || title?.trim() || 'App Banner';

  const existing = await GlobalSetting.findOne({ key, group: 'app_banner' });
  if (existing) {
    const updatedBanner = await GlobalSetting.findOneAndUpdate(
      { key, group: 'app_banner' },
      {
        label,
        title,
        description,
        ...(image !== undefined ? { image } : {}),
        active: active ?? existing.active,
      },
      { new: true, runValidators: true }
    );

    sendSuccess(res, updatedBanner, t(lang, 'contentSetting.updated'), 200);
    return;
  }

  const banner = await GlobalSetting.create({
    group: 'app_banner',
    key,
    label,
    title,
    description,
    image,
    active: active ?? true,
  });

  sendSuccess(res, banner, t(lang, 'contentSetting.created'), 201);
});

export const updateAppBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);
  const bodyWithUploadedImage = await attachBannerImage(req, req.body as Record<string, any>);
  const { label, title, description, image, active } = bodyWithUploadedImage as {
    label?: string;
    title?: string;
    description?: string;
    image?: string;
    active?: boolean;
  };

  const updates: Record<string, any> = {};
  if (label !== undefined) updates.label = label;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (image !== undefined) updates.image = image;
  if (active !== undefined) updates.active = active;

  if (Object.keys(updates).length === 0) {
    throw new AppError('At least one field is required to update', 400);
  }

  const banner = await GlobalSetting.findOneAndUpdate(
    { key, group: 'app_banner' },
    updates,
    { new: true, runValidators: true }
  );

  if (!banner) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, banner, t(lang, 'contentSetting.updated'), 200);
});

export const deleteAppBanner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const key = normalizeParamValue(req.params.key);

  const banner = await GlobalSetting.findOneAndDelete({ key, group: 'app_banner' });
  if (!banner) {
    throw new AppError(t(lang, 'contentSetting.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'contentSetting.deleted'), 200);
});
