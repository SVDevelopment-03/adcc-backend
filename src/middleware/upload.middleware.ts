import multer from 'multer';
import { AppError } from '@/utils/app-error';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/heic',
  'image/heif',
]);

const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'video/mpeg',
]);

const storage = multer.memoryStorage();

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    cb(new Error('Only image files are allowed'));
    return;
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
});

// Allow both images and videos for settings uploads (CMS may upload videos for splash)
const settingsFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (IMAGE_MIME_TYPES.has(file.mimetype) || VIDEO_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error('Only image or video files are allowed for this upload'));
};

const uploadWithVideos = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: settingsFileFilter,
});

const storeItemFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.fieldname === 'video') {
    if (!VIDEO_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Only video files are allowed for the video field'));
      return;
    }
    cb(null, true);
    return;
  }

  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    cb(new Error('Only image files are allowed for store item photos'));
    return;
  }

  cb(null, true);
};

const uploadStoreItemMedia = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: storeItemFileFilter,
});

export const uploadSingleImage = upload.single('image');
export const uploadMultipleImages = upload.array('images', 10);
const uploadStoreItemBody = upload.none();

const uploadStoreItemImages = uploadStoreItemMedia.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'photos', maxCount: 10 },
  { name: 'photos[]', maxCount: 10 },
  { name: 'video', maxCount: 1 },
]);

export const uploadEventImages = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'eventImage', maxCount: 1 },
  { name: 'galleryImages', maxCount: 10 },
  { name: 'galleryImage', maxCount: 10 },
  { name: 'badgeImage' , maxCount: 1},

]);

export const uploadEventImagesIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadEventImages(req, res, next);
  }
  return next();
};

export const uploadStoreItemBodyIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadStoreItemBody(req, res, next);
  }
  return next();
};

/**
 * Parse multipart/form-data fields without expecting any file uploads.
 * Useful when the frontend sends `FormData` for PATCH/POST endpoints but doesn't upload images.
 */
export const uploadBodyIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadStoreItemBody(req, res, next);
  }
  return next();
};

export const uploadStoreItemImagesIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadStoreItemImages(req, res, next);
  }
  return next();
};

export const uploadChallengeImageIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadSingleImage(req, res, next);
  }
  return next();
};

export const uploadBadgeImageIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadSingleImage(req, res, next);
  }
  return next();
};

export const uploadNewsImageIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadSingleImage(req, res, next);
  }
  return next();
};

export const uploadCommunityPostImageIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadSingleImage(req, res, next);
  }
  return next();
};

export const uploadFeedPostImageIfMultipart = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    // Accept files from any field name to avoid "Unexpected field" when the frontend key differs.
    // The multer instance still enforces image mime-types + max file size via upload configuration.
    return upload.any()(req, res, next);
  }

  return next();
};

/**
 * Admin-created feed posts: one optional `image` and one optional `video`.
 * Each field only accepts its own kind of file, with its own size cap.
 * Limits are mirrored in the dashboard (src/utils/feedMediaValidation.ts).
 */
export const FEED_IMAGE_MAX_SIZE_MB = 5;
export const FEED_VIDEO_MAX_SIZE_MB = 50;
const FEED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FEED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

const uploadFeedAdminMediaFields = multer({
  storage,
  // Multer has one per-file cap, so it is set to the larger (video) limit;
  // the image cap is checked per field below.
  limits: { fileSize: FEED_VIDEO_MAX_SIZE_MB * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'image') {
      if (!FEED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        cb(new AppError('Image must be a JPG, PNG or WebP file', 400));
        return;
      }
      cb(null, true);
      return;
    }
    if (file.fieldname === 'video') {
      if (!FEED_VIDEO_MIME_TYPES.has(file.mimetype)) {
        cb(new AppError('Video must be an MP4, MOV or WebM file', 400));
        return;
      }
      cb(null, true);
      return;
    }
    cb(new AppError(`Unexpected file field "${file.fieldname}". Use "image" or "video".`, 400));
  },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
]);

export const uploadFeedAdminMedia = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  return uploadFeedAdminMediaFields(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(`Video size must not exceed ${FEED_VIDEO_MAX_SIZE_MB}MB`, 400));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return next(
          new AppError('Upload at most one image (field "image") and one video (field "video")', 400)
        );
      }
      return next(new AppError(err.message, 400));
    }
    if (err) return next(err);

    const image = req.files?.image?.[0] as Express.Multer.File | undefined;
    if (image && image.size > FEED_IMAGE_MAX_SIZE_MB * 1024 * 1024) {
      return next(new AppError(`Image size must not exceed ${FEED_IMAGE_MAX_SIZE_MB}MB`, 400));
    }
    return next();
  });
};

