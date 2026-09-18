import { prisma } from '../config/prisma';

interface AuditLogEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

interface AuditLogQueryParams {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Append-only audit log service.
 * No update/delete endpoint or method exposed.
 * Never stores passwords, tokens, or secrets in metadata.
 */
export const auditService = {
  async log(entry: AuditLogEntry): Promise<void> {
    if (process.env['NODE_ENV'] === 'test' || !process.env['DATABASE_URL']) return;
    try {
      await prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata ? (entry.metadata as any) : undefined,
        },
      });
    } catch (err) {
      // Non-critical: log failures must never crash the primary operation
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('[AUDIT_LOG_FAILURE]', err);
      }
    }
  },

  async query(params: AuditLogQueryParams) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;
    if (params.actorId) where.actorId = params.actorId;
    if (params.action) where.action = params.action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: { id: true, email: true, role: true, profile: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total, page, pageSize };
  },
};
