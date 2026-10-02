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
  const items = await GlobalSetting.find({ group: 'splash-screen' })
    .select('group key title description image active updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  if (!items || items.length === 0) {
    return sendSuccess(res, null, 'No splash configured', 200);
  }

  const selected = items
    .map((item) => {
      let priority = 1;
      let status = 'draft';
      let enabled = item.active === true;

      try {
        const parsed = item.description ? JSON.parse(item.description as string) : null;
        if (parsed && typeof parsed === 'object') {
          const rawPriority = Number(parsed.priority ?? 1);
          if (Number.isFinite(rawPriority)) priority = rawPriority;
          if (typeof parsed.status === 'string') status = parsed.status.toLowerCase();
          if (typeof parsed.enabled === 'boolean') enabled = parsed.enabled;
        }
      } catch {
        // ignore malformed metadata
      }

      const isStatusEnabled = status === 'current' || status === 'published' || status === 'scheduled';
      const isLive = enabled && isStatusEnabled;

      return {
        item,
        priority,
        status,
        enabled,
        isLive,
      };
    })
    .filter(({ item, isLive }) => {
      if (!isLive) return false;
      return item.image != null && item.image !== '';
    })
    .sort((a, b) => {
      const statusWeight: Record<string, number> = {
        current: 5,
        published: 4,
        scheduled: 3,
        draft: 1,
      };

      const aWeight = statusWeight[a.status] ?? 1;
      const bWeight = statusWeight[b.status] ?? 1;

      if (bWeight !== aWeight) return bWeight - aWeight;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.item.updatedAt ?? 0).getTime() - new Date(a.item.updatedAt ?? 0).getTime();
    })[0];

  if (!selected) {
    return sendSuccess(res, null, 'No splash configured', 200);
  }

  const { item } = selected;
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
