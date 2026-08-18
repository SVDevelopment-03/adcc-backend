import { Response, Request } from 'express';
import mongoose from 'mongoose';
import Lookup from '@/models/lookup.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { refreshLookupCache } from '@/services/lookup.service';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';

const ensureObjectId = (id: string): mongoose.Types.ObjectId => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid ID', 400);
  }
  return new mongoose.Types.ObjectId(id);
};

const isAdminCaller = (req: AuthRequest): boolean => Boolean(req.user);

const extractUploadedIconUrl = async (req: AuthRequest): Promise<string | undefined> => {
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

  const files = fileFromSingle ? [fileFromSingle] : flattenedFiles;
  const iconFile = files.find((file) => (file.fieldname || '').toLowerCase() === 'icon') || files[0];
  if (!iconFile) return undefined;

  const uploaded = await uploadImageBufferToS3(
    iconFile.buffer,
    iconFile.mimetype,
    iconFile.originalname,
    'lookup-icons'
  );
  return uploaded.url;
};

/**
 * GET /api/lookups?type=event_category
 * Public list of active entries for a type, ordered for display.
 * Authenticated staff can pass includeInactive=true to also see disabled entries
 * (needed by the admin management screen).
 */
export const getLookups = asyncHandler(async (req: Request, res: Response) => {
  const type = String(req.query.type || '').trim().toLowerCase();
  if (!type) {
    throw new AppError('type query parameter is required', 400);
  }

  const includeInactive = String(req.query.includeInactive) === 'true' && isAdminCaller(req as AuthRequest);

  const filter: Record<string, unknown> = { type };
  if (!includeInactive) {
    filter.active = true;
  }
  if (typeof req.query.parentValue === 'string' && req.query.parentValue.trim()) {
    filter.parentValue = req.query.parentValue.trim();
  }

  const items = await Lookup.find(filter).sort({ order: 1, label: 1 }).lean();
  sendSuccess(res, items, 'Lookups retrieved');
});

export const createLookup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { type, value, label, labelAr, parentValue, order, active } = req.body;
  const normalizedType = String(type).trim().toLowerCase();
  const normalizedValue = String(value || label).trim();
  const normalizedParentValue = parentValue ? String(parentValue).trim() : undefined;

  const existing = await Lookup.findOne({ type: normalizedType, value: normalizedValue, parentValue: normalizedParentValue });
  if (existing) {
    throw new AppError('A lookup with this value already exists for this type', 409);
  }

  const uploadedIconUrl = await extractUploadedIconUrl(req);

  const lookup = await Lookup.create({
    type: normalizedType,
    value: normalizedValue,
    label,
    labelAr,
    parentValue: normalizedParentValue,
    icon: uploadedIconUrl,
    order: order ?? 0,
    active: active ?? true,
  });

  await refreshLookupCache(normalizedType);
  sendSuccess(res, lookup, 'Lookup created', 201);
});

export const updateLookup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const lookup = await Lookup.findById(ensureObjectId(String(id)));

  if (!lookup) {
    throw new AppError('Lookup not found', 404);
  }

  const { label, labelAr, parentValue, order, active, removeIcon } = req.body;
  const uploadedIconUrl = await extractUploadedIconUrl(req);

  if (label !== undefined) lookup.label = label;
  if (labelAr !== undefined) lookup.labelAr = labelAr;
  if (parentValue !== undefined) lookup.parentValue = parentValue;
  if (order !== undefined) lookup.order = order;
  if (active !== undefined) lookup.active = active;
  if (uploadedIconUrl !== undefined) {
    lookup.icon = uploadedIconUrl;
  } else if (removeIcon === true) {
    lookup.icon = undefined;
  }

  await lookup.save();
  await refreshLookupCache(lookup.type);
  sendSuccess(res, lookup, 'Lookup updated');
});

export const deleteLookup = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const lookup = await Lookup.findOneAndDelete({ _id: ensureObjectId(String(id)) });

  if (!lookup) {
    throw new AppError('Lookup not found', 404);
  }

  await refreshLookupCache(lookup.type);
  sendSuccess(res, null, 'Lookup deleted');
});
