import { Request, Response } from 'express';
import News from '@/models/news.model';
import { t } from '@/utils/i18n';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import { localizeNewsStatic } from '@/utils/localization';

const attachNewsImage = async (req: AuthRequest, data: Record<string, any>) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return data;

  const uploadResult = await uploadImageBufferToS3(
    file.buffer,
    file.mimetype,
    file.originalname,
    'news'
  );
  data.coverImage = uploadResult.url;

  return data;
};

const buildSearchFilter = (q: unknown) => {
  if (!q || typeof q !== 'string') return undefined;
  const searchRegex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return [{ title: searchRegex }, { titleAr: searchRegex }, { content: searchRegex }];
};

/**
 * Create a news article
 * POST /v1/news
 * Admin / content-manager only (route-gated)
 */
export const createNews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const newsData: Record<string, any> = {
    ...req.body,
    publishedAt:
      req.body.status === 'Published'
        ? req.body.publishedAt
          ? new Date(req.body.publishedAt)
          : new Date()
        : req.body.publishedAt
        ? new Date(req.body.publishedAt)
        : undefined,
    createdBy: userId,
  };

  await attachNewsImage(req, newsData);

  const news = await News.create(newsData);

  const payload = news.toObject();
  localizeNewsStatic(payload as Record<string, any>, lang);
  sendSuccess(res, payload, t(lang, 'news.created'), 201);
});

/**
 * Get published news (public)
 * GET /v1/news
 */
export const getAllNews = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { category, q, page = 1, limit = 10 } = req.query as any;

  const filter: any = { status: 'Published' };
  if (category) filter.category = category;
  const searchOr = buildSearchFilter(q);
  if (searchOr) filter.$or = searchOr;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    News.find(filter)
      .populate('createdBy', 'fullName')
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    News.countDocuments(filter),
  ]);

  items.forEach((item) => localizeNewsStatic(item as Record<string, any>, lang));

  sendSuccess(
    res,
    {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    t(lang, 'news.allNews'),
    200
  );
});

/**
 * Get a published news article by id (public)
 * GET /v1/news/:id
 */
export const getNewsById = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;

  const news = await News.findOne({ _id: id, status: 'Published' }).populate('createdBy', 'fullName');
  if (!news) {
    throw new AppError(t(lang, 'news.not_found'), 404);
  }

  const payload = news.toObject();
  localizeNewsStatic(payload as Record<string, any>, lang);
  sendSuccess(res, payload, t(lang, 'news.details'), 200);
});

/**
 * Get news of any status for the dashboard (Admin / content-manager only, route-gated)
 * GET /v1/news/admin/all
 */
export const getAdminNews = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { status, category, q, page = 1, limit = 10 } = req.query as any;

  const filter: any = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  const searchOr = buildSearchFilter(q);
  if (searchOr) filter.$or = searchOr;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    News.find(filter)
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    News.countDocuments(filter),
  ]);

  items.forEach((item) => localizeNewsStatic(item as Record<string, any>, lang));

  sendSuccess(
    res,
    {
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
    t(lang, 'news.allNews'),
    200
  );
});

/**
 * Get a news article of any status by id for the dashboard (Admin / content-manager only, route-gated)
 * GET /v1/news/admin/:id
 */
export const getAdminNewsById = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;

  const news = await News.findById(id).populate('createdBy', 'fullName');
  if (!news) {
    throw new AppError(t(lang, 'news.not_found'), 404);
  }

  const payload = news.toObject();
  localizeNewsStatic(payload as Record<string, any>, lang);
  sendSuccess(res, payload, t(lang, 'news.details'), 200);
});

/**
 * Update a news article
 * PATCH /v1/news/:id
 * Admin / content-manager only (route-gated)
 */
export const updateNews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;

  const news = await News.findById(id);
  if (!news) {
    throw new AppError(t(lang, 'news.not_found'), 404);
  }

  const updates: Record<string, any> = { ...req.body };

  if (updates.status === 'Published' && news.status !== 'Published' && !updates.publishedAt) {
    updates.publishedAt = new Date();
  }
  if (updates.publishedAt) {
    updates.publishedAt = new Date(updates.publishedAt);
  }

  await attachNewsImage(req, updates);

  Object.assign(news, updates);
  await news.save();

  const payload = news.toObject();
  localizeNewsStatic(payload as Record<string, any>, lang);
  sendSuccess(res, payload, t(lang, 'news.updated'), 200);
});

/**
 * Permanently delete a news article
 * DELETE /v1/news/:id
 * Admin / content-manager only (route-gated)
 */
export const deleteNews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;

  const news = await News.findByIdAndDelete(id);
  if (!news) {
    throw new AppError(t(lang, 'news.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'news.deleted'), 200);
});
