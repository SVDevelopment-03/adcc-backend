import mongoose, { Schema, Document } from 'mongoose';

/**
 * Central catalog of every image (and other file) ever uploaded through
 * `uploadImageBufferToS3` (see services/s3-upload.service.ts), regardless of
 * which form/controller triggered the upload. This is what powers the
 * WordPress-style "choose an existing image" picker across the dashboard —
 * a single shared library instead of each admin only seeing their own
 * browser's history.
 */
export interface IMedia extends Document {
  url: string;
  key: string;
  folder: string;
  name: string;
  mimeType?: string;
  size?: number;
  uploadedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MediaSchema = new Schema<IMedia>(
  {
    url: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true, trim: true },
    folder: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

MediaSchema.index({ createdAt: -1 });
MediaSchema.index({ name: 'text' });

export default mongoose.model<IMedia>('Media', MediaSchema);
