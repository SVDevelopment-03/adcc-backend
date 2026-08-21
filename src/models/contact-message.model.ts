import mongoose, { Document, Schema } from 'mongoose';

export interface IContactMessage extends Document {
  firstName: string;
  email: string;
  phone?: string;
  message: string;
  status: 'New' | 'Read' | 'Resolved';
  createdAt: Date;
  updatedAt: Date;
}

const ContactMessageSchema = new Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: 4000,
    },
    status: {
      type: String,
      enum: ['New', 'Read', 'Resolved'],
      default: 'New',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IContactMessage>('contact_messages', ContactMessageSchema);
