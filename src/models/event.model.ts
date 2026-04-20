import mongoose, { Schema, Document } from 'mongoose';

export interface IEventEligibility {
  helmetRequired: boolean;
  roadBikeOnly: boolean;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'all';
  gender?: 'male' | 'female' | 'other' | 'all';
}

export interface IEventSchedule {
  time: string;
  title: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  order?: number;
}

export type IEventAmenity = string;

export type IEventCategory =
  | 'Race'
  | 'Community Ride'
  | 'Training & Clinics'
  | 'Awareness Rides'
  | 'Family & Kids'
  | 'Corporate Events'
  | 'National Events';

export interface IEvent {
  amenities?: IEventAmenity[];
}


export interface IEvent extends Document {
  communityId?: mongoose.Types.ObjectId;
  trackId?: mongoose.Types.ObjectId;
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  mainImage?: string;
  eventImage?: string;
  eventDate: Date;
  eventTime: string;
  address: string;
  addressAr?: string;
  city?: string;
  country ?: string;
  zipCode?: string;
  maxParticipants?: number; // 0 means unlimited
  registrationFeeType?: 'free' | 'paid';
  registrationFeeAmount?: number;
  minAge?: number;
  maxAge?: number;
  distance?: number; // in kilometers
  amenities?: IEventAmenity[];
  schedule?: IEventSchedule[];
  eligibility?: IEventEligibility;
  youtubeLink?: string;
  category?: IEventCategory;
  currentParticipants: number;
  status: 'Open' | 'Draft' | 'Full' | 'Closed' | 'Disabled' | 'Completed' | 'Archived';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  rewards: {
    points: number;
    badgeName: string;
    badgeImage?: string;
  };
  slug?: string;
  endTime?: string;
  difficulty?: string;
  isFeatured?: boolean;
  allowCancellation?: boolean;
  galleryImages?: string[];
}

const EventSchema = new Schema(
  {
    communityId: {
      type: Schema.Types.ObjectId,
      ref: 'communities',
      set: (value: unknown) => {
        if (value === null || value === undefined) return undefined;
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (!normalized || normalized === 'null' || normalized === 'undefined') {
            return undefined;
          }
        }
        return value;
      },
      // default: null,
      // required: [true, 'Community ID is required'],
    },
    trackId: {
      type: Schema.Types.ObjectId,
      ref: 'track',
      set: (value: unknown) => {
        if (value === null || value === undefined) return undefined;
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase();
          if (!normalized || normalized === 'null' || normalized === 'undefined') {
            return undefined;
          }
        }
        return value;
      },
      // default: null,
      // required: [true, 'Track ID is required'],
    },
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
    },
    titleAr: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Event description is required'],
      trim: true,
    },
    descriptionAr: {
      type: String,
      trim: true,
    },
    mainImage: {
      type: String,
      trim: true,
    },
    eventImage: {
      type: String,
      trim: true,
    },
    eventDate: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    eventTime: {
      type: String,
      required: [true, 'Event time is required'],
    },
    endTime: {
      type: String,
      required: [true, 'Event time end is required'],
    },
    address: {
      type: String,
      required: [true, 'Event address is required'],
      trim: true,
    },
    addressAr: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    zipCode: {
      type: String,
      trim: true,
    },
    distance: {
      type: Number,
      min: [0, 'Distance cannot be negative'],
    },
    amenities: [
      {
        type: String,
        trim: true,
      },
    ],
    schedule: [
      {
        time: { type: String, required: true },
        title: { type: String, required: true },
        titleAr: { type: String },
        description: { type: String },
        descriptionAr: { type: String },
        order: { type: Number },
      },
    ],
    eligibility: [
      {
        helmetRequired: { type: Boolean, default: false },
        roadBikeOnly: { type: Boolean, default: false },
        experienceLevel: {
          type: String,
          enum: ['beginner', 'intermediate', 'advanced', 'all'],
          default: 'all',
        },
        gender: {
          type: String,
          enum: ['male', 'female', 'other', 'all'],
          default: 'all',
        },
      },
    ],
    maxParticipants: {
      type: Number,
      min: [0, 'Max participants cannot be negative'],
      // 0 means unlimited
    },
    registrationFeeType: {
      type: String,
      enum: ['free', 'paid'],
      default: 'free',
      trim: true,
    },
    registrationFeeAmount: {
      type: Number,
      min: [0, 'Registration fee amount cannot be negative'],
      default: 0,
    },
    minAge: {
      type: Number,
      min: [0, 'Min age cannot be negative'],
    },
    maxAge: {
      type: Number,
      min: [0, 'Max age cannot be negative'],
    },
    youtubeLink: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['Race', 'Community Ride', 'Training & Clinics', 'Awareness Rides', 'Family & Kids', 'Corporate Events', 'National Events'],
      trim: true,
    },
    currentParticipants: {
      type: Number,
      default: 0,
      min: [0, 'Current participants cannot be negative'],
    },
    status: {
      type: String,
      enum: ['Draft', 'Open', 'Full', 'Closed', 'Disabled', 'Completed', 'Archived'],
      default: 'Open',
    },
    galleryImages: {
      type: [String],
      default: [],
    },
    difficulty: {
      type: String,
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
    },
    isFeatured:{
      type: Boolean,
      trim: true,
    },
    allowCancellation:{
      type: Boolean,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Event creator is required'],
    },
  },
  {
    timestamps: true,
  }
);

// Index for filtering
EventSchema.index({ eventDate: 1, status: 1 });
EventSchema.index({ status: 1, eventDate: 1, createdAt: -1 });

export default mongoose.model<IEvent>('events', EventSchema);
