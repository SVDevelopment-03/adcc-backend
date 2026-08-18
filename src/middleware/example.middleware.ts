import { Request, Response, NextFunction } from 'express';

export const exampleMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Simple example - just check if token exists
  const token = req.headers.authorization;
  
  if (!token) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }
  
  
  // In real app, verify JWT here
  next();
};