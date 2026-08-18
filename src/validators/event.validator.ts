import { z } from 'zod';
import mongoose from 'mongoose';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

const stringField = (message: string) =>
  z.preprocess(firstValue, z.string().min(1, message));

const optionalStringField = (message: string) =>
  z.preprocess(firstValue, z.string().min(1, message)).optional();

const optionalCoerceNumberField = (message: string) =>
  z.preprocess(firstValue, z.coerce.number().min(0, message)).optional();

const jsonOrValue = (val: unknown) => {
  const raw = firstValue(val);
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
};

const rewardsSchema = z.preprocess(
  jsonOrValue,
  z
    .object({
      points: z.preprocess(firstValue, z.coerce.number().min(0, 'Reward points cannot be negative')).default(0),
      badgeName: z.preprocess(firstValue, z.string()).optional().or(z.literal('')).default(''),
      badgeImage: z.preprocess(firstValue, z.string()).optional().or(z.literal('')).default(''),
    })
    .strip()
).optional();

const objectIdSchema = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: 'Invalid MongoDB ObjectId' }
);

const optionalObjectIdSchema = z.preprocess(
  (val) => {
    const value = firstValue(val);
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized || normalized === 'null' || normalized === 'undefined') {
        return undefined;
      }
      return value;
    }
    return value;
  },
  objectIdSchema.optional()
);

export const createEventSchema = z
  .object({
    title: stringField('Event title is required'),
    titleAr: optionalStringField('Arabic event title is required'),
    description: stringField('Event description is required'),
    descriptionAr: optionalStringField('Arabic event description is required'),
    mainImage: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    eventImage: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    eventDate: z.preprocess(firstValue, z.string().or(z.date())).refine(
      (val) => {
        const date = val instanceof Date ? val : new Date(val);
        return !isNaN(date.getTime());
      },
      { message: 'Invalid event date' }
    ),
    eventTime: stringField('Event time is required'),
    address: stringField('Event address is required'),
    addressAr: optionalStringField('Arabic event address is required'),
    city: z.preprocess(firstValue, z.string()).optional(),
    country: z.preprocess(firstValue, z.string()).optional(),
    zipCode: z.preprocess(firstValue, z.string()).optional(),
    maxParticipants: z.preprocess(firstValue, z.coerce.number().int().min(0, 'Max participants cannot be negative')).optional(),
    registrationFeeType: z.preprocess(firstValue, z.enum(['free', 'paid'])).default('free'),
    registrationFeeAmount: z.preprocess(firstValue, z.coerce.number().min(0, 'Registration fee amount cannot be negative')).default(0),
    minAge: z.preprocess(firstValue, z.coerce.number().int().min(0, 'Min age cannot be negative')).optional(),
    maxAge: z.preprocess(firstValue, z.coerce.number().int().min(0, 'Max age cannot be negative')).optional(),
    youtubeLink: z.preprocess(firstValue, z.string().url('Invalid YouTube URL')).optional().or(z.literal('')),
    distance: optionalCoerceNumberField('Distance cannot be negative'),
    communityId: optionalObjectIdSchema,
    trackId: optionalObjectIdSchema,
    amenities: z.preprocess(
      jsonOrValue,
      z.array(z.string().trim().min(1))
    ).optional(),
    schedule: z.preprocess(
      jsonOrValue,
      z.array(
        z.object({
          time: z.string(),
          title: z.string(),
          titleAr: z.string().optional(),
          description: z.string().optional(),
          descriptionAr: z.string().optional(),
          order: z.coerce.number().optional(),
        })
      )
    ).optional(),
    eligibility: z.preprocess(
      jsonOrValue,
      z.object({
        helmetRequired: z.coerce.boolean().optional(),
        roadBikeOnly: z.coerce.boolean().optional(),
        experinceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'all']).optional(),
        gender: z.enum(['male', 'female', 'other', 'all']).optional()
      })
    ).optional(),

    status: z.preprocess(firstValue, z.enum(['Draft', 'Open', 'Full', 'Closed', 'Disabled', 'Completed', 'Archived'])).default('Draft'),
    slug: z.preprocess(firstValue, z.string()).optional(),
    difficulty: z.preprocess(firstValue, z.string()).optional(),
    endTime: z.preprocess(firstValue, z.string()).optional(),
    category: z.preprocess(firstValue, z.string()).optional(),
    isFeatured: z.preprocess(firstValue, z.coerce.boolean()).default(false),
    allowCancellation: z.preprocess(firstValue, z.coerce.boolean()).default(false),
    rewards: rewardsSchema,
    galleryImages: z.preprocess(jsonOrValue, z.array(z.string().url('Invalid image URL'))).optional().default([])
  })
  .strip();

