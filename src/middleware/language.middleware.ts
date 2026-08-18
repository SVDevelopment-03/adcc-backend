import { Request, Response, NextFunction } from 'express';
import { resolveRequestLanguage } from '@/utils/localization';

export const languageMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  (req as Request & { lang?: 'en' | 'ar' }).lang = resolveRequestLanguage(req);

  next();
};
