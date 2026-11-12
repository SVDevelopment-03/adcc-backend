import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';
import { AppError } from '@/utils/app-error';
import Media from '@/models/media.model';

const FOLDER_MAP: Record<string, string> = {
  events: 'events',
  'event-gallery': 'events/galleries',
  'event-galleries': 'events/galleries',
  'events-gallery': 'events/galleries',
  'events-galleries': 'events/galleries',
     
  tracks: 'tracks',
  'track-gallery': 'tracks/galleries',
  'track-galleries': 'tracks/galleries',
  'tracks-gallery': 'tracks/galleries',
  'tracks-galleries': 'tracks/galleries',

  store: 'store',
  'store-items': 'store/items',
  'store-item': 'store/items',
  'store-photos': 'store/items',
  'store-galleries': 'store/galleries',
  'store-items-galleries': 'store/galleries',
  'store-item-galleries': 'store/galleries',
  'merchandise-banners': 'merchandise/banners',
  'merchandise-banner': 'merchandise/banners',
  'merchandise-offer-banner': 'merchandise/banners',
  'merchandise-products': 'merchandise/products',
  'merchandise-product': 'merchandise/products',
  'product-images': 'merchandise/products',
  'product-gallery': 'merchandise/products',
  'product-categories': 'product/categories',
  'product-category': 'product/categories',
  'merchandise-categories': 'product/categories',
  'product-banners': 'product/banners',
  'product-banner': 'product/banners',
  community: 'community',
  'community-posts': 'community/posts',
  'community-post': 'community/posts',
  'community-gallery': 'community/galleries',
  'community-galleries': 'community/galleries',
  gallery: 'community/galleries',
  galleries: 'community/galleries',
  gelleries: 'community/galleries',
  challenge: 'challenges',
  challenges: 'challenges',
  badge: 'badges',
  badges: 'badges',
  'feed-posts': 'feed/posts',
  members: 'members',
  'member-profile': 'members',
  'members-profile': 'members',
  content: 'content',
  'content-section': 'content/sections',
  'content-sections': 'content/sections',
  'badge-images' : 'badge-images',
  'lookup-icons': 'lookups/icons',
  'lookup-icon': 'lookups/icons',
  news: 'news',
  'news-cover': 'news',
  'news-covers': 'news',
  partners: 'partners/logos',
  'partner-logos': 'partners/logos',
  'partner-logo': 'partners/logos',
  'page-banners': 'pages/banners',
};

let s3Client: S3Client | null = null;

const getAwsConfig = () => {
  const bucket = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_Secret_KEY;

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new AppError(
      'AWS S3 is not configured. Please set AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
      500
    );
  }

  return { bucket, region, accessKeyId, secretAccessKey };
};

const getS3Client = () => {
  if (!s3Client) {
    const { region, accessKeyId, secretAccessKey } = getAwsConfig();
    s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return s3Client;
};

const sanitizeFileName = (name: string) => {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-');
};

const buildPublicUrl = (bucket: string, region: string, key: string) => {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
};

const getExtension = (originalName: string, mimeType: string) => {
  const extFromName = path.extname(originalName);
  if (extFromName) return extFromName.toLowerCase();

  const mimeExtMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv',
    'video/webm': '.webm',
    'video/mpeg': '.mpeg',
  };

  return mimeExtMap[mimeType] || '.jpg';
};

export const resolveUploadFolder = (folderKey: string) => {
  const normalizedKey = String(folderKey || '').trim().toLowerCase();
  const folder = FOLDER_MAP[normalizedKey];
  if (!folder) {
    throw new AppError(
      'Invalid upload folder. Allowed folders: events, tracks, store-items, store-items-galleries, community, community-posts, feed-posts, galleries, events-galleries, tracks-galleries, community-galleries, challenges, badges, content-sections, members-profile, merchandise-banners, merchandise-products, product-banners, product-categories, merchandise-categories, lookup-icons, news, partner-logos, page-banners.',
      400
    );
  }
  return folder;
};

