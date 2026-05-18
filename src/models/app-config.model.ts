import mongoose, { Schema, Document } from 'mongoose';

export type AppConfigLanguage = 'English' | 'Arabic';

export interface IAppConfig extends Document {
  key: string;
  config: {
    appName: string;
    supportEmail: string;
    contactPhone: string;
    defaultLanguage: AppConfigLanguage;
    features: Record<string, boolean>;
    notifications: Record<string, boolean>;
    security: Record<string, boolean>;
  };
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppConfigSchema = new Schema<IAppConfig>(
  {
    key: { type: String, required: true, unique: true, default: 'default', trim: true },
    config: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAppConfig>('app_configs', AppConfigSchema);

