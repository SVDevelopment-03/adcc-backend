import mongoose, { Schema, Document } from 'mongoose';

export interface ICommunityRide extends Document {
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  image?: string;
  date: Date;
  time: string;
  address: string;
  addressAr?: string;
  maxParticipants?: number; // 0 means unlimited
  minAge?: number;
  maxAge?: number;
  currentParticipants: number;
  status: 'active' | 'left' | 'banned';
  publishedNotificationSentAt?: Date | null;
  reminder24hSentAt?: Date | null;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CommunityRideSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    titleAr: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    descriptionAr: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
    },
    time: {
      type: String,
      required: [true, 'Time is required'],
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    addressAr: {
      type: String,
      trim: true,
    },
    maxParticipants: {
      type: Number,
      min: [0, 'Max participants cannot be negative'],
      // 0 means unlimited
    },
    minAge: {
      type: Number,
      min: [0, 'Min age cannot be negative'],
    },
    maxAge: {
      type: Number,
      min: [0, 'Max age cannot be negative'],
    },
    currentParticipants: {
      type: Number,
      default: 0,
      min: [0, 'Current participants cannot be negative'],
    },
    status: {
      type: String,
      enum: ['active', 'left', 'banned'],
      default: 'active',
    },
    publishedNotificationSentAt: { type: Date, default: null },
    reminder24hSentAt: { type: Date, default: null },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Creator is required'],
    },
  },
  {
    timestamps: true,
  }
);

// Index for filtering
CommunityRideSchema.index({ date: 1, status: 1 });

export default mongoose.model<ICommunityRide>('communityrides', CommunityRideSchema);

