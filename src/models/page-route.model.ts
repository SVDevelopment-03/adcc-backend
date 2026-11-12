import mongoose, { Schema, Document } from 'mongoose';

/**
 * The URL of a built-in public page when an admin has changed it (Pages →
 * <page> → Page URL). Pages without a document keep their original path.
 */
export interface IPageRoute extends Document {
  pageId: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

const PageRouteSchema = new Schema<IPageRoute>(
  {
    pageId: { type: String, required: true, trim: true, unique: true },
    path: { type: String, required: true, trim: true, lowercase: true, unique: true },
  },
  { timestamps: true }
);

export default mongoose.model<IPageRoute>('page_routes', PageRouteSchema);
