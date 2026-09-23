import { prisma } from '../../config/prisma';
import { TaskStatus, BugStatus, InvoiceStatus, TestRunResult, UserRole, AuthenticatedUser } from '@deliveryos/shared';
import { getAccessibleProjectIds } from '../../services/project-access.service';

export class ReportService {
  /**
   * Project filter for the given actor. Returns {} for SaaS/agency admins
   * (all data) and { id: { in: [...] } } for PMs (assigned projects only).
   */
  private async scopedWhere(actor: AuthenticatedUser): Promise<any> {
    const accessible = await getAccessibleProjectIds(actor);
    if (accessible === null) return {};
    return { id: { in: accessible } };
  }

  private async scopedProjectIds(actor: AuthenticatedUser): Promise<string[] | null> {
    return getAccessibleProjectIds(actor);
  }

  async getExecutiveSummary(actor: AuthenticatedUser) {
    const accessibleProjectIds = await this.scopedProjectIds(actor);
    const projectScope = accessibleProjectIds !== null ? { projectId: { in: accessibleProjectIds } } : {};

    const [
      activeProjects,
      openTasksCount,
      openBugsCount,
      invoices,
    ] = await Promise.all([
      prisma.project.findMany({
        where: { status: 'ACTIVE', deletedAt: null, ...(accessibleProjectIds !== null ? { id: { in: accessibleProjectIds } } : {}) },
        select: { id: true },
      }),
      prisma.task.count({
        where: {
          deletedAt: null,
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
          ...projectScope,
        },
      }),
      prisma.bug.count({
        where: {
          status: { notIn: [BugStatus.CLOSED, BugStatus.WONT_FIX] },
          ...projectScope,
        },
      }),
      prisma.invoice.findMany({
        where: { deletedAt: null, status: { not: InvoiceStatus.VOID }, ...projectScope },
        include: { payments: true },
      }),
    ]);

    const totalInvoicedAmount = invoices.reduce((sum, i) => sum + Number(i.total), 0);
    const totalCollectedAmount = invoices.reduce(
      (sum, i) => sum + i.payments.reduce((s, p) => s + Number(p.amount), 0),
      0
    );
    const outstandingAmount = Math.max(0, totalInvoicedAmount - totalCollectedAmount);

    return {
      activeProjectsCount: activeProjects.length,
      openTasksCount,
      openBugsCount,
      totalInvoicedAmount: Number(totalInvoicedAmount.toFixed(2)),
      totalCollectedAmount: Number(totalCollectedAmount.toFixed(2)),
      outstandingAmount: Number(outstandingAmount.toFixed(2)),
    };
  }

  async getDeveloperWorkload(actor: AuthenticatedUser) {
    const accessibleProjectIds = await this.scopedProjectIds(actor);

    // For PMs, workload is limited to members of their assigned projects.
    let memberUserIds: string[] | null = null;
    if (accessibleProjectIds !== null && accessibleProjectIds.length > 0) {
      const members = await prisma.projectMember.findMany({
        where: { projectId: { in: accessibleProjectIds }, leftAt: null },
        select: { userId: true },
        distinct: ['userId'],
      });
      memberUserIds = members.map((m) => m.userId);
    }

    const developers = await prisma.user.findMany({
      where: {
        role: { in: [UserRole.DEVELOPER, UserRole.PROJECT_MANAGER] },
        status: 'ACTIVE',
        ...(memberUserIds !== null && memberUserIds.length > 0 ? { id: { in: memberUserIds } } : {}),
        ...(memberUserIds !== null && memberUserIds.length === 0 ? { id: '__none__' } : {}),
      },
      include: {
        profile: true,
        assignedTasks: {
          where: {
            deletedAt: null,
            ...(accessibleProjectIds !== null ? { projectId: { in: accessibleProjectIds } } : {}),
          },
          select: { id: true, status: true, estimatedHours: true, actualHours: true },
        },
        timeEntries: {
          where: accessibleProjectIds !== null ? { projectId: { in: accessibleProjectIds } } : undefined,
          select: { durationMinutes: true, date: true },
        },
      },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return developers.map((dev) => {
      const activeTasks = dev.assignedTasks.filter(
        (t) => t.status !== TaskStatus.DONE && t.status !== TaskStatus.CANCELLED
      );
      const completedTasks = dev.assignedTasks.filter((t) => t.status === TaskStatus.DONE);

      const recentMinutes = dev.timeEntries
        .filter((te) => new Date(te.date) >= thirtyDaysAgo)
        .reduce((sum, te) => sum + te.durationMinutes, 0);

      const allMinutes = dev.timeEntries.reduce((sum, te) => sum + te.durationMinutes, 0);

      return {
        userId: dev.id,
        name: dev.profile?.displayName || `${dev.profile?.firstName || ''} ${dev.profile?.lastName || ''}`.trim() || dev.email,
        email: dev.email,
        role: dev.role,
        activeTasksCount: activeTasks.length,
        completedTasksCount: completedTasks.length,
        hoursLoggedPast30Days: Number((recentMinutes / 60).toFixed(1)),
        totalHoursLogged: Number((allMinutes / 60).toFixed(1)),
      };
    });
  }

  async getQaMetrics(actor: AuthenticatedUser) {
    const accessibleProjectIds = await this.scopedProjectIds(actor);
    const testRunScope =
      accessibleProjectIds !== null ? { testCase: { projectId: { in: accessibleProjectIds } } } : {};
    const bugScope = accessibleProjectIds !== null ? { projectId: { in: accessibleProjectIds } } : {};

    const [totalRuns, passedRuns, failedRuns, bugs] = await Promise.all([
      prisma.testRun.count({ where: testRunScope }),
      prisma.testRun.count({ where: { ...testRunScope, result: TestRunResult.PASS } }),
      prisma.testRun.count({ where: { ...testRunScope, result: TestRunResult.FAIL } }),
      prisma.bug.findMany({
        where: bugScope,
        select: { severity: true, status: true },
      }),
    ]);

    const passRate = totalRuns > 0 ? Number(((passedRuns / totalRuns) * 100).toFixed(1)) : 0;

    const bugsBySeverity = bugs.reduce(
      (acc, bug) => {
        acc[bug.severity] = (acc[bug.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const openBugs = bugs.filter((b) => b.status !== BugStatus.CLOSED && b.status !== BugStatus.WONT_FIX).length;

    return {
      totalTestRuns: totalRuns,
      passedRuns,
      failedRuns,
      passRatePercentage: passRate,
      totalBugs: bugs.length,
      openBugs,
      bugsBySeverity,
    };
  }

  async getFinancialOverview(actor: AuthenticatedUser) {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null, ...(await this.scopedWhere(actor)) },
      include: {
        organization: { select: { id: true, name: true } },
        invoices: {
          where: { deletedAt: null, status: { not: InvoiceStatus.VOID } },
          include: { payments: true },
        },
      },
    });

    return projects.map((p) => {
      let invoiced = 0;
      let collected = 0;

      for (const inv of p.invoices) {
        invoiced += Number(inv.total);
        collected += inv.payments.reduce((sum, pay) => sum + Number(pay.amount), 0);
      }

      return {
        projectId: p.id,
        projectName: p.name,
        projectCode: p.code,
        organizationName: p.organization.name,
        status: p.status,
        currency: p.currency,
        totalInvoiced: Number(invoiced.toFixed(2)),
        totalCollected: Number(collected.toFixed(2)),
        outstanding: Number(Math.max(0, invoiced - collected).toFixed(2)),
      };
    });
  }
}

export const reportService = new ReportService();