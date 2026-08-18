import { z } from 'zod';

const firstValue = (val: unknown) => (Array.isArray(val) ? val[0] : val);

const postTypeEnum = z.enum(['Announcement', 'Highlight', 'Awareness']);

export const createCommunityPostSchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'Post title is required')),
    postType: z.preprocess(firstValue, postTypeEnum),
    caption: z.preprocess(firstValue, z.string().min(1, 'Caption is required')).optional(),
    image: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
  })
  .strict();

export const updateCommunityPostSchema = z
  .object({
    title: z.preprocess(firstValue, z.string().min(1, 'Post title is required')).optional(),
    postType: z.preprocess(firstValue, postTypeEnum).optional(),
    caption: z.preprocess(firstValue, z.string().min(1, 'Caption is required')).optional(),
    image: z.preprocess(firstValue, z.string().url('Invalid image URL')).optional(),
  })
  .strict();

export const getCommunityPostsQuerySchema = z.object({
  postType: z.preprocess(firstValue, postTypeEnum).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  q: z.string().optional(),
});

export type CreateCommunityPostInput = z.infer<typeof createCommunityPostSchema>;
export type UpdateCommunityPostInput = z.infer<typeof updateCommunityPostSchema>;
export type GetCommunityPostsQueryInput = z.infer<typeof getCommunityPostsQuerySchema>;
