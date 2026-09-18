import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import {
  UserRole,
  BugStatus,
  BugSeverity,
  BugPriority,
  TestRunResult,
  CommentVisibility,
  NotificationType,
  CreateTestCaseInput,
  ExecuteTestRunInput,
  CreateBugInput,
  UpdateBugStatusInput,
  CreateBugCommentInput,
  PaginationQueryInput,
} from '@deliveryos/shared';

export class QaService {
  /**
   * Creates a test case for a project/requirement.
   */
  async createTestCase(input: CreateTestCaseInput, creatorId: string) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) {
      throw AppError.notFound('Project not found');
    }

    const testCase = await prisma.testCase.create({
      data: {
        projectId: input.projectId,
        requirementId: input.requirementId || null,
        title: input.title,
        steps: input.steps,
        expectedResult: input.expectedResult,
        createdById: creatorId,
      },
      include: {
        createdBy: { include: { profile: true } },
        requirement: true,
      },
    });

    await auditService.log({
      actorId: creatorId,
      action: 'TEST_CASE_CREATED',
      entityType: 'TestCase',
      entityId: testCase.id,
      metadata: { title: testCase.title, projectId: testCase.projectId },
    });

    return testCase;
  }

  /**
   * Lists test cases for a project.
   */
  async listTestCases(query: PaginationQueryInput) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.projectId) where.projectId = query.projectId;
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
   * Executes a test run.
   * If the result is FAIL, an automated Bug is spawned inside a transaction
   * (unless an active open bug for this test case already exists).
   */
  async executeTestRun(input: ExecuteTestRunInput, executedById: string) {
    const testCase = await prisma.testCase.findUnique({
      where: { id: input.testCaseId },
      include: { project: true },
    });
    if (!testCase) {
      throw AppError.notFound('Test case not found');
    }

    let spawnedBugId: string | null = null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Record TestRun
      const testRun = await tx.testRun.create({
        data: {
          testCaseId: input.testCaseId,
          taskId: input.taskId || null,
          executedById,
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
            status: { in: [BugStatus.OPEN, BugStatus.TRIAGED, BugStatus.IN_PROGRESS] },
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
              reporterId: executedById,
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
        actorId: executedById,
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
        linkUrl: `/app/projects/${testCase.projectId}?tab=bugs&bugId=${spawnedBugId}`,
      });
    }

    return { testRun: result, spawnedBugId };
  }

  /**
   * Creates a manual bug report.
   */
  async createBug(input: CreateBugInput, reporterId: string) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) {
      throw AppError.notFound('Project not found');
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
        reporterId,
        assigneeId: input.assigneeId || null,
        status: BugStatus.OPEN,
      },
      include: {
        reporter: { include: { profile: true } },
        assignee: { include: { profile: true } },
      },
    });

    await auditService.log({
      actorId: reporterId,
      action: 'BUG_CREATED',
      entityType: 'Bug',
      entityId: bug.id,
      metadata: { title: bug.title, severity: bug.severity },
    });

    await activityService.log({
      projectId: bug.projectId,
      actorId: reporterId,
      type: 'BUG_REPORTED',
      message: `Bug reported: "${bug.title}" (${bug.severity})`,
      visibility: CommentVisibility.INTERNAL,
      entityType: 'Bug',
      entityId: bug.id,
    });

    if (bug.assigneeId && bug.assigneeId !== reporterId) {
      await notificationService.notify({
        userId: bug.assigneeId,
        type: NotificationType.BUG_ASSIGNED,
        title: 'Bug Assigned',
        message: `You were assigned bug "${bug.title}" (${bug.severity})`,
        entityType: 'Bug',
        entityId: bug.id,
        linkUrl: `/app/projects/${bug.projectId}?tab=bugs&bugId=${bug.id}`,
      });
    }

    return bug;
  }

  /**
   * Updates bug status and handles retest notifications.
   */
  async updateBugStatus(id: string, input: UpdateBugStatusInput, actorId: string, actorRole: UserRole) {
    const bug = await prisma.bug.findUnique({
      where: { id },
      include: { project: true, reporter: true, assignee: true },
    });
    if (!bug) {
      throw AppError.notFound('Bug not found');
    }

    // Clients cannot change bug status directly
    if (actorRole === UserRole.CLIENT) {
      throw AppError.forbidden('Clients cannot modify bug lifecycle status');
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
      actorId,
      action: 'BUG_STATUS_CHANGED',
      entityType: 'Bug',
      entityId: bug.id,
      metadata: { fromStatus: previousStatus, toStatus: input.status, comment: input.comment },
    });

    await activityService.log({
      projectId: bug.projectId,
      actorId,
      type: 'BUG_STATUS_UPDATED',
      message: `Bug "${bug.title}" status changed to ${input.status}`,
      visibility: CommentVisibility.INTERNAL,
      entityType: 'Bug',
      entityId: bug.id,
    });

    // Retest cycle: if bug is marked READY_FOR_RETEST, notify QA reporter immediately!
    if (input.status === BugStatus.READY_FOR_RETEST) {
      await notificationService.notify({
        userId: bug.reporterId,
        type: NotificationType.BUG_READY_FOR_RETEST,
        title: 'Bug Ready for Retest',
        message: `Bug "${bug.title}" is ready for QA retest.`,
        entityType: 'Bug',
        entityId: bug.id,
        linkUrl: `/app/projects/${bug.projectId}?tab=bugs&bugId=${bug.id}`,
      });
    }

    return updatedBug;
  }

  /**
   * Adds comment to bug report.
   */
  async addComment(bugId: string, input: CreateBugCommentInput, authorId: string, authorRole: UserRole) {
    const bug = await prisma.bug.findUnique({ where: { id: bugId } });
    if (!bug) throw AppError.notFound('Bug not found');

    const visibility = authorRole === UserRole.CLIENT ? CommentVisibility.CLIENT_VISIBLE : input.visibility;

    return prisma.bugComment.create({
      data: {
        bugId,
        authorId,
        content: input.content,
        visibility,
      },
      include: { author: { include: { profile: true } } },
    });
  }

  /**
   * Gets bug details by ID.
   */
  async getBugById(id: string, userRole: UserRole, userOrgId?: string | null) {
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
          where: userRole === UserRole.CLIENT ? { visibility: CommentVisibility.CLIENT_VISIBLE } : undefined,
          include: { author: { include: { profile: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!bug) throw AppError.notFound('Bug not found');

    if (userRole === UserRole.CLIENT && bug.project.organizationId !== userOrgId) {
      throw AppError.notFound('Bug not found');
    }

    return bug;
  }

  /**
   * Lists bugs with filtering and pagination.
   */
  async listBugs(query: PaginationQueryInput, userRole: UserRole, userOrgId?: string | null) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.projectId) where.projectId = query.projectId;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (userRole === UserRole.CLIENT) {
      where.project = { organizationId: userOrgId, deletedAt: null };
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

    return { bugs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}

export const qaService = new QaService();
