import { prisma } from '../config/prisma';
import type { UserRole } from '@prisma/client';

interface AuditLogEntry {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  /**
   * Optional pre-resolved actor identity. Callers that already loaded the
   * actor (or that are recording an entry for an account that is about to be
   * deleted) can pass it to avoid the extra lookup.
   */
  actorSnapshot?: AuditActorSnapshot;
}

export interface AuditActorSnapshot {
  email: string;
  name?: string | null;
  role?: UserRole | null;
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
  /**
   * Resolves the actor's identity once, at write time, into an immutable
   * snapshot. `AuditLog.actorId` is nullable with ON DELETE SET NULL so the
   * row survives permanent account deletion — the snapshot is what keeps the
   * trail attributable afterwards.
   */
  async resolveActorSnapshot(actorId: string): Promise<AuditActorSnapshot | null> {
    const user = await prisma.user.findUnique({
      where: { id: actorId },
      select: { email: true, role: true, profile: { select: { firstName: true, lastName: true, displayName: true } } },
    });
    if (!user) return null;
    const name =
      user.profile?.displayName ||
      [user.profile?.firstName, user.profile?.lastName].filter(Boolean).join(' ') ||
      null;
    return { email: user.email, name, role: user.role };
  },

  async log(entry: AuditLogEntry): Promise<void> {
    if (process.env['NODE_ENV'] === 'test' || !process.env['DATABASE_URL']) return;
    try {
      let snapshot = entry.actorSnapshot ?? (await this.resolveActorSnapshot(entry.actorId));
      await prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          actorEmail: snapshot?.email ?? null,
          actorName: snapshot?.name ?? null,
          actorRole: snapshot?.role ?? null,
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
