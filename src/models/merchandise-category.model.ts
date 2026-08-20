import mongoose, { Schema, Document } from 'mongoose';

export interface IMerchandiseCategory extends Document {
  id: string;
  name: string;
  nameAr?: string;
  icon: string;
  image?: string | null;
  active: boolean;
  subcategories: Array<{ id: string; name: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const MerchandiseCategorySchema = new Schema<IMerchandiseCategory>(
  {
    id: {
      type: String,
      required: [true, 'Category ID is required'],
      trim: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    nameAr: {
      type: String,
      trim: true,
    },
    icon: {
      type: String,
      trim: true,
      default: '🏷️',
    },
    image: {
      type: String,
      trim: true,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    subcategories: [
      {
        id: {
          type: String,
          required: [true, 'Subcategory ID is required'],
          trim: true,
        },
        name: {
          type: String,
          required: [true, 'Subcategory name is required'],
          trim: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

MerchandiseCategorySchema.index({ id: 1 }, { unique: true });

export default mongoose.model<IMerchandiseCategory>('merchandise_categories', MerchandiseCategorySchema);
