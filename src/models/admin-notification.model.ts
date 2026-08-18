import mongoose, { Schema, Document, Types } from 'mongoose';

export type AdminNotificationCategory =
  | 'event'
  | 'community'
  | 'tracks'
  | 'store'
  | 'feed_moderation';

export interface IAdminNotification extends Document {
  category: AdminNotificationCategory;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  readByUserIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const AdminNotificationSchema = new Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ['event', 'community', 'tracks', 'store', 'feed_moderation'],
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    readByUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'users' }],
      default: [],
    },
  },
  { timestamps: true }
);

AdminNotificationSchema.index({ createdAt: -1 });
AdminNotificationSchema.index({ category: 1, createdAt: -1 });

export default mongoose.model<IAdminNotification>(
  'adminNotifications',
  AdminNotificationSchema
);
