import mongoose, { Schema, Document } from 'mongoose';
import {
  BADGE_CATEGORIES,
  BADGE_ICON_KEYS,
  BADGE_RARITIES,
  BadgeCategory,
  BadgeIcon,
  BadgeRarity,
} from '@/constants/badges';

export interface IBadge extends Document {
  name: string;
  nameAr?: string;
  description: string;
  descriptionAr?: string;
  icon: BadgeIcon;
  category: BadgeCategory;
  timesAwarded: number;
  rarity: BadgeRarity;
  requirements: string;
  image?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BadgeSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Badge title is required'],
      trim: true,
    },
    nameAr: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Badge description is required'],
      trim: true,
    },
    descriptionAr: {
      type: String,
      trim: true,
    },
    icon: {
      type: String,
      enum: BADGE_ICON_KEYS,
      required: [true, 'Badge icon is required'],
    },
    category: {
      type: String,
      enum: BADGE_CATEGORIES,
      required: [true, 'Badge category is required'],
    },
    timesAwarded: {
      type: Number,
      default: 0,
      min: [0, 'Times awarded cannot be negative'],
    },
    rarity: {
      type: String,
      enum: BADGE_RARITIES,
      required: [true, 'Badge rarity is required'],
    },
    requirements: {
      type: String,
      required: [true, 'Badge requirements are required'],
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

BadgeSchema.index({ name: 1 }, { unique: true });
BadgeSchema.index({ active: 1, category: 1, rarity: 1 });

export default mongoose.model<IBadge>('badges', BadgeSchema);
