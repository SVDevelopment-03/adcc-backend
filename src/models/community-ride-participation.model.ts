import mongoose, { Schema, Document } from 'mongoose';

export interface ICommunityRideParticipation extends Document {
  rideId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: 'joined' | 'left';
  joinedAt: Date;
  leftAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CommunityRideParticipationSchema = new Schema<ICommunityRideParticipation>(
  {
    rideId: { type: Schema.Types.ObjectId, ref: 'communityrides', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
    status: {
      type: String,
      enum: ['joined', 'left'],
      default: 'joined',
    },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CommunityRideParticipationSchema.index({ rideId: 1, userId: 1 }, { unique: true });
CommunityRideParticipationSchema.index({ userId: 1, status: 1 });

export default mongoose.model<ICommunityRideParticipation>('communityRideParticipation', CommunityRideParticipationSchema);