import mongoose, { Schema, Document } from 'mongoose';
import { generateUniqueSlug } from '@/utils/slug';


// Dashboard-managed via the `lookups` collection (type "track_facility").
export type FacilityType = string;

export interface ITrackFacility {
  facilities?: FacilityType[];
}


export interface ITrack extends Document {
  title: string;
  titleAr?: string;
  description: string;
  descriptionAr?: string;
  image?: string;
  coverImage?: string;
  city: string;
  address?: string;
  zipcode?: string;
  latitude?: number;
  longitude?: number;
  distance: number;
  elevation: string;
  trackType: 'circuit' | 'road' | 'costal' | 'desert' | 'urban';
  avgtime?: string; // in minutes
  pace?: string;
  facilities?: ITrackFacility[];
  estimatedTime?: string;
  loopOptions?: number[];
  difficulty?: string;
  category?: string;
  surfaceType: 'asphalt' | 'concrete' | 'mixed';
  status: 'open' | 'limited' | 'closed' | 'archived' | 'disabled';
  slug?: string;
  country?: string;
  safetyNotes?: string;
  helmetRequired?: boolean;
  area?: string;
  displayPriority?: number;
  nightRidingAllowed?: boolean;
  visibility?: string;
  galleryImages?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

const TrackSchema = new Schema(
  {
    title: { type: String, required: [true, 'Track title is required'], trim: true },
    titleAr: { type: String, trim: true },
    description: { type: String, required: [true, 'Track description is required'], trim: true },
    descriptionAr: { type: String, trim: true },
    image: { type: String, trim: true },
    coverImage: { type: String, trim: true },
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    zipcode: { type: String, trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    trackFile: { type: String, trim: true },
    distance: { type: Number, required: [true, 'Track distance is required'], min: 0 },
    elevation: { type: String, required: [true, 'Elevation gain is required'], min: 0 },
    trackType: {
      type: String,
        enum: ['circuit', 'road', 'costal', 'desert', 'urban'],
        required: [true, 'Track type is required'],
    },
    avgtime: { type: String },
    pace: { type: String, trim: true },
    facilities: {
        // Dashboard-managed via the `lookups` collection (type "track_facility") —
        // intentionally not a Mongoose enum so new facilities don't require a deploy.
        type: [String],
        default: [],
      },
    status: { type: String },
    surfaceType: { type: String },
    safetyNotes: { type: String },
    helmetRequired: { type: Boolean },
    visibility: { type: String },
    slug: { type: String, unique: true, sparse: true },
    estimatedTime: { type: String },
    country: { type: String },
    difficulty: { type: String },
    category: { type: String },
    displayPriority: { type: Number },
    loopOptions: {
      type: [Number],
      default: [],
    },
    nightRidingAllowed: { type: Boolean },
    area: { type: String },
    galleryImages: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Event creator is required'],
    },
  },
  { timestamps: true }
);

// Auto-generate a URL-friendly slug from the title on first save. Existing
// tracks keep their slug forever once set — it's never regenerated on a
// later title edit, so shared/bookmarked links stay valid.
TrackSchema.pre('save', async function () {
  if (!this.slug && this.title) {
    this.slug = await generateUniqueSlug(
      this.constructor as mongoose.Model<ITrack>,
      this.title,
      (this._id as mongoose.Types.ObjectId | undefined)?.toString(),
    );
  }
});

export default mongoose.model<ITrack>('track', TrackSchema);
