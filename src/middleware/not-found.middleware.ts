import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/app-error';

export const notFound = (
  req: Request,
  _res: Response,

  next: NextFunction
) => {
  next(new AppError(`Not Found - ${req.originalUrl}`, 404));
};
