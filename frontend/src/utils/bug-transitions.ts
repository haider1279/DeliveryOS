import { BugStatus, UserRole } from '@deliveryos/shared';

/**
 * Authoritative frontend representation of bug transitions and entry gates,
 * ensuring UI controls only present actions authorized by the backend state machine.
 */
export const BUG_TRANSITIONS: Record<BugStatus, readonly BugStatus[]> = {
  [BugStatus.OPEN]: [BugStatus.TRIAGED, BugStatus.WONT_FIX],
  [BugStatus.TRIAGED]: [BugStatus.IN_PROGRESS, BugStatus.WONT_FIX, BugStatus.OPEN],
  [BugStatus.IN_PROGRESS]: [BugStatus.READY_FOR_RETEST, BugStatus.FIXED],
  [BugStatus.FIXED]: [BugStatus.READY_FOR_RETEST, BugStatus.REOPENED],
  [BugStatus.READY_FOR_RETEST]: [BugStatus.CLOSED, BugStatus.REOPENED],
  [BugStatus.CLOSED]: [BugStatus.REOPENED],
  [BugStatus.WONT_FIX]: [BugStatus.REOPENED, BugStatus.OPEN],
  [BugStatus.REOPENED]: [BugStatus.TRIAGED, BugStatus.IN_PROGRESS, BugStatus.WONT_FIX],
};

export const BUG_STATUS_ENTRY_GATES: Record<BugStatus, readonly UserRole[]> = {
  [BugStatus.OPEN]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA, UserRole.CLIENT],
  [BugStatus.TRIAGED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA],
  [BugStatus.IN_PROGRESS]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.DEVELOPER],
  [BugStatus.FIXED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.DEVELOPER],
  [BugStatus.READY_FOR_RETEST]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.DEVELOPER, UserRole.QA],
  [BugStatus.CLOSED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.QA], // Strict: Developer and PM CANNOT close
  [BugStatus.REOPENED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.QA, UserRole.PROJECT_MANAGER],
  [BugStatus.WONT_FIX]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA],
};

export function getAvailableBugTransitions(
  currentStatus: BugStatus,
  role?: UserRole | null
): BugStatus[] {
  if (!role || role === UserRole.CLIENT) {
    return [currentStatus];
  }

  const allowedNext = BUG_TRANSITIONS[currentStatus] || [];
  const permitted = allowedNext.filter((nextStatus) => {
    const entryRoles = BUG_STATUS_ENTRY_GATES[nextStatus];
    return !entryRoles || entryRoles.includes(role);
  });

  return [currentStatus, ...permitted];
}
