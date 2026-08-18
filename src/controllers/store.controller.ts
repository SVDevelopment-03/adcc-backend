import { Response } from 'express';
import mongoose from 'mongoose';
import StoreItem from '@/models/store-item.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { t } from '@/utils/i18n';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import User from '@/models/user.model';
import { notifyAdminStoreItemPending } from '@/services/admin-notification.service';
import feedStoreNotificationService from '@/services/feed-store-notification.service';
import { localizeStoreItemStatic, SupportedLanguage } from '@/utils/localization';

const isAdmin = (req: AuthRequest): boolean => req.user?.role === 'Admin';

const isOwner = (req: AuthRequest, item: any): boolean => {
  const userId = req.user?.id;
  if (!userId) return false;
  return item.createdBy?.toString?.() === userId.toString();
};

const ensureObjectId = (id: string): mongoose.Types.ObjectId => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid item ID', 400);
  }
  return new mongoose.Types.ObjectId(id);
};

const normalizePhotosInput = (value: unknown): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => item !== '__uploaded_photos__');
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

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

const enrichSellerFields = (item: any, lang?: string) => {
  const createdBy = item?.createdBy;
  const createdByName =
    createdBy && typeof createdBy === 'object'
      ? String(createdBy.fullName || createdBy.name || '').trim()
      : '';
  const sellerName =
    createdByName || String(item?.sellerName || '').trim() || 'Unknown Seller';

  const enriched = {
    ...item,
    sellerName,
    postedBy: sellerName,
  };

  if (lang) {
    localizeStoreItemStatic(enriched, lang as SupportedLanguage);
  }

  return enriched;
};

const attachStoreItemImages = async (req: AuthRequest, data: Record<string, any>) => {
  const files = req.files as {
    [fieldname: string]: Express.Multer.File[];
  } | undefined;

  if (!files) return data;

  if (files.coverImage?.length) {
    const uploadResult = await uploadImageBufferToS3(
      files.coverImage[0].buffer,
      files.coverImage[0].mimetype,
      files.coverImage[0].originalname,
      'store-items'
    );
    data.coverImage = uploadResult.url;
  }

  if (files.photos?.length) {
    const uploaded = await Promise.all(
      files.photos.map(async (file) => {
        const result = await uploadImageBufferToS3(
          file.buffer,
          file.mimetype,
          file.originalname,
          'store-items-galleries'
        );
        return result.url;
      })
    );
    data.photos = [...(data.photos || []), ...uploaded];
  }

  if (files['photos[]']?.length) {
    const uploaded = await Promise.all(
      files['photos[]'].map(async (file) => {
        const result = await uploadImageBufferToS3(
          file.buffer,
          file.mimetype,
          file.originalname,
          'store-items-galleries'
        );
        return result.url;
      })
    );
    data.photos = [...(data.photos || []), ...uploaded];
  }

  if (files.video?.length) {
    const uploadResult = await uploadImageBufferToS3(
      files.video[0].buffer,
      files.video[0].mimetype,
      files.video[0].originalname,
      'store-items'
    );
    data.video = uploadResult.url;
  }

  return data;
};

/**
 * Create store item
 * POST /v1/store/items
 * Member/Staff
 */
export const createStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const data: any = { ...req.body };
  data.photos = normalizePhotosInput(data.photos);
  await attachStoreItemImages(req, data);
  if (!data.coverImage && Array.isArray(data.photos) && data.photos.length > 0) {
    data.coverImage = data.photos[0];
  }
  if ((data.photos == null || data.photos.length === 0) && !data.video) {
    throw new AppError('At least one photo or a video is required', 400);
  }
  if (Array.isArray(data.photos) && data.photos.length > 5) {
    throw new AppError('Up to 5 photos are allowed', 400);
  }

  const seller = await User.findById(userId).select('fullName').lean();
  const sellerName = seller?.fullName?.trim() || 'Unknown Seller';

  const item = await StoreItem.create({
    ...data,
    status: 'Pending',
    isFeatured: false,
    createdBy: userId,
    sellerName,
  });

  void notifyAdminStoreItemPending({
    itemTitle: item.title,
    itemId: item._id.toString(),
    sellerName,
  });

  sendSuccess(
    res,
    enrichSellerFields(item.toObject ? item.toObject() : item, lang),
    t(lang, 'store.created'),
    201
  );
});

