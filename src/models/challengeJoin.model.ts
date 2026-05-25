import mongoose, { Schema, Document } from 'mongoose';

export interface IChallengeJoin extends Document {
  challengeId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: 'joined' | 'left';
  joinedAt: Date;
  leftAt?: Date | null;
  progressValue?: number;
  progressPercent?: number;
  milestone25SentAt?: Date | null;
  milestone50SentAt?: Date | null;
  milestone75SentAt?: Date | null;
  completedNotificationSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ChallengeJoinSchema = new Schema<IChallengeJoin>(
  {
    challengeId: { type: Schema.Types.ObjectId, ref: 'challenges', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true },
    status: {
      type: String,
      enum: ['joined', 'left'],
      default: 'joined',
    },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    progressValue: { type: Number, default: 0, min: 0 },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    milestone25SentAt: { type: Date, default: null },
    milestone50SentAt: { type: Date, default: null },
    milestone75SentAt: { type: Date, default: null },
    completedNotificationSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ChallengeJoinSchema.index({ challengeId: 1, userId: 1 }, { unique: true });
ChallengeJoinSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IChallengeJoin>('challengeJoin', ChallengeJoinSchema);