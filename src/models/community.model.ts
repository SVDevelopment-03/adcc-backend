import mongoose, { Schema, Document } from 'mongoose';
import { generateUniqueSlug } from '@/utils/slug';

export interface ICommunity extends Document {
  title: string;
  titleAr?: string;
  slug: string;
  description: string;
  descriptionAr?: string;
  type: string[];
  category: string;
  location?: string; // Dashboard-managed via the `lookups` collection (type "city")
  purposeType?: string;
  ridesThisMonth?: string;
  weeklyRides?: string;
  fundsRaised?: string;
  primaryTracks?: string;
  joinMode?: string;
  displayPriority?: string;
  area?: string;
  city?: string;
  country?: string;
  image?: string;
  logo?: string;
  gallery?: string[];
  members?: mongoose.Types.ObjectId[];
  memberCount?: number;
  trackName?: string; // For search functionality
  distance?: number; // For search functionality (in km)
  terrain?: string; // For search functionality
  isActive: boolean;
  isPublic: boolean;
  status: boolean;
  isFeatured: boolean;
  allowPosts: boolean;
  allowGallery: boolean;
  foundedYear: number;
  /** Primary cycling tracks (array of refs). */
  trackId?: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  manager?: string;
}

const CommunitySchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Community title is required'],
      trim: true,
    },
    titleAr: {
      type: String,
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    description: {
      type: String,
      required: [true, 'Community description is required'],
      trim: true,
    },
    descriptionAr: {
      type: String,
      trim: true,
    },
    type: {
      type: [String],
      default: [],
      required: [true, 'Community-type is required'],
    },
    category: {
      type: String,
      trim: true,
    },
    purposeType: {
      type: String,
      trim: true,
    },
    ridesThisMonth: {
      type: String,
      trim: true,
    },
    weeklyRides: {
      type: String,
      trim: true,
    },
    fundsRaised: {
      type: String,
      trim: true,
    },
    joinMode: {
      type: String,
      trim: true,
    },
    location: {
      // Dashboard-managed via the `lookups` collection (type "city") —
      // intentionally not a Mongoose enum so new cities don't require a deploy.
      type: String,
      trim: true,
    },
      
    area: {
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
    image: {
      type: String,
      trim: true,
    },
    logo: {
      type: String,
      trim: true,
    },
    gallery: {
      type: [String],
      default: [],
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'users',
      },
    ],
    memberCount: {
      type: Number,
      default: 0,
      min: [0, 'Member count cannot be negative'],
    },
    manager: {
      type: String,
      trim: true,
    },
    distance: {
      type: Number,
      min: [0, 'Distance cannot be negative'],
    },
    terrain: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    trackId: {
      type: [Schema.Types.ObjectId],
      ref: 'track',
      default: [],
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Boolean,
      default: false,
    },
    allowPosts: {
      type: Boolean,
      default: false,
    },
    allowGallery: {
      type: Boolean,
      default: false,
    },
    foundedYear: {
      type: Number,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Community creator is required'],
    },
  },
  {
    timestamps: true,
  }
  
);

// Indexes for search and filtering
CommunitySchema.index({ type: 1, location: 1 });
CommunitySchema.index({ category: 1 });
CommunitySchema.index({ isActive: 1 });
CommunitySchema.index({ isPublic: 1 });
CommunitySchema.index({ isFeatured: 1 });
CommunitySchema.index({ title: 'text', description: 'text', trackName: 'text', terrain: 'text' });
CommunitySchema.index({ trackId: 1 });

// Update memberCount when members array changes; coerce legacy single ObjectId to array
CommunitySchema.pre('save', async function () {
  this.memberCount = this.members.length;
  const doc = this as mongoose.Document & ICommunity;
  const tid = doc.trackId as unknown;
  if (tid != null && !Array.isArray(tid)) {
    doc.trackId = [tid as mongoose.Types.ObjectId];
  }
});

// Auto-generate a URL-friendly slug from the title on first save. Existing
// communities keep their slug forever once set — it's never regenerated on
// a later title edit, so shared/bookmarked links stay valid.
CommunitySchema.pre('save', async function () {
  if (!this.slug && this.title) {
    this.slug = await generateUniqueSlug(
      this.constructor as mongoose.Model<ICommunity>,
      this.title,
      (this._id as mongoose.Types.ObjectId | undefined)?.toString(),
    );
  }
});

export default mongoose.model<ICommunity>('communities', CommunitySchema);

