import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRole extends Document {
  name: string;
  slug: string;
  description?: string;
  /** Built-in roles (e.g. super-admin) cannot be deleted */
  isSystem: boolean;
  permissions: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Role name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Role slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [/^[a-z0-9][a-z0-9_-]*$/, 'Invalid role slug format'],
    },
    description: {
      type: String,
      trim: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },
    permissions: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Permission',
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<IRole>('Role', RoleSchema);
