import { z } from 'zod';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

const optionalStringField = (message: string) =>
  z.preprocess(firstValue, z.string().min(1, message)).optional();

const optionalPlatformField = z.preprocess(
  firstValue,
  z.enum(['web', 'android', 'ios'])
).optional();

export const verifyFirebaseAuthSchema = z.object({
  idToken: z.string().min(1, 'Firebase ID token is required'),
  fcmToken: optionalStringField('FCM token is required'),
  userAgent: optionalStringField('Invalid user agent'),
  platform: optionalPlatformField,
  deviceId: optionalStringField('Invalid device id'),
  deviceModel: optionalStringField('Invalid device model'),
  osVersion: optionalStringField('Invalid OS version'),
  appVersion: optionalStringField('Invalid app version'),
  appBuild: optionalStringField('Invalid app build'),
});

const isValidDateValue = (val: string) => {
  const d = new Date(val);
  return !Number.isNaN(d.getTime());
};

const isNotFutureDate = (val: string) => {
  const d = new Date(val);
  return d.getTime() <= Date.now();
};

const dobSchema = z
  .string()
  .min(1, 'Date of birth must be a valid date')
  .refine(isValidDateValue, 'Date of birth must be a valid date')
  .refine(isNotFutureDate, 'Date of birth cannot be in the future');

export const registerUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').trim(),
  email: z.preprocess(firstValue, z.string().trim().email('Invalid email')).optional(),
  phone: z.preprocess(firstValue, z.string().trim().min(1, 'Phone number is required')).optional(),
  password: z.preprocess(firstValue, z.string().min(6, 'Password must be at least 6 characters')).optional(),
  gender: z.enum(['Male', 'Female'], {
    message: 'Gender must be either Male or Female',
  }),
  age: z.coerce.number().int().min(0, 'Age cannot be negative').max(150, 'Age must be realistic').optional(),
  dob: dobSchema,
  country: z.string().min(1, 'Country is required').trim().optional(),
  city: z.string().min(1, 'City is required').trim().optional(),
  provider: z.string().min(1, 'Provider is required').trim().optional(),
  fcmToken: optionalStringField('FCM token is required'),
  userAgent: optionalStringField('Invalid user agent'),
  platform: optionalPlatformField,
  deviceId: optionalStringField('Invalid device id'),
  deviceModel: optionalStringField('Invalid device model'),
  osVersion: optionalStringField('Invalid OS version'),
  appVersion: optionalStringField('Invalid app version'),
  appBuild: optionalStringField('Invalid app build'),
}).strict();

export const emailRegisterSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').trim(),
  email: z.preprocess(firstValue, z.string().trim().email('Invalid email')),
  password: z.preprocess(firstValue, z.string().min(6, 'Password must be at least 6 characters')),
  gender: z.enum(['Male', 'Female'], {
    message: 'Gender must be either Male or Female',
  }).optional(),
  age: z.coerce.number().int().min(0, 'Age cannot be negative').max(150, 'Age must be realistic').optional(),
  dob: dobSchema.optional(),
  country: z.string().min(1, 'Country is required').trim().optional(),
  city: z.string().min(1, 'City is required').trim().optional(),
  provider: z.string().min(1, 'Provider is required').trim().optional(),
  fcmToken: optionalStringField('FCM token is required'),
  userAgent: optionalStringField('Invalid user agent'),
  platform: optionalPlatformField,
  deviceId: optionalStringField('Invalid device id'),
  deviceModel: optionalStringField('Invalid device model'),
  osVersion: optionalStringField('Invalid OS version'),
  appVersion: optionalStringField('Invalid app version'),
  appBuild: optionalStringField('Invalid app build'),
}).strict();

export const emailLoginSchema = z.object({
  email: z.preprocess(firstValue, z.string().trim().email('Invalid email')),
  password: z.preprocess(firstValue, z.string().min(6, 'Password must be at least 6 characters')),
}).strict();

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  fcmToken: z.string().min(1, 'FCM token is required').optional(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').trim().optional(),
  email: z.string().email('Invalid email address').trim().toLowerCase().optional(),
  gender: z.enum(['Male', 'Female'], {
    message: 'Gender must be either Male or Female',
  }).optional(),
  age: z.coerce.number().int().min(0, 'Age cannot be negative').max(150, 'Age must be realistic').optional(),
  dob: dobSchema.optional(),
  country: z.string().min(1, 'Country is required').trim().optional(),
  city: z.string().min(1, 'City is required').trim().optional(),
  profileImage: z.string().min(1, 'Profile image is required').trim().optional(),
}).strict();

/** Optional body for POST /auth/guest (e.g. deviceId for future rate-limiting) */
export const createGuestSchema = z
  .object({
    deviceId: z.string().optional(),
  })
  .strict()
  .default({});

export type VerifyFirebaseAuthInput = z.infer<typeof verifyFirebaseAuthSchema>;
export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

