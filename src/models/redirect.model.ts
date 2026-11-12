import mongoose, { Schema, Document } from 'mongoose';

/**
 * A URL redirect managed in the dashboard (Pages → Redirects). `from` is a
 * site path, optionally ending in `/*` to cover everything below it; `to` is
 * a site path (may end in `/*` to keep the rest of the URL) or a full URL.
 */
export interface IRedirect extends Document {
  from: string;
  to: string;
  enabled: boolean;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

const RedirectSchema = new Schema<IRedirect>(
  {
    from: { type: String, required: true, trim: true, lowercase: true, unique: true },
    to: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    note: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<IRedirect>('redirects', RedirectSchema);
