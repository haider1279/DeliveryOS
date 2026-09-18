import { prisma } from '../../config/prisma';
import { TaskStatus, BugStatus, InvoiceStatus, TestRunResult, UserRole } from '@deliveryos/shared';

export class ReportService {
  async getExecutiveSummary() {
    const [
      activeProjectsCount,
      openTasksCount,
      openBugsCount,
      totalInvoiced,
      totalPaid,
    ] = await Promise.all([
      prisma.project.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.task.count({
        where: {
          deletedAt: null,
          status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
        },
      }),
      prisma.bug.count({
        where: {
          status: { notIn: [BugStatus.CLOSED, BugStatus.WONT_FIX] },
        },
      }),
      prisma.invoice.findMany({
        where: { deletedAt: null, status: { not: InvoiceStatus.VOID } },
        select: { total: true },
      }),
      prisma.payment.findMany({
        select: { amount: true },
      }),
    ]);

    const totalInvoicedAmount = totalInvoiced.reduce((sum, i) => sum + Number(i.total), 0);
    const totalCollectedAmount = totalPaid.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstandingAmount = Math.max(0, totalInvoicedAmount - totalCollectedAmount);

    return {
      activeProjectsCount,
      openTasksCount,
      openBugsCount,
      totalInvoicedAmount: Number(totalInvoicedAmount.toFixed(2)),
      totalCollectedAmount: Number(totalCollectedAmount.toFixed(2)),
      outstandingAmount: Number(outstandingAmount.toFixed(2)),
    };
  }

  async getDeveloperWorkload() {
    const developers = await prisma.user.findMany({
      where: {
        role: { in: [UserRole.DEVELOPER, UserRole.PROJECT_MANAGER] },
        status: 'ACTIVE',
      },
      include: {
        profile: true,
        assignedTasks: {
          where: { deletedAt: null },
          select: { id: true, status: true, estimatedHours: true, actualHours: true },
        },
        timeEntries: {
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

  async getQaMetrics() {
    const [totalRuns, passedRuns, failedRuns, bugs] = await Promise.all([
      prisma.testRun.count(),
      prisma.testRun.count({ where: { result: TestRunResult.PASS } }),
      prisma.testRun.count({ where: { result: TestRunResult.FAIL } }),
      prisma.bug.findMany({
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

  async getFinancialOverview() {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
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
