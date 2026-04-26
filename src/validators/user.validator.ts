import { z } from 'zod';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

const stringField = (message: string) =>
  z.preprocess(firstValue, z.string().min(1, message));

const optionalStringField = (message: string) =>
  z.preprocess(firstValue, z.string().min(1, message)).optional();

const optionalPlatformField = z.preprocess(
  firstValue,
  z.enum(['web', 'android', 'ios'])
).optional();

const coerceBoolean = (val: unknown) => {
  const raw = firstValue(val);
  if (typeof raw === 'boolean') return raw;

  if (typeof raw === 'number') {
    if (raw === 1) return true;
    if (raw === 0) return false;
    return raw;
  }

  if (typeof raw !== 'string') return raw;

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return raw;
};

export const updateUserVerifiedSchema = z
  .object({
    isVerified: z.preprocess(
      coerceBoolean,
      // `required_error` is not supported by the installed Zod typings for `z.boolean()`.
      // The field itself is required because it's not marked `.optional()`.
      z.boolean()
    ),
  })
  .strict();

export const registerFcmTokenSchema = z
  .object({
    token: stringField('FCM token is required'),
    userAgent: optionalStringField('Invalid user agent'),
    platform: optionalPlatformField,
    deviceId: optionalStringField('Invalid device id'),
    deviceModel: optionalStringField('Invalid device model'),
    osVersion: optionalStringField('Invalid OS version'),
    appVersion: optionalStringField('Invalid app version'),
    appBuild: optionalStringField('Invalid app build'),
  })
  .strict();

export const unregisterFcmTokenSchema = z
  .object({
    token: stringField('FCM token is required'),
  })
  .strict();

export const createUserSchema = z
  .object({
    fullName: stringField('Full name is required'),
    email: z.preprocess(firstValue, z.string().email('Valid email is required')),
    password: z.preprocess(firstValue, z.string().min(8, 'Password must be at least 8 characters')),
    phone: optionalStringField('Invalid phone number'),
    profileImage: optionalStringField('Invalid profile image'),
    gender: z.preprocess(firstValue, z.enum(['Male', 'Female'])),
    role: z.preprocess(firstValue, z.enum(['Admin', 'Vendor', 'Member'])).optional(),
    isVerified: z.preprocess(coerceBoolean, z.boolean()).optional(),
  })
  .strict();

export type UpdateUserVerifiedInput = z.infer<typeof updateUserVerifiedSchema>;
export type RegisterFcmTokenInput = z.infer<typeof registerFcmTokenSchema>;
export type UnregisterFcmTokenInput = z.infer<typeof unregisterFcmTokenSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
