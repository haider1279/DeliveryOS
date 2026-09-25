import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import { requireProjectAccess, getAccessibleProjectIds } from '../../services/project-access.service';
import {
  UserRole,
  ReleaseStatus,
  ProjectStatus,
  InvoiceStatus,
  ClientReviewDecision,
  RequirementStatus,
  CommentVisibility,
  NotificationType,
  AuthenticatedUser,
  CreateReleaseInput,
  UpdateReleaseStatusInput,
  DecideClientReviewInput,
  PaginationQueryInput,
} from '@deliveryos/shared';
import {
  RELEASE_TRANSITIONS,
  RELEASE_STATUS_ENTRY_GATES,
  CLIENT_VISIBLE_RELEASE_STATUSES,
} from './release-transitions';

export class ReleaseService {
  /**
   * Creates a new release with attached release items (PM/Admin only).
   */
  async createRelease(input: CreateReleaseInput, actor: AuthenticatedUser) {
    await requireProjectAccess(actor, input.projectId);

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) {
      throw AppError.notFound('Project not found');
    }
    if (
      project.status === ProjectStatus.COMPLETED ||
      project.status === ProjectStatus.ARCHIVED ||
      project.status === ProjectStatus.CANCELLED
    ) {
      throw AppError.badRequest(`Cannot plan a release for a ${project.status.toLowerCase()} project`);
    }

    // Every referenced requirement / bug must belong to this same project.
    const requirementIds = input.itemIds.filter((i) => i.requirementId).map((i) => i.requirementId as string);
    const bugIds = input.itemIds.filter((i) => i.bugId).map((i) => i.bugId as string);
    if (requirementIds.length > 0) {
      const count = await prisma.requirement.count({
        where: { id: { in: requirementIds }, projectId: input.projectId, deletedAt: null },
      });
      if (count !== new Set(requirementIds).size) {
        throw AppError.badRequest('One or more requirements do not belong to this project');
      }
    }
    if (bugIds.length > 0) {
      const count = await prisma.bug.count({
        where: { id: { in: bugIds }, projectId: input.projectId },
      });
      if (count !== new Set(bugIds).size) {
        throw AppError.badRequest('One or more bugs do not belong to this project');
      }
    }

    // Check version uniqueness for this project
    const existing = await prisma.release.findFirst({
      where: { projectId: input.projectId, version: input.version, deletedAt: null },
    });
    if (existing) {
      throw AppError.badRequest(`Release version ${input.version} already exists for this project`);
    }

    const release = await prisma.release.create({
      data: {
        projectId: input.projectId,
        version: input.version,
        name: input.name,
        status: ReleaseStatus.PLANNED,
        releaseDate: input.releaseDate ? new Date(input.releaseDate) : null,
        releaseNotes: input.releaseNotes || null,
        deploymentNotes: input.deploymentNotes || null,
        createdById: actor.id,
        items: {
          create: input.itemIds.map((item) => ({
            itemType: item.itemType,
            requirementId: item.requirementId || null,
            bugId: item.bugId || null,
            description: item.description || null,
          })),
        },
      },
      include: {
        items: {
          include: {
            requirement: { select: { id: true, title: true, status: true } },
            bug: { select: { id: true, title: true, status: true, severity: true } },
          },
        },
        createdBy: { include: { profile: true } },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'RELEASE_CREATED',
      entityType: 'Release',
      entityId: release.id,
      metadata: { version: release.version, name: release.name },
    });

    await activityService.log({
      projectId: release.projectId,
      actorId: actor.id,
      type: 'RELEASE_CREATED',
      message: `Release ${release.version} planned: "${release.name}"`,
      visibility: CommentVisibility.CLIENT_VISIBLE,
      entityType: 'Release',
      entityId: release.id,
    });

    return release;
  }

