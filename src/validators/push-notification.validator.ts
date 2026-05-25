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

export const registerWebPushTokenSchema = z
  .object({
    token: stringField('Web push token is required'),
    userAgent: optionalStringField('Invalid user agent'),
    platform: optionalPlatformField,
    deviceId: optionalStringField('Invalid device id'),
    deviceModel: optionalStringField('Invalid device model'),
    osVersion: optionalStringField('Invalid OS version'),
    appVersion: optionalStringField('Invalid app version'),
    appBuild: optionalStringField('Invalid app build'),
  })
  .strict();

export const unregisterWebPushTokenSchema = z
  .object({
    token: stringField('Web push token is required'),
  })
  .strict();

export const sendStaffWebPushSchema = z
  .object({
    title: stringField('Notification title is required'),
    body: stringField('Notification message is required'),
    audienceType: stringField('Audience type is required'),
    // deliveryType: app | email | both (optional)
    deliveryType: z.preprocess(firstValue, z.enum(['app', 'email', 'both'])).optional(),
    selectedUserIds: optionalStringField('Invalid selected user ids'),
    // optional comma-separated external emails for sending to outsider addresses
    externalEmails: optionalStringField('Invalid external email list'),
    scheduleDate: optionalStringField('Invalid schedule date'),
    scheduleTime: optionalStringField('Invalid schedule time'),
    url: optionalStringField('Invalid URL').refine(
      (val) => {
        if (!val) return true;
        try {
          // Allow relative URLs as well as absolute
          new URL(val, 'https://example.com');
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid URL' }
    ),
  })
  .strict();

export type RegisterWebPushTokenInput = z.infer<typeof registerWebPushTokenSchema>;
export type UnregisterWebPushTokenInput = z.infer<typeof unregisterWebPushTokenSchema>;
export type SendStaffWebPushInput = z.infer<typeof sendStaffWebPushSchema>;
