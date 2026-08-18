import mongoose, { Schema, Document } from 'mongoose';

export interface ICommunityMembership extends Document {
  userId: mongoose.Types.ObjectId;
  communityId: mongoose.Types.ObjectId;
  role: 'member' | 'organiser' | 'admin';
  joinedAt: Date;
  status: 'active' | 'inactive' | 'banned';
  contribution?: number; // Points or contribution count
  createdAt: Date;
  updatedAt: Date;
}

const CommunityMembershipSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'User ID is required'],
      index: true,
    },
    communityId: {
      type: Schema.Types.ObjectId,
      ref: 'communities',
      required: [true, 'Community ID is required'],
      index: true,
    },
    role: {
      type: String,
      enum: ['member', 'moderator', 'admin'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'banned'],
      default: 'active',
    },
    contribution: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure unique user-community pairs
CommunityMembershipSchema.index({ userId: 1, communityId: 1 }, { unique: true });

export default mongoose.model<ICommunityMembership>('communityMemberships', CommunityMembershipSchema);
