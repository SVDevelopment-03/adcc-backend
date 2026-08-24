import { z } from 'zod';
import mongoose from 'mongoose';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

/** Form-data often repeats the same key (`trackId` × N); parsers give a string[] — do not take only [0]. */
const arrayOrScalar = (val: unknown) => (Array.isArray(val) ? val : firstValue(val));

/** Validates hex string and stores as MongoDB ObjectId. */
const mongoObjectIdSchema = z
  .string()
  .trim()
  .refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid MongoDB ObjectId' })
  .transform((val) => new mongoose.Types.ObjectId(val));

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

const booleanFromString = z.preprocess(
  (val) => {
    const value = firstValue(val);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  },
  z.boolean()
);

const numberFromString = z.preprocess(firstValue, z.coerce.number());
const numberFromStringMin = (min: number, message: string) =>
  z.preprocess(firstValue, z.coerce.number().min(min, message));

const trackIdArrayFromInput = z.preprocess((val) => {
  const raw = arrayOrScalar(val);
  if (raw === undefined || raw === null) return undefined;
  let arr: unknown[];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        arr = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [trimmed];
      }
    } else {
      arr = [trimmed];
    }
  } else {
    arr = [raw];
  }
  const ids = arr
    .map((x) => {
      if (x instanceof mongoose.Types.ObjectId) return x.toString();
      if (typeof x === 'string') return x.trim();
      return '';
    })
    .filter((s) => s && mongoose.Types.ObjectId.isValid(s));
  return ids;
}, z.array(mongoObjectIdSchema).optional().transform((arr) => {
  if (!arr?.length) return arr;
  const seen = new Set<string>();
  const out: mongoose.Types.ObjectId[] = [];
  for (const id of arr) {
    const s = id.toString();
    if (!seen.has(s)) {
      seen.add(s);
      out.push(id);
    }
  }
  return out;
}));

// Only accept URL strings (files should be uploaded via multipart to S3)
const imageStringSchema = z.string().url('Each image must be a valid URL.');

export const  createCommunitySchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'Community title is required')),
    titleAr: z.preprocess(firstValue, z.string().min(1, 'Arabic community title is required')).optional(),
    description: z.preprocess(firstValue, z.string().min(1, 'Community description is required')),
    descriptionAr: z.preprocess(firstValue, z.string().min(1, 'Arabic community description is required')).optional(),
    type: z.preprocess(arrayFromStringOrJson, z.array(z.string().trim())).optional(),
    category: z.preprocess(firstValue, z.string()).optional(),
    purposeType: z.preprocess(firstValue, z.string()).optional(),
    ridesThisMonth: z.preprocess(firstValue, z.string()).optional(),
    weeklyRides: z.preprocess(firstValue, z.string()).optional(),
    fundsRaised: z.preprocess(firstValue, z.string()).optional(),
    joinMode: z.preprocess(firstValue, z.string()).optional(),
    location: z.preprocess(firstValue, z.enum([
      "Abu Dhabi",
      "Dubai",
      "Sharjah",
      "Ajman",
      "Ras Al Khaimah",
      "Fujairah",
      "Umm Al Quwain",
      "Al Ain",
      "Riyadh",
      "Jeddah",
      "Mecca",
      "Medina",
      "Dammam",
      "Khobar",
      "Dhahran",
      "Taif",
      "Tabuk",
      "Abha",
      "Jubail",
      "Yanbu",
      "Doha",
      "Al Wakrah",
      "Al Khor",
      "Al Rayyan",
      "Mesaieed",
      "Dukhan",
      "Muscat",
      "Salalah",
      "Sohar",
      "Nizwa",
      "Sur",
      "Ibri",
      "Barka",
      "Rustaq",
      "Kuwait City",
      "Hawalli",
      "Salmiya",
      "Farwaniya",
      "Jahra",
      "Ahmadi",
      "Mangaf",
      "Fahaheel",
      "Manama",
      "Muharraq",
      "Riffa",
      "Hamad Town",
      "Isa Town",
      "Sitra",
      "Budaiya",
      "Jidhafs"
    ])).optional(),
    country: z.preprocess(firstValue, z.string()).optional(),
    image: z.preprocess(firstValue, imageStringSchema).optional(),
    coverImage: z.preprocess(firstValue, imageStringSchema).optional(),
    logo: z.preprocess(firstValue, imageStringSchema).optional(),
    gallery: z.preprocess(arrayFromStringOrJson, z.array(imageStringSchema)).optional(),
    galleryImages: z.preprocess(arrayFromStringOrJson, z.array(imageStringSchema)).optional(),
    trackName: z.preprocess(firstValue, z.string()).optional(),
    distance: numberFromStringMin(0, 'Distance cannot be negative').optional(),
    terrain: z.preprocess(firstValue, z.string()).optional(),
    isActive: booleanFromString.default(true),
    isPublic: booleanFromString.default(false),
    status: booleanFromString.default(false),
    allowPosts: booleanFromString.default(false),
    allowGallery: booleanFromString.default(false),
    isFeatured: booleanFromString.default(false),
    foundedYear: numberFromString.optional(),
    members: z.preprocess(firstValue, z.string()).optional(),
    memberCount: numberFromString.optional(),
    slug: z.preprocess(firstValue, z.string()).optional(),
    manager: z.preprocess(firstValue, z.string()).optional(),
    area: z.preprocess(firstValue, z.string()).optional(),
    city: z.preprocess(firstValue, z.string()).optional(),
    /** Primary track refs (array of ObjectIds). */
    trackId: trackIdArrayFromInput,
    /** Backward-compatible multi-track payload from admin forms. */
    trackIds: trackIdArrayFromInput,
  })
  .strict();

