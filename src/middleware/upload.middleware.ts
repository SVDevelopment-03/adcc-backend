import multer from 'multer';

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

// const settingsFields = upload.fields([
//   { name: 'image', maxCount: 1 },
//   { name: 'images', maxCount: 10 },
//   { name: 'images[]', maxCount: 10 },
// ]);

export const uploadSettingsImages = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return upload.any()(req, res, next);
  }
  return next();
};

export const uploadSettingsBulkImages = (req: any, res: any, next: any) => {
  const contentType = (req.headers['content-type'] || '').toString();
  if (contentType.includes('multipart/form-data')) {
    return upload.any()(req, res, next);
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
