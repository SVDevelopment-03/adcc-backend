import mongoose, { Schema, Document } from 'mongoose';

export type ChallengeType = 'Distance' | 'Frequency' | 'Duration' | 'Social' | 'Event';

export type ChallengeStatus =
  | 'Draft'
  | 'Active'
  | 'Upcoming'
  | 'Completed'
  | 'Closed'
  | 'Disabled'
  | 'Archived';

export interface IChallenge extends Document {
  title: string;
  description: string;
  image?: string;
  type: ChallengeType;
  target: number;
  unit: string;
  startDate: Date;
  endDate: Date;
  rewardBadge?: mongoose.Types.ObjectId;
  rules?: string[];
  featured: boolean;
  status: ChallengeStatus;
  participants: number;
  completions: number;
  publishedNotificationSentAt?: Date | null;
  endingSoonNotificationSentAt?: Date | null;
  completedNotificationSentAt?: Date | null;
  createdBy: mongoose.Types.ObjectId;
  communities?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Challenge title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Challenge description is required'],
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['Distance', 'Frequency', 'Duration', 'Social', 'Event'],
      required: [true, 'Challenge type is required'],
    },
    target: {
      type: Number,
      min: [0, 'Target cannot be negative'],
      required: [true, 'Target is required'],
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      trim: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    rewardBadge: {
      type: Schema.Types.ObjectId,
      ref: 'badges',
    },
    rules: {
      type: [String],
      default: [],
    },
    featured: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['Draft', 'Active', 'Upcoming', 'Completed', 'Closed', 'Disabled', 'Archived'],
      default: 'Draft',
    },
    participants: {
      type: Number,
      default: 0,
      min: [0, 'Participants cannot be negative'],
    },
    completions: {
      type: Number,
      default: 0,
      min: [0, 'Completions cannot be negative'],
    },
    publishedNotificationSentAt: { type: Date, default: null },
    endingSoonNotificationSentAt: { type: Date, default: null },
    completedNotificationSentAt: { type: Date, default: null },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Challenge creator is required'],
    },
    communities: [
      {
        type: Schema.Types.ObjectId,
        ref: 'communities',
      },
    ],
  },
  {
    timestamps: true,
  }
);

ChallengeSchema.index({ status: 1, startDate: 1, createdAt: -1 });
ChallengeSchema.index({ featured: 1, status: 1 });
ChallengeSchema.index({ type: 1, status: 1 });
ChallengeSchema.index({ communities: 1 });

export default mongoose.model<IChallenge>('challenges', ChallengeSchema);
