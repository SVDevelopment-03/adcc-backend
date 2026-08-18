import { z } from 'zod';

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

const keyField = z.preprocess(firstValue, z.string().min(1, 'Key is required'));

export const createGlobalSettingSchema = z
  .object({
    key: keyField,
    group: z.preprocess(firstValue, z.string().min(1, 'Group is required')).optional(),
    label: z.preprocess(firstValue, z.string().min(1, 'Label is required')).optional(),
    title: z.preprocess(firstValue, z.string().min(1, 'Title is required')).optional(),
    description: z.preprocess(firstValue, z.string().min(1, 'Description is required')).optional(),
    image: z.preprocess(firstValue, z.string().min(1, 'Image is required')).optional(),
    active: booleanFromString.default(true),
  })
  .strict();

export const updateGlobalSettingSchema = z
  .object({
    key: keyField.optional(),
    group: z.preprocess(firstValue, z.string().min(1, 'Group is required')).optional(),
    label: z.preprocess(firstValue, z.string().min(1, 'Label is required')).optional(),
    title: z.preprocess(firstValue, z.string().min(1, 'Title is required')).optional(),
    description: z.preprocess(firstValue, z.string().min(1, 'Description is required')).optional(),
    image: z.preprocess(firstValue, z.string().min(1, 'Image is required')).optional(),
    active: booleanFromString.optional(),
  })
  .strict();

export const getGlobalSettingsQuerySchema = z.object({
  group: z.string().optional(),
  key: z.string().optional(),
  keys: z.string().optional(),
  active: z.string().transform((val) => val === 'true').optional(),
  q: z.string().optional(),
  page: z.string().regex(/^\\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\\d+$/).transform(Number).optional(),
});

export const globalSettingKeySchema = z.object({
  key: z.string().min(1, 'Setting key is required'),
});

const bulkItemSchema = z
  .object({
    key: keyField,
    group: z.preprocess(firstValue, z.string().min(1, 'Group is required')).optional(),
    label: z.preprocess(firstValue, z.string().min(1, 'Label is required')).optional(),
    title: z.preprocess(firstValue, z.string().min(1, 'Title is required')).optional(),
    description: z.preprocess(firstValue, z.string().min(1, 'Description is required')).optional(),
    image: z.preprocess(firstValue, z.string().min(1, 'Image is required')).optional(),
    active: booleanFromString.optional(),
  })
  .strict();

export const bulkGlobalSettingsSchema = z
  .object({
    items: z.preprocess((value) => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return parsed;
        } catch {
          return value;
        }
      }
      return value;
    }, z.array(bulkItemSchema).min(1, 'Items are required')),
  })
  .strict();

export const createContentSettingSchema = z
  .object({
    group: z.preprocess(firstValue, z.string().min(1, 'Group is required')),
    key: keyField,
    label: z.preprocess(firstValue, z.string().min(1, 'Label is required')),
    title: z.preprocess(firstValue, z.string().min(1, 'Title is required')),
    description: z.preprocess(firstValue, z.string()).optional(),
    image: z.preprocess(firstValue, z.string()).optional(),
    active: booleanFromString.optional().default(true),
  })
  .strict();

export const updateContentSettingSchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'Title is required')).optional(),
    description: z.preprocess(firstValue, z.string()).optional(),
    image: z.preprocess(firstValue, z.string()).optional(),
    active: booleanFromString.optional(),
  })
  .strict();

export const listContentSettingsQuerySchema = z.object({
  group: z.string().optional(),
  key: z.string().optional(),
  active: z.string().transform((val) => val === 'true').optional(),
});

export type CreateGlobalSettingInput = z.infer<typeof createGlobalSettingSchema>;
export type UpdateGlobalSettingInput = z.infer<typeof updateGlobalSettingSchema>;
export type CreateContentSettingInput = z.infer<typeof createContentSettingSchema>;
export type UpdateContentSettingInput = z.infer<typeof updateContentSettingSchema>;
