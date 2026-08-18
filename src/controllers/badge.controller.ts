import { Request, Response } from 'express';
import Badge from '@/models/badge.model';
import { t } from '@/utils/i18n';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3 } from '@/services/s3-upload.service';
import { BADGE_ICONS } from '@/constants/badges';
import { localizeBadgeStatic } from '@/utils/localization';

const attachBadgeImage = async (req: AuthRequest, data: Record<string, any>) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return data;

  const uploadResult = await uploadImageBufferToS3(
    file.buffer,
    file.mimetype,
    file.originalname,
    'badges'
  );
  data.image = uploadResult.url;

  return data;
};

/**
 * Get available badge icons
 * GET /v1/badges/icons
 */
export const getBadgeIcons = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, { icons: BADGE_ICONS }, 'Badge icons retrieved');
});

/**
 * Create badge
 * POST /v1/badges
 * Admin only
 */
export const createBadge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const userId = req.user?.id;
 console.log('body', req.body);
  if (!userId) {
    throw new AppError(t(lang, 'auth.unauthorized'), 401);
  }

  const badgeData: Record<string, any> = {
    ...req.body,
  };

  const name = typeof badgeData.name === 'string' ? badgeData.name.trim() : '';
  if (!name) {
    throw new AppError(t(lang, 'badge.name_required'), 400);
  }
  badgeData.name = name;

  await attachBadgeImage(req, badgeData);

  const badge = await Badge.create(badgeData);

  sendSuccess(res, badge, t(lang, 'badge.created'), 201);
});

/**
 * Get all badges
 * GET /v1/badges
 */
export const getAllBadges = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { active, category, rarity, q, page = 1, limit = 10 } = req.query as any;

  const filter: any = {};
  if (typeof active === 'boolean') filter.active = active;
  if (category) filter.category = category;
  if (rarity) filter.rarity = rarity;
  if (q) {
    filter.$or = [
      { name: { $regex: String(q), $options: 'i' } },
      { description: { $regex: String(q), $options: 'i' } },
      { requirements: { $regex: String(q), $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  const [badges, total] = await Promise.all([
    Badge.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Badge.countDocuments(filter),
  ]);

  badges.forEach((badge) => localizeBadgeStatic(badge as Record<string, any>, lang));

  sendSuccess(
    res,
    {
      badges,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    },
    t(lang, 'badge.allBadges'),
    200
  );
});

/**
 * Get badge by ID
 * GET /v1/badges/:id
 */
export const getBadgeById = asyncHandler(async (req: Request, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;

  const badge = await Badge.findById(id);

  if (!badge) {
    throw new AppError(t(lang, 'badge.not_found'), 404);
  }

  localizeBadgeStatic(badge as unknown as Record<string, any>, lang);

  sendSuccess(res, badge, t(lang, 'badge.details'));
});

/**
 * Update badge
 * PATCH /v1/badges/:id
 * Admin only
 */
export const updateBadge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;
  const updateData: Record<string, any> = { ...req.body };

  await attachBadgeImage(req, updateData);

  const badge = await Badge.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!badge) {
    throw new AppError(t(lang, 'badge.not_found'), 404);
  }

  sendSuccess(res, badge, t(lang, 'badge.updated'));
});

/**
 * Delete badge
 * DELETE /v1/badges/:id
 * Admin only
 */
export const deleteBadge = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as any;
  const { id } = req.params;

  const badge = await Badge.findByIdAndDelete(id);

  if (!badge) {
    throw new AppError(t(lang, 'badge.not_found'), 404);
  }

  sendSuccess(res, null, t(lang, 'badge.deleted'));
});
