import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import {
  UserRole,
  ReleaseStatus,
  ClientReviewDecision,
  RequirementStatus,
  CommentVisibility,
  NotificationType,
  CreateReleaseInput,
  UpdateReleaseStatusInput,
  DecideClientReviewInput,
  PaginationQueryInput,
} from '@deliveryos/shared';

export class ReleaseService {
  /**
   * Creates a new release with attached release items.
   */
  async createRelease(input: CreateReleaseInput, creatorId: string) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) {
      throw AppError.notFound('Project not found');
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
        createdById: creatorId,
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
      actorId: creatorId,
      action: 'RELEASE_CREATED',
      entityType: 'Release',
      entityId: release.id,
      metadata: { version: release.version, name: release.name },
    });

    await activityService.log({
      projectId: release.projectId,
      actorId: creatorId,
      type: 'RELEASE_CREATED',
      message: `Release ${release.version} planned: "${release.name}"`,
      visibility: CommentVisibility.CLIENT_VISIBLE,
      entityType: 'Release',
      entityId: release.id,
    });

    return release;
  }

  /**
   * Updates release status (e.g. DEPLOYED, ROLLED_BACK).
   */
  async updateReleaseStatus(id: string, input: UpdateReleaseStatusInput, actorId: string) {
    const release = await prisma.release.findFirst({
      where: { id, deletedAt: null },
      include: { project: { include: { organization: true } } },
    });
    if (!release) {
      throw AppError.notFound('Release not found');
    }

    const isNowDeployed = input.status === ReleaseStatus.DEPLOYED;

    const updatedRelease = await prisma.release.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.deploymentNotes !== undefined && { deploymentNotes: input.deploymentNotes }),
        ...(isNowDeployed && { deployedAt: new Date() }),
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
      actorId,
      action: 'RELEASE_STATUS_UPDATED',
      entityType: 'Release',
      entityId: release.id,
      metadata: { fromStatus: release.status, toStatus: input.status },
    });

    await activityService.log({
      projectId: release.projectId,
      actorId,
      type: 'RELEASE_STATUS_CHANGED',
      message: `Release ${release.version} marked as ${input.status}`,
      visibility: CommentVisibility.CLIENT_VISIBLE,
      entityType: 'Release',
      entityId: release.id,
    });

    // If deployed, notify all client users belonging to the project's organization!
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
    }

    return updatedRelease;
  }

  /**
   * Retrieves release by ID.
   */
  async getReleaseById(id: string) {
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
    return release;
  }

  /**
   * Lists releases for a project.
   */
  async listReleases(query: PaginationQueryInput) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;

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
   */
  async recordClientReview(
    requirementId: string,
    input: DecideClientReviewInput,
    reviewerId: string,
    reviewerRole: UserRole,
    reviewerOrgId?: string | null
  ) {
    const requirement = await prisma.requirement.findFirst({
      where: { id: requirementId, deletedAt: null },
      include: { project: true },
    });
    if (!requirement) {
      throw AppError.notFound('Requirement not found');
    }

    // Must be in CLIENT_REVIEW status
    if (requirement.status !== RequirementStatus.CLIENT_REVIEW) {
      throw AppError.badRequest(
        `Requirement cannot be reviewed in current status: ${requirement.status}. Must be in CLIENT_REVIEW.`
      );
    }

    // If client, verify tenant isolation
    if (reviewerRole === UserRole.CLIENT && requirement.project.organizationId !== reviewerOrgId) {
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