export const updateEventSchema = z
  .object({
    title: optionalStringField('Event title is required'),
    titleAr: optionalStringField('Arabic event title is required'),
    description: optionalStringField('Event description is required'),
    descriptionAr: optionalStringField('Arabic event description is required'),
    mainImage: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    eventImage: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    eventDate: z.preprocess(firstValue, z.string().or(z.date()))
      .refine(
        (val) => {
          const date = val instanceof Date ? val : new Date(val);
          return !isNaN(date.getTime());
        },
        { message: 'Invalid event date' }
      )
      .optional(),
    eventTime: z.preprocess(firstValue, z.string().min(1, 'Event time is required')).optional(),
    address: z.preprocess(firstValue, z.string().min(1, 'Event address is required')).optional(),
    addressAr: z.preprocess(firstValue, z.string().min(1, 'Arabic event address is required')).optional(),
    city: z.preprocess(firstValue, z.string()).optional(),
    country: z.preprocess(firstValue, z.string()).optional(),
    zipCode: z.preprocess(firstValue, z.string()).optional(),
    maxParticipants: z.preprocess(firstValue, z.coerce.number().int().min(0, 'Max participants cannot be negative')).optional(),
    registrationFeeType: z.preprocess(firstValue, z.enum(['free', 'paid'])).optional(),
    registrationFeeAmount: z.preprocess(firstValue, z.coerce.number().min(0, 'Registration fee amount cannot be negative')).optional(),
    minAge: z.preprocess(firstValue, z.coerce.number().int().min(0, 'Min age cannot be negative')).optional(),
    maxAge: z.preprocess(firstValue, z.coerce.number().int().min(0, 'Max age cannot be negative')).optional(),
    youtubeLink: z.preprocess(firstValue, z.string().url('Invalid YouTube URL')).optional().or(z.literal('')),
    status: z.preprocess(firstValue, z.enum(['Draft', 'Open', 'Full', 'Closed', 'Disabled', 'Completed', 'Archived'])).optional(),
    distance: optionalCoerceNumberField('Distance cannot be negative'),
    communityId: optionalObjectIdSchema,
    trackId: optionalObjectIdSchema,
    amenities: z.preprocess(
      jsonOrValue,
      z.array(z.string().trim().min(1))
    ).optional(),
    schedule: z.preprocess(
      jsonOrValue,
      z.array(
        z.object({
          time: z.string(),
          title: z.string(),
          titleAr: z.string().optional(),
          description: z.string().optional(),
          descriptionAr: z.string().optional(),
          order: z.coerce.number().optional(),
        })
      )
    ).optional(),
    eligibility: z.preprocess(
      jsonOrValue,
      z.object({
        helmetRequired: z.coerce.boolean().optional(),
        roadBikeOnly: z.coerce.boolean().optional(),
        experinceLevel: z.enum(['beginner', 'intermediate', 'advanced', 'all']).optional(),
        gender: z.enum(['male', 'female', 'other', 'all']).optional()
      })
    ).optional(),
    slug: z.preprocess(firstValue, z.string()).optional(),
    difficulty: z.preprocess(firstValue, z.string()).optional(),
    endTime: z.preprocess(firstValue, z.string()).optional(),
    category: z.preprocess(firstValue, z.string()).optional(),
    rewards: rewardsSchema,
    isFeatured: z.preprocess(firstValue, z.coerce.boolean()).default(false),
    allowCancellation: z.preprocess(firstValue, z.coerce.boolean()).default(false),
    galleryImages: z.preprocess(jsonOrValue, z.array(z.string().url('Invalid image URL'))).optional()

  })
  .strip();

export const getEventsQuerySchema = z.object({
  status: z
    .enum([
      'Draft',
      'Open',
      'Full',
      'Closed',
      'Disabled',
      'Completed',
      'Archived',
      'Upcoming',
      'Ongoing',
    ])
    .optional(),
  city: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  level: z.string().trim().min(1).optional(),
  communityId: z
    .string()
    .refine((val) => mongoose.Types.ObjectId.isValid(val), {
      message: 'Invalid MongoDB ObjectId',
    })
    .optional(),
  search: z.string().trim().min(1).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type GetEventsQueryInput = z.infer<typeof getEventsQuerySchema>;