/**
 * List approved store items (public)
 * GET /v1/store/items
 */
export const getStoreItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { page = 1, limit = 10, status, category, condition, city, minPrice, maxPrice, q } = req.query as any;

  const filter: any = {};
  filter.status = isAdmin(req) && status ? status : 'Approved';
  if (category) filter.category = category;
  if (condition) filter.condition = condition;
  if (city) filter.city = city;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (q) {
    filter.$or = [
      { title: { $regex: String(q), $options: 'i' } },
      { description: { $regex: String(q), $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    StoreItem.find(filter)
      .populate('createdBy', 'fullName profileImage')
      .sort({ isFeatured: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    StoreItem.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      items: items.map((i) => enrichSellerFields(i, lang)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'store.list')
  );
});

/**
 * Admin list (pending/any status)
 * GET /v1/store/admin/items
 */
export const getAdminStoreItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  if (!isAdmin(req)) {
    throw new AppError(t(lang, 'store.admin_required'), 403);
  }

  const { page = 1, limit = 10, status = 'Pending', category, condition, city, minPrice, maxPrice, q, sellerId } = req.query as any;
  const filter: any = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (condition) filter.condition = condition;
  if (city) filter.city = city;
  if (sellerId) filter.createdBy = ensureObjectId(String(sellerId));
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (q) {
    filter.$or = [
      { title: { $regex: String(q), $options: 'i' } },
      { description: { $regex: String(q), $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    StoreItem.find(filter)
      .populate('createdBy', 'fullName profileImage')
      .populate('approvedBy', 'fullName')
      .populate('rejectedBy', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    StoreItem.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      items: items.map((i) => enrichSellerFields(i, lang)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'store.admin_list')
  );
});

/**
 * Get my listings
 * GET /v1/store/my-items
 */
export const getMyStoreItems = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const { page = 1, limit = 10, status } = req.query as any;
  const filter: any = { createdBy: userId };
  if (status) filter.status = status;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    StoreItem.find(filter)
      .populate('createdBy', 'fullName profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    StoreItem.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      items: items.map((i) => enrichSellerFields(i, lang)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'store.my_list')
  );
});

/**
 * Get store item by ID
 * GET /v1/store/items/:id
 */
export const getStoreItemById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const item = await StoreItem.findById(id)
    .populate('createdBy', 'fullName profileImage')
    .lean();

  if (!item) {
    throw new AppError(t(lang, 'store.not_found'), 404);
  }

  const canView = item.status === 'Approved' || isAdmin(req) || isOwner(req, item);
  if (!canView) {
    throw new AppError(t(lang, 'store.not_found'), 404);
  }

  sendSuccess(res, enrichSellerFields(item, lang), t(lang, 'store.details'));
});

/**
 * Update store item
 * PATCH /v1/store/items/:id
 */
export const updateStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const item = await StoreItem.findById(id);
  if (!item) {
    throw new AppError(t(lang, 'store.not_found'), 404);
  }

  if (!isAdmin(req) && !isOwner(req, item)) {
    throw new AppError(t(lang, 'store.forbidden'), 403);
  }

  if (item.status === 'Sold' || item.status === 'Archived') {
    throw new AppError(t(lang, 'store.update_not_allowed'), 400);
  }

  const updates = { ...req.body } as any;
  if (updates.photos !== undefined) {
    updates.photos = normalizePhotosInput(updates.photos);
  }
  await attachStoreItemImages(req, updates);
  if (updates.photos && updates.photos.length > 5) {
    throw new AppError('Up to 5 photos are allowed', 400);
  }
  if (updates.photos && !updates.coverImage) {
    updates.coverImage = updates.photos[0];
  }

  if (!isAdmin(req) && item.status === 'Approved') {
    updates.status = 'Pending';
    updates.approvedBy = undefined;
    updates.approvedAt = undefined;
    updates.isFeatured = false;
  }

  const updated = await StoreItem.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('createdBy', 'fullName profileImage')
    .lean();

  sendSuccess(
    res,
    updated ? enrichSellerFields(updated, lang) : updated,
    t(lang, 'store.updated')
  );
});

