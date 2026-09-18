import { RequirementStatus, UserRole } from '@deliveryos/shared';

/**
 * The authoritative state transition map for Requirements.
 * Every status-changing endpoint must consult this map.
 * No transition is permitted unless it appears here.
 */
export interface TransitionDefinition {
  to: RequirementStatus;
  allowedRoles: UserRole[];
}

export const REQUIREMENT_TRANSITIONS: Record<RequirementStatus, TransitionDefinition[]> = {
  [RequirementStatus.DRAFT]: [
    { to: RequirementStatus.SUBMITTED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.CLIENT] },
  ],
  [RequirementStatus.SUBMITTED]: [
    { to: RequirementStatus.UNDER_REVIEW, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.NEEDS_CLARIFICATION, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.UNDER_REVIEW]: [
    { to: RequirementStatus.ESTIMATING, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.NEEDS_CLARIFICATION, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.NEEDS_CLARIFICATION]: [
    { to: RequirementStatus.UNDER_REVIEW, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.CLIENT] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.ESTIMATING]: [
    { to: RequirementStatus.WAITING_FOR_APPROVAL, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.NEEDS_CLARIFICATION, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.WAITING_FOR_APPROVAL]: [
    { to: RequirementStatus.APPROVED, allowedRoles: [UserRole.CLIENT] },
    { to: RequirementStatus.REJECTED, allowedRoles: [UserRole.CLIENT] },
    { to: RequirementStatus.NEEDS_CLARIFICATION, allowedRoles: [UserRole.CLIENT, UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.APPROVED]: [
    { to: RequirementStatus.IN_DEVELOPMENT, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.REJECTED]: [
    { to: RequirementStatus.SUBMITTED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.IN_DEVELOPMENT]: [
    { to: RequirementStatus.QA, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.DEVELOPER, UserRole.QA] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.QA]: [
    { to: RequirementStatus.IN_DEVELOPMENT, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA] },
    { to: RequirementStatus.CLIENT_REVIEW, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.CLIENT_REVIEW]: [
    { to: RequirementStatus.COMPLETED, allowedRoles: [UserRole.CLIENT] },
    { to: RequirementStatus.IN_DEVELOPMENT, allowedRoles: [UserRole.CLIENT, UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
    { to: RequirementStatus.CANCELLED, allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER] },
  ],
  [RequirementStatus.COMPLETED]: [
    // Terminal state — no further transitions
  ],
  [RequirementStatus.CANCELLED]: [
    // Terminal state — no further transitions
  ],
};

/**
 * Validates whether a given role can transition from one status to another.
 * Returns the matching transition definition or null if not allowed.
 */
export function validateTransition(
  fromStatus: RequirementStatus,
  toStatus: RequirementStatus,
  userRole: UserRole
): { valid: true } | { valid: false; reason: string } {
  const allowedTransitions = REQUIREMENT_TRANSITIONS[fromStatus] ?? [];

  const match = allowedTransitions.find((t) => t.to === toStatus);
  if (!match) {
    return {
      valid: false,
      reason: `Cannot transition requirement from ${fromStatus} to ${toStatus}. Not a valid workflow step.`,
    };
  }

  if (!match.allowedRoles.includes(userRole)) {
    return {
      valid: false,
      reason: `Your role (${userRole}) cannot perform the ${fromStatus} → ${toStatus} transition.`,
    };
  }

  return { valid: true };
}

/**
 * Helper function for transitions testing and validation checking.
 */
export function validateRequirementTransition(
  fromStatus: RequirementStatus,
  toStatus: RequirementStatus,
  userRole: UserRole
): { allowed: boolean; reason?: string } {
  const res = validateTransition(fromStatus, toStatus, userRole);
  return {
    allowed: res.valid,
    reason: res.valid ? undefined : res.reason,
  };
}
