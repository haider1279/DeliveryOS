import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import {
  UserRole,
  TaskStatus,
  CommentVisibility,
  NotificationType,
  CreateTaskInput,
  UpdateTaskInput,
  CreateTaskCommentInput,
  CreateTimeEntryInput,
  PaginationQueryInput,
} from '@deliveryos/shared';

export class TaskService {
  /**
   * Creates a new task within a project.
   * If assigneeId is provided, verifies that the user is an active project member.
   */
  async createTask(input: CreateTaskInput, creatorId: string) {
    // 1. Verify project exists
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
      include: { organization: true },
    });
    if (!project) {
      throw AppError.notFound('Project not found');
    }

    // 2. If assignee provided, verify active membership
    if (input.assigneeId) {
      const activeMember = await prisma.projectMember.findFirst({
        where: {
          projectId: input.projectId,
          userId: input.assigneeId,
          leftAt: null,
        },
      });
      if (!activeMember) {
        throw AppError.badRequest('Assigned user is not an active member of this project');
      }
    }

    // 3. Create task
    const task = await prisma.task.create({
      data: {
        projectId: input.projectId,
        requirementId: input.requirementId || null,
        title: input.title,
        description: input.description || null,
        assigneeId: input.assigneeId || null,
        creatorId,
        priority: input.priority,
        estimatedHours: input.estimatedHours ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        labels: input.labels || [],
        status: TaskStatus.TODO,
      },
      include: {
        assignee: { include: { profile: true } },
        creator: { include: { profile: true } },
        requirement: true,
      },
    });

    // 4. Audit & Activity
    await auditService.log({
      actorId: creatorId,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      metadata: { title: task.title, projectId: task.projectId },
    });

    await activityService.log({
      projectId: task.projectId,
      actorId: creatorId,
      type: 'TASK_CREATED',
      message: `Task created: "${task.title}"`,
      visibility: CommentVisibility.INTERNAL,
      entityType: 'Task',
      entityId: task.id,
    });

    // 5. Notify Assignee
    if (task.assigneeId && task.assigneeId !== creatorId) {
      await notificationService.notify({
        userId: task.assigneeId,
        type: NotificationType.TASK_ASSIGNED,
        title: 'New Task Assigned',
        message: `You were assigned to task "${task.title}" in project "${project.name}"`,
        entityType: 'Task',
        entityId: task.id,
        linkUrl: `/app/projects/${project.id}?tab=tasks&taskId=${task.id}`,
      });
    }

    return task;
  }

  /**
   * Updates task details, status, or assignee.
   */
  async updateTask(id: string, input: UpdateTaskInput, actorId: string, actorRole: UserRole) {
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: { project: true },
    });
    if (!task) {
      throw AppError.notFound('Task not found');
    }

    // Clients cannot edit tasks directly
    if (actorRole === UserRole.CLIENT) {
      throw AppError.forbidden('Clients cannot edit development tasks');
    }

    // Verify new assignee if provided
    if (input.assigneeId && input.assigneeId !== task.assigneeId) {
      const activeMember = await prisma.projectMember.findFirst({
        where: {
          projectId: task.projectId,
          userId: input.assigneeId,
          leftAt: null,
        },
      });
      if (!activeMember) {
        throw AppError.badRequest('Assigned user is not an active member of this project');
      }
    }

    const previousStatus = task.status;
    const isNowDone = input.status === TaskStatus.DONE && previousStatus !== TaskStatus.DONE;
    const isReopened = previousStatus === TaskStatus.DONE && input.status && input.status !== TaskStatus.DONE;

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.estimatedHours !== undefined && { estimatedHours: input.estimatedHours }),
        ...(input.actualHours !== undefined && { actualHours: input.actualHours }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate ? new Date(input.dueDate) : null }),
        ...(input.labels !== undefined && { labels: input.labels }),
        ...(isNowDone && { completedAt: new Date() }),
        ...(isReopened && { completedAt: null }),
      },
      include: {
        assignee: { include: { profile: true } },
        creator: { include: { profile: true } },
        requirement: true,
      },
    });

    // Audit log
    await auditService.log({
      actorId,
      action: 'TASK_UPDATED',
      entityType: 'Task',
      entityId: task.id,
      metadata: { previousStatus, newStatus: input.status, changes: input },
    });

    // If status changed, log activity
    if (input.status && input.status !== previousStatus) {
      await activityService.log({
        projectId: task.projectId,
        actorId,
        type: 'TASK_STATUS_CHANGED',
        message: `Task "${task.title}" status changed to ${input.status}`,
        visibility: CommentVisibility.INTERNAL,
        entityType: 'Task',
        entityId: task.id,
      });

      // Notify assignee if someone else changed it
      if (task.assigneeId && task.assigneeId !== actorId) {
        await notificationService.notify({
          userId: task.assigneeId,
          type: NotificationType.TASK_STATUS_CHANGED,
          title: 'Task Status Updated',
          message: `Task "${task.title}" status changed to ${input.status}`,
          entityType: 'Task',
          entityId: task.id,
          linkUrl: `/app/projects/${task.projectId}?tab=tasks&taskId=${task.id}`,
        });
      }
    }

    return updatedTask;
  }

  /**
   * Retrieves task by ID, applying visibility filter on comments.
   */
  async getTaskById(id: string, userRole: UserRole, userOrgId?: string | null) {
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: {
          include: { organization: true },
        },
        assignee: { include: { profile: true } },
        creator: { include: { profile: true } },
        requirement: true,
        comments: {
          where: userRole === UserRole.CLIENT ? { visibility: CommentVisibility.CLIENT_VISIBLE } : undefined,
          include: {
            author: { include: { profile: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        timeEntries: userRole === UserRole.CLIENT ? false : {
          include: { user: { include: { profile: true } } },
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!task) {
      throw AppError.notFound('Task not found');
    }

    // Client tenant isolation check
    if (userRole === UserRole.CLIENT && task.project.organizationId !== userOrgId) {
      throw AppError.notFound('Task not found');
    }

    return task;
  }

  /**
   * Lists tasks with search, pagination, and filters.
   */
  async listTasks(query: PaginationQueryInput, userRole: UserRole, userOrgId?: string | null) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const where: any = {
      deletedAt: null,
    };

    if (query.projectId) {
      where.projectId = query.projectId;
    }

    if (query.assigneeId) {
      where.assigneeId = query.assigneeId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Client isolation: only tasks for projects in client's org
    if (userRole === UserRole.CLIENT) {
      where.project = { organizationId: userOrgId, deletedAt: null };
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          assignee: { include: { profile: true } },
          creator: { include: { profile: true } },
          requirement: { select: { id: true, title: true, status: true } },
          _count: { select: { comments: true, timeEntries: true } },
        },
        orderBy: query.sort ? { [query.sort]: query.order || 'desc' } : { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.task.count({ where }),
    ]);

    return { tasks, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Adds a comment to a task.
   */
  async addComment(taskId: string, input: CreateTaskCommentInput, authorId: string, authorRole: UserRole) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { project: true },
    });
    if (!task) {
      throw AppError.notFound('Task not found');
    }

    // Force visibility to CLIENT_VISIBLE if comment is authored by a client
    const visibility = authorRole === UserRole.CLIENT ? CommentVisibility.CLIENT_VISIBLE : input.visibility;

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        authorId,
        content: input.content,
        visibility,
      },
      include: {
        author: { include: { profile: true } },
      },
    });

    // Notify task assignee if someone else commented
    if (task.assigneeId && task.assigneeId !== authorId) {
      await notificationService.notify({
        userId: task.assigneeId,
        type: NotificationType.MENTION,
        title: 'New Task Comment',
        message: `New comment on task "${task.title}"`,
        entityType: 'Task',
        entityId: task.id,
        linkUrl: `/app/projects/${task.projectId}?tab=tasks&taskId=${task.id}`,
      });
    }

    return comment;
  }

  /**
   * Logs time against a task and updates project & task actual effort hours.
   */
  async logTime(input: CreateTimeEntryInput, userId: string, userRole: UserRole) {
    if (userRole === UserRole.CLIENT) {
      throw AppError.forbidden('Clients cannot log development time entries');
    }

    const task = await prisma.task.findFirst({
      where: { id: input.taskId, deletedAt: null },
      include: { project: true },
    });
    if (!task) {
      throw AppError.notFound('Task not found');
    }

    // Transactionally create time entry and update task & project hours
    const hoursLogged = Number((input.durationMinutes / 60).toFixed(2));

    const result = await prisma.$transaction(async (tx) => {
      const timeEntry = await tx.timeEntry.create({
        data: {
          projectId: task.projectId,
          taskId: input.taskId,
          userId,
          date: new Date(input.date),
          durationMinutes: input.durationMinutes,
          note: input.note || null,
          billable: input.billable ?? true,
        },
        include: {
          user: { include: { profile: true } },
        },
      });

      // Update task actualHours
      const updatedTask = await tx.task.update({
        where: { id: task.id },
        data: {
          actualHours: { increment: hoursLogged },
        },
      });

      // Update project actualEffortHours
      await tx.project.update({
        where: { id: task.projectId },
        data: {
          actualEffortHours: { increment: hoursLogged },
        },
      });

      return { timeEntry, updatedTask };
    });

    return result.timeEntry;
  }

  /**
   * Aggregates the logged-in user's active tasks for the "My Work" developer dashboard.
   */
  async getMyWork(userId: string) {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [activeTasks, recentTimeEntries, assignedBugs] = await Promise.all([
      prisma.task.findMany({
        where: {
          assigneeId: userId,
          deletedAt: null,
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
          requirement: { select: { id: true, title: true } },
        },
        orderBy: [
          { priority: 'desc' },
          { dueDate: 'asc' },
        ],
      }),
      prisma.timeEntry.findMany({
        where: { userId },
        include: {
          task: { select: { id: true, title: true } },
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { date: 'desc' },
        take: 10,
      }),
      prisma.bug.findMany({
        where: {
          assigneeId: userId,
          status: { notIn: ['CLOSED', 'WONT_FIX'] },
        },
        include: {
          project: { select: { id: true, name: true, code: true } },
        },
        orderBy: { severity: 'desc' },
      }),
    ]);

    // Compute metrics
    const overdueTasks = activeTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);
    const dueSoonTasks = activeTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= threeDaysFromNow
    );
    const blockedTasks = activeTasks.filter((t) => t.status === TaskStatus.BLOCKED);

    return {
      activeTasks,
      overdueTasks,
      dueSoonTasks,
      blockedTasks,
      assignedBugs,
      recentTimeEntries,
      summary: {
        totalActive: activeTasks.length,
        overdueCount: overdueTasks.length,
        dueSoonCount: dueSoonTasks.length,
        blockedCount: blockedTasks.length,
        bugCount: assignedBugs.length,
      },
    };
  }
}

export const taskService = new TaskService();
