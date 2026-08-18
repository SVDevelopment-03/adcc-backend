import { Request, Response, NextFunction } from 'express';

export const debugRequestBasics = (req: Request, _res: Response, next: NextFunction) => {
  if (process.env.DEBUG_REQUESTS !== 'true') {
    return next();
  }

  const headers = req.headers || {};
  const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];
  const filesKeys = (req as any).files
    ? Array.isArray((req as any).files)
      ? ['_array']
      : Object.keys((req as any).files || {})
    : [];

  console.log('[debug-request]', {
    method: req.method,
    url: req.originalUrl,
    contentType: headers['content-type'],
    contentLength: headers['content-length'],
    transferEncoding: headers['transfer-encoding'],
    hasBody: bodyKeys.length > 0,
    bodyKeys,
    filesKeys,
  });

  next();
};
