import Event from '@/models/event.model';
import Track from '@/models/track.model';
import Community from '@/models/community.model';
import GlobalSetting from '@/models/global-setting.model';
import Lookup from '@/models/lookup.model';
import Media from '@/models/media.model';

/**
 * One-time (repeatable, idempotent) backfill that scans every content
 * collection for image URLs and adds any not already in the shared media
 * catalog. Needed because the catalog only started recording uploads from
 * the moment uploadImageBufferToS3 was hooked (see s3-upload.service.ts) —
 * images uploaded before that never got a Media row, so they were invisible
 * to the "choose an existing image" picker. Skips anything already present.
 */

// Matches any AWS S3 virtual-hosted URL, e.g.
// https://my-bucket.s3.eu-west-1.amazonaws.com/events/foo-123.jpg
const S3_URL_PATTERN = /^https?:\/\/[^/]+\.s3[.-][^/]*amazonaws\.com\//i;

const collectUrls = (...values: Array<unknown>): string[] => {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (Array.isArray(v)) {
      v.forEach((item) => typeof item === 'string' && item && out.push(item));
    } else if (typeof v === 'string') {
      out.push(v);
    }
  }
  return out;
};

const parseUrl = (url: string): { key: string; folder: string; name: string } | null => {
  try {
    const parsed = new URL(url);
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!key) return null;
    const segments = key.split('/');
    const name = segments[segments.length - 1] || key;
    const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : 'legacy';
    return { key, folder, name };
  } catch {
    return null;
  }
};

export const backfillMediaFromContent = async (): Promise<{ scanned: number; added: number }> => {
  const urls = new Set<string>();

  const events = await Event.find({}).select('mainImage eventImage galleryImages rewards').lean();
  for (const e of events as any[]) {
    collectUrls(e.mainImage, e.eventImage, e.galleryImages, e.rewards?.badgeImage).forEach((u) => urls.add(u));
  }

  const tracks = await Track.find({}).select('image coverImage galleryImages').lean();
  for (const track of tracks as any[]) {
    collectUrls(track.image, track.coverImage, track.galleryImages).forEach((u) => urls.add(u));
  }

  const communities = await Community.find({}).select('image logo gallery').lean();
  for (const c of communities as any[]) {
    collectUrls(c.image, c.logo, c.gallery).forEach((u) => urls.add(u));
  }

  // Covers app banners, product banners (EN/AR), and any other GlobalSetting-backed image.
  const settings = await GlobalSetting.find({}).select('image').lean();
  for (const s of settings as any[]) {
    collectUrls(s.image).forEach((u) => urls.add(u));
  }

  const lookups = await Lookup.find({}).select('icon').lean();
  for (const l of lookups as any[]) {
    collectUrls(l.icon).forEach((u) => urls.add(u));
  }

  const s3Urls = Array.from(urls).filter((u) => S3_URL_PATTERN.test(u));
  if (!s3Urls.length) {
    return { scanned: 0, added: 0 };
  }

  const existing = await Media.find({ url: { $in: s3Urls } }).select('url').lean();
  const existingSet = new Set(existing.map((m) => m.url));

  const toInsert = s3Urls
    .filter((url) => !existingSet.has(url))
    .map((url) => {
      const parsed = parseUrl(url);
      if (!parsed) return null;
      return {
        url,
        key: parsed.key,
        folder: parsed.folder,
        name: parsed.name,
      };
    })
    .filter((doc): doc is NonNullable<typeof doc> => doc !== null);

  let added = 0;
  if (toInsert.length) {
    try {
      const result = await Media.insertMany(toInsert, { ordered: false });
      added = result.length;
    } catch (error: any) {
      // ordered:false still throws once any write fails (e.g. two content
      // records sharing the exact same image URL race on the unique `key`
      // index) — count what actually landed instead of losing the whole batch.
      added = error?.insertedDocs?.length ?? error?.result?.result?.nInserted ?? 0;
    }
  }

  return { scanned: s3Urls.length, added };
};
