import { z } from 'zod';

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const booleanFromString = z.preprocess((value) => {
  const v = firstValue(value);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}, z.boolean());

const numberFromString = z.preprocess((value) => {
  const v = firstValue(value);
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return v;
}, z.number().int());

/** Lowercase, underscore-separated identifiers, e.g. "event_category". */
const lookupTypeSchema = z
  .string()
  .trim()
  .min(1, 'Lookup type is required')
  .regex(/^[a-z][a-z0-9_]*$/, 'Lookup type must be lowercase letters, numbers and underscores');

export const listLookupsQuerySchema = z.object({
  type: z.preprocess(firstValue, lookupTypeSchema),
  parentValue: z.preprocess(firstValue, z.string().trim().min(1)).optional(),
  includeInactive: z.preprocess(firstValue, z.coerce.boolean()).optional(),
});

export const createLookupSchema = z.object({
  type: z.preprocess(firstValue, lookupTypeSchema),
  value: z.preprocess(firstValue, z.string().trim().min(1, 'Value is required')).optional(),
  label: z.preprocess(firstValue, z.string().trim().min(1, 'English label is required')),
  labelAr: z.preprocess(firstValue, z.string().trim().min(1, 'Arabic label is required')),
  parentValue: z.preprocess(firstValue, z.string().trim().min(1)).optional(),
  icon: z.preprocess(firstValue, z.string()).optional(),
  order: numberFromString.optional().default(0),
  active: booleanFromString.optional().default(true),
});

export const updateLookupSchema = z.object({
  label: z.preprocess(firstValue, z.string().trim().min(1, 'English label is required')).optional(),
  labelAr: z.preprocess(firstValue, z.string().trim().min(1, 'Arabic label is required')).optional(),
  parentValue: z.preprocess(firstValue, z.string().trim().min(1)).optional(),
  icon: z.preprocess(firstValue, z.string()).optional(),
  removeIcon: booleanFromString.optional(),
  order: numberFromString.optional(),
  active: booleanFromString.optional(),
});
