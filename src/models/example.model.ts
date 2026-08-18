import mongoose, { Schema, Document } from 'mongoose';

export interface IExample extends Document {
  name: string;
  email: string;
  role: string;
}

const ExampleSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, default: 'member' },
}, {
  timestamps: true,
});

export default mongoose.model<IExample>('examples', ExampleSchema);