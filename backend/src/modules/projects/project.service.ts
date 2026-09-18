import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { activityService } from '../../services/notification.service';
import { UserRole, CommentVisibility, ProjectStatus } from '@deliveryos/shared';
import type { CreateProjectDTO, UpdateProjectDTO, AddProjectMemberDTO, AuthenticatedUser } from '@deliveryos/shared';

export const projectService = {
  async create(actor: AuthenticatedUser, dto: CreateProjectDTO) {
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions to create projects', 403);
    }

    const existing = await prisma.project.findFirst({ where: { code: dto.code } });
    if (existing) throw new AppError('CONFLICT', `Project code "${dto.code}" is already in use`, 409);

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

    // Tenant isolation
    if (actor.role === UserRole.CLIENT && project.organizationId !== actor.organizationId) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    // Members not in project (non-admin)
    if ([UserRole.DEVELOPER, UserRole.QA].includes(actor.role as UserRole)) {
      const isMember = project.members.some((m) => m.userId === actor.id);
      if (!isMember) throw new AppError('NOT_FOUND', 'Project not found', 404);
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
    } else if ([UserRole.DEVELOPER, UserRole.QA].includes(actor.role as UserRole)) {
      const memberProjectIds = await prisma.projectMember.findMany({
        where: { userId: actor.id, leftAt: null },
        select: { projectId: true },
      });
      where.id = { in: memberProjectIds.map((m) => m.projectId) };
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

    return { items, total };
  },

  async update(actor: AuthenticatedUser, projectId: string, dto: UpdateProjectDTO) {
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

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        name: dto.name ?? project.name,
        description: dto.description,
        status: dto.status as any ?? project.status,
        priority: dto.priority as any ?? project.priority,
        targetDate: dto.targetDate !== undefined ? (dto.targetDate ? new Date(dto.targetDate) : null) : project.targetDate,
        budget: dto.budget ?? project.budget,
        notes: dto.notes,
        completedAt: dto.status === ProjectStatus.COMPLETED ? new Date() : project.completedAt,
      },
    });

    return updated;
  },

  async addMember(actor: AuthenticatedUser, projectId: string, dto: AddProjectMemberDTO) {
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
      select: { id: true, status: true },
    });
    if (!targetUser || targetUser.status !== 'ACTIVE') {
      throw new AppError('BUSINESS_RULE_VIOLATION', 'Cannot add an inactive or suspended user to a project', 400);
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
    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
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
