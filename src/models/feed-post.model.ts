import mongoose, { Schema, Document } from 'mongoose';

export type FeedPostStatus = 'pending' | 'approved' | 'rejected';

export interface IFeedPost extends Document {
  title: string;
  description: string;
  status: FeedPostStatus;
  image?: string;
  likes: mongoose.Types.ObjectId[];
  comments: {
    user?: mongoose.Types.ObjectId;
    text: string;
    createdAt: Date;
  }[];
  reported: boolean;
  rejectedReason?: string;
  approvedNotificationSentAt?: Date | null;
  rejectedNotificationSentAt?: Date | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeedPostSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Post title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Post description is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      required: [true, 'Post status is required'],
      default: 'pending',
      index: true,
    },
    image: {
      type: String,
      trim: true,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'users',
      },
    ],
    comments: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'users',
        },
        text: {
          type: String,
          trim: true,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reported: {
      type: Boolean,
      default: false,
      index: true,
    },
    rejectedReason: {
      type: String,
      trim: true,
    },
    approvedNotificationSentAt: { type: Date, default: null },
    rejectedNotificationSentAt: { type: Date, default: null },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Creator is required'],
      index: true,
    },
  },
  { timestamps: true }
);

FeedPostSchema.index({ status: 1, reported: 1, createdAt: -1 });
FeedPostSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.model<IFeedPost>('feedPosts', FeedPostSchema);