  /**
   * Updates release status (e.g. DEPLOYED, ROLLED_BACK). PM/Admin only.
   */
  async updateReleaseStatus(id: string, input: UpdateReleaseStatusInput, actor: AuthenticatedUser) {
    const release = await prisma.release.findFirst({
      where: { id, deletedAt: null },
      include: { project: { include: { organization: true } } },
    });
    if (!release) {
      throw AppError.notFound('Release not found');
    }

    await requireProjectAccess(actor, release.projectId);

    if (input.status === release.status) {
      throw AppError.badRequest(`Release is already in ${input.status} status`);
    }

    const allowedRoles = RELEASE_STATUS_ENTRY_GATES[input.status];
    if (allowedRoles && !allowedRoles.includes(actor.role)) {
      throw AppError.forbidden(`Role ${actor.role} is not permitted to transition release to ${input.status}`);
    }

    const allowedNext = RELEASE_TRANSITIONS[release.status as ReleaseStatus];
    if (!allowedNext || !allowedNext.includes(input.status)) {
      throw AppError.forbidden(`Cannot move release from ${release.status} to ${input.status}`);
    }

    const isNowDeployed = input.status === ReleaseStatus.DEPLOYED;
    const isLeavingDeployed = release.status === ReleaseStatus.DEPLOYED;

    const updatedRelease = await prisma.release.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.deploymentNotes !== undefined && { deploymentNotes: input.deploymentNotes }),
        ...(isNowDeployed && { deployedAt: new Date() }),
        // Rolled back releases are no longer "deployed".
        ...(isLeavingDeployed && input.status !== ReleaseStatus.DEPLOYED && { deployedAt: null }),
      },
      include: {
        items: {
          include: {
            requirement: true,
            bug: true,
          },
        },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'RELEASE_STATUS_UPDATED',
      entityType: 'Release',
      entityId: release.id,
      metadata: { fromStatus: release.status, toStatus: input.status },
    });

    await activityService.log({
      projectId: release.projectId,
      actorId: actor.id,
      type: 'RELEASE_STATUS_CHANGED',
      message: `Release ${release.version} marked as ${input.status}`,
      visibility: CommentVisibility.CLIENT_VISIBLE,
      entityType: 'Release',
      entityId: release.id,
    });

    // If deployed, notify all client users belonging to the project's organization & update project status!
    if (isNowDeployed) {
      const clientUsers = await prisma.user.findMany({
        where: {
          organizationId: release.project.organizationId,
          role: UserRole.CLIENT,
          status: 'ACTIVE',
        },
      });

      for (const client of clientUsers) {
        await notificationService.notify({
          userId: client.id,
          type: NotificationType.RELEASE_DEPLOYED,
          title: 'New Release Deployed!',
          message: `Release ${release.version} (${release.name}) has been deployed for ${release.project.name}.`,
          entityType: 'Release',
          entityId: release.id,
          linkUrl: `/portal/projects/${release.projectId}?tab=releases`,
        });
      }

      const unpaidInvoicesCount = await prisma.invoice.count({
        where: {
          projectId: release.projectId,
          status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.VOID] },
          deletedAt: null,
        },
      });

      const proj = await prisma.project.findUnique({
        where: { id: release.projectId },
        select: { status: true },
      });

      if (unpaidInvoicesCount === 0 && proj?.status !== ProjectStatus.COMPLETED) {
        await prisma.project.update({
          where: { id: release.projectId },
          data: { status: ProjectStatus.COMPLETED, completedAt: new Date() },
        });
      } else if (proj?.status === ProjectStatus.PLANNING) {
        await prisma.project.update({
          where: { id: release.projectId },
          data: { status: ProjectStatus.ACTIVE },
        });
      }
    }

    return updatedRelease;
  }

  /**
   * Retrieves release by ID (project access enforced; clients see shipped only).
   */
  async getReleaseById(id: string, actor: AuthenticatedUser) {
    const release = await prisma.release.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { include: { organization: true } },
        items: {
          include: {
            requirement: { select: { id: true, title: true, status: true, priority: true } },
            bug: { select: { id: true, title: true, status: true, severity: true } },
          },
        },
        createdBy: { include: { profile: true } },
      },
    });

    if (!release) throw AppError.notFound('Release not found');

    await requireProjectAccess(actor, release.projectId);

    if (
      actor.role === UserRole.CLIENT &&
      !CLIENT_VISIBLE_RELEASE_STATUSES.includes(release.status as ReleaseStatus)
    ) {
      throw AppError.notFound('Release not found');
    }

    return release;
  }

  /**
   * Lists releases scoped to accessible projects (clients: shipped only).
   */
  async listReleases(query: PaginationQueryInput, actor: AuthenticatedUser) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const accessible = await getAccessibleProjectIds(actor);

    const where: any = { deletedAt: null };
    if (query.projectId) {
      if (accessible === null || accessible.includes(query.projectId)) {
        where.projectId = query.projectId;
      } else {
        where.projectId = '__no_access__';
      }
    } else if (accessible !== null) {
      where.projectId = { in: accessible };
    }
    if (query.status) where.status = query.status;
    if (actor.role === UserRole.CLIENT) {
      where.status = { in: CLIENT_VISIBLE_RELEASE_STATUSES };
    }

    const [releases, total] = await Promise.all([
      prisma.release.findMany({
        where,
        include: {
          createdBy: { include: { profile: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.release.count({ where }),
    ]);

    return { releases, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Records a Client Review decision on a requirement in CLIENT_REVIEW status.
   * Only the client (of the requirement's organization) may decide.
   */
  async recordClientReview(
    requirementId: string,
    input: DecideClientReviewInput,
    reviewerId: string,
    reviewerRole: UserRole,
    reviewerOrgId?: string | null
  ) {
    // Client Review Decisions are exclusively a CLIENT capability.
    if (reviewerRole !== UserRole.CLIENT) {
      throw AppError.forbidden('Only clients can record client review decisions');
    }

    const requirement = await prisma.requirement.findFirst({
      where: { id: requirementId, deletedAt: null },
      include: { project: true },
    });
    if (!requirement) {
      throw AppError.notFound('Requirement not found');
    }

    // Must not be a completed or deployed project
    const deployedReleaseCount = await prisma.release.count({
      where: { projectId: requirement.projectId, status: ReleaseStatus.DEPLOYED, deletedAt: null },
    });
    if (requirement.project.status === ProjectStatus.COMPLETED || deployedReleaseCount > 0) {
      throw AppError.forbidden('Cannot review requirements on a completed or deployed project');
    }

    // Must be in CLIENT_REVIEW status
    if (requirement.status !== RequirementStatus.CLIENT_REVIEW) {
      throw AppError.badRequest(
        `Requirement cannot be reviewed in current status: ${requirement.status}. Must be in CLIENT_REVIEW.`
      );
    }

    // Tenant isolation (must be this client's own organization)
    if (requirement.project.organizationId !== reviewerOrgId) {
      throw AppError.notFound('Requirement not found');
    }

    // Pinning check
    if (requirement.currentVersion !== input.requirementVersion) {
      throw AppError.conflict(
        `Requirement was updated to version ${requirement.currentVersion}. You are reviewing version ${input.requirementVersion}. Please refresh.`
      );
    }

    const nextStatus =
      input.decision === ClientReviewDecision.APPROVED
        ? RequirementStatus.COMPLETED
        : RequirementStatus.IN_DEVELOPMENT;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create ClientReview record
      const review = await tx.clientReview.create({
        data: {
          requirementId,
          projectId: requirement.projectId,
          reviewerId,
          decision: input.decision,
          comment: input.comment || null,
          requirementVersion: input.requirementVersion,
        },
        include: {
          reviewer: { include: { profile: true } },
        },
      });

      // 2. Transition requirement status
      const updatedReq = await tx.requirement.update({
        where: { id: requirementId },
        data: {
          status: nextStatus,
          ...(nextStatus === RequirementStatus.COMPLETED && { completedAt: new Date() }),
        },
      });

      // 3. Record status history
      await tx.requirementStatusHistory.create({
        data: {
          requirementId,
          fromStatus: requirement.status,
          toStatus: nextStatus,
          actorId: reviewerId,
          comment: `Client Review: ${input.decision}. ${input.comment || ''}`.trim(),
        },
      });

      return { review, updatedReq };
    });

    // Post-transaction logs & notifications
    await auditService.log({
      actorId: reviewerId,
      action: 'CLIENT_REVIEW_DECIDED',
      entityType: 'Requirement',
      entityId: requirementId,
      metadata: { decision: input.decision, nextStatus },
    });

    await activityService.log({
      projectId: requirement.projectId,
      actorId: reviewerId,
      type: 'CLIENT_REVIEW_DECIDED',
      message: `Client ${input.decision === ClientReviewDecision.APPROVED ? 'approved' : 'requested changes on'} requirement "${requirement.title}"`,
      visibility: CommentVisibility.CLIENT_VISIBLE,
      entityType: 'Requirement',
      entityId: requirementId,
    });

    // Notify Project Manager
    await notificationService.notify({
      userId: requirement.project.projectManagerId,
      type: NotificationType.REQUIREMENT_STATUS_CHANGED,
      title: `Client Review: ${input.decision}`,
      message: `Client decided ${input.decision} on "${requirement.title}"`,
      entityType: 'Requirement',
      entityId: requirement.id,
      linkUrl: `/app/projects/${requirement.projectId}?tab=requirements&requirementId=${requirement.id}`,
    });

    return result;
  }
}

export const releaseService = new ReleaseService();