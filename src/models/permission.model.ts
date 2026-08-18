import mongoose, { Schema, Document } from 'mongoose';

export interface IPermission extends Document {
  key: string;
  name: string;
  description?: string;
  group?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema(
  {
    key: {
      type: String,
      required: [true, 'Permission key is required'],
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [/^[a-z0-9][a-z0-9_.-]*$/, 'Invalid permission key format'],
    },
    name: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    group: {
      type: String,
      trim: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IPermission>('Permission', PermissionSchema);
