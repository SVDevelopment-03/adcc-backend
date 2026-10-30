import mongoose, { Schema, Document } from 'mongoose';

export interface IPageSection extends Document {
  page: string;
  section: string;
  // Shape depends on the section; validated per section in page-section.validator.ts.
  content: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PageSectionSchema = new Schema<IPageSection>(
  {
    page: {
      type: String,
      required: [true, 'Page is required'],
      trim: true,
      lowercase: true,
    },
    section: {
      type: String,
      required: [true, 'Section is required'],
      trim: true,
      lowercase: true,
    },
    content: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

PageSectionSchema.index({ page: 1, section: 1 }, { unique: true });

export default mongoose.model<IPageSection>('page_sections', PageSectionSchema);
