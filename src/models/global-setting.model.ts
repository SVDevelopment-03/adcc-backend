import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalSetting extends Document {
  key: string;
  group?: string;
  label?: string;
  title?: string;
  description?: string;
  image?: string;
  active?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GlobalSettingSchema = new Schema<IGlobalSetting>(
  {
    key: {
      type: String,
      required: [true, 'Key is required'],
      trim: true,
      unique: true,
    },
    group: {
      type: String,
      trim: true,
    },
    label: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
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

GlobalSettingSchema.index({ group: 1, key: 1 });

export default mongoose.model<IGlobalSetting>('global_settings', GlobalSettingSchema);
