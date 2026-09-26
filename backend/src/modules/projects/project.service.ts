import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { activityService } from '../../services/notification.service';
import { UserRole, UserStatus, CommentVisibility, ProjectStatus, InvoiceStatus, OrganizationQualificationStatus } from '@deliveryos/shared';
import type { CreateProjectDTO, UpdateProjectDTO, AddProjectMemberDTO, AuthenticatedUser } from '@deliveryos/shared';
import { requireProjectAccess, getAccessibleProjectIds, assertProjectWritable } from '../../services/project-access.service';
import { requireQualifiedOrganization } from '../organizations/organization-eligibility.service';

export async function syncProjectStatus(projectId: string, db: any = prisma): Promise<ProjectStatus | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true, deletedAt: true },
  });

  if (!project || project.deletedAt || project.status === ProjectStatus.CANCELLED || project.status === ProjectStatus.ARCHIVED) {
    return project?.status || null;
  }

  // Check deployment status
  const deployedReleaseCount = await db.release.count({
    where: { projectId, status: 'DEPLOYED', deletedAt: null },
  });

  const totalReqs = await db.requirement.count({
    where: { projectId, deletedAt: null },
  });

  const completedReqs = await db.requirement.count({
    where: { projectId, status: { in: ['COMPLETED', 'APPROVED'] }, deletedAt: null },
  });

  const isDeployedOrScopeFinished =
    deployedReleaseCount > 0 || (totalReqs > 0 && totalReqs === completedReqs);

  // Check invoice / payment status
  const totalInvoicesCount = await db.invoice.count({
    where: { projectId, status: { not: InvoiceStatus.VOID }, deletedAt: null },
  });

  const unpaidInvoicesCount = await db.invoice.count({
    where: { projectId, status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.VOID] }, deletedAt: null },
  });

  const isPaymentConfirmed = totalInvoicesCount > 0 && unpaidInvoicesCount === 0;

  let targetStatus = project.status;

  if (isDeployedOrScopeFinished && isPaymentConfirmed) {
    targetStatus = ProjectStatus.COMPLETED;
  } else if (project.status === ProjectStatus.PLANNING && totalInvoicesCount > 0) {
    targetStatus = ProjectStatus.ACTIVE;
  }

  if (targetStatus !== project.status) {
    await db.project.update({
      where: { id: projectId },
      data: {
        status: targetStatus,
        ...(targetStatus === ProjectStatus.COMPLETED ? { completedAt: new Date() } : {}),
      },
    });
  }

  return targetStatus;
}

