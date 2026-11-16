import { z } from 'zod';

const textSchema = z.string().trim().max(200);

const bannerMediaUrl = z
  .string()
  .trim()
  .max(1000)
  .default('')
  .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//i.test(v), {
    message: 'Media URL must start with "/" or "http(s)://"',
  });

export const HOME_BANNER_MAX_SLIDES = 8;

/**
 * Homepage banner. `mode` picks what fills the hero:
 *  - `static`   — one image (`imageEn`, optional `imageAr`)
 *  - `carousel` — 2+ `slides` that cross-fade every `intervalSeconds`
 *  - `video`    — `videoUrl`, looping and muted, with `videoPoster` shown
 *                 while it loads (falls back to `imageEn`)
 * Title text / buttons and `hideText` apply to every mode. Documents saved
 * before `mode` existed parse as `static`, so nothing changes for them.
 */
export const homeBannerContentSchema = z
  .object({
    mode: z.enum(['static', 'carousel', 'video']).default('static'),
    hideText: z.boolean().default(false),
    // Kept when no new file is uploaded; may be a site-relative path for the
    // built-in default images or an S3 URL for uploaded ones. The Arabic image
    // is optional; the site falls back to the English one.
    imageEn: bannerMediaUrl,
    imageAr: bannerMediaUrl,
    slides: z
      .array(z.object({ imageEn: bannerMediaUrl, imageAr: bannerMediaUrl }).strict())
      .max(HOME_BANNER_MAX_SLIDES, `Carousel: at most ${HOME_BANNER_MAX_SLIDES} slides allowed`)
      .default([]),
    intervalSeconds: z.number().int().min(3, 'Slide interval must be at least 3 seconds').max(15, 'Slide interval must be at most 15 seconds').default(5),
    videoUrl: bannerMediaUrl,
    videoPoster: bannerMediaUrl,
    titleLine1En: textSchema.default(''),
    titleLine2En: textSchema.default(''),
    titleLine1Ar: textSchema.default(''),
    titleLine2Ar: textSchema.default(''),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Only the selected mode's media is required; the others are kept so an
    // admin can switch back without re-uploading.
    if (data.mode === 'static' && !data.imageEn) {
      ctx.addIssue({ code: 'custom', path: ['imageEn'], message: 'Banner image is required' });
    }
    if (data.mode === 'carousel') {
      const filled = data.slides.filter((s) => s.imageEn);
      if (filled.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['slides'], message: 'Carousel needs at least 2 slide images' });
      }
      data.slides.forEach((s, i) => {
        if (!s.imageEn) {
          ctx.addIssue({ code: 'custom', path: ['slides', i, 'imageEn'], message: `Slide ${i + 1} needs an image` });
        }
      });
    }
    if (data.mode === 'video' && !data.videoUrl) {
      ctx.addIssue({ code: 'custom', path: ['videoUrl'], message: 'Banner video is required' });
    }
  });

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
  // Fixed at two. `icon` is optional: an empty one keeps the card's built-in
  // icon on the site.
  cards: list('Cards', { icon: image, ...localized('title'), ...localized('text', 500) }, 2, 2),
  ...localized('text', 1500),
  ...localized('buttonLabel'),
  buttonLink: link,
});

/* ─── Site-wide header and footer (page "layout") ───────────────────────── */

const navLink = { ...localized('label'), link };

const layoutHeaderContentSchema = section({
  logoImage: image,
  navItems: list('Menu items', navLink, 1, 10),
});

const layoutCtaContentSchema = section({
  ...localized('title'),
  ...localized('subtitle', 500),
  backgroundImage: image,
});

const layoutFooterContentSchema = section({
  logoImage: image,
  ...localized('brandText', 1000),
  // The site picks each icon from the link's domain (Twitter/X, Facebook, ...).
  socialLinks: list('Social links', navLink, 0, 8),
  ...localized('quickLinksTitle'),
  quickLinks: list('Quick links', navLink, 0, 12),
  ...localized('contactTitle'),
  phone: text(50),
  email: text(200),
  ...localized('address', 500),
  addressLink: link,
  ...localized('copyright'),
});

const layoutJourneyCardContentSchema = section({
  riderImage: image,
  ...localized('eyebrow'),
  ...localized('title'),
  ...localized('communityText'),
  ...localized('buttonLabel'),
  buttonLink: link,
});

