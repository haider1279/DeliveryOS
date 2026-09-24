import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import {
  UserRole,
  UserStatus,
  TaskStatus,
  CommentVisibility,
  NotificationType,
  CreateTaskInput,
  UpdateTaskInput,
  CreateTaskCommentInput,
  CreateTimeEntryInput,
  PaginationQueryInput,
  AuthenticatedUser,
} from '@deliveryos/shared';
import { requireProjectAccess, getAccessibleProjectIds, assertProjectWritable } from '../../services/project-access.service';

// Allowed forward/back movements in the task workflow. Reopening a finished
// task (DONE/CANCELLED) is allowed so work can resume after a mistake.
const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.CODE_REVIEW, TaskStatus.BLOCKED, TaskStatus.DONE, TaskStatus.CANCELLED],
  [TaskStatus.CODE_REVIEW]: [TaskStatus.READY_FOR_QA, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.DONE, TaskStatus.CANCELLED],
  [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.READY_FOR_QA]: [TaskStatus.DONE, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.DONE]: [TaskStatus.IN_PROGRESS, TaskStatus.TODO, TaskStatus.CANCELLED],
  [TaskStatus.CANCELLED]: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
};

// Developers drive active-status changes but cannot cancel their own work or
// self-close straight to DONE from non-code-review states.
const MANAGER_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER];

