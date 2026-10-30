import { Request, Response } from 'express';
import PageSection from '@/models/page-section.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import { PAGE_SECTION_SCHEMAS } from '@/validators/page-section.validator';

const PAGE_IMAGE_FOLDER = 'page-banners';

const normalizeParam = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] || '' : value || '').trim().toLowerCase();

const parseContentField = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to the error below
    }
  }
  throw new AppError('"content" must be a JSON object', 400);
};

// GET /pages/:page/sections/:section — public; `content` is null until the
// section has been saved once, and the site then shows its built-in defaults.
export const getPageSection = asyncHandler(async (req: Request, res: Response) => {
  const page = normalizeParam(req.params.page);
  const section = normalizeParam(req.params.section);

  const doc = await PageSection.findOne({ page, section }).lean();
  sendSuccess(
    res,
    { page, section, content: doc?.content ?? null, updatedAt: doc?.updatedAt ?? null },
    'Page section fetched successfully',
    200
  );
});

// PUT /pages/:page/sections/:section — multipart: `content` (JSON string) plus
// optional image files whose field name is the content key they replace
// (e.g. `imageEn`, `imageAr`).
export const upsertPageSection = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = normalizeParam(req.params.page);
  const section = normalizeParam(req.params.section);
  const schema = PAGE_SECTION_SCHEMAS[page]?.[section];
  if (!schema) {
    throw new AppError('Unknown page section', 404);
  }

  const content = parseContentField(req.body?.content);

  const files = ((req as any).files as Express.Multer.File[] | undefined) ?? [];
  for (const file of files) {
    if (!(file.fieldname in content) || typeof content[file.fieldname] === 'object') {
      throw new AppError(`Unexpected image field "${file.fieldname}"`, 400);
    }
    const uploaded = await uploadImageBufferToS3(
      file.buffer,
      file.mimetype,
      file.originalname,
      PAGE_IMAGE_FOLDER,
      req.user?.id
    );
    content[file.fieldname] = uploaded.url;
  }

  const result = schema.safeParse(content);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new AppError(JSON.stringify(errors, null, 2), 400);
  }

  const doc = await PageSection.findOneAndUpdate(
    { page, section },
    { $set: { content: result.data } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  sendSuccess(
    res,
    { page, section, content: doc?.content ?? result.data, updatedAt: doc?.updatedAt ?? null },
    'Page section saved successfully',
    200
  );
});
