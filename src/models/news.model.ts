import mongoose, { Schema, Document } from 'mongoose';
import { generateUniqueSlug } from '@/utils/slug';

/**
 * News categories are dashboard-managed (see the `lookups` collection,
 * type "news_category") rather than a fixed enum, so admins can add/edit/
 * remove categories without a code change.
 */
export type INewsCategory = string;

export interface INews extends Document {
  title: string;
  titleAr?: string;
  /** Rich text (HTML) body written via the dashboard's WYSIWYG editor. */
  content: string;
  contentAr?: string;
  category?: INewsCategory;
  coverImage?: string;
  /** Free-text byline, e.g. "Adcc Club" — defaults to the creator's name if blank. */
  author?: string;
  status: 'Draft' | 'Published' | 'Trash';
  publishedAt?: Date;
  slug?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NewsSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'News title is required'],
      trim: true,
    },
    titleAr: {
      type: String,
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'News content is required'],
    },
    contentAr: {
      type: String,
    },
    category: {
      // Dashboard-managed via the `lookups` collection (type "news_category").
      type: String,
      trim: true,
    },
    coverImage: {
      type: String,
      trim: true,
    },
    author: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Published', 'Trash'],
      default: 'Draft',
    },
    publishedAt: {
      type: Date,
    },
    slug: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'News creator is required'],
    },
  },
  {
    timestamps: true,
  }
);

NewsSchema.index({ status: 1, publishedAt: -1, createdAt: -1 });
NewsSchema.index({ title: 'text', titleAr: 'text' });

// Auto-generate a URL-friendly slug from the title on first save. Existing
// articles keep their slug forever once set — it's never regenerated on a
// later title edit, so shared/bookmarked links stay valid.
NewsSchema.pre('save', async function () {
  if (!this.slug && this.title) {
    this.slug = await generateUniqueSlug(
      this.constructor as mongoose.Model<INews>,
      this.title,
      (this._id as mongoose.Types.ObjectId | undefined)?.toString(),
    );
  }
});

export default mongoose.model<INews>('news', NewsSchema);
