import { z } from 'zod';
import mongoose from 'mongoose';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

const arrayFromStringOrJson = (val: unknown) => {
  const raw = firstValue(val);
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [trimmed];
    } catch {
      return [trimmed];
    }
  }
  return [trimmed];
};

const booleanFromString = z.preprocess(
  (val) => {
    const value = firstValue(val);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  },
  z.boolean()
);

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

const dateField = (message: string) =>
  z.preprocess(firstValue, z.string().or(z.date())).refine(
    (val) => {
      const date = val instanceof Date ? val : new Date(val);
      return !isNaN(date.getTime());
    },
    { message }
  );

const optionalDateField = (message: string) => dateField(message).optional();

export const updateChallengeProgressSchema = z
  .object({
    progress: z.preprocess(firstValue, z.coerce.number().min(0, 'Progress cannot be negative')).optional(),
    progressPercent: z.preprocess(
      firstValue,
      z.coerce.number().min(0, 'Progress percent cannot be negative').max(100, 'Progress percent cannot exceed 100')
    ).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.progress === undefined && data.progressPercent === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Progress or progressPercent is required',
      });
    }
  })
  .strict();

export const createChallengeSchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'Challenge title is required')),
    description: z.preprocess(firstValue, z.string().min(1, 'Challenge description is required')),
    image: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    type: z.preprocess(firstValue, z.enum(['Distance', 'Frequency', 'Duration', 'Social', 'Event'])),
    target: z.preprocess(firstValue, z.coerce.number().min(0, 'Target cannot be negative')),
    unit: z.preprocess(firstValue, z.string().min(1, 'Unit is required')),
    startDate: dateField('Invalid start date'),
    endDate: dateField('Invalid end date'),
    rewardBadge: optionalObjectIdSchema,
    featured: booleanFromString.default(false),
    status: z.preprocess(firstValue, z.enum(['Draft', 'Active', 'Upcoming', 'Completed', 'Closed', 'Disabled', 'Archived'])).default('Draft'),
    participants: z.preprocess(firstValue, z.coerce.number().min(0, 'Participants cannot be negative')).optional(),
    completions: z.preprocess(firstValue, z.coerce.number().min(0, 'Completions cannot be negative')).optional(),
    communities: z.preprocess(
      arrayFromStringOrJson,
      z.array(objectIdSchema)
    ).optional(),
  })
  .superRefine((data, ctx) => {
    const start = data.startDate instanceof Date ? data.startDate : new Date(data.startDate);
    const end = data.endDate instanceof Date ? data.endDate : new Date(data.endDate);
    if (start && end && end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be after start date',
        path: ['endDate'],
      });
    }
  })
  .strict();

export const updateChallengeSchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'Challenge title is required')).optional(),
    description: z.preprocess(firstValue, z.string().min(1, 'Challenge description is required')).optional(),
    image: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    type: z.preprocess(firstValue, z.enum(['Distance', 'Frequency', 'Duration', 'Social', 'Event'])).optional(),
    target: z.preprocess(firstValue, z.coerce.number().min(0, 'Target cannot be negative')).optional(),
    unit: z.preprocess(firstValue, z.string().min(1, 'Unit is required')).optional(),
    startDate: optionalDateField('Invalid start date'),
    endDate: optionalDateField('Invalid end date'),
    rewardBadge: optionalObjectIdSchema,
    featured: booleanFromString.optional(),
    status: z.preprocess(firstValue, z.enum(['Draft', 'Active', 'Upcoming', 'Completed', 'Closed', 'Disabled', 'Archived'])).optional(),
    participants: z.preprocess(firstValue, z.coerce.number().min(0, 'Participants cannot be negative')).optional(),
    completions: z.preprocess(firstValue, z.coerce.number().min(0, 'Completions cannot be negative')).optional(),
    communities: z.preprocess(
      arrayFromStringOrJson,
      z.array(objectIdSchema)
    ).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.startDate || !data.endDate) return;
    const start = data.startDate instanceof Date ? data.startDate : new Date(data.startDate);
    const end = data.endDate instanceof Date ? data.endDate : new Date(data.endDate);
    if (start && end && end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be after start date',
        path: ['endDate'],
      });
    }
  })
  .strict();

export const getChallengesQuerySchema = z.object({
  status: z.enum(['Draft', 'Active', 'Upcoming', 'Completed', 'Closed', 'Disabled', 'Archived']).optional(),
  type: z.enum(['Distance', 'Frequency', 'Duration', 'Social', 'Event']).optional(),
  featured: z.string().transform((val) => val === 'true').optional(),
  communityId: optionalObjectIdSchema,
  search: z.string().trim().min(1).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type UpdateChallengeInput = z.infer<typeof updateChallengeSchema>;
export type UpdateChallengeProgressInput = z.infer<typeof updateChallengeProgressSchema>;
export type GetChallengesQueryInput = z.infer<typeof getChallengesQuerySchema>;
