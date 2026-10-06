import AuditLog from '@/models/audit-log.model';
import { AuthRequest } from '@/middleware/auth.middleware';

interface RecordAuditLogInput {
  req: AuthRequest;
  action: string;
  /** Module the entry belongs to: 'Event', 'Community', 'Track', 'User', ... */
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditChange {
  field: string;
  from: unknown;
  to: unknown;
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
  // Tells the generic staff-action logger (rbac.middleware) this request is covered.
  (req as any).auditLogged = true;
  try {
    metadata = metadata ? (sanitizeMetadata(metadata) as Record<string, unknown>) : metadata;
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

const MAX_VALUE_LENGTH = 200;

/** Uploaded files arrive as base64 data URIs — log that an image was set, not its bytes. */
const shortenText = (text: string): string => {
  if (text.startsWith('data:')) return '[uploaded image]';
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
};

/** Keeps audit entries small and readable whatever a controller passes as metadata. */
const sanitizeMetadata = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return shortenText(value);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  if (typeof (value as any).toHexString === 'function') return String(value);
  if (depth >= 4) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      sanitizeMetadata(val, depth + 1),
    ])
  );
};

const toComparable = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toComparable);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // ObjectIds and populated refs compare by id
    if (typeof (obj as any).toHexString === 'function') return String(value);
    if (obj._id) return String(obj._id);
    return Object.fromEntries(Object.entries(obj).map(([key, val]) => [key, toComparable(val)]));
  }
  return value;
};

const toDisplay = (value: unknown): unknown => {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  return shortenText(typeof value === 'string' ? value : JSON.stringify(value));
};

/**
 * Lists the fields in `fields` whose value differs between two snapshots of a
 * document, with the old and new value, for the "what was changed" part of an
 * audit entry. Long values are truncated so entries stay small.
 */
export function diffChanges(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  fields: string[]
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const from = toComparable(before?.[field]);
    const to = toComparable(after?.[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field, from: toDisplay(from), to: toDisplay(to) });
    }
  }
  return changes;
}
