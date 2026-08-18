import { z } from 'zod';

export const createCommunityRideSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    titleAr: z.string().min(1, 'Arabic title is required').optional(),
    description: z.string().min(1, 'Description is required'),
    descriptionAr: z.string().min(1, 'Arabic description is required').optional(),
    image: z.string().optional(),
    date: z.string().or(z.date()).refine(
      (val) => {
        const date = val instanceof Date ? val : new Date(val);
        return !isNaN(date.getTime());
      },
      { message: 'Invalid date' }
    ),
    time: z.string().min(1, 'Time is required'),
    address: z.string().min(1, 'Address is required'),
    addressAr: z.string().min(1, 'Arabic address is required').optional(),
    maxParticipants: z.number().int().min(0, 'Max participants cannot be negative').optional(),
    minAge: z.number().int().min(0, 'Min age cannot be negative').optional(),
    maxAge: z.number().int().min(0, 'Max age cannot be negative').optional(),
    status: z.enum(['active', 'left', 'banned']).default('active'),
  })
  .strict();

export const updateCommunityRideSchema = z
  .object({
    title: z.string().min(1, 'Title is required').optional(),
    titleAr: z.string().min(1, 'Arabic title is required').optional(),
    description: z.string().min(1, 'Description is required').optional(),
    descriptionAr: z.string().min(1, 'Arabic description is required').optional(),
    image: z.string().optional(),
    date: z
      .string()
      .or(z.date())
      .refine(
        (val) => {
          const date = val instanceof Date ? val : new Date(val);
          return !isNaN(date.getTime());
        },
        { message: 'Invalid date' }
      )
      .optional(),
    time: z.string().min(1, 'Time is required').optional(),
    address: z.string().min(1, 'Address is required').optional(),
    addressAr: z.string().min(1, 'Arabic address is required').optional(),
    maxParticipants: z.number().int().min(0, 'Max participants cannot be negative').optional(),
    minAge: z.number().int().min(0, 'Min age cannot be negative').optional(),
    maxAge: z.number().int().min(0, 'Max age cannot be negative').optional(),
    status: z.enum(['active', 'left', 'banned']).optional(),
  })
  .strict();

export const getCommunityRidesQuerySchema = z.object({
  status: z.enum(['active', 'left', 'banned']).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export type CreateCommunityRideInput = z.infer<typeof createCommunityRideSchema>;
export type UpdateCommunityRideInput = z.infer<typeof updateCommunityRideSchema>;
export type GetCommunityRidesQueryInput = z.infer<typeof getCommunityRidesQuerySchema>;

