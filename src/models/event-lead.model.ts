import mongoose, { Document, Schema } from 'mongoose';

export const EVENT_LEAD_GENDERS = ['Male', 'Female'] as const;

export const EVENT_LEAD_CITIES = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
  'Al Ain',
  'Al Dhafra',
] as const;

/** Snapshot of the picked event track, so the lead still reads correctly if the track is later edited or removed. */
export interface IEventLeadTrack {
  trackId: mongoose.Types.ObjectId;
  name: string;
  date: string;
  time: string;
}

export interface IEventLead extends Document {
  eventId: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  mobileNumber: string;
  email: string;
  gender: (typeof EVENT_LEAD_GENDERS)[number];
  nationality: string;
  city: (typeof EVENT_LEAD_CITIES)[number];
  emergencyContactName: string;
  emergencyContactNumber: string;
  raceTracks: IEventLeadTrack[];
  createdAt: Date;
  updatedAt: Date;
}

const EventLeadSchema = new Schema(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'events',
      required: true,
    },
    firstName: { type: String, required: [true, 'First name is required'], trim: true, maxlength: 120 },
    lastName: { type: String, required: [true, 'Last name is required'], trim: true, maxlength: 120 },
    dateOfBirth: { type: Date, required: [true, 'Date of birth is required'] },
    mobileNumber: { type: String, required: [true, 'Mobile number is required'], trim: true },
    email: { type: String, required: [true, 'Email is required'], trim: true, lowercase: true },
    gender: { type: String, enum: EVENT_LEAD_GENDERS, required: [true, 'Gender is required'] },
    nationality: { type: String, required: [true, 'Nationality is required'], trim: true, maxlength: 120 },
    city: { type: String, enum: EVENT_LEAD_CITIES, required: [true, 'Region/City is required'] },
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
    raceTracks: {
      type: [
        {
          _id: false,
          trackId: { type: Schema.Types.ObjectId, required: true },
          name: { type: String, required: true, trim: true },
          date: { type: String, required: true, trim: true },
          time: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

EventLeadSchema.index({ eventId: 1, createdAt: -1 });
EventLeadSchema.index({ eventId: 1, 'raceTracks.trackId': 1 });

export default mongoose.model<IEventLead>('event_leads', EventLeadSchema);
