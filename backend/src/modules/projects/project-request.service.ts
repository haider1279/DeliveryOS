import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { UserRole, UserStatus, ProjectStatus, ProjectRequestStatus } from '@deliveryos/shared';
import type { CreateProjectRequestDTO, DecideProjectRequestDTO, AuthenticatedUser } from '@deliveryos/shared';
import { requireQualifiedOrganization } from '../organizations/organization-eligibility.service';

const REQUEST_INCLUDE = {
  // qualificationStatus travels with the request so the review screen can show
  // an administrator WHY an approval will be refused, instead of failing with an
  // opaque error after the fact.
  organization: {
    select: { id: true, name: true, slug: true, qualificationStatus: true, status: true },
  },
  requestedBy: { include: { profile: { select: { firstName: true, lastName: true, displayName: true } } } },
} as const;

/**
 * Derives a unique, human-readable project code from the request slug.
 * The request id suffix guarantees uniqueness even when two requests for the
 * same client share a name, so approval can never collide on the unique
 * `Project.code` column.
 */
function buildProjectCode(request: { name: string; id: string }): string {
  const prefix = request.name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 6)
    .padEnd(3, 'PRJ');
  return `${prefix}-${request.id.slice(0, 6).toUpperCase()}`.slice(0, 10);
}

/**
 * Resolves the project manager who will own the project created by an approval.
 * Explicit id wins; otherwise the first active PROJECT_MANAGER is used so the
 * existing "approve with no extra input" flow keeps working. Always validates
 * the result is a real, active PROJECT_MANAGER.
 */
async function resolveProjectManager(explicitId: string | undefined): Promise<{ id: string; email: string }> {
  const candidate = explicitId
    ? await prisma.user.findFirst({ where: { id: explicitId, role: UserRole.PROJECT_MANAGER } })
    : await prisma.user.findFirst({
        where: { role: UserRole.PROJECT_MANAGER, status: UserStatus.ACTIVE },
        orderBy: { createdAt: 'asc' },
      });

  if (!candidate) {
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      explicitId
        ? 'Selected project manager is not a valid PROJECT_MANAGER user'
        : 'No active project manager is available to own the approved project',
      400
    );
  }

  if (candidate.status !== UserStatus.ACTIVE) {
    throw new AppError('BUSINESS_RULE_VIOLATION', 'Project manager must be an active user', 400);
  }

  return { id: candidate.id, email: candidate.email };
}

/**
 * Conditional claim of a PENDING request, equivalent to
 *   UPDATE "ProjectRequest" SET status = :decision
 *   WHERE id = :id AND status = 'PENDING'
 *
 * A zero row count means somebody else already decided the request, so the
 * caller must abort. This is the single guarantee that a request can be
 * decided (and, for approvals, materialised into a project) only once.
 */
async function claimPendingRequest(
  tx: Prisma.TransactionClient,
  id: string,
  decision: ProjectRequestStatus,
  notes?: string
): Promise<void> {
  const claimed = await tx.projectRequest.updateMany({
    where: { id, status: ProjectRequestStatus.PENDING },
    data: {
      status: decision,
      ...(notes !== undefined && { notes }),
    },
  });

  if (claimed.count > 0) return;

  const current = await tx.projectRequest.findUnique({ where: { id }, select: { status: true } });
  if (!current) {
    throw new AppError('NOT_FOUND', 'Project request not found', 404);
  }
  throw new AppError(
    'CONFLICT',
    `Project request has already been ${current.status.toLowerCase()} and cannot be modified`,
    409
  );
}