export const updateCommunitySchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'Community title is required')).optional(),
    titleAr: z.preprocess(firstValue, z.string().min(1, 'Arabic community title is required')).optional(),
    description: z.preprocess(firstValue, z.string().min(1, 'Community description is required')).optional(),
    descriptionAr: z.preprocess(firstValue, z.string().min(1, 'Arabic community description is required')).optional(),
    type: z.preprocess(arrayFromStringOrJson, z.array(z.string().trim())).optional(),
    category: z.preprocess(firstValue, z.string()).optional(),
    purposeType: z.preprocess(firstValue, z.string()).optional(),
    ridesThisMonth: z.preprocess(firstValue, z.string()).optional(),
    weeklyRides: z.preprocess(firstValue, z.string()).optional(),
    fundsRaised: z.preprocess(firstValue, z.string()).optional(),
    joinMode: z.preprocess(firstValue, z.string()).optional(),
    location: z.preprocess(firstValue, z.enum(['Abu Dhabi', 'Dubai', 'Al Ain', 'Sharjah'])).optional(),
    country: z.preprocess(firstValue, z.string()).optional(),
    image: z.preprocess(firstValue, imageStringSchema).optional(),
    coverImage: z.preprocess(firstValue, imageStringSchema).optional(),
    logo: z.preprocess(firstValue, imageStringSchema).optional(),
    gallery: z.preprocess(arrayFromStringOrJson, z.array(imageStringSchema)).optional(),
    galleryImages: z.preprocess(arrayFromStringOrJson, z.array(imageStringSchema)).optional(),
    trackName: z.preprocess(firstValue, z.string()).optional(),
    distance: numberFromStringMin(0, 'Distance cannot be negative').optional(),
    terrain: z.preprocess(firstValue, z.string()).optional(),
    isActive: booleanFromString.optional(),
    isPublic: booleanFromString.optional(),
    status: booleanFromString.optional(),
    allowPosts: booleanFromString.optional(),
    allowGallery: booleanFromString.optional(),
    isFeatured: booleanFromString.default(false),
    foundedYear: numberFromString.optional(),
    members: z.preprocess(firstValue, z.string()).optional(),
    memberCount: numberFromString.optional(),
    slug: z.preprocess(firstValue, z.string()).optional(),
    manager: z.preprocess(firstValue, z.string()).optional(),
    area: z.preprocess(firstValue, z.string()).optional(),
    city: z.preprocess(firstValue, z.string()).optional(),
    trackId: trackIdArrayFromInput,
    trackIds: trackIdArrayFromInput,
  })
  .strict();

export const featureCommunitySchema = z
  .object({
    isFeatured: z.preprocess(firstValue, z.boolean()),
  })
  .strict();

export const getCommunitiesQuerySchema = z.object({
  type: z.enum(['Family Rides', 'Racing & Performance', 'Women (SheRides)', 'Youth Cycling', 'Weekend Social', 'Night Riders', 'MTB/Trail', 'Training & Clinics']).optional(),
  location: z.enum(['Abu Dhabi', 'Dubai', 'Al Ain', 'Sharjah', 'Al Dhafra']).optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  isActive: z.string().transform((val) => val === 'true').optional(),
  isPublic: z.string().transform((val) => val === 'true').optional(),
  isFeatured: z.string().transform((val) => val === 'true').optional(),
});

export const addGalleryImagesSchema = z
  .union([
    // Accept "images" array
    z.object({
      images: z.preprocess(arrayFromStringOrJson, z.array(imageStringSchema).min(1, 'At least one image is required')),
    }),
    // Accept "image" as single string
    z.object({
      image: z.preprocess(firstValue, imageStringSchema),
    }),
    // Accept "image" as array
    z.object({
      image: z.preprocess(arrayFromStringOrJson, z.array(imageStringSchema).min(1, 'At least one image is required')),
    }),
  ])
  .transform((data) => {
    // Normalize: always return { images: [...] }
    if ('images' in data && Array.isArray(data.images)) {
      return { images: data.images };
    }
    if ('image' in data) {
      return { images: Array.isArray(data.image) ? data.image : [data.image] };
    }
    return { images: [] };
  });

export const removeGalleryImagesSchema = z
  .object({
    imageUrls: z.preprocess(arrayFromStringOrJson, z.array(imageStringSchema).min(1, 'At least one image URL is required')),
  })
  .strict();

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type GetCommunitiesQueryInput = z.infer<typeof getCommunitiesQuerySchema>;
export type AddGalleryImagesInput = z.infer<typeof addGalleryImagesSchema>;
export type RemoveGalleryImagesInput = z.infer<typeof removeGalleryImagesSchema>;
export type FeatureCommunityInput = z.infer<typeof featureCommunitySchema>;


