import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Media from '@/models/media.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { backfillMediaFromContent } from '@/services/media-backfill.service';

/**
 * GET /v1/media?search=&folder=&page=&limit=
 * Staff-only list of every previously uploaded file, newest first — backs
 * the "choose an existing image" picker used across the dashboard's upload
 * fields (see media.model.ts for why this is a single shared catalog).
 */
export const listMedia = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 60));
  const search = String(req.query.search || '').trim();
  const folder = String(req.query.folder || '').trim();

  const filter: Record<string, unknown> = {};
  if (folder) filter.folder = folder;
  if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

  const [items, total] = await Promise.all([
    Media.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Media.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    },
    'Media retrieved'
  );
});

/**
 * DELETE /v1/media/:id
 * Removes the catalog entry only — the underlying S3 object is left in
 * place so any content still referencing that URL keeps working (same
 * "remove from library" behavior the browser-only Media Library page used).
 */
export const deleteMedia = asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid media id', 400);
  }

  const item = await Media.findByIdAndDelete(id);
  if (!item) {
    throw new AppError('Media not found', 404);
  }

  sendSuccess(res, null, 'Media removed from library');
});

/**
 * POST /v1/media/backfill
 * Scans events/tracks/communities/banners/lookups for images uploaded before
 * the media catalog existed and adds them, so the picker also offers
 * pre-existing content, not just uploads made from now on. Safe to run
 * repeatedly — already-cataloged URLs are skipped.
 */
export const backfillMedia = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const result = await backfillMediaFromContent();
  sendSuccess(res, result, `Scanned ${result.scanned} image URL(s), added ${result.added} new`);
});
