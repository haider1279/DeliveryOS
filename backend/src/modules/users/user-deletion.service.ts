import { Prisma } from '@prisma/client';
import type { $Enums } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { getSupabaseAdmin } from '../../services/supabase-admin.service';
import { UserRole, AuthenticatedUser } from '@deliveryos/shared';

/**
 * `UserRole` is declared twice: as a TypeScript enum in @deliveryos/shared
 * (used for the authenticated actor) and as a string union in the generated
 * Prisma client (used for rows read from the database). Both carry identical
 * string values, so authority tables are keyed by string and accept either.
 */
type DbUserRole = $Enums.UserRole;

// ---------------------------------------------------------------------------
// Transaction retry
// ---------------------------------------------------------------------------

const MAX_TRANSACTION_ATTEMPTS = 3;
const TRANSACTION_RETRY_DELAY_MS = 25;

/**
 * Runs a SERIALIZABLE transaction, retrying if PostgreSQL aborts it with
 * `P2034` (write conflict / deadlock).
 *
 * This is an expected, self-resolving outcome whenever the delete races another
 * writer, so it must be retried rather than surfaced as a 500 to the caller.
 * The retry re-reads inside the transaction, so it also re-validates the
 * preconditions on each attempt instead of replaying a stale decision.
 */
async function withWriteConflictRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isWriteConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';

      if (!isWriteConflict || attempt >= MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, TRANSACTION_RETRY_DELAY_MS * attempt));
    }
  }
}

// ---------------------------------------------------------------------------
// Deletion authority
// ---------------------------------------------------------------------------

/**
 * Ranked authority per role. A target may only be deleted by an actor whose
 * rank is strictly greater than the target's, which is what keeps SUPER_ADMIN
 * above ADMIN and prevents an ADMIN from ever deleting a peer or a superior.
 */
const ROLE_AUTHORITY: Record<string, number> = {
  [UserRole.SUPER_ADMIN]: 40,
  [UserRole.ADMIN]: 30,
  [UserRole.BD]: 20,
  [UserRole.PROJECT_MANAGER]: 20,
  [UserRole.DEVELOPER]: 10,
  [UserRole.QA]: 10,
  [UserRole.CLIENT]: 10,
};

/** Only these roles may ever issue a delete. */
const DELETE_AUTHORITIES: ReadonlyArray<string> = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

/**
 * Roles an ADMIN may permanently delete. Deliberately excludes ADMIN and
 * SUPER_ADMIN: an ADMIN can never remove a peer administrator or a super
 * admin, which matches the existing invite/role-change authority rules in
 * user.service.ts.
 */
const ADMIN_DELETABLE_ROLES: ReadonlyArray<string> = [
  UserRole.BD,
  UserRole.PROJECT_MANAGER,
  UserRole.DEVELOPER,
  UserRole.QA,
  UserRole.CLIENT,
];

export interface DeletionBlocker {
  reason: string;
  detail: string;
}

export interface UserDeletionResult {
  deletedUserId: string;
  deletedEmail: string;
  deletedRole: DbUserRole;
  /** Human-readable summary of what was detached vs. what was preserved. */
  removed: {
    profile: boolean;
    projectMemberships: number;
    notifications: number;
    managedProjectsReassignment: null;
  };
  /** Counts of historical rows that were preserved with a NULL actor. */
  preserved: {
    auditLogs: number;
    projectActivities: number;
    payments: number;
    timeEntries: number;
    tasksCreated: number;
    tasksAssigned: number;
    bugsReported: number;
    bugsAssigned: number;
    requirementsSubmitted: number;
    requirementVersions: number;
    requirementStatusHistory: number;
    estimates: number;
    requirementApprovals: number;
    clientReviews: number;
    testCases: number;
    testRuns: number;
    releases: number;
    fileAssets: number;
    comments: number;
    projectRequests: number;
  };
  /** Non-fatal issues (e.g. the external identity could not be removed). */
  warnings: string[];
}

/**
 * Verifies that `actor` is allowed to permanently delete `target`.
 *
 * Every input is re-read from the database by the caller: the target's role,
 * id and organization are NEVER taken from the request, so swapping the
 * userId in a crafted request cannot escalate privileges (IDOR-safe).
 */
function assertDeletionAuthorized(actor: AuthenticatedUser, target: { id: string; role: DbUserRole }): void {
  if (!DELETE_AUTHORITIES.includes(actor.role)) {
    throw AppError.forbidden('Only administrators can delete user accounts');
  }

  // Self-deletion is refused for every role, including SUPER_ADMIN. This
  // schema has no system-owner escape hatch, so the safest reading of the
  // authority model is that an account can never remove itself.
  if (target.id === actor.id) {
    throw AppError.forbidden('You cannot delete your own account');
  }

  if (actor.role === UserRole.ADMIN && !ADMIN_DELETABLE_ROLES.includes(target.role)) {
    throw AppError.forbidden(
      target.role === UserRole.SUPER_ADMIN
        ? 'Only a super admin can delete a super admin account'
        : `You do not have permission to delete a ${target.role} account`
    );
  }

  // Defence in depth: enforce the strict authority inequality directly rather
  // than relying only on the ADMIN allow-list above.
  if (ROLE_AUTHORITY[actor.role] <= ROLE_AUTHORITY[target.role]) {
    throw AppError.forbidden('You do not have permission to delete this account');
  }
}

