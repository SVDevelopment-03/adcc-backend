import mongoose, { Document, Schema } from 'mongoose';

export const LAFFAH_RIDE_LOCATIONS = [
  'Al Dhafra',
  'Al Wathba',
  'Al Ain',
  'Yas Marina',
  'Al Hudariyat',
] as const;

export type LaffahRideLocation = (typeof LAFFAH_RIDE_LOCATIONS)[number];

export const LAFFAH_RIDE_GENDERS = ['Male', 'Female'] as const;

export interface ILaffahRideRegistration extends Document {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  mobileNumber: string;
  email: string;
  gender: (typeof LAFFAH_RIDE_GENDERS)[number];
  nationality: string;
  city: string;
  raceLocations: LaffahRideLocation[];
  createdAt: Date;
  updatedAt: Date;
}

const LaffahRideRegistrationSchema = new Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 120,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 120,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    gender: {
      type: String,
      enum: LAFFAH_RIDE_GENDERS,
      required: [true, 'Gender is required'],
    },
    nationality: {
      type: String,
      required: [true, 'Nationality is required'],
      trim: true,
      maxlength: 120,
    },
    city: {
      type: String,
      required: [true, 'Region/City is required'],
      trim: true,
      maxlength: 120,
    },
    raceLocations: {
      type: [{ type: String, enum: LAFFAH_RIDE_LOCATIONS }],
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ILaffahRideRegistration>(
  'laffah_ride_registrations',
  LaffahRideRegistrationSchema
);
