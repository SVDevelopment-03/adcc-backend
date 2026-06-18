import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';
import { AppError } from '@/utils/app-error';

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
  'badge-images' : 'badge-images'
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
      'Invalid upload folder. Allowed folders: events, tracks, store-items, store-items-galleries, community, community-posts, feed-posts, galleries, events-galleries, tracks-galleries, community-galleries, challenges, badges, content-sections, members-profile.',
      
      400
    );
  }
  return folder;
};

export const uploadImageBufferToS3 = async (
  fileBuffer: Buffer,
  mimeType: string,
  originalName: string,
  folderKey: string
) => {
  try {
    const { bucket, region } = getAwsConfig();
    const client = getS3Client();
    const folder = resolveUploadFolder(folderKey);
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

    return {
      key,
      url: buildPublicUrl(bucket, region, key),
    };
  } catch (error: any) {
    const details = error?.name || error?.Code || error?.code || 'UnknownS3Error';
    const message = error?.message || 'S3 upload failed';
    throw new AppError(`S3 upload failed (${details}): ${message}`, 502);
  }
};
