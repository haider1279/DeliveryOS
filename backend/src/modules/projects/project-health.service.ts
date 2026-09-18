import { prisma } from '../../config/prisma';
import { ProjectHealthStatus, TaskStatus, BugSeverity, BugStatus } from '@deliveryos/shared';
import type { ProjectHealthResult } from '@deliveryos/shared';

const BUSINESS_DAYS_MS = 2 * 24 * 60 * 60 * 1000; // 2 business days approx
const AT_RISK_DEADLINE_DAYS = 7;
const AT_RISK_OVERDUE_TASKS = 3;
const AT_RISK_MIN_PROGRESS = 0.7; // 70% expected at 7 days before deadline

/**
 * Computes deterministic project health from real database signals.
 * Always returns reasons alongside the status — never a bare badge.
 */
export async function computeProjectHealth(projectId: string): Promise<ProjectHealthResult> {
  const now = new Date();

  const [project, tasks, bugs, pendingApprovals] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { targetDate: true, status: true },
    }),
    prisma.task.findMany({
      where: { projectId, deletedAt: null, status: { notIn: ['CANCELLED'] } },
      select: { id: true, status: true, dueDate: true },
    }),
    prisma.bug.findMany({
      where: {
        projectId,
        status: { notIn: [BugStatus.CLOSED, BugStatus.WONT_FIX] },
      },
      select: { severity: true },
    }),
    prisma.requirementStatusHistory.findMany({
      where: {
        requirement: { projectId },
        toStatus: 'WAITING_FOR_APPROVAL',
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, requirementId: true },
    }),
  ]);

  const reasons: string[] = [];
  let status: ProjectHealthStatus = ProjectHealthStatus.ON_TRACK;

  if (!project) return { status: ProjectHealthStatus.ON_TRACK, reasons: [], metrics: { progressPercent: null, overdueTasksCount: 0, openBlockedTasksCount: 0, criticalBugsCount: 0, pendingApprovalDays: null, daysUntilDeadline: null } };

  const isTerminal = ['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(project.status);

  // --- DELAYED check ---
  const daysUntilDeadline = project.targetDate
    ? Math.floor((project.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  if (project.targetDate && now > project.targetDate && !isTerminal) {
    reasons.push(`Project is past its target completion date (${project.targetDate.toDateString()})`);
    status = ProjectHealthStatus.DELAYED;
  }

  // --- BLOCKED check ---
  const blockedTasks = tasks.filter((t) => t.status === TaskStatus.BLOCKED);
  const openBlockedTasksCount = blockedTasks.length;
  if (openBlockedTasksCount > 0) {
    reasons.push(`${openBlockedTasksCount} task${openBlockedTasksCount > 1 ? 's are' : ' is'} blocked`);
    if (status !== ProjectHealthStatus.DELAYED) status = ProjectHealthStatus.BLOCKED;
  }

  // --- AT_RISK checks ---
  const overdueTasks = tasks.filter((t) =>
    t.dueDate && t.dueDate < now && !['DONE', 'CANCELLED'].includes(t.status)
  );
  const overdueTasksCount = overdueTasks.length;

  const criticalBugs = bugs.filter((b) => b.severity === BugSeverity.CRITICAL);
  const criticalBugsCount = criticalBugs.length;

  // Pending approval duration check (oldest waiting requirement)
  let pendingApprovalDays: number | null = null;
  const waitingReqs = await prisma.requirement.findMany({
    where: { projectId, status: 'WAITING_FOR_APPROVAL' },
    select: { id: true, updatedAt: true },
  });
  if (waitingReqs.length > 0) {
    const oldest = waitingReqs.reduce((a, b) => a.updatedAt < b.updatedAt ? a : b);
    pendingApprovalDays = Math.floor((now.getTime() - oldest.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  if (overdueTasksCount >= AT_RISK_OVERDUE_TASKS) {
    reasons.push(`${overdueTasksCount} tasks are overdue`);
    if (status === ProjectHealthStatus.ON_TRACK) status = ProjectHealthStatus.AT_RISK;
  }

  if (criticalBugsCount > 0) {
    reasons.push(`${criticalBugsCount} critical bug${criticalBugsCount > 1 ? 's' : ''} open`);
    if (status === ProjectHealthStatus.ON_TRACK) status = ProjectHealthStatus.AT_RISK;
  }

  if (pendingApprovalDays !== null && pendingApprovalDays > 2) {
    reasons.push(`Client approval has been pending for ${pendingApprovalDays} day${pendingApprovalDays > 1 ? 's' : ''}`);
    if (status === ProjectHealthStatus.ON_TRACK) status = ProjectHealthStatus.AT_RISK;
  }

  // Near-deadline with low progress
  const doneTasks = tasks.filter((t) => t.status === TaskStatus.DONE).length;
  const totalEligibleTasks = tasks.filter((t) => t.status !== 'CANCELLED').length;

  const completedRequirements = await prisma.requirement.count({
    where: { projectId, status: 'COMPLETED', deletedAt: null },
  });
  const totalRequirements = await prisma.requirement.count({
    where: { projectId, status: { not: 'CANCELLED' }, deletedAt: null },
  });

  const totalEligible = totalEligibleTasks + totalRequirements;
  const totalCompleted = doneTasks + completedRequirements;
  const progressPercent = totalEligible > 0 ? (totalCompleted / totalEligible) : null;

  if (
    daysUntilDeadline !== null &&
    daysUntilDeadline <= AT_RISK_DEADLINE_DAYS &&
    daysUntilDeadline > 0 &&
    progressPercent !== null &&
    progressPercent < AT_RISK_MIN_PROGRESS
  ) {
    reasons.push(
      `Deadline in ${daysUntilDeadline} days with only ${Math.round((progressPercent ?? 0) * 100)}% progress completed`
    );
    if (status === ProjectHealthStatus.ON_TRACK) status = ProjectHealthStatus.AT_RISK;
  }

  return {
    status,
    reasons,
    metrics: {
      progressPercent: progressPercent !== null ? Math.round(progressPercent * 100) : null,
      overdueTasksCount,
      openBlockedTasksCount,
      criticalBugsCount,
      pendingApprovalDays,
      daysUntilDeadline,
    },
  };
}
