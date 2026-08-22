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

const stringField = z.preprocess(firstValue, z.string().min(1));

export const bannerKeySchema = z.object({
  key: z.string().min(1, 'Banner key is required'),
});

export const createAppBannerSchema = z
  .object({
    key: z.preprocess(firstValue, z.string().min(1, 'Key is required')).optional(),
    label: z.preprocess(firstValue, z.string().min(1, 'Label is required')).optional(),
    title: z.preprocess(firstValue, z.string()).optional(),
    description: z.preprocess(firstValue, z.string()).optional(),
    active: booleanFromString.optional().default(true),
  })
  .strict();

export const updateAppBannerSchema = z
  .object({
    label: stringField.optional(),
    title: stringField.optional(),
    description: z.preprocess(firstValue, z.string()).optional(),
    image: z.preprocess(firstValue, z.string()).optional(),
    active: booleanFromString.optional(),
  })
  .strict();

export const listAppBannerQuerySchema = z.object({
  active: z.string().transform((val) => val === 'true').optional(),
});

export type CreateAppBannerInput = z.infer<typeof createAppBannerSchema>;
export type UpdateAppBannerInput = z.infer<typeof updateAppBannerSchema>;
