import { z } from 'zod';

const textSchema = z.string().trim().max(200);

export const homeBannerContentSchema = z
  .object({
    hideText: z.boolean().default(false),
    // Kept when no new file is uploaded; may be a site-relative path for the
    // built-in default images or an S3 URL for uploaded ones. The Arabic image
    // is optional; the site falls back to the English one.
    imageEn: z.string().trim().min(1, 'Banner image is required').max(1000),
    imageAr: z.string().trim().max(1000).default(''),
    titleLine1En: textSchema.default(''),
    titleLine2En: textSchema.default(''),
    titleLine1Ar: textSchema.default(''),
    titleLine2Ar: textSchema.default(''),
  })
  .strict();

export type HomeBannerContent = z.infer<typeof homeBannerContentSchema>;

/* ─── Field helpers for the other home sections ─────────────────────────── */

// Site-relative paths (built-in defaults) and http(s) URLs only, so a saved
// value can never become a `javascript:` link or image source.
const isSafeUrl = (value: string) => value === '' || value.startsWith('/') || /^https?:\/\//i.test(value);

const text = (max = 200) => z.string().trim().max(max).default('');
const url = (label: string) =>
  z
    .string()
    .trim()
    .max(1000)
    .default('')
    .refine(isSafeUrl, { message: `${label} must start with "/" or "http(s)://"` });
const image = url('Image');
const link = url('Link');

/** `<name>En` + `<name>Ar` text fields. */
const localized = <K extends string>(name: K, max = 200) =>
  ({ [`${name}En`]: text(max), [`${name}Ar`]: text(max) }) as Record<`${K}En` | `${K}Ar`, ReturnType<typeof text>>;

const list = <T extends z.ZodRawShape>(label: string, item: T, min: number, max: number) =>
  z
    .array(z.object(item).strict())
    .min(min, `${label}: at least ${min} item(s) required`)
    .max(max, `${label}: at most ${max} items allowed`);

const section = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ visible: z.boolean().default(true), ...shape }).strict();

const homeStatsContentSchema = section({
  items: list('Ticker items', localized('text'), 1, 8),
});

const homeAppContentSchema = section({
  logoImage: image,
  ...localized('headline', 300),
  ...localized('tagline', 300),
  ...localized('downloadLabel'),
  phoneImage: image,
  features: list('Features', { ...localized('label'), icon: image }, 1, 6),
});

const homeJourneyContentSchema = section({
  ...localized('titleLine1'),
  ...localized('titleLine2'),
  ...localized('text', 1000),
  ...localized('buttonLabel'),
  buttonLink: link,
  riderImageEn: image,
  riderImageAr: image,
  cards: list('Cards', { ...localized('label'), image, link }, 1, 8),
});

const homeCommunityContentSchema = section({
  ...localized('eyebrow'),
  ...localized('title'),
  ...localized('subtitle', 500),
  ...localized('buttonLabel'),
  buttonLink: link,
});

const homePlatformContentSchema = section({
  ...localized('title'),
  cards: list(
    'Cards',
    { ...localized('tag'), ...localized('title', 300), ...localized('action'), image, link },
    1,
    6
  ),
});

const homeFeedContentSchema = section({
  ...localized('title'),
  ...localized('subtitle', 1000),
});

const homePartnersContentSchema = section({
  ...localized('title'),
  ...localized('subtitle', 1000),
});

const homeAboutContentSchema = section({
  ...localized('title'),
  ...localized('text', 1500),
  stats: list('Stats', { ...localized('value', 20), ...localized('label', 100) }, 1, 4),
  ...localized('buttonLabel'),
  buttonLink: link,
  riderImageEn: image,
  riderImageAr: image,
});

const homeVenueContentSchema = section({
  ...localized('title1'),
  ...localized('title2'),
  image,
  ...localized('imageTitle'),
  ...localized('imageSubtitle', 500),
  // Fixed at two: each card has its own built-in icon on the site.
  cards: list('Cards', { ...localized('title'), ...localized('text', 500) }, 2, 2),
  ...localized('text', 1500),
  ...localized('buttonLabel'),
  buttonLink: link,
});

/**
 * Editable sections per page, each with the schema its content must match.
 * Add an entry here to make another page section editable from the dashboard.
 */
export const PAGE_SECTION_SCHEMAS: Record<string, Record<string, z.ZodType>> = {
  home: {
    banner: homeBannerContentSchema,
    stats: homeStatsContentSchema,
    app: homeAppContentSchema,
    journey: homeJourneyContentSchema,
    community: homeCommunityContentSchema,
    platform: homePlatformContentSchema,
    feed: homeFeedContentSchema,
    partners: homePartnersContentSchema,
    about: homeAboutContentSchema,
    venue: homeVenueContentSchema,
  },
};

export const pageSectionParamsSchema = z
  .object({
    page: z.string().trim().toLowerCase(),
    section: z.string().trim().toLowerCase(),
  })
  .refine((val) => Boolean(PAGE_SECTION_SCHEMAS[val.page]?.[val.section]), {
    message: 'Unknown page section',
  });

export const pageParamsSchema = z
  .object({
    page: z.string().trim().toLowerCase(),
  })
  .refine((val) => Boolean(PAGE_SECTION_SCHEMAS[val.page]), {
    message: 'Unknown page',
  });
