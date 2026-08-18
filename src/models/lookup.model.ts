import mongoose, { Schema, Document } from 'mongoose';

/**
 * Generic, admin-manageable lookup list used to replace hardcoded dropdown/filter
 * data (event categories, community types, cities, countries, ...) with
 * dashboard-editable, bilingual (English/Arabic) values.
 *
 * `type` groups entries into a named list (e.g. "event_category").
 * `value` is the stable identifier stored on referencing records (for
 * event categories this intentionally matches the existing English label
 * text, e.g. "Community Ride", so no data migration is required).
 *
 * `parentValue` supports hierarchical lists (e.g. type "city" entries set
 * `parentValue` to the owning country's `value` within type "country") —
 * a plain string reference rather than an ObjectId, consistent with how
 * every other reference in this collection avoids joins.
 */
export interface ILookup extends Document {
  type: string;
  value: string;
  label: string;
  labelAr: string;
  parentValue?: string;
  icon?: string;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LookupSchema = new Schema<ILookup>(
  {
    type: {
      type: String,
      required: [true, 'Lookup type is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    value: {
      type: String,
      required: [true, 'Lookup value is required'],
      trim: true,
    },
    label: {
      type: String,
      required: [true, 'English label is required'],
      trim: true,
    },
    labelAr: {
      type: String,
      required: [true, 'Arabic label is required'],
      trim: true,
    },
    parentValue: {
      type: String,
      trim: true,
      index: true,
    },
    icon: {
      type: String,
      trim: true,
    },
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

LookupSchema.index({ type: 1, value: 1, parentValue: 1 }, { unique: true });
LookupSchema.index({ type: 1, order: 1, label: 1 });
LookupSchema.index({ type: 1, parentValue: 1, order: 1 });

export default mongoose.model<ILookup>('lookups', LookupSchema);
