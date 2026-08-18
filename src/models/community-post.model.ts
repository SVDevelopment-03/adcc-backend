import mongoose, { Schema, Document } from 'mongoose';

export type CommunityPostType = 'Announcement' | 'Highlight' | 'Awareness';

export interface ICommunityPost extends Document {
  communityId: mongoose.Types.ObjectId;
  title: string;
  postType: CommunityPostType;
  caption?: string;
  image?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CommunityPostSchema = new Schema(
  {
    communityId: {
      type: Schema.Types.ObjectId,
      ref: 'communities',
      required: [true, 'Community is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Post title is required'],
      trim: true,
    },
    postType: {
      type: String,
      enum: ['Announcement', 'Highlight', 'Awareness'],
      required: [true, 'Post type is required'],
    },
    caption: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Creator is required'],
    },
  },
  {
    timestamps: true,
  }
);

CommunityPostSchema.index({ communityId: 1, createdAt: -1 });
CommunityPostSchema.index({ postType: 1 });

export default mongoose.model<ICommunityPost>('communityPosts', CommunityPostSchema);
