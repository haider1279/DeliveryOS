import { describe, it, expect } from 'vitest';
import { RequirementStatus, UserRole } from '@deliveryos/shared';
import { validateRequirementTransition } from '../../src/modules/requirements/requirement-transitions';

describe('Requirement State Machine Transitions', () => {
  it('allows PM to move SUBMITTED to UNDER_REVIEW', () => {
    const result = validateRequirementTransition(
      RequirementStatus.SUBMITTED,
      RequirementStatus.UNDER_REVIEW,
      UserRole.PROJECT_MANAGER
    );
    expect(result.allowed).toBe(true);
  });

  it('allows PM to move UNDER_REVIEW to ESTIMATING', () => {
    const result = validateRequirementTransition(
      RequirementStatus.UNDER_REVIEW,
      RequirementStatus.ESTIMATING,
      UserRole.PROJECT_MANAGER
    );
    expect(result.allowed).toBe(true);
  });

  it('rejects Developer attempting to approve estimate (WAITING_FOR_APPROVAL -> APPROVED)', () => {
    const result = validateRequirementTransition(
      RequirementStatus.WAITING_FOR_APPROVAL,
      RequirementStatus.APPROVED,
      UserRole.DEVELOPER
    );
    expect(result.allowed).toBe(false);
  });

  it('rejects illegal transition from DRAFT straight to COMPLETED', () => {
    const result = validateRequirementTransition(
      RequirementStatus.DRAFT,
      RequirementStatus.COMPLETED,
      UserRole.SUPER_ADMIN
    );
    expect(result.allowed).toBe(false);
  });

  it('allows QA to advance IN_DEVELOPMENT to QA', () => {
    const result = validateRequirementTransition(
      RequirementStatus.IN_DEVELOPMENT,
      RequirementStatus.QA,
      UserRole.QA
    );
    expect(result.allowed).toBe(true);
  });

  it('allows QA to advance QA to CLIENT_REVIEW', () => {
    const result = validateRequirementTransition(
      RequirementStatus.QA,
      RequirementStatus.CLIENT_REVIEW,
      UserRole.QA
    );
    expect(result.allowed).toBe(true);
  });
});
