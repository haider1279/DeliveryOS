import { BugStatus, UserRole } from '@deliveryos/shared';

/**
 * The authoritative bug lifecycle transition graph.
 *
 * Flow:
 *   OPEN -> TRIAGED -> IN_PROGRESS -> READY_FOR_RETEST (or FIXED) -> CLOSED (QA-verified)
 *                                      └──> REOPENED (QA-rejected) -> IN_PROGRESS
 */
export const BUG_TRANSITIONS: Record<BugStatus, readonly BugStatus[]> = {
  [BugStatus.OPEN]: [BugStatus.TRIAGED, BugStatus.WONT_FIX],
  [BugStatus.TRIAGED]: [BugStatus.IN_PROGRESS, BugStatus.WONT_FIX, BugStatus.OPEN],
  [BugStatus.IN_PROGRESS]: [BugStatus.READY_FOR_RETEST, BugStatus.FIXED],
  [BugStatus.FIXED]: [BugStatus.READY_FOR_RETEST, BugStatus.IN_PROGRESS],
  [BugStatus.READY_FOR_RETEST]: [BugStatus.CLOSED, BugStatus.REOPENED],
  [BugStatus.REOPENED]: [BugStatus.IN_PROGRESS, BugStatus.TRIAGED, BugStatus.WONT_FIX],
  [BugStatus.CLOSED]: [BugStatus.REOPENED],
  [BugStatus.WONT_FIX]: [BugStatus.REOPENED, BugStatus.TRIAGED],
};

/**
 * Which roles are allowed to move a bug INTO a specific status.
 * Notice:
 * - CLOSED (QA Verification): Only QA and Admin/SuperAdmin. PM and Developer are strictly FORBIDDEN.
 * - TRIAGED: Only QA, PM, Admin/SuperAdmin. Developers cannot triage.
 * - IN_PROGRESS: Developers (to fix), QA, PM, Admin/SuperAdmin.
 * - READY_FOR_RETEST / FIXED: Developers, QA, Admin/SuperAdmin.
 */
export const BUG_STATUS_ENTRY_GATES: Record<BugStatus, readonly UserRole[]> = {
  [BugStatus.OPEN]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.QA, UserRole.PROJECT_MANAGER],
  [BugStatus.TRIAGED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.QA, UserRole.PROJECT_MANAGER],
  [BugStatus.IN_PROGRESS]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER],
  [BugStatus.FIXED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DEVELOPER, UserRole.QA],
  [BugStatus.READY_FOR_RETEST]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DEVELOPER, UserRole.QA],
  [BugStatus.REOPENED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.QA, UserRole.PROJECT_MANAGER],
  [BugStatus.CLOSED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.QA],
  [BugStatus.WONT_FIX]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.QA, UserRole.PROJECT_MANAGER],
};

export const STAFF_WITH_FULL_BUG_CONTROL: readonly UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
];
