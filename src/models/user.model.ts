import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRefreshToken {
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface IUserStats {
  totalDistanceKm: number;
  totalRides: number;
  totalEventsParticipated: number;
  totalPoints: number;
  completedCount: number;
}

export interface IUser extends Document {
  fullName: string;
  firebaseUid?: string;
  phone?: string;
  email?: string;
  passwordHash?: string;
  profileImage?: string;
  gender: 'Male' | 'Female';
  age?: number;
  dob?: Date;
  country?: string;
  city?: string;
  provider?: string;
  role: 'Admin' | 'Vendor' | 'Member' | 'Guest';
  /** Optional RBAC role; when set, authorization uses RBAC permissions. Legacy `role` remains for app/JWT. */
  roleId?: Types.ObjectId;
  isVerified: boolean;
  banFeedPost: boolean;
  refreshTokens: IRefreshToken[];
  webPushTokens?: Array<{
    token: string;
    userAgent?: string;
    platform?: 'web' | 'android' | 'ios';
    deviceId?: string;
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
    appBuild?: string;
    createdAt: Date;
    lastSeenAt: Date;
  }>;
  fcmTokens?: Array<{
    token: string;
    userAgent?: string;
    platform?: 'web' | 'android' | 'ios';
    deviceId?: string;
    deviceModel?: string;
    osVersion?: string;
    appVersion?: string;
    appBuild?: string;
    createdAt: Date;
    lastSeenAt: Date;
  }>;
  stats?: IUserStats;
  createdAt: Date;
  updatedAt: Date;
}

// Add to user.model.ts
export interface IGuestSession extends Document {
  sessionId: string;
  actions: string[]; // Track what guest did
  expiresAt: Date;
}

const RefreshTokenSchema = new Schema({
  token: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const UserSchema = new Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      trim: true,
      default: null,
    },
    profileImage: {
      type: String,
      trim: true,
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: ['Male', 'Female'],
    },
    age: {
      type: Number,
      min: [0, 'Age cannot be negative'],
      max: [150, 'Age must be realistic'],
    },
    dob: {
      type: Date,
    },
    country: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    provider: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: ['Admin', 'Vendor', 'Member'],
      default: 'Member',
    },
    roleId: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      sparse: true,
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    banFeedPost: {
      type: Boolean,
      default: false,
      index: true,
    },
    refreshTokens: [RefreshTokenSchema],
    webPushTokens: [
      {
        token: { type: String, required: true, index: true },
        userAgent: { type: String, trim: true },
        platform: { type: String, enum: ['web', 'android', 'ios'] },
        deviceId: { type: String, trim: true },
        deviceModel: { type: String, trim: true },
        osVersion: { type: String, trim: true },
        appVersion: { type: String, trim: true },
        appBuild: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
      },
    ],
    fcmTokens: [
      {
        token: { type: String, required: true, index: true },
        userAgent: { type: String, trim: true },
        platform: { type: String, enum: ['web', 'android', 'ios'] },
        deviceId: { type: String, trim: true },
        deviceModel: { type: String, trim: true },
        osVersion: { type: String, trim: true },
        appVersion: { type: String, trim: true },
        appBuild: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
      },
    ],
    stats: {
      totalDistanceKm: { type: Number, default: 0 },
      totalRides: { type: Number, default: 0 },
      totalEventsParticipated: { type: Number, default: 0 },
      totalPoints: { type: Number, default: 0 },
      completedCount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>('users', UserSchema);

