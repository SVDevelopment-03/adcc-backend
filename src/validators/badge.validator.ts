import { z } from 'zod';
import { BADGE_CATEGORIES, BADGE_ICON_KEYS, BADGE_RARITIES } from '@/constants/badges';

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

const nameField = z.preprocess(firstValue, z.string().min(1, 'Badge name is required'));

export const createBadgeSchema = z
  .object({
    name: nameField,
    nameAr: z.preprocess(firstValue, z.string()).optional(),
    description: z.preprocess(firstValue, z.string().min(1, 'Badge description is required')),
    descriptionAr: z.preprocess(firstValue, z.string()).optional(),
    icon: z.preprocess(firstValue, z.enum(BADGE_ICON_KEYS)),
    category: z.preprocess(firstValue, z.enum(BADGE_CATEGORIES)),
    timesAwarded: z.preprocess(firstValue, z.coerce.number().min(0, 'Times awarded cannot be negative')).optional(),
    rarity: z.preprocess(firstValue, z.enum(BADGE_RARITIES)),
    requirements: z.preprocess(firstValue, z.string().min(1, 'Badge requirements are required')),
    image: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    active: booleanFromString.default(true),
  })
  .strict();

export const updateBadgeSchema = z
  .object({
    name: nameField.optional(),
    nameAr: z.preprocess(firstValue, z.string()).optional(),
    description: z.preprocess(firstValue, z.string().min(1, 'Badge description is required')).optional(),
    descriptionAr: z.preprocess(firstValue, z.string()).optional(),
    icon: z.preprocess(firstValue, z.enum(BADGE_ICON_KEYS)).optional(),
    category: z.preprocess(firstValue, z.enum(BADGE_CATEGORIES)).optional(),
    timesAwarded: z.preprocess(firstValue, z.coerce.number().min(0, 'Times awarded cannot be negative')).optional(),
    rarity: z.preprocess(firstValue, z.enum(BADGE_RARITIES)).optional(),
    requirements: z.preprocess(firstValue, z.string().min(1, 'Badge requirements are required')).optional(),
    image: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    active: booleanFromString.optional(),
  })
  .strict();

export const getBadgesQuerySchema = z.object({
  active: z.string().transform((val) => val === 'true').optional(),
  category: z.enum(BADGE_CATEGORIES).optional(),
  rarity: z.enum(BADGE_RARITIES).optional(),
  q: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
export type UpdateBadgeInput = z.infer<typeof updateBadgeSchema>;
export type GetBadgesQueryInput = z.infer<typeof getBadgesQuerySchema>;