/* ─── Other public pages (Pages → About Us, Events, ...) ───────────────── */
// Mirrors CONTENT_PAGES in the web app's services/contentPages.ts.

const heroContentSchema = section({
  ...localized('title'),
  ...localized('breadcrumb'),
  backgroundImage: image,
});

const introContentSchema = section({
  ...localized('title', 300),
  ...localized('body', 2000),
});

const introWithImageContentSchema = section({
  ...localized('title', 300),
  ...localized('body', 2000),
  image,
});

const headingContentSchema = section({
  ...localized('title', 300),
});

const aboutIntroContentSchema = section({
  ...localized('title', 300),
  image,
  // An empty value on the first two stats shows the live member / event counts.
  stats: list('Stats', { ...localized('value', 20), ...localized('label', 100) }, 1, 4),
  ...localized('body', 2000),
  ...localized('buttonLabel'),
  buttonLink: link,
});

const aboutMissionContentSchema = section({
  ...localized('title', 300),
  ...localized('intro', 2000),
  backgroundImage: image,
  ...localized('missionHeading'),
  ...localized('missionText', 2000),
  ...localized('visionHeading'),
  ...localized('visionText', 2000),
});

const aboutValuesContentSchema = section({
  ...localized('eyebrow'),
  ...localized('title', 300),
  ...localized('buttonLabel'),
  buttonLink: link,
  items: list('Values', { ...localized('title'), ...localized('text', 500) }, 1, 6),
});

const aboutCoachesContentSchema = section({
  ...localized('title', 300),
  cards: list('Cards', { ...localized('label'), image }, 1, 4),
});

const tracksWhyContentSchema = section({
  ...localized('title', 300),
  ...localized('buttonLabel'),
  image,
  backgroundImage: image,
  features: list('Features', { ...localized('title'), ...localized('text', 500) }, 1, 6),
});

const challengesVideoContentSchema = section({
  videoUrl: url('Video'),
  posterImage: image,
});

const contactDetailsContentSchema = section({
  email: text(200),
  phone: text(50),
  ...localized('address', 500),
  addressLink: link,
});

const marketplaceGearUpContentSchema = section({
  ...localized('title', 300),
  ...localized('body', 2000),
  ...localized('buttonLabel'),
  buttonLink: link,
  image,
});

const privacyPolicyContentSchema = section({
  ...localized('title'),
  ...localized('breadcrumb'),
  ...localized('intro', 20000),
  sections: list('Policy sections', { ...localized('heading', 300), ...localized('body', 20000) }, 1, 40),
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
  layout: {
    header: layoutHeaderContentSchema,
    cta: layoutCtaContentSchema,
    footer: layoutFooterContentSchema,
    journey: layoutJourneyCardContentSchema,
  },
  about: {
    hero: heroContentSchema,
    intro: aboutIntroContentSchema,
    mission: aboutMissionContentSchema,
    values: aboutValuesContentSchema,
    coaches: aboutCoachesContentSchema,
  },
  events: {
    hero: heroContentSchema,
    intro: introContentSchema,
  },
  tracks: {
    hero: heroContentSchema,
    intro: introWithImageContentSchema,
    why: tracksWhyContentSchema,
    list: headingContentSchema,
  },
  challenges: {
    hero: heroContentSchema,
    intro: introContentSchema,
    video: challengesVideoContentSchema,
    list: headingContentSchema,
  },
  communities: {
    hero: heroContentSchema,
    intro: introWithImageContentSchema,
    list: headingContentSchema,
  },
  contact: {
    hero: heroContentSchema,
    intro: introWithImageContentSchema,
    details: contactDetailsContentSchema,
  },
  store: {
    launching: headingContentSchema,
  },
  marketplace: {
    hero: heroContentSchema,
    list: section({ ...localized('title', 300), ...localized('listingsTitle', 300) }),
    promo: marketplaceGearUpContentSchema,
  },
  news: {
    hero: heroContentSchema,
    intro: introContentSchema,
  },
  laffah: {
    hero: heroContentSchema,
    intro: introContentSchema,
  },
  privacy: {
    policy: privacyPolicyContentSchema,
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
