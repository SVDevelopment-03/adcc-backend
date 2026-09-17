import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  actorId?: Types.ObjectId;
  actorEmail?: string;
  /** Dot-namespaced action key, e.g. 'role.create', 'user.password.update'. */
  action: string;
  targetType?: string;
  targetId?: string;
  /** Human-readable label for the target (role name, user email, etc.) so
   * the log stays readable even if the target is later renamed/deleted. */
  targetLabel?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    actorEmail: { type: String, trim: true },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      index: true,
    },
    targetType: { type: String, trim: true, index: true },
    targetId: { type: String, trim: true, index: true },
    targetLabel: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
