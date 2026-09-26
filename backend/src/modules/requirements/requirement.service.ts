import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import {
  RequirementStatus,
  UserRole,
  NotificationType,
  CommentVisibility,
  RequirementApprovalDecision,
  EstimateStatus,
  ReleaseStatus,
} from '@deliveryos/shared';
import type {
  CreateRequirementDTO,
  UpdateRequirementDTO,
  TransitionRequirementDTO,
  CreateEstimateDTO,
  DecideApprovalDTO,
} from '@deliveryos/shared';
import { validateTransition } from './requirement-transitions';
import { requireProjectAccess, getAccessibleProjectIds, assertProjectWritable } from '../../services/project-access.service';
import type { AuthenticatedUser } from '@deliveryos/shared';

export const requirementService = {
  async create(actor: AuthenticatedUser, dto: CreateRequirementDTO) {
    await assertProjectWritable(actor, dto.projectId);

    // Per the roles/permissions matrix only managers and the owning client may
    // submit requirements; DEVELOPER/QA cannot, even as project members.
    if (
      ![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.CLIENT].includes(
        actor.role as UserRole
      )
    ) {
      throw new AppError('FORBIDDEN', 'Only project managers and clients can submit requirements', 403);
    }

    const project = await prisma.project.findFirst({
      where: { id: dto.projectId, deletedAt: null },
      select: {
        organizationId: true,
        status: true,
        releases: {
          where: { status: ReleaseStatus.DEPLOYED, deletedAt: null },
          take: 1,
        },
      },
    });
    if (!project) throw new AppError('NOT_FOUND', 'Project not found', 404);

    if (project.status === 'COMPLETED' || project.releases.length > 0) {
      if (actor.role === UserRole.CLIENT) {
        throw new AppError('FORBIDDEN', 'Cannot submit new requirements to a completed or deployed project', 403);
      }
    }

    const requirement = await prisma.$transaction(async (tx) => {
      const req = await tx.requirement.create({
        data: {
          projectId: dto.projectId,
          title: dto.title,
          description: dto.description,
          priority: dto.priority as any,
          category: dto.category ?? 'General',
          acceptanceCriteria: dto.acceptanceCriteria,
          status: RequirementStatus.SUBMITTED,
          currentVersion: 1,
          submittedById: actor.id,
          requestedByUserId: actor.id,
          targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        },
      });

      // Create initial version snapshot
      await tx.requirementVersion.create({
        data: {
          requirementId: req.id,
          versionNumber: 1,
          title: dto.title,
          description: dto.description,
          acceptanceCriteria: dto.acceptanceCriteria,
          changeSummary: 'Initial submission',
          createdById: actor.id,
        },
      });

      await tx.requirementStatusHistory.create({
        data: {
          requirementId: req.id,
          fromStatus: RequirementStatus.SUBMITTED,
          toStatus: RequirementStatus.SUBMITTED,
          actorId: actor.id,
          comment: 'Requirement submitted',
        },
      });

      return req;
    });

    const pmMembers = await prisma.projectMember.findMany({
      where: { projectId: dto.projectId, leftAt: null, membershipRole: 'PROJECT_MANAGER' },
      select: { userId: true },
    });
    if (pmMembers.length > 0) {
      await notificationService.sendMany(
        pmMembers.map((m) => ({
          userId: m.userId,
          type: NotificationType.REQUIREMENT_SUBMITTED,
          title: 'New Requirement Submitted',
          message: `"${requirement.title}" has been submitted for review.`,
          entityType: 'Requirement',
          entityId: requirement.id,
          linkUrl: `/app/projects/${requirement.projectId}?tab=requirements&requirementId=${requirement.id}`,
        }))
      );
    }

    await activityService.record({
      projectId: dto.projectId,
      actorId: actor.id,
      type: 'REQUIREMENT_CREATED',
      message: `Requirement created: "${dto.title}"`,
      visibility: CommentVisibility.INTERNAL,
      entityType: 'Requirement',
      entityId: requirement.id,
    });

    return requirement;
  },

  async getById(actor: AuthenticatedUser, requirementId: string) {
    const req = await prisma.requirement.findFirst({
      where: { id: requirementId, deletedAt: null },
      include: {
        project: { select: { id: true, name: true, organizationId: true } },
        submittedBy: { include: { profile: true } },
        versions: { orderBy: { versionNumber: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'asc' }, include: { actor: { include: { profile: true } } } },
        estimates: { orderBy: { createdAt: 'desc' } },
        approvals: { orderBy: { decidedAt: 'desc' }, include: { decidedBy: { include: { profile: true } } } },
      },
    });

    if (!req) throw new AppError('NOT_FOUND', 'Requirement not found', 404);

    await requireProjectAccess(actor, req.project.id);

    // Tenant isolation: client can only see their org's requirements
    if (actor.role === UserRole.CLIENT && req.project.organizationId !== actor.organizationId) {
      throw new AppError('NOT_FOUND', 'Requirement not found', 404);
    }

    // Filter internal-only fields for CLIENT role
    if (actor.role === UserRole.CLIENT) {
      // Clients do not see internal estimate costs (only clientPrice)
      req.estimates = req.estimates.map((est) => ({
        ...est,
        estimatedCost: null as any, // internal cost hidden
        assumptions: est.status === EstimateStatus.SENT || est.status === EstimateStatus.APPROVED ? est.assumptions : null,
      }));
    }

    return req;
  },

  async list(actor: AuthenticatedUser, query: {
    projectId?: string;
    status?: string;
    priority?: string;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const where: any = { deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Tenant isolation
    const andConds: any[] = [];
    if (query.projectId) andConds.push({ projectId: query.projectId });

    if (actor.role === UserRole.CLIENT) {
      andConds.push({ project: { organizationId: actor.organizationId } });
    } else if ([UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      // Only see requirements from projects they're a member of (incl. PM)
      const accessibleProjectIds = await getAccessibleProjectIds(actor);
      if (accessibleProjectIds && accessibleProjectIds.length > 0) {
        andConds.push({ projectId: { in: accessibleProjectIds } });
      } else {
        andConds.push({ projectId: { in: [] } });
      }
    }

    if (andConds.length > 0) where.AND = andConds;

    const [total, items] = await Promise.all([
      prisma.requirement.count({ where }),
      prisma.requirement.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          submittedBy: { include: { profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return { items, total };
  },

  async update(actor: AuthenticatedUser, requirementId: string, dto: UpdateRequirementDTO) {
    const req = await prisma.requirement.findFirst({
      where: { id: requirementId, deletedAt: null },
      include: { project: { select: { organizationId: true } } },
    });
    if (!req) throw new AppError('NOT_FOUND', 'Requirement not found', 404);

    await requireProjectAccess(actor, req.projectId);

    // Only managers/admins may edit requirements; DEVELOPER/QA/CLIENT cannot.
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Only project managers can edit requirements', 403);
    }

    // If requirement was already approved, create a new version
    const wasApproved = [
      RequirementStatus.APPROVED,
      RequirementStatus.IN_DEVELOPMENT,
      RequirementStatus.QA,
      RequirementStatus.CLIENT_REVIEW,
    ].includes(req.status as RequirementStatus);

    const updated = await prisma.$transaction(async (tx) => {
      const newVersion = wasApproved ? req.currentVersion + 1 : req.currentVersion;

      const updatedReq = await tx.requirement.update({
        where: { id: requirementId },
        data: {
          title: dto.title ?? req.title,
          description: dto.description ?? req.description,
          priority: dto.priority as any ?? req.priority,
          category: dto.category ?? req.category,
          acceptanceCriteria: dto.acceptanceCriteria ?? req.acceptanceCriteria,
          targetDate: dto.targetDate !== undefined ? (dto.targetDate ? new Date(dto.targetDate) : null) : req.targetDate,
          currentVersion: newVersion,
          // If was approved and content changed, route back for re-approval
          status: wasApproved && (dto.title || dto.description || dto.acceptanceCriteria)
            ? RequirementStatus.ESTIMATING
            : req.status,
        },
      });

      if (wasApproved) {
        // Create immutable new version snapshot
        await tx.requirementVersion.create({
          data: {
            requirementId,
            versionNumber: newVersion,
            title: dto.title ?? req.title,
            description: dto.description ?? req.description,
            acceptanceCriteria: dto.acceptanceCriteria ?? req.acceptanceCriteria,
            changeSummary: dto.changeSummary ?? 'Content updated after approval',
            createdById: actor.id,
          },
        });

        // Supersede any outstanding estimates
        await tx.estimate.updateMany({
          where: { requirementId, status: { in: ['DRAFT', 'SENT'] as any } },
          data: { status: EstimateStatus.SUPERSEDED },
        });
      }

      // A status change caused by this edit must be recorded in the history
      // so the workflow timeline stays complete and auditable.
      if (updatedReq.status !== req.status) {
        await tx.requirementStatusHistory.create({
          data: {
            requirementId,
            fromStatus: req.status as any,
            toStatus: updatedReq.status as any,
            actorId: actor.id,
            comment: dto.changeSummary ?? 'Requirement content updated — reverted to estimating',
          },
        });
      }

      return updatedReq;
    });

    await auditService.log({
      actorId: actor.id,
      action: 'REQUIREMENT_UPDATED',
      entityType: 'Requirement',
      entityId: requirementId,
      metadata: { wasApproved, newVersion: updated.currentVersion },
    });

    return updated;
  },

  async transition(actor: AuthenticatedUser, requirementId: string, dto: TransitionRequirementDTO) {
    const req = await prisma.requirement.findFirst({
      where: { id: requirementId, deletedAt: null },
      include: {
        project: {
          include: {
            members: { where: { leftAt: null }, include: { user: { include: { profile: true } } } },
          },
        },
      },
    });
    if (!req) throw new AppError('NOT_FOUND', 'Requirement not found', 404);

    await requireProjectAccess(actor, req.projectId);

    // Tenant check for clients
    if (actor.role === UserRole.CLIENT && req.project.organizationId !== actor.organizationId) {
      throw new AppError('NOT_FOUND', 'Requirement not found', 404);
    }

    if (actor.role === UserRole.CLIENT) {
      const isDeployed = req.project.status === 'COMPLETED' || (await prisma.release.count({
        where: { projectId: req.projectId, status: ReleaseStatus.DEPLOYED, deletedAt: null },
      })) > 0;
      if (isDeployed) {
        throw new AppError('FORBIDDEN', 'Cannot transition requirements for a completed or deployed project', 403);
      }
    }

    if (dto.toStatus === RequirementStatus.NEEDS_CLARIFICATION && (!dto.comment || !dto.comment.trim())) {
      throw new AppError('BAD_REQUEST', 'Clarification message is required when requesting clarification', 400);
    }

    if (
      req.status === RequirementStatus.NEEDS_CLARIFICATION &&
      dto.toStatus === RequirementStatus.UNDER_REVIEW &&
      (!dto.comment || !dto.comment.trim())
    ) {
      throw new AppError('BAD_REQUEST', 'Response message is required when responding to clarification', 400);
    }

    const validation = validateTransition(
      req.status as RequirementStatus,
      dto.toStatus,
      actor.role as UserRole
    );

    if (!validation.valid) {
      throw new AppError('INVALID_STATE_TRANSITION', validation.reason, 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const updatedReq = await tx.requirement.update({
        where: { id: requirementId },
        data: {
          status: dto.toStatus,
          approvedAt: dto.toStatus === RequirementStatus.APPROVED ? now : req.approvedAt,
          completedAt: dto.toStatus === RequirementStatus.COMPLETED ? now : req.completedAt,
        },
      });

      await tx.requirementStatusHistory.create({
        data: {
          requirementId,
          fromStatus: req.status as any,
          toStatus: dto.toStatus as any,
          actorId: actor.id,
          comment: dto.comment ?? null,
        },
      });

      // A client moving the requirement out of review is a formal client
      // review decision — persist it for traceability.
      if (
        req.status === RequirementStatus.CLIENT_REVIEW &&
        actor.role === UserRole.CLIENT
      ) {
        const decision =
          dto.toStatus === RequirementStatus.COMPLETED
            ? 'APPROVED'
            : 'CHANGES_REQUESTED';
        await tx.clientReview.create({
          data: {
            requirementId,
            projectId: req.projectId,
            requirementVersion: req.currentVersion,
            reviewerId: actor.id,
            decision: decision as any,
            comment: dto.comment ?? null,
            decidedAt: now,
          },
        });
      }

      return updatedReq;
    });

    // Fire notifications and activity (non-transactional — failures must not roll back)
    const pmUsers = req.project.members
      .filter((m) => m.membershipRole === 'PROJECT_MANAGER')
      .map((m) => m.user);

    if (req.status === RequirementStatus.NEEDS_CLARIFICATION && dto.toStatus === RequirementStatus.UNDER_REVIEW) {
      await notificationService.sendMany(
        pmUsers.map((pm) => ({
          userId: pm.id,
          type: NotificationType.REQUIREMENT_SUBMITTED,
          title: 'Clarification Responded',
          message: `Client responded to clarification for "${req.title}".`,
          entityType: 'Requirement',
          entityId: requirementId,
          linkUrl: `/app/projects/${req.projectId}?tab=requirements&requirementId=${requirementId}`,
        }))
      );
    }

    if (dto.toStatus === RequirementStatus.SUBMITTED) {
      await notificationService.sendMany(
        pmUsers.map((pm) => ({
          userId: pm.id,
          type: NotificationType.REQUIREMENT_SUBMITTED,
          title: 'New Requirement Submitted',
          message: `"${req.title}" has been submitted for review.`,
          entityType: 'Requirement',
          entityId: requirementId,
          linkUrl: `/app/projects/${req.projectId}?tab=requirements&requirementId=${requirementId}`,
        }))
      );
    }

    // A null submittedById means the submitter's account was permanently
    // deleted: the requirement and its history are preserved, but there is no
    // longer an account to send the clarification to.
    if (dto.toStatus === RequirementStatus.NEEDS_CLARIFICATION && req.submittedById) {
      await notificationService.send({
        userId: req.submittedById,
        type: NotificationType.REQUIREMENT_CLARIFICATION,
        title: 'Clarification Needed',
        message: `Your requirement "${req.title}" needs clarification before it can proceed.`,
        entityType: 'Requirement',
        entityId: requirementId,
        linkUrl: `/portal/requirements/${requirementId}`,
      });
    }

    if (dto.toStatus === RequirementStatus.CLIENT_REVIEW) {
      // Notify client organization users
      const clientUsers = await prisma.user.findMany({
        where: { organizationId: req.project.organizationId, role: 'CLIENT', status: 'ACTIVE' },
      });
      await notificationService.sendMany(
        clientUsers.map((u) => ({
          userId: u.id,
          type: NotificationType.CLIENT_REVIEW_REQUESTED,
          title: 'Your Review is Needed',
          message: `"${req.title}" is ready for your review and approval.`,
          entityType: 'Requirement',
          entityId: requirementId,
          linkUrl: `/portal/requirements/${requirementId}`,
        }))
      );
    }

    await activityService.record({
      projectId: req.projectId,
      actorId: actor.id,
      type: `REQUIREMENT_${dto.toStatus}`,
      message: `Requirement "${req.title}" status changed to ${dto.toStatus}${dto.comment ? ': ' + dto.comment : ''}`,
      visibility: [RequirementStatus.COMPLETED, RequirementStatus.CLIENT_REVIEW, RequirementStatus.APPROVED].includes(dto.toStatus)
        ? CommentVisibility.CLIENT_VISIBLE
        : CommentVisibility.INTERNAL,
      entityType: 'Requirement',
      entityId: requirementId,
    });

    await auditService.log({
      actorId: actor.id,
      action: `REQUIREMENT_TRANSITION_${dto.toStatus}`,
      entityType: 'Requirement',
      entityId: requirementId,
      metadata: { fromStatus: req.status, toStatus: dto.toStatus },
    });

    return updated;
  },

  async createEstimate(actor: AuthenticatedUser, requirementId: string, dto: CreateEstimateDTO) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Only project managers can create estimates', 403);
    }

    const req = await prisma.requirement.findFirst({
      where: { id: requirementId, deletedAt: null },
      include: { project: { select: { organizationId: true } } },
    });
    if (!req) throw new AppError('NOT_FOUND', 'Requirement not found', 404);

    await requireProjectAccess(actor, req.projectId);

    const totalHours = (dto.devHours ?? 0) + (dto.qaHours ?? 0) + (dto.designHours ?? 0);

    return prisma.$transaction(async (tx) => {
        // Supersede any prior DRAFT/SENT estimates
        await tx.estimate.updateMany({
          where: { requirementId, status: { in: ['DRAFT', 'SENT'] as any } },
          data: { status: EstimateStatus.SUPERSEDED },
        });

        const prevVersion = await tx.estimate.count({ where: { requirementId } });

      const estimate = await tx.estimate.create({
        data: {
          requirementId,
          requirementVersion: req.currentVersion,
          version: prevVersion + 1,
          devHours: dto.devHours,
          qaHours: dto.qaHours,
          designHours: dto.designHours ?? 0,
          totalHours,
          estimatedCost: dto.estimatedCost ?? 0,
          clientPrice: dto.clientPrice,
          proposedDeliveryDate: dto.proposedDeliveryDate ? new Date(dto.proposedDeliveryDate) : null,
          assumptions: dto.assumptions,
          exclusions: dto.exclusions,
          notes: dto.notes,
          status: EstimateStatus.DRAFT,
          createdById: actor.id,
        },
      });

      return estimate;
    }, { isolationLevel: 'Serializable' as any });
  },

  async sendEstimate(actor: AuthenticatedUser, requirementId: string, estimateId: string) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Only project managers can send estimates', 403);
    }

    return prisma.$transaction(async (tx) => {
      const req = await tx.requirement.findFirst({
        where: { id: requirementId, deletedAt: null },
        include: { project: { select: { organizationId: true } } },
      });
      if (!req) throw new AppError('NOT_FOUND', 'Requirement not found', 404);

      await requireProjectAccess(actor, req.projectId);

      // Sending an estimate transitions the requirement into
      // WAITING_FOR_APPROVAL — it must be a legal workflow step from its
      // current status and the actor must be allowed to perform it.
      const validation = validateTransition(
        req.status as RequirementStatus,
        RequirementStatus.WAITING_FOR_APPROVAL,
        actor.role as UserRole
      );
      if (!validation.valid) {
        throw new AppError('INVALID_STATE_TRANSITION', validation.reason, 400);
      }

      const estimate = await tx.estimate.findFirst({
        where: { id: estimateId, requirementId },
      });
      if (!estimate) throw new AppError('NOT_FOUND', 'Estimate not found', 404);
      if (estimate.status !== EstimateStatus.DRAFT) {
        throw new AppError('CONFLICT', 'Only draft estimates can be sent', 409);
      }
      // Reject stale estimates built against an older requirement version
      if (estimate.requirementVersion !== req.currentVersion) {
        throw new AppError('CONFLICT', 'This estimate is based on an outdated requirement version. Please refresh and re-estimate.', 409);
      }

      const updatedEstimate = await tx.estimate.update({
        where: { id: estimateId },
        data: { status: EstimateStatus.SENT },
      });

      await tx.requirement.update({
        where: { id: requirementId },
        data: { status: RequirementStatus.WAITING_FOR_APPROVAL },
      });

      return updatedEstimate;
    }, { isolationLevel: 'Serializable' as any }).then(async (updatedEstimate) => {
      // Post-commit notifications (must never roll back with the send)
      const req = await prisma.requirement.findFirst({
        where: { id: requirementId },
        include: { project: { select: { organizationId: true } } },
      });

      const clientUsers = await prisma.user.findMany({
        where: { organizationId: req!.project.organizationId, role: 'CLIENT', status: 'ACTIVE' },
      });
      await notificationService.sendMany(
        clientUsers.map((u) => ({
          userId: u.id,
          type: NotificationType.ESTIMATE_SENT,
          title: 'Estimate Ready for Review',
          message: `An estimate has been submitted for "${req?.title}". Please review and approve.`,
          entityType: 'Estimate',
          entityId: estimateId,
          linkUrl: `/portal/requirements/${requirementId}`,
        }))
      );

      return updatedEstimate;
    });
  },

  /**
   * Transactional approval — the heart of the approval workflow.
   * Checks version pinning to reject stale approvals.
   */
  async decideApproval(actor: AuthenticatedUser, requirementId: string, dto: DecideApprovalDTO) {
    if (actor.role !== UserRole.CLIENT) {
      throw new AppError('FORBIDDEN', 'Only client users can approve or reject estimates', 403);
    }

    return prisma.$transaction(async (tx) => {
      // Lock and re-read fresh from DB inside the transaction
      const req = await tx.requirement.findFirst({
        where: { id: requirementId, deletedAt: null },
        include: {
          project: {
            select: {
              organizationId: true,
              status: true,
              releases: {
                where: { status: ReleaseStatus.DEPLOYED, deletedAt: null },
                take: 1,
              },
            },
          },
        },
      });
      if (!req) throw new AppError('NOT_FOUND', 'Requirement not found', 404);

      if (req.project.status === 'COMPLETED' || req.project.releases.length > 0) {
        throw new AppError('FORBIDDEN', 'Cannot approve or reject estimates for a completed or deployed project', 403);
      }

      // Tenant isolation
      if (req.project.organizationId !== actor.organizationId) {
        throw new AppError('NOT_FOUND', 'Requirement not found', 404);
      }

      // Must be in WAITING_FOR_APPROVAL
      if (req.status !== RequirementStatus.WAITING_FOR_APPROVAL) {
        throw new AppError('CONFLICT', 'This requirement is not currently awaiting approval', 409);
      }

      // Version pinning check — prevent stale approvals
      if (req.currentVersion !== dto.requirementVersion) {
        throw new AppError(
          'CONFLICT',
          `This requirement has been updated (now at version ${req.currentVersion}). Please review the latest version before deciding.`,
          409
        );
      }

      const estimate = await tx.estimate.findFirst({
        where: { id: dto.estimateId, requirementId },
      });
      if (!estimate) throw new AppError('NOT_FOUND', 'Estimate not found', 404);
      if (estimate.version !== dto.estimateVersion) {
        throw new AppError('CONFLICT', 'The estimate has been superseded. Please review the latest estimate.', 409);
      }
      if (estimate.status !== EstimateStatus.SENT) {
        throw new AppError('CONFLICT', 'This estimate is no longer awaiting decision', 409);
      }

      // Write the approval record
      const approval = await tx.requirementApproval.create({
        data: {
          requirementId,
          requirementVersion: dto.requirementVersion,
          estimateId: dto.estimateId,
          estimateVersion: dto.estimateVersion,
          decision: dto.decision as any,
          decidedById: actor.id,
          comment: dto.comment,
          decidedAt: new Date(),
        },
      });

      // Update estimate and requirement statuses
      const newReqStatus = dto.decision === RequirementApprovalDecision.APPROVED
        ? RequirementStatus.APPROVED
        : dto.decision === RequirementApprovalDecision.REJECTED
          ? RequirementStatus.REJECTED
          : RequirementStatus.NEEDS_CLARIFICATION;

      const newEstStatus = dto.decision === RequirementApprovalDecision.APPROVED
        ? EstimateStatus.APPROVED
        : EstimateStatus.REJECTED;

      await tx.estimate.update({
        where: { id: dto.estimateId },
        data: { status: newEstStatus },
      });

      await tx.requirement.update({
        where: { id: requirementId },
        data: {
          status: newReqStatus,
          approvedAt: dto.decision === RequirementApprovalDecision.APPROVED ? new Date() : req.approvedAt,
        },
      });

      await tx.requirementStatusHistory.create({
        data: {
          requirementId,
          fromStatus: RequirementStatus.WAITING_FOR_APPROVAL as any,
          toStatus: newReqStatus as any,
          actorId: actor.id,
          comment: dto.comment ?? `Client decision: ${dto.decision}`,
        },
      });

      return approval;
    }, { isolationLevel: 'Serializable' as any });
    // Post-transaction notifications (non-blocking)
    // (handled by the controller after this call returns)
  },

  async softDelete(actor: AuthenticatedUser, requirementId: string) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }
    const req = await prisma.requirement.findFirst({ where: { id: requirementId, deletedAt: null } });
    if (!req) throw new AppError('NOT_FOUND', 'Requirement not found', 404);

    await requireProjectAccess(actor, req.projectId);

    await prisma.requirement.update({
      where: { id: requirementId },
      data: { deletedAt: new Date(), status: RequirementStatus.CANCELLED },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'REQUIREMENT_DELETED',
      entityType: 'Requirement',
      entityId: requirementId,
    });
  },

  /**
   * Verifies the caller may view a requirement's metadata and returns its id.
   * Used by version-history/approval-history endpoints before querying.
   */
  async assertAccessible(actor: AuthenticatedUser, requirementId: string): Promise<string> {
    const req = await prisma.requirement.findFirst({
      where: { id: requirementId, deletedAt: null },
      select: { id: true, projectId: true },
    });
    if (!req) throw new AppError('NOT_FOUND', 'Requirement not found', 404);
    await requireProjectAccess(actor, req.projectId);
    return req.id;
  },
};
