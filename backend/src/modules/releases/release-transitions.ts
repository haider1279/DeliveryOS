import { ReleaseStatus, UserRole } from '@deliveryos/shared';

/**
 * Authoritative release lifecycle state machine.
 *
 * Workflow:
 *   PLANNED -> IN_PROGRESS -> READY (QA Gate) -> DEPLOYED -> ROLLED_BACK
 */
export const RELEASE_TRANSITIONS: Record<ReleaseStatus, readonly ReleaseStatus[]> = {
  [ReleaseStatus.PLANNED]: [ReleaseStatus.IN_PROGRESS, ReleaseStatus.CANCELLED],
  [ReleaseStatus.IN_PROGRESS]: [ReleaseStatus.READY, ReleaseStatus.CANCELLED],
  [ReleaseStatus.READY]: [ReleaseStatus.DEPLOYED, ReleaseStatus.IN_PROGRESS, ReleaseStatus.CANCELLED],
  [ReleaseStatus.DEPLOYED]: [ReleaseStatus.ROLLED_BACK],
  [ReleaseStatus.ROLLED_BACK]: [ReleaseStatus.PLANNED, ReleaseStatus.IN_PROGRESS],
  [ReleaseStatus.CANCELLED]: [ReleaseStatus.PLANNED],
};

/**
 * Role entry gates for each release status:
 * - READY (QA signoff): QA, PM, Admin
 * - DEPLOYED (Production deployment): PM, Admin. QA cannot deploy. Developer cannot deploy.
 */
export const RELEASE_STATUS_ENTRY_GATES: Record<ReleaseStatus, readonly UserRole[]> = {
  [ReleaseStatus.PLANNED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER],
  [ReleaseStatus.IN_PROGRESS]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER],
  [ReleaseStatus.READY]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA],
  [ReleaseStatus.DEPLOYED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER],
  [ReleaseStatus.ROLLED_BACK]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER],
  [ReleaseStatus.CANCELLED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER],
};

export const CLIENT_VISIBLE_RELEASE_STATUSES = [ReleaseStatus.DEPLOYED, ReleaseStatus.ROLLED_BACK];
