import { z } from 'zod';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

const dateField = (message: string) =>
  z.preprocess(firstValue, z.string().or(z.date())).refine(
    (val) => {
      const date = val instanceof Date ? val : new Date(val);
      return !isNaN(date.getTime());
    },
    { message }
  );

export const createNewsSchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'News title is required')),
    titleAr: z.preprocess(firstValue, z.string()).optional(),
    content: z.preprocess(firstValue, z.string().min(1, 'News content is required')),
    contentAr: z.preprocess(firstValue, z.string()).optional(),
    category: z.preprocess(firstValue, z.string()).optional(),
    coverImage: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    author: z.preprocess(firstValue, z.string()).optional(),
    status: z.preprocess(firstValue, z.enum(['Draft', 'Published', 'Trash'])).default('Draft'),
    publishedAt: dateField('Invalid publish date').optional(),
    slug: z.preprocess(firstValue, z.string()).optional(),
  })
  .strict();

export const updateNewsSchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'News title is required')).optional(),
    titleAr: z.preprocess(firstValue, z.string()).optional(),
    content: z.preprocess(firstValue, z.string().min(1, 'News content is required')).optional(),
    contentAr: z.preprocess(firstValue, z.string()).optional(),
    category: z.preprocess(firstValue, z.string()).optional(),
    coverImage: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
    author: z.preprocess(firstValue, z.string()).optional(),
    status: z.preprocess(firstValue, z.enum(['Draft', 'Published', 'Trash'])).optional(),
    publishedAt: dateField('Invalid publish date').optional(),
    slug: z.preprocess(firstValue, z.string()).optional(),
  })
  .strict();

export const getNewsQuerySchema = z.object({
  status: z.enum(['Draft', 'Published', 'Trash']).optional(),
  category: z.string().optional(),
  q: z.string().trim().min(1).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export type CreateNewsInput = z.infer<typeof createNewsSchema>;
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;
export type GetNewsQueryInput = z.infer<typeof getNewsQuerySchema>;
