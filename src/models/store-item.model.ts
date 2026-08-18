import mongoose, { Schema, Document } from 'mongoose';

export type StoreItemStatus = 'Pending' | 'Approved' | 'Rejected' | 'Sold' | 'Archived';

export interface IStoreItem extends Document {
  title: string;
  titleAr?: string;
  sellerName?: string;
  description: string;
  descriptionAr?: string;
  category: string;
  categoryAr?: string;
  condition: string;
  conditionAr?: string;
  currency: string;
  price: number;
  photos: string[];
  coverImage?: string;
  video?: string;
  contactMethod: 'Call' | 'WhatsApp' | 'InApp';
  phoneNumber?: string;
  city: string;
  cityAr?: string;
  status: StoreItemStatus;
  isFeatured: boolean;
  createdBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  approvedNotificationSentAt?: Date | null;
  rejectedNotificationSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const StoreItemSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Item title is required'],
      trim: true,
    },
    titleAr: {
      type: String,
      trim: true,
    },
    sellerName: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
    },
    descriptionAr: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Item category is required'],
      trim: true,
    },
    categoryAr: {
      type: String,
      trim: true,
    },
    condition: {
      type: String,
      required: [true, 'Item condition is required'],
      trim: true,
    },
    conditionAr: {
      type: String,
      trim: true,
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      trim: true,
      default: 'AED',
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    photos: {
      type: [String],
      default: [],
      validate: [
        {
          validator: function (this: any, value: string[]) {
            return Array.isArray(value) && value.length <= 5;
          },
          message: 'Up to 5 photos are allowed',
        },
        {
          validator: function (this: any, value: string[]) {
            return (Array.isArray(value) && value.length > 0) || Boolean(this.video);
          },
          message: 'At least one photo or a video is required',
        },
      ],
    },
    coverImage: {
      type: String,
      trim: true,
    },
    video: {
      type: String,
      trim: true,
    },
    contactMethod: {
      type: String,
      enum: ['Call', 'WhatsApp', 'InApp'],
      required: [true, 'Preferred contact method is required'],
      default: 'InApp',
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
      required: [true, 'City is required'],
    },
    cityAr: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Sold', 'Archived'],
      default: 'Pending',
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Creator is required'],
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
    },
    approvedAt: {
      type: Date,
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
    },
    rejectedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    approvedNotificationSentAt: { type: Date, default: null },
    rejectedNotificationSentAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

StoreItemSchema.index({ status: 1, createdAt: -1 });
StoreItemSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.model<IStoreItem>('store_items', StoreItemSchema);
