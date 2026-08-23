import mongoose, { Schema, Document } from 'mongoose';

export type MerchandiseProductStatus = 'published' | 'draft' | 'archived';
export type MerchandiseProductSource = 'adcc' | 'vendor';

export interface IMerchandiseProductVariant {
  id: string;
  size?: string;
  color?: string;
  colorHex?: string;
  stock: number;
  sku: string;
}

export interface IMerchandiseProduct extends Document {
  name: string;
  nameAr?: string;
  categoryId: string;
  subcategoryId?: string;
  price: number;
  originalPrice?: number;
  images: string[];
  description: string;
  descriptionAr?: string;
  specifications: Array<{ label: string; value: string }>;
  specificationsAr?: Array<{ label: string; value: string; labelAr?: string; valueAr?: string }>;
  variants: IMerchandiseProductVariant[];
  status: MerchandiseProductStatus;
  featured: boolean;
  tags: string[];
  totalStock: number;
  sold: number;
  sku: string;
  source: MerchandiseProductSource;
  vendorName?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MerchandiseProductVariantSchema = new Schema(
  {
    id: {
      type: String,
      required: [true, 'Variant ID is required'],
      trim: true,
    },
    size: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },
    colorHex: {
      type: String,
      trim: true,
    },
    stock: {
      type: Number,
      required: [true, 'Variant stock is required'],
      min: [0, 'Variant stock cannot be negative'],
      default: 0,
    },
    sku: {
      type: String,
      required: [true, 'Variant SKU is required'],
      trim: true,
    },
  },
  { _id: false }
);

const MerchandiseProductSchema = new Schema<IMerchandiseProduct>(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    nameAr: {
      type: String,
      trim: true,
    },
    categoryId: {
      type: String,
      required: [true, 'Product category is required'],
      trim: true,
      index: true,
    },
    subcategoryId: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    originalPrice: {
      type: Number,
      min: [0, 'Original price cannot be negative'],
    },
    images: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
    },
    descriptionAr: {
      type: String,
      trim: true,
    },
    specificationsAr: {
      type: [
        {
          label: { type: String, trim: true, required: true },
          value: { type: String, trim: true, required: true },
          labelAr: { type: String, trim: true },
          valueAr: { type: String, trim: true },
        },
      ],
      default: [],
    },
    specifications: {
      type: [
        {
          label: { type: String, trim: true, required: true },
          value: { type: String, trim: true, required: true },
        },
      ],
      default: [],
    },
    variants: {
      type: [MerchandiseProductVariantSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['published', 'draft', 'archived'],
      default: 'draft',
    },
    featured: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    totalStock: {
      type: Number,
      default: 0,
      min: [0, 'Total stock cannot be negative'],
    },
    sold: {
      type: Number,
      default: 0,
      min: [0, 'Sold count cannot be negative'],
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      trim: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['adcc', 'vendor'],
      default: 'adcc',
    },
    vendorName: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
    },
  },
  {
    timestamps: true,
  }
);

MerchandiseProductSchema.index({ status: 1 });
MerchandiseProductSchema.index({ source: 1 });
MerchandiseProductSchema.index({ sku: 1 });

export default mongoose.model<IMerchandiseProduct>('merchandise_products', MerchandiseProductSchema);
