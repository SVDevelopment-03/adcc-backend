import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

/**
 * Blocks requests until MongoDB is connected.
 * Prevents hanging requests due to Mongoose command buffering when DB isn't ready.
 */
export const requireDbReady = (_req: Request, res: Response, next: NextFunction) => {
  // 1 = connected (see Mongoose Connection.readyState)
  if (mongoose.connection.readyState === 1) {
    next();
    return;
  }

  res.status(503).json({
    success: false,
    message: 'Service unavailable: database not connected',
  });
};