export const projectRequestService = {
  async create(actor: AuthenticatedUser, dto: CreateProjectRequestDTO) {
    let targetOrgId: string;

    if (actor.role === UserRole.CLIENT) {
      if (!actor.organizationId) {
        throw new AppError('FORBIDDEN', 'Client user must belong to an organization to submit project requests', 403);
      }
      if (dto.organizationId && dto.organizationId !== actor.organizationId) {
        throw new AppError('FORBIDDEN', 'Client can only submit project requests for their own organization', 403);
      }
      targetOrgId = actor.organizationId;
    } else if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.ADMIN) {
      targetOrgId = dto.organizationId || actor.organizationId!;
      if (!targetOrgId) {
        throw new AppError('BAD_REQUEST', 'Organization ID is required', 400);
      }
    } else {
      throw new AppError('FORBIDDEN', 'Insufficient permissions to submit project requests', 403);
    }

    // The target organization must already be qualified. A request raised for an
    // organization that has not been through qualification can NEVER be approved
    // (approval creates a real project, which requires an APPROVED organization),
    // so accepting it would only create a permanently stuck record. Failing here
    // keeps the pipeline synchronized: the request is always created against an
    // organization that the documented approval step can actually act on.
    const org = await requireQualifiedOrganization(
      targetOrgId,
      'Submitting a project request'
    );

    const request = await prisma.projectRequest.create({
      data: {
        organizationId: targetOrgId,
        requestedById: actor.id,
        name: dto.name,
        description: dto.description || null,
        budget: dto.budget ?? null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        notes: dto.notes || null,
        status: ProjectRequestStatus.PENDING,
      },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        requestedBy: { include: { profile: { select: { firstName: true, lastName: true, displayName: true } } } },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'PROJECT_REQUEST_SUBMITTED',
      entityType: 'ProjectRequest',
      entityId: request.id,
      metadata: { name: request.name, organizationId: targetOrgId },
    });

    return request;
  },

  async list(actor: AuthenticatedUser, query: { organizationId?: string; status?: string }) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.ADMIN &&
      actor.role !== UserRole.CLIENT
    ) {
      throw new AppError('FORBIDDEN', 'You do not have permission to list project requests', 403);
    }

    const where: any = {};

    if (actor.role === UserRole.CLIENT) {
      where.organizationId = actor.organizationId || '00000000-0000-0000-0000-000000000000';
    } else if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    if (query.status && Object.values(ProjectRequestStatus).includes(query.status as any)) {
      where.status = query.status;
    }

    const requests = await prisma.projectRequest.findMany({
      where,
      include: {
        ...REQUEST_INCLUDE,
        // Surfaces the activated project so the UI can move the card out of
        // "pending" and link straight to it instead of guessing.
        project: {
          select: { id: true, name: true, code: true, status: true, projectManagerId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests;
  },

  async getById(actor: AuthenticatedUser, id: string) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.ADMIN &&
      actor.role !== UserRole.CLIENT
    ) {
      throw new AppError('FORBIDDEN', 'You do not have permission to view project request details', 403);
    }

    const request = await prisma.projectRequest.findUnique({
      where: { id },
      include: {
        ...REQUEST_INCLUDE,
        project: {
          select: { id: true, name: true, code: true, status: true, projectManagerId: true },
        },
      },
    });

    if (!request) {
      throw new AppError('NOT_FOUND', 'Project request not found', 404);
    }

    if (actor.role === UserRole.CLIENT && request.organizationId !== actor.organizationId) {
      throw new AppError('FORBIDDEN', 'You do not have access to this project request', 403);
    }

    return request;
  },

  /**
   * ADMIN/SUPER_ADMIN decision on a client project request.
   *
   * APPROVED is not a bookkeeping flag: it materialises the real Project. The
   * request and the project are written inside ONE transaction and the request
   * status is claimed with a conditional update (`WHERE id = ? AND status =
   * PENDING`), so:
   *
   *   - approving creates exactly one project (a duplicate/parallel approval
   *     loses the conditional claim and gets a 409, it never creates a second
   *     project);
   *   - an already-decided request (approved or rejected) can never be
   *     re-decided, so a stale frontend button cannot resurrect a rejected
   *     request into an active project;
   *   - the project is linked back via ProjectRequest.projectId, keeping the
   *     original client request traceable.
   *
   * The created project is written with ProjectStatus.ACTIVE — the status the
   * existing "Active Projects" filter already matches — and the owner is added
   * as a PROJECT_MANAGER member so existing assignment rules grant them access.
   */
  async decide(actor: AuthenticatedUser, id: string, dto: DecideProjectRequestDTO) {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.ADMIN) {
      throw new AppError('FORBIDDEN', 'Only administrators can approve or reject project requests', 403);
    }

    if (dto.decision !== ProjectRequestStatus.APPROVED && dto.decision !== ProjectRequestStatus.REJECTED) {
      throw new AppError('BAD_REQUEST', 'Decision must be APPROVED or REJECTED', 400);
    }

    const request = await prisma.projectRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new AppError('NOT_FOUND', 'Project request not found', 404);
    }

    // A decision that was already made is authoritative and final. This is what
    // stops a stale "Approve" click from activating a request that was rejected
    // (or already approved) in the meantime.
    if (request.status !== ProjectRequestStatus.PENDING) {
      throw new AppError(
        'BAD_REQUEST',
        `Project request has already been ${request.status.toLowerCase()} and cannot be modified`,
        400
      );
    }

    // Resolve everything an approval needs BEFORE mutating anything, so a
    // validation failure can never leave a half-approved request behind.
    if (dto.decision === ProjectRequestStatus.APPROVED) {
      // Single source of truth for the qualification rule. Approving a request
      // materialises a real project, so the organization must satisfy exactly
      // the same precondition as the manual "New Project" flow.
      await requireQualifiedOrganization(request.organizationId, 'Approving a project request');
    }

    let project: Awaited<ReturnType<typeof prisma.project.create>> | null = null;

    if (dto.decision === ProjectRequestStatus.REJECTED) {
      await prisma.$transaction((tx) => claimPendingRequest(tx, id, dto.decision, dto.notes));
    } else {
      const projectManagerId = (await resolveProjectManager(dto.projectManagerId)).id;

      project = await prisma.$transaction(async (tx) => {
        await claimPendingRequest(tx, id, dto.decision, dto.notes);

        // Exactly one project per request: ProjectRequest.projectId is UNIQUE, so
        // even a hypothetical race that slipped past the claim collides here.
        const created = await tx.project.create({
          data: {
            organizationId: request.organizationId,
            projectManagerId,
            name: request.name,
            code: buildProjectCode(request),
            description: request.description ?? undefined,
            status: ProjectStatus.ACTIVE,
            startDate: new Date(),
            targetDate: request.targetDate,
            budget: request.budget ?? null,
            currency: 'USD',
            notes: request.notes ?? undefined,
          },
        });

        // Reuse the existing assignment rule from projectService.create: the owner
        // is added as a PROJECT_MANAGER member, which is what grants them (and
        // membership-scoped access checks) visibility of the new project.
        await tx.projectMember.create({
          data: {
            projectId: created.id,
            userId: projectManagerId,
            membershipRole: 'PROJECT_MANAGER',
          },
        });

        await tx.projectRequest.update({
          where: { id },
          data: { projectId: created.id },
        });

        return created;
      });
    }

    await auditService.log({
      actorId: actor.id,
      action: dto.decision === ProjectRequestStatus.APPROVED ? 'PROJECT_REQUEST_APPROVED' : 'PROJECT_REQUEST_REJECTED',
      entityType: 'ProjectRequest',
      entityId: id,
      metadata: {
        decision: dto.decision,
        notes: dto.notes,
        ...(project ? { projectId: project.id, projectCode: project.code } : {}),
      },
    });

    if (project) {
      await auditService.log({
        actorId: actor.id,
        action: 'PROJECT_CREATED',
        entityType: 'Project',
        entityId: project.id,
        metadata: {
          name: project.name,
          code: project.code,
          status: project.status,
          sourceProjectRequestId: id,
        },
      });
    }

    const updated = await prisma.projectRequest.findUnique({
      where: { id },
      include: {
        ...REQUEST_INCLUDE,
        project: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
            projectManagerId: true,
            organizationId: true,
          },
        },
      },
    });

    return updated;
  },
};
