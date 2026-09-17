import AuditLog from '@/models/audit-log.model';
import { AuthRequest } from '@/middleware/auth.middleware';

interface RecordAuditLogInput {
  req: AuthRequest;
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes one audit log entry. Best-effort: a logging failure must never break
 * the admin action that triggered it, so errors are swallowed (and logged to
 * the console for ops visibility) rather than thrown.
 */
export async function recordAuditLog({
  req,
  action,
  targetType,
  targetId,
  targetLabel,
  metadata,
}: RecordAuditLogInput): Promise<void> {
  try {
    await AuditLog.create({
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      action,
      targetType,
      targetId,
      targetLabel,
      metadata,
    });
  } catch (error) {
    console.error('[AUDIT LOG] failed to record entry:', action, error);
  }
}
