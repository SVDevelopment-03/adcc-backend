import { z } from 'zod';
import mongoose from 'mongoose';

const objectIdSchema = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: 'Invalid MongoDB ObjectId' }
);

export const createStoreItemSchema = z
  .object({
    title: z.string().min(1, 'Item title is required'),
    description: z.string().min(1, 'Item description is required'),
    category: z.string().min(1, 'Item category is required'),
    condition: z.string().min(1, 'Item condition is required'),
    currency: z.string().min(1, 'Currency is required').default('AED'),
    price: z.number().min(0, 'Price cannot be negative'),
    photos: z.array(z.string().min(1)).max(5, 'Up to 5 photos are allowed').optional(),
    video: z.string().url('Invalid video URL').optional(),
    coverImage: z.string().min(1).optional(),
    contactMethod: z.enum(['Call', 'WhatsApp', 'InApp']),
    phoneNumber: z.string().min(5, 'Phone number is required').optional(),
    city: z.string().min(1, 'City is required'),
  })
  .strict()
  .superRefine((val, ctx) => {
    if ((val.contactMethod === 'Call' || val.contactMethod === 'WhatsApp') && !val.phoneNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone number is required for the selected contact method',
        path: ['phoneNumber'],
      });
    }
    if ((val.photos == null || val.photos.length === 0) && !val.video) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one photo or a video is required',
        path: ['photos'],
      });
    }
  });

export const updateStoreItemSchema = z
  .object({
    title: z.string().min(1, 'Item title is required').optional(),
    description: z.string().min(1, 'Item description is required').optional(),
    category: z.string().min(1, 'Item category is required').optional(),
    condition: z.string().min(1, 'Item condition is required').optional(),
    currency: z.string().min(1, 'Currency is required').optional(),
    price: z.number().min(0, 'Price cannot be negative').optional(),
    photos: z.array(z.string().min(1)).max(5, 'Up to 5 photos are allowed').optional(),
    video: z.string().url('Invalid video URL').optional(),
    coverImage: z.string().min(1).optional(),
    contactMethod: z.enum(['Call', 'WhatsApp', 'InApp']).optional(),
    phoneNumber: z.string().min(5, 'Phone number is required').optional(),
    city: z.string().min(1, 'City is required').optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if ((val.contactMethod === 'Call' || val.contactMethod === 'WhatsApp') && !val.phoneNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone number is required for the selected contact method',
        path: ['phoneNumber'],
      });
    }
  });

export const storeItemQuerySchema = z.object({
  status: z.enum(['Pending', 'Approved', 'Rejected', 'Sold', 'Archived']).optional(),
  category: z.string().optional(),
  condition: z.string().optional(),
  city: z.string().optional(),
  minPrice: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).optional(),
  maxPrice: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).optional(),
  q: z.string().optional(),
  sellerId: objectIdSchema.optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const approveStoreItemSchema = z
  .object({
    isFeatured: z.boolean().optional(),
  })
  .strict();

export const rejectStoreItemSchema = z
  .object({
    reason: z.string().min(1, 'Rejection reason is required').optional(),
  })
  .strict();

export const featureStoreItemSchema = z
  .object({
    isFeatured: z.boolean(),
  })
  .strict();

export type CreateStoreItemInput = z.infer<typeof createStoreItemSchema>;
export type UpdateStoreItemInput = z.infer<typeof updateStoreItemSchema>;
export type StoreItemQueryInput = z.infer<typeof storeItemQuerySchema>;