/**
 * Archive store item (soft delete)
 * DELETE /v1/store/items/:id
 */
export const archiveStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const item = await StoreItem.findById(id);
  if (!item) {
    throw new AppError(t(lang, 'store.not_found'), 404);
  }

  if (!isAdmin(req) && !isOwner(req, item)) {
    throw new AppError(t(lang, 'store.forbidden'), 403);
  }

  item.status = 'Archived';
  item.isFeatured = false;
  await item.save();

  sendSuccess(
    res,
    enrichSellerFields(item.toObject ? item.toObject() : item, lang),
    t(lang, 'store.archived')
  );
});

/**
 * Approve item
 * POST /v1/store/items/:id/approve
 */
export const approveStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  if (!isAdmin(req)) {
    throw new AppError(t(lang, 'store.admin_required'), 403);
  }

  const { id } = req.params;
  const updates: any = {
    status: 'Approved',
    approvedBy: req.user?.id,
    approvedAt: new Date(),
    rejectedBy: undefined,
    rejectedAt: undefined,
    rejectionReason: undefined,
  };

  if (typeof req.body?.isFeatured === 'boolean') {
    updates.isFeatured = req.body.isFeatured;
  }

  const item = await StoreItem.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  })
    .populate('createdBy', 'fullName profileImage')
    .lean();

  if (!item) {
    throw new AppError(t(lang, 'store.not_found'), 404);
  }

  void feedStoreNotificationService.notifyStoreItemApproved(String(item._id));

  sendSuccess(res, enrichSellerFields(item, lang), t(lang, 'store.approved'));
});

/**
 * Reject item
 * POST /v1/store/items/:id/reject
 */
export const rejectStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  if (!isAdmin(req)) {
    throw new AppError(t(lang, 'store.admin_required'), 403);
  }

  const { id } = req.params;
  const item = await StoreItem.findByIdAndUpdate(
    id,
    {
      status: 'Rejected',
      rejectedBy: req.user?.id,
      rejectedAt: new Date(),
      rejectionReason: req.body.reason,
      isFeatured: false,
    },
    { new: true, runValidators: true }
  )
    .populate('createdBy', 'fullName profileImage')
    .lean();

  if (!item) {
    throw new AppError(t(lang, 'store.not_found'), 404);
  }

  void feedStoreNotificationService.notifyStoreItemRejected(String(item._id), req.body?.reason);

  sendSuccess(res, enrichSellerFields(item, lang), t(lang, 'store.rejected'));
});

/**
 * Feature/unfeature item
 * POST /v1/store/items/:id/feature
 */
export const featureStoreItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  if (!isAdmin(req)) {
    throw new AppError(t(lang, 'store.admin_required'), 403);
  }

  const { id } = req.params;
  const item = await StoreItem.findById(id);
  if (!item) {
    throw new AppError(t(lang, 'store.not_found'), 404);
  }

  if (item.status !== 'Approved') {
    throw new AppError(t(lang, 'store.feature_requires_approval'), 400);
  }

  item.isFeatured = !!req.body.isFeatured;
  await item.save();

  sendSuccess(res, enrichSellerFields(item, lang), t(lang, 'store.featured'));
});

/**
 * Mark item as sold
 * POST /v1/store/items/:id/sold
 */
export const markStoreItemSold = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const item = await StoreItem.findById(id);
  if (!item) {
    throw new AppError(t(lang, 'store.not_found'), 404);
  }

  if (!isAdmin(req) && !isOwner(req, item)) {
    throw new AppError(t(lang, 'store.forbidden'), 403);
  }

  item.status = 'Sold';
  item.isFeatured = false;
  await item.save();

  sendSuccess(res, enrichSellerFields(item, lang), t(lang, 'store.sold'));
});
