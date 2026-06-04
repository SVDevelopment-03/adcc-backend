import mongoose, { Document, Schema } from 'mongoose';

export interface INewsletterSubscription extends Document {
  email: string;
  source: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NewsletterSubscriptionSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
      trim: true,
      default: 'home-footer',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<INewsletterSubscription>(
  'newsletter_subscriptions',
  NewsletterSubscriptionSchema
);
