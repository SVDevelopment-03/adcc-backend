import { z } from 'zod';

export const evenResultSchema = z
  .object({
    eventId: z.string().min(1, 'Event ID is required'),
    userId: z.string().min(1, 'User ID is required'),
    distance: z.number().min(0, 'Distance cannot be negative').optional(),
    time: z.string().optional(),
    rank: z.number().min(1, 'Rank must be at least 1').optional(),
    pointsEarned: z.number().min(0, 'Points earned cannot be negative').optional(),
    badge: z.string().optional(),
    status: z.enum(['joined', 'cancelled', 'completed', 'checked_in', 'no_show']),
  })
  .strict();

  export const updateEventResultSchema = z
  .object({
    distance: z.number().min(0, 'Distance cannot be negative').optional(),
    time: z.string().optional(),
    rank: z.number().min(1, 'Rank must be at least 1').optional(),
    pointsEarned: z.number().min(0, 'Points earned cannot be negative').optional(),
    badge: z.string().optional(),
    status: z.enum(['joined', 'cancelled', 'completed', 'checked_in', 'no_show']).optional(),
  })
  .strict();

export const joinEventSchema = z
  .object({
    eventId: z.string().min(1, 'Event ID is required'),
  })
  .strict();

/** Time in mm:ss or hh:mm:ss for submit result */
const timePattern = /^(?:\d{1,2}:)?[0-5]\d:[0-5]\d$/;

export const submitResultSchema = z
  .object({
    time: z
      .string()
      .trim()
      .min(1, 'Time is required')
      .regex(timePattern, 'Time must be in mm:ss or hh:mm:ss format'),
    distance: z.number().min(0, 'Distance cannot be negative').optional(),
    calories: z.number().min(0, 'Calories cannot be negative').optional(),
    elevationGain: z.string().trim().optional(),
    rating: z.number().min(1).max(5).optional(),
    notes: z.string().trim().optional(),
  })
  .strict();

export const resultFeedbackSchema = z
  .object({
    rating: z.number().min(1).max(5).optional(),
    notes: z.string().trim().optional(),
  })
  .strict()
  .refine((data) => data.rating != null || (data.notes != null && data.notes !== ''), {
    message: 'At least one of rating or notes must be provided',
  });

/** Optional "Share your photos" – add image URLs to a completed result */
export const addResultPhotosSchema = z
  .object({
    imageUrls: z
      .array(z.string().trim().min(1, 'Image URL cannot be empty'))
      .min(1, 'At least one image URL is required')
      .max(10, 'Maximum 10 photos per request'),
  })
  .strict();

export type CreateEventResultInput = z.infer<typeof evenResultSchema>;
export type UpdateEventResultInput = z.infer<typeof updateEventResultSchema>;
export type JoinEventSchemaInput = z.infer<typeof joinEventSchema>;
export type SubmitResultInput = z.infer<typeof submitResultSchema>;
export type ResultFeedbackInput = z.infer<typeof resultFeedbackSchema>;
export type AddResultPhotosInput = z.infer<typeof addResultPhotosSchema>;
