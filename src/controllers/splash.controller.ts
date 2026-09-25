import { Request, Response } from 'express';
import GlobalSetting from '@/models/global-setting.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';

/**
 * Public endpoint that returns the active splash configuration.
 * Response shape:
 * { url: string, type: 'image'|'video', duration?: number }
 */
export const getSplashPublic = asyncHandler(async (_req: Request, res: Response) => {
  // Prefer group 'splash-screen' and active items; return the first active item.
  const items = await GlobalSetting.find({ group: 'splash-screen', active: true })
    .select('group key title description image')
    .sort({ updatedAt: -1 })
    .lean();

  if (!items || items.length === 0) {
    return sendSuccess(res, null, 'No splash configured', 200);
  }

  const item = items[0];
  const url = item.image || null;
  if (!url) {
    return sendSuccess(res, null, 'No splash configured', 200);
  }

  const isVideoExtension = /\.(mp4|webm|mov|m3u8)(?:\?|$)/i.test(url);
  const payload: Record<string, any> = {
    url,
    type: isVideoExtension ? 'video' : 'image',
  };

  try {
    if (item.description) {
      const parsed = JSON.parse(item.description as string);
      const explicitType = parsed && typeof parsed.type === 'string' ? parsed.type.toLowerCase() : undefined;
      if (explicitType === 'video') {
        payload.type = 'video';
      } else if (explicitType === 'image' || explicitType === 'gif') {
        payload.type = 'image';
      }

      if (payload.type !== 'video' && parsed && typeof parsed.duration === 'number') {
        payload.duration = parsed.duration;
      }
    }
  } catch {
    // ignore
  }

  if (payload.type === 'video') {
    delete payload.duration;
    return sendSuccess(res, payload, 'Splash fetched', 200);
  }

  return sendSuccess(res, payload, 'Splash fetched', 200);
});
