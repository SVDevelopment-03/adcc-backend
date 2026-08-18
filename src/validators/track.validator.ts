import { z } from 'zod';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

const jsonOrValue = (val: unknown) => {
  const raw = firstValue(val);
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
};

const arrayFromStringOrJson = (val: unknown) => {
  const raw = firstValue(val);
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return [trimmed];
    }
  }
  return [trimmed];
};

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

export const facilityEnum = z.enum([
  'water stations',
  'restrooms',
  'parking',
  'lighting',
  'cafes',
  'bike rental',
  'first aid',
  'changing rooms',
]);

export const createTrackSchema = z
    .object({
        title: z.preprocess(firstValue, z.string().min(1, 'Track title is required')),
        titleAr: z.preprocess(firstValue, z.string().min(1, 'Arabic track title is required')).optional(),
        description: z.preprocess(firstValue, z.string().min(1, 'Track description is required')),
        descriptionAr: z.preprocess(firstValue, z.string().min(1, 'Arabic track description is required')).optional(),
        image: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
        coverImage: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
        city: z.preprocess(firstValue, z.string()).optional(),
        address: z.preprocess(firstValue, z.string()).optional(),
        zipcode: z.preprocess(firstValue, z.string()).optional(),
        latitude: z.preprocess(firstValue, z.coerce.number()).optional(),
        longitude: z.preprocess(firstValue, z.coerce.number()).optional(),
        distance: z.preprocess(firstValue, z.coerce.number().min(0, 'Track distance is required')),
        elevation: z.preprocess(firstValue, z.string().min(0, 'Elevation gain is required')),
        trackType: z.preprocess(firstValue, z.enum(['circuit', 'road', 'costal', 'desert', 'urban'], 'Invalid track type')),
        avgtime: z.preprocess(firstValue, z.string().min(0, 'Average time is required')).optional(),
        pace: z.preprocess(firstValue, z.string().min(1, 'Pace is required')).optional(),
        facilities: z.preprocess(arrayFromStringOrJson, z.array(facilityEnum)).optional(),
        status: z.preprocess(firstValue, z.enum(['open', 'limited', 'closed', 'archived', 'disabled'], 'Invalid status type')),
        difficulty: z.preprocess(firstValue, z.string()).optional(),
        category: z.preprocess(firstValue, z.string()).optional(),
        surfaceType: z.preprocess(firstValue, z.string()).optional(),
        nightRidingAllowed: z.preprocess(coerceBoolean, z.boolean()).optional(),
        helmetRequired: z.preprocess(coerceBoolean, z.boolean()).optional(),
        mapPreview: z.preprocess(firstValue, z.string()).optional(),
        estimatedTime: z.preprocess(firstValue, z.string()).optional(),
        loopOptions: z.preprocess(jsonOrValue, z.array(z.coerce.number())).optional(),
        displayPriority: z
        .preprocess(firstValue, z.coerce.number())
        .refine((v) => !isNaN(v), { message: 'Priority type required' })
        .optional(),
        area: z.preprocess(firstValue, z.string()).optional(),
        slug: z.preprocess(firstValue, z.string()).optional(),
        country: z.preprocess(firstValue, z.string()).optional(),
        safetyNotes: z.preprocess(firstValue, z.string()).optional(),
        visibility: z.preprocess(firstValue, z.string()).optional(),
        galleryImages: z.preprocess(arrayFromStringOrJson, z.array(z.string().url('Invalid image URL'))).optional()
    })
    .strict();

export const updateTrackSchema = z
    .object({
        title: z.preprocess(firstValue, z.string().min(1, 'Track title is required')).optional(),
        titleAr: z.preprocess(firstValue, z.string().min(1, 'Arabic track title is required')).optional(),
        description: z.preprocess(firstValue, z.string().min(1, 'Track description is required')).optional(),
        descriptionAr: z.preprocess(firstValue, z.string().min(1, 'Arabic track description is required')).optional(),
        image: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
        coverImage: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
        city: z.preprocess(firstValue, z.string()).optional(),
        address: z.preprocess(firstValue, z.string()).optional(),
        zipcode: z.preprocess(firstValue, z.string()).optional(),
        latitude: z.preprocess(firstValue, z.coerce.number()).optional(),
        longitude: z.preprocess(firstValue, z.coerce.number()).optional(),
        distance: z.preprocess(firstValue, z.coerce.number().min(0, 'Track distance is required')).optional(),
        elevation: z.preprocess(firstValue, z.string().min(0, 'Elevation gain is required')).optional(),
        trackType: z.preprocess(firstValue, z.enum(['circuit', 'road', 'costal', 'desert', 'urban'], 'Invalid track type')).optional(),
        avgtime: z.preprocess(firstValue, z.string().min(0, 'Average time is required')).optional(),
        pace: z.preprocess(firstValue, z.string().min(1, 'Pace is required')).optional(),
        facilities: z.preprocess(arrayFromStringOrJson, z.array(facilityEnum)).optional(),
        status: z.preprocess(firstValue, z.enum(['open', 'limited', 'closed' , 'archived', 'disabled'], 'Invalid status type')),
        difficulty: z.preprocess(firstValue, z.string()).optional(),
        category: z.preprocess(firstValue, z.string()).optional(),
        surfaceType: z.preprocess(firstValue, z.string()).optional(),
        nightRidingAllowed: z.preprocess(coerceBoolean, z.boolean()).optional(),
        mapPreview: z.preprocess(firstValue, z.string()).optional(),
        estimatedTime: z.preprocess(firstValue, z.string()).optional(),
        loopOptions: z.preprocess(jsonOrValue, z.array(z.coerce.number())).optional(),
        displayPriority: z
        .preprocess(firstValue, z.coerce.number())
        .refine((v) => !isNaN(v), { message: 'Priority type required' })
        .optional(),
        area: z.preprocess(firstValue, z.string()).optional(),
        slug: z.preprocess(firstValue, z.string()).optional(),
        country: z.preprocess(firstValue, z.string()).optional(),
        safetyNotes: z.preprocess(firstValue, z.string()).optional(),
        helmetRequired: z.preprocess(coerceBoolean, z.boolean()).optional(),
        visibility: z.preprocess(firstValue, z.string()).optional(),
        galleryImages: z.preprocess(arrayFromStringOrJson, z.array(z.string().url('Invalid image URL'))).optional()
    })
    .strict();

export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;