export class TaskService {
  /**
   * Creates a new task within a project.
   * If assigneeId is provided, verifies that the user is an active project member.
   */
  async createTask(actor: AuthenticatedUser, input: CreateTaskInput) {
    await assertProjectWritable(actor, input.projectId);

    // QA may view/test but never create development tasks.
    if (actor.role === UserRole.QA) {
      throw AppError.forbidden('QA users cannot create tasks');
    }

    // DEVELOPER may only assign tasks to themselves.
    if (
      actor.role === UserRole.DEVELOPER &&
      input.assigneeId &&
      input.assigneeId !== actor.id
    ) {
      throw AppError.forbidden('Developers can only assign tasks to themselves');
    }

    // 1. Verify project exists
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
      include: { organization: true },
    });
    if (!project) {
      throw AppError.notFound('Project not found');
    }

    // 2. If assignee provided, verify active membership and role authorization
    if (input.assigneeId) {
      const activeMember = await prisma.projectMember.findFirst({
        where: {
          projectId: input.projectId,
          userId: input.assigneeId,
          leftAt: null,
        },
        include: { user: true },
      });
      if (!activeMember || activeMember.user.status === UserStatus.SUSPENDED || activeMember.user.status === UserStatus.DEACTIVATED) {
        throw AppError.badRequest('Assigned user is not an active member of this project');
      }
      if (
        actor.role === UserRole.PROJECT_MANAGER &&
        activeMember.user.role !== UserRole.DEVELOPER
      ) {
        throw AppError.forbidden('Project managers can only assign development tasks to project developers');
      }
    }

    // 2b. If requirement provided, it must belong to this project.
    if (input.requirementId) {
      const requirement = await prisma.requirement.findFirst({
        where: { id: input.requirementId, projectId: input.projectId, deletedAt: null },
        select: { id: true },
      });
      if (!requirement) {
        throw AppError.badRequest('Requirement does not belong to this project');
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
        creatorId: actor.id,
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
      actorId: actor.id,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      metadata: { title: task.title, projectId: task.projectId },
    });

    await activityService.log({
      projectId: task.projectId,
      actorId: actor.id,
      type: 'TASK_CREATED',
      message: `Task created: "${task.title}"`,
      visibility: CommentVisibility.INTERNAL,
      entityType: 'Task',
      entityId: task.id,
    });

    // 5. Notify Assignee
    if (task.assigneeId && task.assigneeId !== actor.id) {
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
  async updateTask(id: string, input: UpdateTaskInput, actor: AuthenticatedUser) {
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: { project: true },
    });
    if (!task) {
      throw AppError.notFound('Task not found');
    }

    await requireProjectAccess(actor, task.projectId);

    // Clients cannot edit tasks directly
    if (actor.role === UserRole.CLIENT) {
      throw AppError.forbidden('Clients cannot edit development tasks');
    }

    // QA cannot edit development tasks; DEVELOPER edits are limited to
    // workflow/status fields within their own project (never reassignment or
    // direct actual-hours writes).
    if (actor.role === UserRole.QA) {
      throw AppError.forbidden('QA users cannot edit tasks');
    }
    if (actor.role === UserRole.DEVELOPER) {
      if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
        throw AppError.forbidden('Developers cannot reassign tasks');
      }
      if (input.actualHours !== undefined) {
        throw AppError.forbidden('Developers cannot set actual hours directly');
      }
    }

    // Verify new assignee if provided
    if (input.assigneeId && input.assigneeId !== task.assigneeId) {
      const activeMember = await prisma.projectMember.findFirst({
        where: {
          projectId: task.projectId,
          userId: input.assigneeId,
          leftAt: null,
        },
        include: { user: true },
      });
      if (!activeMember || activeMember.user.status === UserStatus.SUSPENDED || activeMember.user.status === UserStatus.DEACTIVATED) {
        throw AppError.badRequest('Assigned user is not an active member of this project');
      }
      if (
        actor.role === UserRole.PROJECT_MANAGER &&
        activeMember.user.role !== UserRole.DEVELOPER
      ) {
        throw AppError.forbidden('Project managers can only assign development tasks to project developers');
      }
    }

    const previousStatus = task.status;

    // Enforce the workflow state machine when a status change is requested.
    if (input.status !== undefined && input.status !== previousStatus) {
      const allowedNext = TASK_TRANSITIONS[previousStatus];
      if (!allowedNext.includes(input.status)) {
        throw AppError.forbidden(`Cannot move task from ${previousStatus} to ${input.status}`);
      }
      // Developers may not abandon/cancel work themselves; managers may.
      if (
        input.status === TaskStatus.CANCELLED &&
        actor.role === UserRole.DEVELOPER
      ) {
        throw AppError.forbidden('Developers cannot cancel tasks; ask a project manager');
      }
    }

    const isNowDone = input.status === TaskStatus.DONE && previousStatus !== TaskStatus.DONE;
    const isLeavingFinishedState =
      (previousStatus === TaskStatus.DONE || previousStatus === TaskStatus.CANCELLED) &&
      input.status !== undefined &&
      input.status !== TaskStatus.DONE &&
      input.status !== TaskStatus.CANCELLED;

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
        ...(isLeavingFinishedState && { completedAt: null }),
      },
      include: {
        assignee: { include: { profile: true } },
        creator: { include: { profile: true } },
        requirement: true,
      },
    });

    // Audit log
    await auditService.log({
      actorId: actor.id,
      action: 'TASK_UPDATED',
      entityType: 'Task',
      entityId: task.id,
      metadata: { previousStatus, newStatus: input.status, changes: input },
    });

    // If status changed, log activity
    if (input.status && input.status !== previousStatus) {
      await activityService.log({
        projectId: task.projectId,
        actorId: actor.id,
        type: 'TASK_STATUS_CHANGED',
        message: `Task "${task.title}" status changed to ${input.status}`,
        visibility: CommentVisibility.INTERNAL,
        entityType: 'Task',
        entityId: task.id,
      });

      // Notify assignee if someone else changed it
      if (task.assigneeId && task.assigneeId !== actor.id) {
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
  async getTaskById(actor: AuthenticatedUser, id: string) {
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
          where: actor.role === UserRole.CLIENT ? { visibility: CommentVisibility.CLIENT_VISIBLE } : undefined,
          include: {
            author: { include: { profile: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        timeEntries: actor.role === UserRole.CLIENT ? false : {
          include: { user: { include: { profile: true } } },
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!task) {
      throw AppError.notFound('Task not found');
    }

    // Tenant/access isolation (admins pass through, staff need membership,
    // clients must own the project's organization).
    await requireProjectAccess(actor, task.projectId);

    return task;
  }

  /**
   * Lists tasks with search, pagination, and filters.
   */
  async listTasks(actor: AuthenticatedUser, query: PaginationQueryInput) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const andConds: any[] = [{ deletedAt: null }];

    if (query.projectId) {
      andConds.push({ projectId: query.projectId });
    }

    // Client isolation: only tasks for projects in client's org
    if (actor.role === UserRole.CLIENT) {
      andConds.push({ project: { organizationId: actor.organizationId, deletedAt: null } });
    } else if ([UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER].includes(actor.role as UserRole)) {
      const accessibleProjectIds = await getAccessibleProjectIds(actor);
      if (accessibleProjectIds && accessibleProjectIds.length > 0) {
        andConds.push({ projectId: { in: accessibleProjectIds } });
      } else {
        andConds.push({ projectId: { in: [] } });
      }
    }

    const where: any = { AND: andConds };

    if (query.assigneeId) {
      where.AND.push({ assigneeId: query.assigneeId });
    }

    if (query.status) {
      where.AND.push({ status: query.status });
    }

    if (query.priority) {
      where.AND.push({ priority: query.priority });
    }

    if (query.search) {
      where.AND.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      });
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
  async addComment(actor: AuthenticatedUser, taskId: string, input: CreateTaskCommentInput) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { project: true },
    });
    if (!task) {
      throw AppError.notFound('Task not found');
    }

    await requireProjectAccess(actor, task.projectId);

    // Force visibility to CLIENT_VISIBLE if comment is authored by a client
    const visibility = actor.role === UserRole.CLIENT ? CommentVisibility.CLIENT_VISIBLE : input.visibility;

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        authorId: actor.id,
        content: input.content,
        visibility,
      },
      include: {
        author: { include: { profile: true } },
      },
    });

    // Notify task assignee if someone else commented
    if (task.assigneeId && task.assigneeId !== actor.id) {
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
  async logTime(actor: AuthenticatedUser, input: CreateTimeEntryInput) {
    if (actor.role === UserRole.CLIENT) {
      throw AppError.forbidden('Clients cannot log development time entries');
    }

    const task = await prisma.task.findFirst({
      where: { id: input.taskId, deletedAt: null },
      include: { project: true },
    });
    if (!task) {
      throw AppError.notFound('Task not found');
    }

    await requireProjectAccess(actor, task.projectId);

    // No time may be logged against finished work.
    if (task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED) {
      throw AppError.badRequest('Cannot log time against tasks that are already done or cancelled');
    }

    // Transactionally create time entry and update task & project hours
    const hoursLogged = Number((input.durationMinutes / 60).toFixed(2));

    const result = await prisma.$transaction(async (tx) => {
      const timeEntry = await tx.timeEntry.create({
        data: {
          projectId: task.projectId,
          taskId: input.taskId,
          userId: actor.id,
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
   * Updates an existing time entry. Ordinary staff may only edit their own
   * entries; managers may edit any entry within their accessible projects.
   * Task & project actual-effort hours are adjusted by the difference.
   */
  async updateTimeEntry(actor: AuthenticatedUser, id: string, input: {
    date?: string;
    durationMinutes?: number;
    note?: string | null;
    billable?: boolean;
  }) {
    const entry = await prisma.timeEntry.findFirst({
      where: { id },
      include: { task: { select: { id: true, title: true, status: true } } },
    });
    if (!entry) throw AppError.notFound('Time entry not found');

    await requireProjectAccess(actor, entry.projectId);

    const isOwner = entry.userId === actor.id;
    const isManager = MANAGER_ROLES.includes(actor.role);
    if (!isOwner && !isManager) {
      throw AppError.forbidden('You can only edit your own time entries');
    }

    if (entry.task && (entry.task.status === TaskStatus.DONE || entry.task.status === TaskStatus.CANCELLED)) {
      throw AppError.badRequest('Cannot edit time on finished tasks');
    }

    const oldMinutes = entry.durationMinutes;
    const newMinutes = input.durationMinutes !== undefined ? input.durationMinutes : oldMinutes;
    const minutesDelta = newMinutes - oldMinutes;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.timeEntry.update({
        where: { id },
        data: {
          ...(input.date !== undefined && { date: new Date(input.date) }),
          ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
          ...(input.note !== undefined && { note: input.note }),
          ...(input.billable !== undefined && { billable: input.billable }),
        },
        include: { user: { include: { profile: true } } },
      });

      if (minutesDelta !== 0) {
        const hoursDelta = Number((minutesDelta / 60).toFixed(2));
        if (entry.taskId) {
          await tx.task.update({
            where: { id: entry.taskId },
            data: { actualHours: { increment: hoursDelta } },
          });
        }
        await tx.project.update({
          where: { id: entry.projectId },
          data: { actualEffortHours: { increment: hoursDelta } },
        });
      }

      return updated;
    });

    await auditService.log({
      actorId: actor.id,
      action: 'TIME_ENTRY_UPDATED',
      entityType: 'TimeEntry',
      entityId: id,
      metadata: { projectId: entry.projectId, oldMinutes, newMinutes },
    });

    return result;
  }

  /**
   * Deletes a time entry (own entries for staff; managers may delete any entry
   * in their accessible projects). Task & project actual-effort hours roll back.
   */
  async deleteTimeEntry(actor: AuthenticatedUser, id: string) {
    const entry = await prisma.timeEntry.findFirst({
      where: { id },
      include: { task: { select: { id: true } } },
    });
    if (!entry) throw AppError.notFound('Time entry not found');

    await requireProjectAccess(actor, entry.projectId);

    const isOwner = entry.userId === actor.id;
    const isManager = MANAGER_ROLES.includes(actor.role);
    if (!isOwner && !isManager) {
      throw AppError.forbidden('You can only delete your own time entries');
    }

    const hoursRemoved = Number((entry.durationMinutes / 60).toFixed(2));

    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.delete({ where: { id } });
      if (entry.taskId) {
        await tx.task.update({
          where: { id: entry.taskId },
          data: { actualHours: { decrement: hoursRemoved } },
        });
      }
      await tx.project.update({
        where: { id: entry.projectId },
        data: { actualEffortHours: { decrement: hoursRemoved } },
      });
    });

    await auditService.log({
      actorId: actor.id,
      action: 'TIME_ENTRY_DELETED',
      entityType: 'TimeEntry',
      entityId: id,
      metadata: { projectId: entry.projectId, hoursRemoved },
    });

    return { deleted: true, timeEntryId: id };
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
