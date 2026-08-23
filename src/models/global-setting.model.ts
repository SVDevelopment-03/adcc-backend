import mongoose, { Schema, Document } from 'mongoose';

export interface IGlobalSetting extends Document {
  key: string;
  group?: string;
  label?: string;
  title?: string;
  description?: string;
  image?: string;
  targetScreen?: string;
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
    targetScreen: {
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

// Unique per (group, key) — not per key alone — so the same key can be
// reused across groups (e.g. an Arabic banner is paired with its English
// counterpart by reusing that banner's key, see banner.controller.ts).
GlobalSettingSchema.index({ group: 1, key: 1 }, { unique: true });

export default mongoose.model<IGlobalSetting>('global_settings', GlobalSettingSchema);