/**
 * Pre-flight integrity check.
 *
 * Runs BEFORE anything is written. If any required relationship cannot be
 * handled safely the whole deletion is rejected, so the database is never left
 * half-deleted.
 */
async function collectDeletionBlockers(userId: string): Promise<DeletionBlocker[]> {
  const blockers: DeletionBlocker[] = [];

  // A project must always have an accountable manager, so this FK stays
  // ON DELETE RESTRICT. Report exactly which projects are in the way instead of
  // letting a raw foreign-key error surface.
  const managedProjects = await prisma.project.findMany({
    where: { projectManagerId: userId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (managedProjects.length > 0) {
    blockers.push({
      reason: 'MANAGES_ACTIVE_PROJECTS',
      detail: `Still the project manager for ${managedProjects.length} active project(s): ${managedProjects
        .map((p) => `${p.name} (${p.code})`)
        .join(', ')}. Reassign the project manager first.`,
    });
  }

  return blockers;
}

/**
 * Permanently deletes a user account.
 *
 * Guarantees:
 *  - the `User` row is physically deleted (not deactivated, not soft-deleted);
 *  - every historical business record survives with a NULL actor reference
 *    (the FK actions are ON DELETE SET NULL by schema design);
 *  - the whole database-side removal is one transaction, so there is no
 *    half-deleted state;
 *  - the external authentication identity is removed so the person cannot log
 *    back in.
 */
export async function deleteUserAccount(
  targetUserId: string,
  actor: AuthenticatedUser
): Promise<UserDeletionResult> {
  // ---- 1. Resolve the target from the database, never from the request ----
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, role: true, status: true, supabaseUserId: true },
  });

  if (!target) {
    throw AppError.notFound('User not found');
  }

  // ---- 2. Authorization (backend-enforced, independent of the UI) --------
  assertDeletionAuthorized(actor, target);

  // ---- 3. Refuse early if a required relationship cannot be handled ------
  const blockers = await collectDeletionBlockers(target.id);
  if (blockers.length > 0) {
    throw new AppError(
      'USER_DELETE_BLOCKED',
      `This account cannot be deleted yet. ${blockers.map((b) => b.detail).join(' ')}`,
      409
    );
  }

  // ---- 4. Snapshot the actor identity for the audit trail ----------------
  // Recorded AFTER the User row is gone, so it must carry its own snapshot of
  // the deleted account (the spec's §9 requirement: audit history must not
  // depend on the User row still existing).
  const deletedAccountSnapshot = await auditService.resolveActorSnapshot(target.id);

  // ---- 5. Delete, atomically ---------------------------------------------
  let preserved: UserDeletionResult['preserved'];
  let removed: UserDeletionResult['removed'];

  const runDeleteTransaction = () =>
    prisma.$transaction(
      async (tx) => {
        // Count the historical rows that must survive, so the API can report
        // exactly what was preserved rather than silently dropping it.
        const [
          profile,
          projectMemberships,
          notifications,
          auditLogs,
          projectActivities,
          payments,
          timeEntries,
          tasksCreated,
          tasksAssigned,
          bugsReported,
          bugsAssigned,
          requirementsSubmitted,
          requirementVersions,
          requirementStatusHistory,
          estimates,
          requirementApprovals,
          clientReviews,
          testCases,
          testRuns,
          releases,
          fileAssets,
          taskComments,
          bugComments,
          projectRequests,
        ] = await Promise.all([
          tx.profile.count({ where: { userId: target.id } }),
          tx.projectMember.count({ where: { userId: target.id } }),
          tx.notification.count({ where: { userId: target.id } }),
          tx.auditLog.count({ where: { actorId: target.id } }),
          tx.projectActivity.count({ where: { actorId: target.id } }),
          tx.payment.count({ where: { recordedById: target.id } }),
          tx.timeEntry.count({ where: { userId: target.id } }),
          tx.task.count({ where: { creatorId: target.id } }),
          tx.task.count({ where: { assigneeId: target.id } }),
          tx.bug.count({ where: { reporterId: target.id } }),
          tx.bug.count({ where: { assigneeId: target.id } }),
          tx.requirement.count({ where: { submittedById: target.id } }),
          tx.requirementVersion.count({ where: { createdById: target.id } }),
          tx.requirementStatusHistory.count({ where: { actorId: target.id } }),
          tx.estimate.count({ where: { createdById: target.id } }),
          tx.requirementApproval.count({ where: { decidedById: target.id } }),
          tx.clientReview.count({ where: { reviewerId: target.id } }),
          tx.testCase.count({ where: { createdById: target.id } }),
          tx.testRun.count({ where: { executedById: target.id } }),
          tx.release.count({ where: { createdById: target.id } }),
          tx.fileAsset.count({ where: { uploadedById: target.id } }),
          tx.taskComment.count({ where: { authorId: target.id } }),
          tx.bugComment.count({ where: { authorId: target.id } }),
          tx.projectRequest.count({ where: { requestedById: target.id } }),
        ]);

        // Remove the account's own non-historical rows explicitly so the
        // intent is auditable in code and not only implied by FK cascades.
        // (ProjectMember / Notification / Profile are ON DELETE CASCADE in the
        // schema; deleting them here keeps the intent explicit and the counts
        // above accurate.)
        if (projectMemberships > 0) {
          await tx.projectMember.deleteMany({ where: { userId: target.id } });
        }
        if (notifications > 0) {
          await tx.notification.deleteMany({ where: { userId: target.id } });
        }
        if (profile > 0) {
          await tx.profile.deleteMany({ where: { userId: target.id } });
        }

        // The physical delete. Every other relation to User is either
        // ON DELETE CASCADE (already handled above) or ON DELETE SET NULL
        // (history is preserved by PostgreSQL itself, atomically).
        await tx.user.delete({ where: { id: target.id } });

        return {
          removed: {
            profile: profile > 0,
            projectMemberships,
            notifications,
            managedProjectsReassignment: null,
          },
          preserved: {
            auditLogs,
            projectActivities,
            payments,
            timeEntries,
            tasksCreated,
            tasksAssigned,
            bugsReported,
            bugsAssigned,
            requirementsSubmitted,
            requirementVersions,
            requirementStatusHistory,
            estimates,
            requirementApprovals,
            clientReviews,
            testCases,
            testRuns,
            releases,
            fileAssets,
            comments: taskComments + bugComments,
            projectRequests,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

  try {
    const counts = await withWriteConflictRetry(runDeleteTransaction);
    removed = counts.removed;
    preserved = counts.preserved;
  } catch (error) {
    // A foreign-key violation here means a relationship we do not yet model
    // blocked the delete. The transaction has already rolled back, so the
    // account and all of its data are intact — reject with a clear message
    // rather than leaving anything partially deleted.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new AppError(
        'USER_DELETE_BLOCKED',
        'This account still has dependent records that cannot be removed safely. Nothing was deleted.',
        409
      );
    }
    throw error;
  }

  // ---- 6. Revoke the external authentication identity --------------------
  // Done AFTER the database transaction has committed, on purpose:
  //  - the DB row is what actually grants access. authMiddleware re-resolves
  //    the caller from the database on every request, so the moment the row
  //    disappears any already-issued bearer token stops working and returns
  //    401 "User account not found".
  //  - A remote call cannot participate in the SQL transaction, so running it
  //    first would risk destroying the auth identity while the account still
  //    exists. Running it last can only ever fail "closed".
  const warnings: string[] = [];
  if (target.supabaseUserId) {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      warnings.push(
        'Supabase Auth is not configured on this server, so the external authentication identity could not be removed. The account can no longer access DeliveryOS because its database record no longer exists.'
      );
    } else {
      const { error: supabaseError } = await supabaseAdmin.auth.admin.deleteUser(target.supabaseUserId);
      if (supabaseError) {
        warnings.push(
          `The external authentication identity could not be removed (${supabaseError.message}). The account can no longer access DeliveryOS because its database record no longer exists.`
        );
      }
    }
  }

  // ---- 7. Record the deletion in the append-only audit trail -------------
  // The entry references the surviving actor and embeds the deleted account's
  // identity in metadata, because the deleted User row is gone for good.
  await auditService.log({
    actorId: actor.id,
    action: 'USER_DELETED',
    entityType: 'User',
    entityId: target.id,
    metadata: {
      deletedUserId: target.id,
      deletedEmail: target.email,
      deletedRole: target.role,
      deletedStatus: target.status,
      // A snapshot of the subject is retained so the audit trail explains
      // *which* account vanished even though the row itself is deleted.
      deletedActorSnapshot: deletedAccountSnapshot,
      deletedSupabaseUserId: target.supabaseUserId ?? null,
      preservedRecordCounts: preserved,
      warnings,
      performedBy: { id: actor.id, role: actor.role },
    },
  });

  return {
    deletedUserId: target.id,
    deletedEmail: target.email,
    deletedRole: target.role,
    removed,
    preserved,
    warnings,
  };
}

/**
 * Pre-flight endpoint backing the confirmation dialog: tells the UI whether a
 * deletion would be accepted, and why not, before the user commits to it.
 */
export async function previewUserDeletion(
  targetUserId: string,
  actor: AuthenticatedUser
): Promise<{ deletable: boolean; blockers: DeletionBlocker[] }> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true },
  });
  if (!target) throw AppError.notFound('User not found');

  assertDeletionAuthorized(actor, target);

  const blockers = await collectDeletionBlockers(target.id);
  return { deletable: blockers.length === 0, blockers };
}
