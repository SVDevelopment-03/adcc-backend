import jwt, { JwtPayload } from 'jsonwebtoken';
import { AppError } from './app-error';

export interface JWTPayload extends JwtPayload {
  id?: string;
  uid?: string;
  phone?: string;
  email?: string;
  role?: 'Admin' | 'Member' | 'Guest' | 'Vendor';
  isGuest?: boolean;
  type?: 'Guest' | 'Member';
}

// Lazy-load environment variables (only when functions are called)
const getJWTSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in .env');
  }
  return secret;
};

const getRefreshSecret = (): string => {
  const secret = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('REFRESH_TOKEN_SECRET or JWT_SECRET is not configured in .env');
  }
  return secret;
};

const getJWTExpiresIn = (): string => {
  return process.env.JWT_EXPIRES_IN || '5m';
};

const getRefreshExpiresIn = (): string => {
  return process.env.REFRESH_TOKEN_EXPIRES_IN || '3d';
};

export const generateAccessToken = (payload: JWTPayload): string => {
  return jwt.sign(
    payload,
    getJWTSecret(),
    { expiresIn: getJWTExpiresIn() } as jwt.SignOptions
  );
};

export const generateRefreshToken = (payload: JWTPayload): string => {
  return jwt.sign(
    payload,
    getRefreshSecret(),
    { expiresIn: getRefreshExpiresIn() } as jwt.SignOptions
  );
};

export const generateTokens = (payload: JWTPayload) => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

export const verifyAccessToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, getJWTSecret());
    return decoded as JWTPayload;
  } catch (error) {
    throw new AppError('Invalid or expired access token', 401);
  }
};

export const verifyRefreshToken = (token: string): JWTPayload => {
  try {
    const decoded = jwt.verify(token, getRefreshSecret());
    return decoded as JWTPayload;
  } catch (error) {
    throw new AppError('Invalid or expired refresh token', 401);
  }
};

