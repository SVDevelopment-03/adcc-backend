import mongoose, { Schema, Document } from 'mongoose';

export interface IPartner extends Document {
  name: string;
  logo: string;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerSchema = new Schema<IPartner>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    logo: {
      type: String,
      required: [true, 'Logo is required'],
      trim: true,
    },
    // Position in the homepage partners strip — lower comes first.
    order: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

PartnerSchema.index({ order: 1 });

export default mongoose.model<IPartner>('partners', PartnerSchema);
