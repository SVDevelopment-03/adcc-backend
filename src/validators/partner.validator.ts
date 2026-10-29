import { z } from 'zod';
import mongoose from 'mongoose';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

const booleanFromString = z.preprocess(
  (val) => {
    const value = firstValue(val);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  },
  z.boolean()
);

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid partner id',
});

export const partnerIdSchema = z.object({
  id: objectIdSchema,
});

// Logos arrive as multipart files; `name` is optional and only applies when a
// single logo is uploaded (otherwise each partner is named after its file).
export const createPartnerSchema = z
  .object({
    name: z.preprocess(firstValue, z.string().trim().min(1)).optional(),
    active: booleanFromString.optional(),
  })
  .strict();

export const updatePartnerSchema = z
  .object({
    name: z.preprocess(firstValue, z.string().trim().min(1, 'Name is required')).optional(),
    active: booleanFromString.optional(),
  })
  .strict();

export const reorderPartnersSchema = z
  .object({
    ids: z.array(objectIdSchema).min(1, 'At least one partner id is required'),
  })
  .strict();

export const listPartnersQuerySchema = z.object({
  active: z.string().transform((val) => val === 'true').optional(),
});
