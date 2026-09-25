import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import { requireProjectAccess, getAccessibleProjectIds, assertProjectWritable } from '../../services/project-access.service';
import {
  UserRole,
  BugStatus,
  BugSeverity,
  BugPriority,
  TestRunResult,
  CommentVisibility,
  NotificationType,
  AuthenticatedUser,
  CreateTestCaseInput,
  ExecuteTestRunInput,
  CreateBugInput,
  UpdateBugStatusInput,
  CreateBugCommentInput,
  PaginationQueryInput,
} from '@deliveryos/shared';

import {
  BUG_TRANSITIONS,
  BUG_STATUS_ENTRY_GATES,
  STAFF_WITH_FULL_BUG_CONTROL,
} from './bug-transitions';

export class QaService {
  /**
   * Creates a test case for a project/requirement (QA/PM/admin only).
   */
  async createTestCase(input: CreateTestCaseInput, actor: AuthenticatedUser) {
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA];
    if (!allowedRoles.includes(actor.role)) {
      throw AppError.forbidden('Only QA and project managers can create test cases');
    }

    await assertProjectWritable(actor, input.projectId);

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) {
      throw AppError.notFound('Project not found');
    }

    // Requirement must belong to the same project when provided.
    if (input.requirementId) {
      const requirement = await prisma.requirement.findFirst({
        where: { id: input.requirementId, projectId: input.projectId, deletedAt: null },
        select: { id: true },
      });
      if (!requirement) {
        throw AppError.badRequest('Requirement does not belong to this project');
      }
    }

    const testCase = await prisma.testCase.create({
      data: {
        projectId: input.projectId,
        requirementId: input.requirementId || null,
        title: input.title,
        steps: input.steps,
        expectedResult: input.expectedResult,
        createdById: actor.id,
      },
      include: {
        createdBy: { include: { profile: true } },
        requirement: true,
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'TEST_CASE_CREATED',
      entityType: 'TestCase',
      entityId: testCase.id,
      metadata: { title: testCase.title, projectId: testCase.projectId },
    });

    return testCase;
  }

  /**
   * Lists test cases scoped to the actor's accessible projects.
   */
  async listTestCases(query: PaginationQueryInput, actor: AuthenticatedUser) {
    // Per the roles-permissions matrix clients have no access to test cases.
    if (actor.role === UserRole.CLIENT) {
      throw AppError.forbidden('Clients do not have access to test cases');
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const accessible = await getAccessibleProjectIds(actor);

    const where: any = {};
    if (query.projectId) {
      if (accessible === null || accessible.includes(query.projectId)) {
        where.projectId = query.projectId;
      } else {
        where.projectId = '__no_access__';
      }
    } else if (accessible !== null) {
      where.projectId = { in: accessible };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { steps: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [testCases, total] = await Promise.all([
      prisma.testCase.findMany({
        where,
        include: {
          createdBy: { include: { profile: true } },
          requirement: { select: { id: true, title: true } },
          _count: { select: { testRuns: true, bugs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.testCase.count({ where }),
    ]);

    return { testCases, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Executes a test run (QA/PM/admin only, within an accessible project).
   * If the result is FAIL, an automated Bug is spawned inside a transaction
   * (unless an active open bug for this test case already exists).
   */
  async executeTestRun(input: ExecuteTestRunInput, actor: AuthenticatedUser) {
    const allowedRoles = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA];
    if (!allowedRoles.includes(actor.role)) {
      throw AppError.forbidden('Only QA and project managers can execute test runs');
    }

    const testCase = await prisma.testCase.findUnique({
      where: { id: input.testCaseId },
      include: { project: true },
    });
    if (!testCase) {
      throw AppError.notFound('Test case not found');
    }

    await requireProjectAccess(actor, testCase.projectId);

    // Task, when provided, must belong to the same project.
    if (input.taskId) {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, projectId: testCase.projectId, deletedAt: null },
        select: { id: true },
      });
      if (!task) {
        throw AppError.badRequest('Task does not belong to this project');
      }
    }

    // Evidence file (screenshot/video of the run), when provided, must be a
    // file asset belonging to this project.
    if (input.evidenceFileId) {
      const evidence = await prisma.fileAsset.findFirst({
        where: { id: input.evidenceFileId, projectId: testCase.projectId, deletedAt: null },
        select: { id: true },
      });
      if (!evidence) {
        throw AppError.badRequest('Evidence file does not belong to this project');
      }
    }

    let spawnedBugId: string | null = null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Record TestRun
      const testRun = await tx.testRun.create({
        data: {
          testCaseId: input.testCaseId,
          taskId: input.taskId || null,
          executedById: actor.id,
          result: input.result,
          actualResult: input.actualResult,
          notes: input.notes || null,
          evidenceFileId: input.evidenceFileId || null,
        },
        include: {
          executedBy: { include: { profile: true } },
        },
      });

      // 2. If test failed, check if active bug exists; if not, spawn one!
      if (input.result === TestRunResult.FAIL) {
        const existingOpenBug = await tx.bug.findFirst({
          where: {
            testCaseId: input.testCaseId,
            status: { in: [BugStatus.OPEN, BugStatus.TRIAGED, BugStatus.IN_PROGRESS, BugStatus.REOPENED] },
          },
        });

        if (!existingOpenBug) {
          const bug = await tx.bug.create({
            data: {
              projectId: testCase.projectId,
              requirementId: testCase.requirementId,
              taskId: input.taskId || null,
              testCaseId: input.testCaseId,
              title: `[Test Failure] ${testCase.title}`,
              description: `Automated bug generated from failed test run.\nActual Result: ${input.actualResult}`,
              severity: BugSeverity.HIGH,
              priority: BugPriority.HIGH,
              stepsToReproduce: testCase.steps,
              expectedResult: testCase.expectedResult,
              actualResult: input.actualResult,
              reporterId: actor.id,
              status: BugStatus.OPEN,
            },
          });
          spawnedBugId = bug.id;
        }
      }

      return testRun;
    });

    // 3. Post-transaction logs and notifications
    if (input.result === TestRunResult.FAIL && spawnedBugId) {
      await activityService.log({
        projectId: testCase.projectId,
        actorId: actor.id,
        type: 'BUG_AUTO_SPAWNED',
        message: `Bug auto-created from failed test: "${testCase.title}"`,
        visibility: CommentVisibility.INTERNAL,
        entityType: 'Bug',
        entityId: spawnedBugId,
      });

      // Notify PM
      await notificationService.notify({
        userId: testCase.project.projectManagerId,
        type: NotificationType.BUG_ASSIGNED,
        title: 'QA Test Failed — Bug Created',
        message: `Test run failed on "${testCase.title}". Automated bug opened.`,
        entityType: 'Bug',
        entityId: spawnedBugId,
        linkUrl: `/app/projects/${testCase.projectId}?tab=qa&bugId=${spawnedBugId}`,
      });
    }

    return { testRun: result, spawnedBugId };
  }

  /**
   * Creates a manual bug report. Internal staff can report bugs directly;
   * clients may file portal feedback bugs scoped to their own organization.
   */
  async createBug(input: CreateBugInput, actor: AuthenticatedUser) {
    const allowedRoles = [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.QA,
      UserRole.CLIENT,
    ];
    if (!allowedRoles.includes(actor.role)) {
      throw AppError.forbidden('Only QA and Administrators can report bugs');
    }

    await assertProjectWritable(actor, input.projectId);

    // Clients may not assign internal staff to bugs they report.
    if (actor.role === UserRole.CLIENT && input.assigneeId) {
      throw AppError.forbidden('Clients cannot assign internal staff to bugs');
    }

    // Developers may not arbitrarily triage/assign bugs to other users.
    if (actor.role === UserRole.DEVELOPER && input.assigneeId && input.assigneeId !== actor.id) {
      throw AppError.forbidden('Developers cannot assign bugs to other users');
    }

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) {
      throw AppError.notFound('Project not found');
    }

    // Cross-entity assignment validation.
    if (input.requirementId) {
      const req = await prisma.requirement.findFirst({
        where: { id: input.requirementId, projectId: input.projectId, deletedAt: null },
        select: { id: true },
      });
      if (!req) throw AppError.badRequest('Requirement does not belong to this project');
    }
    if (input.taskId) {
      const task = await prisma.task.findFirst({
        where: { id: input.taskId, projectId: input.projectId, deletedAt: null },
        select: { id: true },
      });
      if (!task) throw AppError.badRequest('Task does not belong to this project');
    }
    if (input.testCaseId) {
      const testCase = await prisma.testCase.findFirst({
        where: { id: input.testCaseId, projectId: input.projectId },
        select: { id: true },
      });
      if (!testCase) throw AppError.badRequest('Test case does not belong to this project');
    }

    // If assignee provided, verify project membership
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

    const bug = await prisma.bug.create({
      data: {
        projectId: input.projectId,
        requirementId: input.requirementId || null,
        taskId: input.taskId || null,
        testCaseId: input.testCaseId || null,
        title: input.title,
        description: input.description,
        severity: input.severity,
        priority: input.priority,
        stepsToReproduce: input.stepsToReproduce,
        expectedResult: input.expectedResult,
        actualResult: input.actualResult,
        environment: input.environment || null,
        reporterId: actor.id,
        assigneeId: input.assigneeId || null,
        status: BugStatus.OPEN,
      },
      include: {
        reporter: { include: { profile: true } },
        assignee: { include: { profile: true } },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'BUG_CREATED',
      entityType: 'Bug',
      entityId: bug.id,
      metadata: { title: bug.title, severity: bug.severity },
    });

    await activityService.log({
      projectId: bug.projectId,
      actorId: actor.id,
      type: 'BUG_REPORTED',
      message: `Bug reported: "${bug.title}" (${bug.severity})`,
      visibility: CommentVisibility.INTERNAL,
      entityType: 'Bug',
      entityId: bug.id,
    });

    if (bug.assigneeId && bug.assigneeId !== actor.id) {
      await notificationService.notify({
        userId: bug.assigneeId,
        type: NotificationType.BUG_ASSIGNED,
        title: 'Bug Assigned',
        message: `You were assigned bug "${bug.title}" (${bug.severity})`,
        entityType: 'Bug',
        entityId: bug.id,
        linkUrl: `/app/projects/${bug.projectId}?tab=qa&bugId=${bug.id}`,
      });
    }

    return bug;
  }

  /**
   * Updates bug status with transition + role enforcement.
   */
  async updateBugStatus(id: string, input: UpdateBugStatusInput, actor: AuthenticatedUser) {
    const bug = await prisma.bug.findUnique({
      where: { id },
      include: { project: true, reporter: true, assignee: true },
    });
    if (!bug) {
      throw AppError.notFound('Bug not found');
    }

    await requireProjectAccess(actor, bug.projectId);

    if (actor.role === UserRole.CLIENT) {
      throw AppError.forbidden('Clients cannot modify bug lifecycle status');
    }

    if (input.status === bug.status) {
      throw AppError.badRequest(`Bug is already in ${input.status} status`);
    }

    const allowedNext = BUG_TRANSITIONS[bug.status];
    if (!allowedNext.includes(input.status)) {
      throw AppError.forbidden(`Cannot move bug from ${bug.status} to ${input.status}`);
    }

    if (!STAFF_WITH_FULL_BUG_CONTROL.includes(actor.role as UserRole as any)) {
      const gate = BUG_STATUS_ENTRY_GATES[input.status];
      if (!gate || !gate.includes(actor.role as any)) {
        throw AppError.forbidden(`Your role cannot move a bug to ${input.status}`);
      }
    }

    // Developers and fixer assignees cannot QA-verify their own fix.
    if (input.status === BugStatus.CLOSED) {
      if (actor.role === UserRole.DEVELOPER) {
        throw AppError.forbidden('Developers cannot perform QA verification');
      }
      if (bug.assigneeId === actor.id && !STAFF_WITH_FULL_BUG_CONTROL.includes(actor.role as any)) {
        throw AppError.forbidden('Cannot QA-verify your own fix');
      }
    }

    const previousStatus = bug.status;
    const isNowResolved = (input.status === BugStatus.CLOSED || input.status === BugStatus.FIXED) && !bug.resolvedAt;
    const isReopened = (input.status === BugStatus.REOPENED || input.status === BugStatus.OPEN) && bug.resolvedAt;

    const updatedBug = await prisma.bug.update({
      where: { id },
      data: {
        status: input.status,
        ...(isNowResolved && { resolvedAt: new Date() }),
        ...(isReopened && { resolvedAt: null }),
      },
      include: {
        reporter: { include: { profile: true } },
        assignee: { include: { profile: true } },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'BUG_STATUS_CHANGED',
      entityType: 'Bug',
      entityId: bug.id,
      metadata: { fromStatus: previousStatus, toStatus: input.status, comment: input.comment },
    });

    // Persist the optional status-change note as a comment so it appears in
    // the bug timeline instead of being silently dropped.
    if (input.comment?.trim()) {
      await prisma.bugComment.create({
        data: {
          bugId: bug.id,
          authorId: actor.id,
          content: input.comment,
          visibility: CommentVisibility.INTERNAL,
        },
      });
    }

    await activityService.log({
      projectId: bug.projectId,
      actorId: actor.id,
      type: 'BUG_STATUS_UPDATED',
      message: `Bug "${bug.title}" status changed to ${input.status}`,
      visibility: CommentVisibility.INTERNAL,
      entityType: 'Bug',
      entityId: bug.id,
    });

    // Retest cycle: if bug is marked READY_FOR_RETEST, notify QA reporter immediately!
    if (input.status === BugStatus.READY_FOR_RETEST) {
      const reporter = await prisma.user.findUnique({
        where: { id: bug.reporterId },
        select: { role: true },
      });
      const isClientReporter = reporter?.role === UserRole.CLIENT;
      await notificationService.notify({
        userId: bug.reporterId,
        type: NotificationType.BUG_READY_FOR_RETEST,
        title: 'Bug Ready for Retest',
        message: `Bug "${bug.title}" is ready for QA retest.`,
        entityType: 'Bug',
        entityId: bug.id,
        // Clients must land in the portal, never the internal app workspace.
        linkUrl: isClientReporter
          ? `/portal/projects/${bug.projectId}`
          : `/app/projects/${bug.projectId}?tab=qa&bugId=${bug.id}`,
      });
    }

    return updatedBug;
  }

  /**
   * Adds comment to bug report (project access enforced; client visibility forced).
   */
  async addComment(bugId: string, input: CreateBugCommentInput, actor: AuthenticatedUser) {
    const bug = await prisma.bug.findUnique({ where: { id: bugId } });
    if (!bug) throw AppError.notFound('Bug not found');

    await requireProjectAccess(actor, bug.projectId);

    const visibility = actor.role === UserRole.CLIENT ? CommentVisibility.CLIENT_VISIBLE : input.visibility;

    return prisma.bugComment.create({
      data: {
        bugId,
        authorId: actor.id,
        content: input.content,
        visibility,
      },
      include: { author: { include: { profile: true } } },
    });
  }

  /**
   * Gets bug details by ID (project access enforced).
   */
  async getBugById(id: string, actor: AuthenticatedUser) {
    const bug = await prisma.bug.findUnique({
      where: { id },
      include: {
        project: { include: { organization: true } },
        reporter: { include: { profile: true } },
        assignee: { include: { profile: true } },
        requirement: { select: { id: true, title: true } },
        task: { select: { id: true, title: true } },
        testCase: true,
        comments: {
          where: actor.role === UserRole.CLIENT ? { visibility: CommentVisibility.CLIENT_VISIBLE } : undefined,
          include: { author: { include: { profile: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!bug) throw AppError.notFound('Bug not found');

    await requireProjectAccess(actor, bug.projectId);

    // Clients see a sanitized bug payload: internal-only corner fields such
    // as the reproduction environment are stripped to avoid leaking staff
    // context beyond the portal feedback surface.
    if (actor.role === UserRole.CLIENT) {
      const { environment, ...sanitized } = bug as any;
      return sanitized;
    }

    return bug;
  }

  /**
   * Lists bugs with filtering and pagination, scoped to accessible projects.
   */
  async listBugs(query: PaginationQueryInput, actor: AuthenticatedUser) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const accessible = await getAccessibleProjectIds(actor);

    const where: any = {};
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
    if (query.priority) where.priority = query.priority;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [bugs, total] = await Promise.all([
      prisma.bug.findMany({
        where,
        include: {
          reporter: { include: { profile: true } },
          assignee: { include: { profile: true } },
          project: { select: { id: true, name: true, code: true } },
          _count: { select: { comments: true } },
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.bug.count({ where }),
    ]);

    if (actor.role === UserRole.CLIENT) {
      const sanitized = bugs.map(({ environment, ...rest }: any) => rest);
      return { bugs: sanitized, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    }

    return { bugs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}

export const qaService = new QaService();