export const hashFileBuffer = (fileBuffer: Buffer): string =>
  crypto.createHash('sha256').update(fileBuffer).digest('hex');

/** Reads a stored object back from the bucket (used to hand a library image to an upload field). */
export const getS3ObjectBuffer = async (key: string): Promise<{ buffer: Buffer; contentType?: string }> => {
  const { bucket } = getAwsConfig();
  const response = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) {
    throw new AppError('File not found in storage', 404);
  }
  const bytes = await response.Body.transformToByteArray();
  return { buffer: Buffer.from(bytes), contentType: response.ContentType };
};

/**
 * The browser-supplied MIME type is only a label: check the bytes really are
 * that kind of image, so a renamed text/HTML file can't be stored under an
 * image URL, and refuse SVGs that carry scripts or event handlers.
 */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'avif']);
export const assertImageContent = (buffer: Buffer, mimeType: string) => {
  if (!mimeType.startsWith('image/')) return;
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString('latin1');
  let ok: boolean;
  switch (mimeType) {
    case 'image/jpeg':
      ok = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      break;
    case 'image/png':
      ok = ascii(0, 8) === '\x89PNG\r\n\x1a\n';
      break;
    case 'image/gif':
      ok = ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
      break;
    case 'image/webp':
      ok = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
      break;
    case 'image/heic':
    case 'image/heif':
    case 'image/avif':
      ok = ascii(4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(8, 12));
      break;
    case 'image/svg+xml': {
      const text = buffer.toString('utf8');
      ok = /<svg[\s>]/i.test(text) && !/<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(text);
      break;
    }
    default:
      ok = true;
  }
  if (!ok) {
    throw new AppError('The file is not a valid image (or contains unsafe content). Please upload a real JPG, PNG, WebP, GIF or HEIC image.', 400);
  }
};

export const uploadImageBufferToS3 = async (
  fileBuffer: Buffer,
  mimeType: string,
  originalName: string,
  folderKey: string,
  uploadedBy?: string
) => {
  assertImageContent(fileBuffer, mimeType);
  try {
    const { bucket, region } = getAwsConfig();
    const client = getS3Client();
    const folder = resolveUploadFolder(folderKey);

    // The same file is often submitted more than once — e.g. an image picked
    // from the Media Library and then saved with a form. Reuse the stored copy
    // instead of adding a duplicate object and a duplicate library entry.
    const hash = hashFileBuffer(fileBuffer);
    try {
      const existing = await Media.findOne({ hash }).select('key url').lean();
      if (existing) {
        return { key: existing.key, url: existing.url };
      }
    } catch (lookupError) {
      console.error('Media library duplicate check failed:', lookupError);
    }

    const extension = getExtension(originalName, mimeType);
    const safeName = sanitizeFileName(path.basename(originalName, path.extname(originalName)));
    const uniquePart = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const key = `${folder}/${safeName}-${uniquePart}${extension}`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      })
    );

    const result = {
      key,
      url: buildPublicUrl(bucket, region, key),
    };

    // Record every upload in the shared media catalog — this is the single
    // chokepoint all ~15+ upload controllers funnel through, so hooking it
    // here means the "choose an existing image" picker sees uploads from
    // anywhere in the app without each call site needing to know about it.
    // Never let a catalog write failure break the actual upload.
    try {
      await Media.create({
        url: result.url,
        key,
        folder,
        name: originalName,
        mimeType,
        size: fileBuffer.length,
        hash,
        uploadedBy: uploadedBy || undefined,
      });
    } catch (catalogError) {
      console.error('Failed to record media library entry:', catalogError);
    }

    return result;
  } catch (error: any) {
    const details = error?.name || error?.Code || error?.code || 'UnknownS3Error';
    const message = error?.message || 'S3 upload failed';
    throw new AppError(`S3 upload failed (${details}): ${message}`, 502);
  }
};
