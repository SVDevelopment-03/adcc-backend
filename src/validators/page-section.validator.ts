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

/**
 * Editable sections per page, each with the schema its content must match.
 * Add an entry here to make another page section editable from the dashboard.
 */
export const PAGE_SECTION_SCHEMAS: Record<string, Record<string, z.ZodType>> = {
  home: {
    banner: homeBannerContentSchema,
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
