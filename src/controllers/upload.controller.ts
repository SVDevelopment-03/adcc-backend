import { Response } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { uploadImageBufferToS3, resolveUploadFolder } from '@/services/s3-upload.service';

const getFolderParam = (value: string | string[]) => (Array.isArray(value) ? value[0] : value);
const getRequestedFolder = (req: AuthRequest) => {
  const paramFolder = req.params.folder ? getFolderParam(req.params.folder) : undefined;
  const queryFolder =
    typeof req.query.folder === 'string'
      ? req.query.folder
      : Array.isArray(req.query.folder)
        ? req.query.folder[0]
        : undefined;
  const bodyFolder = typeof req.body?.folder === 'string' ? req.body.folder : undefined;
  return paramFolder || queryFolder || bodyFolder || 'community';
};

export const uploadImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const folder = getRequestedFolder(req);
  resolveUploadFolder(folder);

  if (!req.file) {
    throw new AppError('Image file is required. Send it as form-data with key "image".', 400);
  }

  const uploaded = await uploadImageBufferToS3(
    req.file.buffer,
    req.file.mimetype,
    req.file.originalname,
    folder
  );

  return res.status(201).json({
    success: true,
    message: 'Image uploaded successfully',
    data: uploaded,
  });
});

export const uploadImages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const folder = getRequestedFolder(req);
  resolveUploadFolder(folder);

  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    throw new AppError('At least one image is required. Send images as form-data with key "images".', 400);
  }

  const uploadedImages = await Promise.all(
    req.files.map((file) =>
      uploadImageBufferToS3(file.buffer, file.mimetype, file.originalname, folder)
    )
  );

  return res.status(201).json({
    success: true,
    message: 'Images uploaded successfully',
    data: uploadedImages,
  });
});
