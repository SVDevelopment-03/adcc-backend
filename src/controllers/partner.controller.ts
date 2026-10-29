import { Request, Response } from 'express';
import Partner from '@/models/partner.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';

const PARTNER_LOGO_FOLDER = 'partner-logos';

const extractUploadedFiles = (req: Request): Express.Multer.File[] => {
  const files = (req as any).files as
    | Express.Multer.File[]
    | Record<string, Express.Multer.File[]>
    | undefined;
  const single = (req as any).file as Express.Multer.File | undefined;
  if (single) return [single];
  if (Array.isArray(files)) return files;
  return files ? Object.values(files).flat() : [];
};

const nameFromFile = (file: Express.Multer.File) =>
  (file.originalname || 'Partner').replace(/\.[^.]+$/, '').trim() || 'Partner';

const normalizeId = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] || '' : value || '';

// GET /partners — public; the homepage reads `?active=true`.
export const listPartners = asyncHandler(async (req: Request, res: Response) => {
  const { active } = req.query as { active?: boolean };
  const filter: Record<string, unknown> = {};
  if (typeof active === 'boolean') filter.active = active;

  const partners = await Partner.find(filter).sort({ order: 1, createdAt: 1 }).lean();
  sendSuccess(res, { partners }, 'Partners fetched successfully', 200);
});

// POST /partners — one or more logo files; each becomes a partner appended
// to the end of the current order.
export const createPartners = asyncHandler(async (req: AuthRequest, res: Response) => {
  const files = extractUploadedFiles(req);
  if (!files.length) {
    throw new AppError('At least one logo image is required.', 400);
  }

  const { name, active } = req.body as { name?: string; active?: boolean };
  const last = await Partner.findOne().sort({ order: -1 }).select('order').lean();
  const startOrder = (last?.order ?? -1) + 1;

  const partners = await Promise.all(
    files.map(async (file, index) => {
      const uploaded = await uploadImageBufferToS3(
        file.buffer,
        file.mimetype,
        file.originalname,
        PARTNER_LOGO_FOLDER
      );
      return Partner.create({
        name: files.length === 1 && name ? name : nameFromFile(file),
        logo: uploaded.url,
        order: startOrder + index,
        active: active ?? true,
      });
    })
  );

  sendSuccess(res, { partners }, 'Partners created successfully', 201);
});

// PATCH /partners/:id — rename, toggle active, or replace the logo.
export const updatePartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = normalizeId(req.params.id);
  const { name, active } = req.body as { name?: string; active?: boolean };

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (active !== undefined) updates.active = active;

  const [file] = extractUploadedFiles(req);
  if (file) {
    const uploaded = await uploadImageBufferToS3(
      file.buffer,
      file.mimetype,
      file.originalname,
      PARTNER_LOGO_FOLDER
    );
    updates.logo = uploaded.url;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('At least one field is required to update', 400);
  }

  const partner = await Partner.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!partner) {
    throw new AppError('Partner not found', 404);
  }

  sendSuccess(res, partner, 'Partner updated successfully', 200);
});

// PUT /partners/reorder — body `{ ids: [...] }` in the desired display order.
export const reorderPartners = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { ids } = req.body as { ids: string[] };

  await Partner.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
    }))
  );

  const partners = await Partner.find().sort({ order: 1, createdAt: 1 }).lean();
  sendSuccess(res, { partners }, 'Partners reordered successfully', 200);
});

export const deletePartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = normalizeId(req.params.id);
  const partner = await Partner.findByIdAndDelete(id);
  if (!partner) {
    throw new AppError('Partner not found', 404);
  }

  sendSuccess(res, null, 'Partner deleted successfully', 200);
});
