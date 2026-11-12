import { z } from 'zod';
import mongoose from 'mongoose';
import { BUILT_IN_PAGE_PATHS } from '@/utils/site-paths';

/*
 * Custom pages, page URLs and redirects (routes/site.route.ts). The block
 * types mirror services/customPageBlocks.ts in the web app; URL rules
 * (reserved paths, conflicts, loops) are checked in site.controller.ts.
 */

// Site-relative paths and http(s) URLs only, so a saved value can never
// become a `javascript:` link or image source.
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

const localized = <K extends string>(name: K, max = 200) =>
  ({ [`${name}En`]: text(max), [`${name}Ar`]: text(max) }) as Record<`${K}En` | `${K}Ar`, ReturnType<typeof text>>;

const block = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z
    .object({
      id: z.string().trim().min(1).max(50),
      type: z.literal(type),
      visible: z.boolean().default(true),
      ...shape,
    })
    .strict();

const items = <S extends z.ZodRawShape>(label: string, shape: S, max: number) =>
  z.array(z.object(shape).strict()).max(max, `${label}: at most ${max} items allowed`).default([]);

export const customPageBlockSchema = z.discriminatedUnion('type', [
  block('hero', { ...localized('title'), ...localized('subtitle', 300), backgroundImage: image }),
  block('text', { ...localized('heading', 300), ...localized('body', 20000) }),
  block('imageText', {
    ...localized('heading', 300),
    ...localized('body', 5000),
    image,
    imagePosition: z.enum(['left', 'right']).default('right'),
    ...localized('buttonLabel'),
    buttonLink: link,
  }),
  block('image', { image, ...localized('caption', 300) }),
  block('cards', {
    ...localized('heading', 300),
    items: items('Cards', { ...localized('title'), ...localized('text', 1000), image, link }, 12),
  }),
  block('faq', {
    ...localized('heading', 300),
    items: items('Questions', { ...localized('question', 300), ...localized('answer', 3000) }, 30),
  }),
  block('cta', {
    ...localized('title'),
    ...localized('text', 1000),
    ...localized('buttonLabel'),
    buttonLink: link,
    backgroundImage: image,
  }),
  block('gallery', { ...localized('heading', 300), items: items('Images', { image }, 30) }),
]);

export const customPageBodySchema = z
  .object({
    slug: z.string().trim().min(1, 'URL is required').max(200),
    titleEn: z.string().trim().min(1, 'English title is required').max(200),
    titleAr: text(200),
    status: z.enum(['draft', 'published']).default('draft'),
    seoTitleEn: text(200),
    seoTitleAr: text(200),
    seoDescriptionEn: text(500),
    seoDescriptionAr: text(500),
    blocks: z.array(customPageBlockSchema).max(50, 'A page can have at most 50 blocks').default([]),
  })
  .strict();

export const idParamsSchema = z.object({
  id: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), { message: 'Invalid id' }),
});

export const pageRouteParamsSchema = z.object({
  pageId: z.string().refine((val) => Object.prototype.hasOwnProperty.call(BUILT_IN_PAGE_PATHS, val), {
    message: 'Unknown page',
  }),
});

export const pageRouteBodySchema = z.object({
  path: z.string().trim().min(1, 'URL is required').max(200),
});

export const redirectBodySchema = z
  .object({
    from: z.string().trim().min(1, '"From" URL is required').max(300),
    to: z.string().trim().min(1, '"To" URL is required').max(1000),
    enabled: z.boolean().default(true),
    note: text(300),
  })
  .strict();

export const slugQuerySchema = z.object({
  slug: z.string().trim().min(1).max(200),
});
