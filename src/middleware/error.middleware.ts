import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/app-error';
import multer from 'multer';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  // Custom app errors
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  if ((err as any).name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if ((err as any).name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Mongoose: invalid ObjectId
  if ((err as any).name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  // Mongoose: validation error
  if ((err as any).name === 'ValidationError') {
    statusCode = 400;
    message = Object.values((err as any).errors)
      .map((e: any) => e.message)
      .join(', ');
  }

  // Mongo duplicate key
  if ((err as any).code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value';
  }

  // Payload too large error
  if ((err as any).type === 'entity.too.large' || (err as any).name === 'PayloadTooLargeError') {
    statusCode = 413;
    message = 'Request payload too large. Maximum size is 50MB. Consider compressing images or reducing the number of images.';
  }

  // Multer upload errors
  if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Image is too large. Maximum allowed size is 10MB.';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Invalid upload field. Use "image" for single upload or "images" for multiple upload.';
    } else {
      message = err.message;
    }
  }

  // Generic upload filter errors
  if (err.message === 'Only image files are allowed') {
    statusCode = 400;
    message = err.message;
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
