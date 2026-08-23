import { z } from 'zod';
import mongoose from 'mongoose';

const firstValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const objectIdSchema = z.string().refine(
  (value) => mongoose.Types.ObjectId.isValid(String(value)),
  { message: 'Invalid MongoDB ObjectId' }
);

export const merchandiseProductStatusSchema = z.enum(['published', 'draft', 'archived']);
export const merchandiseOrderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]);

const merchandiseProductVariantSchema = z.object({
  id: z.string().min(1, 'Variant id is required'),
  size: z.string().optional(),
  color: z.string().optional(),
  colorHex: z.string().optional(),
  stock: z.number().min(0, 'Variant stock cannot be negative'),
  sku: z.string().min(1, 'Variant SKU is required'),
});

const merchandiseProductSpecificationSchema = z.object({
  label: z.string().min(1, 'Specification label is required'),
  value: z.string().min(1, 'Specification value is required'),
});

const merchandiseProductSpecificationArSchema = z.object({
  label: z.string().min(1, 'Specification label is required'),
  value: z.string().min(1, 'Specification value is required'),
  labelAr: z.string().optional(),
  valueAr: z.string().optional(),
});

export const createMerchandiseProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  nameAr: z.string().optional(),
  categoryId: z.string().min(1, 'Product category is required'),
  subcategoryId: z.string().optional(),
  price: z.number().min(0, 'Price cannot be negative'),
  originalPrice: z.number().min(0, 'Original price cannot be negative').optional(),
  images: z.array(z.string().min(1)).optional(),
  description: z.string().min(1, 'Product description is required'),
  descriptionAr: z.string().optional(),
  specifications: z.array(merchandiseProductSpecificationSchema).optional().default([]),
  specificationsAr: z.array(merchandiseProductSpecificationArSchema).optional().default([]),
  variants: z.array(merchandiseProductVariantSchema).min(1, 'At least one variant is required'),
  status: merchandiseProductStatusSchema.optional().default('draft'),
  featured: z.boolean().optional().default(false),
  tags: z.array(z.string().min(1)).optional().default([]),
  sku: z.string().min(1, 'SKU is required'),
  source: z.enum(['adcc', 'vendor']).optional().default('adcc'),
  vendorName: z.string().optional(),
});

export const updateMerchandiseProductSchema = createMerchandiseProductSchema.partial();

export const merchandiseQuerySchema = z.object({
  source: z.preprocess(firstValue, z.enum(['adcc', 'vendor'])).optional(),
  status: z.preprocess(firstValue, merchandiseProductStatusSchema).optional(),
  categoryId: z.preprocess(firstValue, z.string()).optional(),
  subcategoryId: z.preprocess(firstValue, z.string()).optional(),
  q: z.preprocess(firstValue, z.string()).optional(),
  page: z.preprocess(firstValue, z.coerce.number().int()).optional(),
  limit: z.preprocess(firstValue, z.coerce.number().int()).optional(),
});

export const createMerchandiseCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  nameAr: z.string().optional(),
  icon: z.string().min(1, 'Category icon is required').optional(),
  image: z.string().min(1, 'Category image is required').optional(),
  active: z.boolean().optional().default(true),
  subcategories: z.array(
    z.object({
      id: z.string().min(1, 'Subcategory id is required'),
      name: z.string().min(1, 'Subcategory name is required'),
    })
  ).optional().default([]),
});

export const updateMerchandiseCategorySchema = createMerchandiseCategorySchema.partial();

export const createMerchandiseOrderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1, 'Product ID is required'),
      productName: z.string().min(1, 'Product name is required'),
      productImage: z.string().optional(),
      size: z.string().optional(),
      color: z.string().optional(),
      price: z.number().min(0, 'Item price cannot be negative'),
      quantity: z.number().min(1, 'Item quantity must be at least 1'),
    })
  ).min(1, 'At least one order item is required'),
  shippingAddress: z.object({
    name: z.string().min(1, 'Shipping name is required'),
    line1: z.string().min(1, 'Shipping address is required'),
    city: z.string().min(1, 'Shipping city is required'),
    emirate: z.string().min(1, 'Shipping emirate is required'),
    phone: z.string().min(5, 'Shipping phone is required'),
  }),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  paymentLast4: z.string().min(4, 'Payment last 4 digits must be 4 characters').max(4).optional(),
  shipping: z.number().min(0, 'Shipping cannot be negative').optional().default(0),
  notes: z.string().optional(),
});

export const updateMerchandiseProductStatusSchema = z.object({
  status: merchandiseProductStatusSchema,
});

export const updateMerchandiseProductFeaturedSchema = z.object({
  featured: z.boolean(),
});

export const updateMerchandiseOrderStatusSchema = z.object({
  status: merchandiseOrderStatusSchema,
});

export const updateMerchandiseOrderTrackingSchema = z.object({
  trackingNumber: z.string().min(1, 'Tracking number is required'),
});

export const merchandiseOrderQuerySchema = z.object({
  status: z.preprocess(firstValue, merchandiseOrderStatusSchema).optional(),
  q: z.preprocess(firstValue, z.string()).optional(),
  page: z.preprocess(firstValue, z.coerce.number().int()).optional(),
  limit: z.preprocess(firstValue, z.coerce.number().int()).optional(),
  userId: z.preprocess(firstValue, objectIdSchema).optional(),
});
