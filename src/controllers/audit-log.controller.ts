import { Response } from 'express';
import AuditLog from '@/models/audit-log.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AuthRequest } from '@/middleware/auth.middleware';

/**
 * GET /audit-logs
 * Paginated, most-recent-first history of admin actions. Optional filters:
 * action (exact key), targetType, actorId, from/to (ISO date, on createdAt).
 */
export const listAuditLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const filter: Record<string, unknown> = {};
  if (typeof req.query.action === 'string' && req.query.action.trim()) {
    filter.action = req.query.action.trim();
  }
  if (typeof req.query.targetType === 'string' && req.query.targetType.trim()) {
    filter.targetType = req.query.targetType.trim();
  }
  if (typeof req.query.actorId === 'string' && req.query.actorId.trim()) {
    filter.actorId = req.query.actorId.trim();
  }
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : null;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : null;
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    filter.createdAt = {
      ...(from && !Number.isNaN(from.getTime()) ? { $gte: from } : {}),
      ...(to && !Number.isNaN(to.getTime()) ? { $lte: to } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actorId', 'fullName email')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    {
      logs,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    },
    'Audit logs retrieved'
  );
});

/** Distinct action keys seen so far, for the filter dropdown. */
export const listAuditLogActions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const actions = await AuditLog.distinct('action');
  sendSuccess(res, { actions: actions.sort() }, 'Audit log actions retrieved');
});