export const projectService = {
  async create(actor: AuthenticatedUser, dto: CreateProjectDTO) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Only administrators (ADMIN or SUPER_ADMIN) can create official projects', 403);
    }

    const existing = await prisma.project.findFirst({ where: { code: dto.code } });
    if (existing) throw new AppError('CONFLICT', `Project code "${dto.code}" is already in use`, 409);

    // Only trust ids that actually resolve to a live organization and an
    // active project manager — never silently accept arbitrary ids.
    // The organization qualification rule lives in
    // organization-eligibility.service so the manual "New Project" flow and the
    // client project-request approval flow cannot drift apart.
    const org = await requireQualifiedOrganization(dto.organizationId, 'Creating a project');
    const pm = await prisma.user.findFirst({ where: { id: dto.projectManagerId, role: UserRole.PROJECT_MANAGER } });
    if (!pm || pm.status !== UserStatus.ACTIVE) {
      throw new AppError('BUSINESS_RULE_VIOLATION', 'Project manager must be an active PROJECT_MANAGER user', 400);
    }

    // Non-super-admin staff may only create projects inside their own
    // organization — otherwise a PM could plant projects in a foreign tenant.
    // ADMIN is globally scoped (mirrors canAccessProject), so like SUPER_ADMIN
    // it may open a project for any organization.
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.ADMIN &&
      org.id !== actor.organizationId
    ) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions to create projects in this organization', 403);
    }

    // The nominated project manager must have a legitimate relationship to the
    // project's organization. DeliveryOS models agency-level PMs (users without
    // a fixed home organization) who manage projects across client
    // organizations through ProjectMember assignment — e.g. the seed PM manages
    // both ACME-WMS and STAR-ECOMM with organizationId null. Requiring
    // `pm.organizationId === org.id` would wrongly block every such assignment,
    // so the authoritative relationship is the project-level membership a PM
    // already holds in the target organization (or, for the globally-scoped
    // SUPER_ADMIN/ADMIN assigners, the assignment itself).
    //
    // Tenant isolation is not weakened: access stays membership-scoped
    // (requireProjectAccess / canAccessProject), and the create transaction
    // below grants the PM only a membership to this project — never to other
    // organizations' data.
    if (
      pm.organizationId !== org.id &&
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.ADMIN
    ) {
      const existingAssignment = await prisma.projectMember.findFirst({
        where: {
          userId: pm.id,
          leftAt: null,
          project: {
            organizationId: org.id,
            deletedAt: null,
            status: { notIn: [ProjectStatus.ARCHIVED, ProjectStatus.CANCELLED] },
          },
        },
        select: { id: true },
      });
      if (!existingAssignment) {
        throw new AppError(
          'BUSINESS_RULE_VIOLATION',
          'Project manager must belong to the project organization or already manage an active project in it',
          400
        );
      }
    }

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          organizationId: dto.organizationId,
          projectManagerId: dto.projectManagerId,
          name: dto.name,
          code: dto.code,
          description: dto.description,
          priority: dto.priority as any,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
          budget: dto.budget ?? null,
          currency: dto.currency ?? 'USD',
          estimatedEffortHours: dto.estimatedEffortHours ?? null,
          notes: dto.notes,
          status: ProjectStatus.PLANNING,
        },
      });

      // Auto-add PM as project member
      await tx.projectMember.create({
        data: { projectId: p.id, userId: dto.projectManagerId, membershipRole: 'PROJECT_MANAGER' },
      });

      return p;
    });

    await auditService.log({
      actorId: actor.id,
      action: 'PROJECT_CREATED',
      entityType: 'Project',
      entityId: project.id,
      metadata: { code: project.code, organizationId: project.organizationId },
    });

    return project;
  },

  async getById(actor: AuthenticatedUser, projectId: string) {
    await requireProjectAccess(actor, projectId);

    await syncProjectStatus(projectId);

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        projectManager: { include: { profile: true } },
        members: {
          where: { leftAt: null },
          include: { user: { include: { profile: true } } },
        },
        _count: {
          select: {
            requirements: { where: { deletedAt: null } },
            tasks: { where: { deletedAt: null } },
            bugs: { where: { status: { notIn: ['CLOSED', 'WONT_FIX'] } } },
            releases: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!project) throw new AppError('NOT_FOUND', 'Project not found', 404);

    // Clients should not see internal staff contact details (emails).
    if (actor.role === UserRole.CLIENT) {
      return {
        ...project,
        projectManager: project.projectManager
          ? { id: project.projectManager.id, profile: project.projectManager.profile }
          : null,
        members: project.members.map((m) => ({
          ...m,
          user: m.user ? { id: m.user.id, profile: m.user.profile } : m.user,
        })),
      };
    }

    return project;
  },

  async list(actor: AuthenticatedUser, query: {
    organizationId?: string;
    status?: string;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const where: any = { deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Tenant isolation
    if (actor.role === UserRole.CLIENT) {
      where.organizationId = actor.organizationId;
    } else if (
      actor.role === UserRole.DEVELOPER ||
      actor.role === UserRole.QA ||
      actor.role === UserRole.PROJECT_MANAGER
    ) {
      const accessibleProjectIds = await getAccessibleProjectIds(actor);
      if (accessibleProjectIds && accessibleProjectIds.length > 0) {
        where.id = { in: accessibleProjectIds };
      } else {
        where.id = { in: [] };
      }
    }

    const [total, items] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true } },
          projectManager: { include: { profile: { select: { firstName: true, lastName: true } } } },
          _count: { select: { requirements: true, tasks: true, bugs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    await Promise.all(
      items.map(async (p) => {
        const syncedStatus = await syncProjectStatus(p.id);
        if (syncedStatus) p.status = syncedStatus;
      })
    );

    return { items, total };
  },

  async update(actor: AuthenticatedUser, projectId: string, dto: UpdateProjectDTO) {
    await requireProjectAccess(actor, projectId);

    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new AppError('NOT_FOUND', 'Project not found', 404);

    if (dto.status === ProjectStatus.CANCELLED || dto.status === ProjectStatus.ARCHIVED) {
      await auditService.log({
        actorId: actor.id,
        action: `PROJECT_${dto.status}`,
        entityType: 'Project',
        entityId: projectId,
      });
    }

    // Duplicate code guard (code is unique; other projects may hold it).
    if (dto.code && dto.code !== project.code) {
      const existing = await prisma.project.findFirst({ where: { code: dto.code } });
      if (existing) throw new AppError('CONFLICT', `Project code "${dto.code}" is already in use`, 409);
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name ?? project.name,
        code: dto.code ?? project.code,
        description: dto.description,
        status: dto.status as any ?? project.status,
        priority: dto.priority as any ?? project.priority,
        startDate: dto.startDate !== undefined ? (dto.startDate ? new Date(dto.startDate) : null) : project.startDate,
        targetDate: dto.targetDate !== undefined ? (dto.targetDate ? new Date(dto.targetDate) : null) : project.targetDate,
        budget: dto.budget !== undefined ? (dto.budget ?? null) : project.budget,
        currency: dto.currency ?? project.currency,
        estimatedEffortHours: dto.estimatedEffortHours !== undefined ? (dto.estimatedEffortHours ?? null) : project.estimatedEffortHours,
        actualEffortHours: dto.actualEffortHours !== undefined ? (dto.actualEffortHours ?? null) : project.actualEffortHours,
        notes: dto.notes,
        completedAt: dto.status === ProjectStatus.COMPLETED ? new Date() : project.completedAt,
      },
    });

    return updated;
  },

  async addMember(actor: AuthenticatedUser, projectId: string, dto: AddProjectMemberDTO) {
    await assertProjectWritable(actor, projectId);

    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }

    // Check for existing active membership
    const existing = await prisma.projectMember.findFirst({
      where: { projectId, userId: dto.userId, leftAt: null },
    });
    if (existing) throw new AppError('CONFLICT', 'User is already an active member of this project', 409);

    const targetUser = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, status: true, role: true },
    });
    if (!targetUser || targetUser.status !== 'ACTIVE') {
      throw new AppError('BUSINESS_RULE_VIOLATION', 'Cannot add an inactive or suspended user to a project', 400);
    }
    if (targetUser.role === UserRole.CLIENT) {
      throw new AppError('BUSINESS_RULE_VIOLATION', 'Clients cannot be added as project team members', 400);
    }
    if (dto.membershipRole === ('DEVELOPER' as any) && targetUser.role !== UserRole.DEVELOPER) {
      throw new AppError('BUSINESS_RULE_VIOLATION', 'Only users with the DEVELOPER role can be assigned as project developers', 400);
    }

    const membership = await prisma.projectMember.create({
      data: { projectId, userId: dto.userId, membershipRole: dto.membershipRole as any },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'PROJECT_MEMBER_ADDED',
      entityType: 'ProjectMember',
      entityId: membership.id,
      metadata: { projectId, userId: dto.userId, role: dto.membershipRole },
    });

    return membership;
  },

  async removeMember(actor: AuthenticatedUser, projectId: string, userId: string) {
    await assertProjectWritable(actor, projectId);

    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }

    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) throw new AppError('NOT_FOUND', 'Project not found', 404);

    if (userId === project.projectManagerId || userId === actor.id) {
      if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.ADMIN) {
        throw new AppError('FORBIDDEN', 'Project Managers cannot remove themselves or unassign the Project Manager role. Only administrators can change project manager assignments.', 403);
      }
    }

    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId, leftAt: null },
    });
    if (!membership) throw new AppError('NOT_FOUND', 'Active membership not found', 404);

    // Soft-leave: set leftAt instead of deleting
    const updated = await prisma.projectMember.update({
      where: { id: membership.id },
      data: { leftAt: new Date() },
    });

    // Flag open tasks for reassignment
    const openTasks = await prisma.task.findMany({
      where: { projectId, assigneeId: userId, status: { notIn: ['DONE', 'CANCELLED'] }, deletedAt: null },
      select: { id: true, title: true },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'PROJECT_MEMBER_REMOVED',
      entityType: 'ProjectMember',
      entityId: membership.id,
      metadata: { projectId, userId, openTasksNeedingReassignment: openTasks.length },
    });

    return { membership: updated, openTasksNeedingReassignment: openTasks };
  },

  async softDelete(actor: AuthenticatedUser, projectId: string) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Only admins can archive projects', 403);
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(), status: ProjectStatus.ARCHIVED },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'PROJECT_ARCHIVED',
      entityType: 'Project',
      entityId: projectId,
    });
  },
};
