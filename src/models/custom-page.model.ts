import mongoose, { Schema, Document } from 'mongoose';

/** A page built in the dashboard from content blocks (Pages → New page). */
export interface ICustomPage extends Document {
  slug: string;
  titleEn: string;
  titleAr: string;
  status: 'draft' | 'published';
  seoTitleEn: string;
  seoTitleAr: string;
  seoDescriptionEn: string;
  seoDescriptionAr: string;
  // Shape per block type is validated in site.validator.ts.
  blocks: Record<string, unknown>[];
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomPageSchema = new Schema<ICustomPage>(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    titleEn: { type: String, required: true, trim: true },
    titleAr: { type: String, default: '', trim: true },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    seoTitleEn: { type: String, default: '' },
    seoTitleAr: { type: String, default: '' },
    seoDescriptionEn: { type: String, default: '' },
    seoDescriptionAr: { type: String, default: '' },
    blocks: { type: Schema.Types.Mixed, default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'users' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'users' },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.model<ICustomPage>('custom_pages', CustomPageSchema);
