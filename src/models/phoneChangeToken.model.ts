import mongoose, { Schema, Document } from 'mongoose';

export interface IPhoneChangeToken extends Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

const PhoneChangeTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'users', required: true, index: true },
    token: { type: String, required: true, index: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    used: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<IPhoneChangeToken>('phone_change_tokens', PhoneChangeTokenSchema);