// const settingsFields = upload.fields([
//   { name: 'image', maxCount: 1 },
//   { name: 'images', maxCount: 10 },
//   { name: 'images[]', maxCount: 10 },
// ]);

export const uploadSettingsImages = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    // Use the relaxed uploader that accepts images AND videos for CMS settings
    return uploadWithVideos.any()(req, res, next);
  }
  return next();
};

// Partner logos: images only, any field name, so the dashboard can send one or
// many files in a single request.
export const uploadPartnerLogos = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return upload.any()(req, res, next);
  }
  return next();
};

// Page section images (e.g. homepage banner): PNG/JPG only, 1MB max — the
// same limits the dashboard enforces before upload.
const PAGE_IMAGE_MAX_SIZE_MB = 1;
const PAGE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

// The homepage banner's video mode: the one place a page section takes a
// video. Only the `videoUrl` field of home/banner accepts one.
export const PAGE_VIDEO_MAX_SIZE_MB = 50;
export const PAGE_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);
const PAGE_VIDEO_FIELD = 'videoUrl';

const isBannerVideoField = (req: any, file: Express.Multer.File) =>
  file.fieldname === PAGE_VIDEO_FIELD &&
  String(req.params?.page || '').toLowerCase() === 'home' &&
  String(req.params?.section || '').toLowerCase() === 'banner';

const uploadPageImages = multer({
  storage,
  // Multer has a single per-file cap, so it is the (larger) video limit; the
  // image cap is enforced per file after parsing.
  limits: { fileSize: PAGE_VIDEO_MAX_SIZE_MB * 1024 * 1024, files: 12 },
  fileFilter: (req, file, cb) => {
    if (isBannerVideoField(req, file)) {
      if (!PAGE_VIDEO_MIME_TYPES.has(file.mimetype)) {
        cb(new AppError('Banner video must be an MP4 or WebM file', 400));
        return;
      }
      cb(null, true);
      return;
    }
    if (!PAGE_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError('Only PNG, JPG and JPEG images are allowed', 400));
      return;
    }
    cb(null, true);
  },
}).any();

export const uploadPageSectionImages = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  return uploadPageImages(req, res, (err: any) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(`Video size must not exceed ${PAGE_VIDEO_MAX_SIZE_MB}MB`, 400));
    }
    if (err) return next(err);

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const oversizedImage = files.find(
      (f) => !isBannerVideoField(req, f) && f.size > PAGE_IMAGE_MAX_SIZE_MB * 1024 * 1024
    );
    if (oversizedImage) {
      return next(new AppError(`Image size must not exceed ${PAGE_IMAGE_MAX_SIZE_MB}MB`, 400));
    }
    return next();
  });
};

export const uploadSettingsBulkImages =(req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return uploadWithVideos.any()(req, res, next);
  }
  return next();
};


export const requireParsedMultipartBody = (req: any, _res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }

  const hasBody = !!req.body && Object.keys(req.body).length > 0;
  const hasFiles =
    Array.isArray(req.files) ? req.files.length > 0 : !!req.files && Object.keys(req.files).length > 0;

  if (!hasBody && !hasFiles) {
    const error = new Error(
      'Multipart form-data was not parsed. Ensure Content-Type includes the multipart boundary and that your proxy forwards it.'
    );
    // @ts-ignore
    error.statusCode = 400;
    return next(error);
  }

  return next();
};

const trackImageFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
  { name: 'galleryImages', maxCount: 10 },
]);

export const uploadTrackImages = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return trackImageFields(req, res, next);
  }
  return next();
};

const communityImageFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
  { name: 'gallery', maxCount: 10 },
]);

export const uploadCommunityImages = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return communityImageFields(req, res, next);
  }
  return next();
};

const communityGalleryFields = upload.fields([
  { name: 'gallery', maxCount: 10 },
  { name: 'galleryImages', maxCount: 10 },
  { name: 'image', maxCount: 1 },
]);

export const uploadCommunityGalleryImages = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return communityGalleryFields(req, res, next);
  }
  return next();
};

export const requireMultipartFormData = (req: any, _res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (!contentType.includes('multipart/form-data')) {
    const error = new Error('Content-Type must be multipart/form-data with boundary');
    // @ts-ignore
    error.statusCode = 400;
    return next(error);
  }
  if (!contentType.includes('boundary=')) {
    const error = new Error(
      'Multipart boundary missing. Do not set Content-Type manually; let your client add the boundary.'
    );
    // @ts-ignore
    error.statusCode = 400;
    return next(error);
  }
  return next();
};
