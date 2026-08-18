import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import { AppError } from '../utils/app-error';

export const validate =
  (schema: ZodType) =>
  (req: Request, _res: Response, next: NextFunction): void => {

    const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase());
    const hasBody = req.body !== undefined;
    const isBodyEmpty = !req.body || Object.keys(req.body).length === 0;

    let data: any = req.body;

    // For body methods, never validate params/query with a body schema
    if (isBodyMethod) {
      if (!hasBody) {
        req.body = {};
        data = req.body;
      }
    } else if (!hasBody || isBodyEmpty) {
      if (Object.keys(req.params).length > 0) {
        data = req.params;
      } else {
        data = req.query;
      }
    }

    const result = schema.safeParse(data);

    if (!result.success) {
      const formattedErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return next(new AppError(JSON.stringify(formattedErrors, null, 2), 400));
    }

    // Assign validated data back
    if (data === req.body) {
      req.body = result.data;
    } else if (data === req.params) {
      Object.assign(req.params, result.data);
    } else {
      Object.assign(req.query, result.data);
    }

    next();
  };

export const validateParams =
  (schema: ZodType) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const formattedErrors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return next(new AppError(JSON.stringify(formattedErrors, null, 2), 400));
    }

    Object.assign(req.params, result.data);
    next();
  };
