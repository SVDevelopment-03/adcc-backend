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

export const LAFFAH_RIDE_CITIES = [
  'Abu Dhabi',
  'Abu al Abyad',
  'Adhen',
  'Ajman',
  'Al Ain',
  'Al Ajban',
  'Al Aryam',
  'Al Awir',
  'Al Badiyah',
  'Al Bataeh',
  'Al Bithnah',
  'Al Faqa',
  'Al Halah',
  'Al Hamraniyah',
  'Al Hamriyah',
  'Al Jazirah Al Hamra',
  'Al Jeer',
  'Al Khawaneej',
  'Al Lisaili',
  'Al Madam',
  'Al Manama',
  'Al Mirfa',
  'Al Qor',
  'Al Qusaidat',
  'Al Rafaah',
  'Al Rashidya',
  'Al Shuwaib',
  'Al Yahar',
  'Ar-Rams',
  'Asimah',
  'Dadna',
  'Dalma',
  'Dhaid',
  'Dibba Al-Fujairah',
  'Dibba Al-Hisn',
  'Digdaga',
  'Dubai',
  'Falaj Al Mualla',
  'Fujairah',
  'Ghalilah',
  'Ghayathi',
  'Ghub',
  'Habshan',
  'Hatta',
  'Huwaylat',
  'Jebel Ali',
  'Kalba',
  'Khatt',
  'Khor Fakkan',
  'Khor Khwair',
  'Lahbab',
  'Liwa Oasis',
  'Madinat Zayed',
  'Marawah',
  'Masafi',
  'Masfut',
  'Mirbah',
  'Mleiha',
  'Nahil',
  'Ras Al Khaimah',
  'Ruwais',
  "Sha'am",
  'Sharjah',
  'Sila',
  'Sir Bani Yas',
  'Sweihan',
  'Umm Al Quwain',
  'Wadi Shah',
  'Zubarah',
] as const;

export interface ILaffahRideRegistration extends Document {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  mobileNumber: string;
  email: string;
  gender: (typeof LAFFAH_RIDE_GENDERS)[number];
  nationality: string;
  city: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
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
    emergencyContactName: {
      type: String,
      required: [true, 'Emergency contact name is required'],
      trim: true,
      maxlength: 120,
    },
    emergencyContactNumber: {
      type: String,
      required: [true, 'Emergency contact mobile number is required'],
      trim: true,
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
