import mongoose, { Schema, Document, Types } from 'mongoose';

/** One broadcast sent from the dashboard's Push Notifications page. */
export interface IPushCampaign extends Document {
  title: string;
  body: string;
  audienceType: string;
  deliveryType: 'app' | 'email' | 'both';
  /** Users who received an in-app inbox entry. */
  recipientCount: number;
  /** Device pushes FCM accepted / rejected. */
  pushSuccessCount: number;
  pushFailureCount: number;
  emailCount: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PushCampaignSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audienceType: { type: String, default: 'all' },
    deliveryType: { type: String, enum: ['app', 'email', 'both'], default: 'app' },
    recipientCount: { type: Number, default: 0 },
    pushSuccessCount: { type: Number, default: 0 },
    pushFailureCount: { type: Number, default: 0 },
    emailCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'users' },
  },
  { timestamps: true }
);

PushCampaignSchema.index({ createdAt: -1 });

export default mongoose.model<IPushCampaign>('pushCampaigns', PushCampaignSchema);
