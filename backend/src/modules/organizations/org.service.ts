import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  PaginationQueryInput,
  UserRole,
  OrganizationQualificationStatus,
  AuthenticatedUser,
} from '@deliveryos/shared';
import { getAccessibleOrganizationIds } from '../../services/project-access.service';
import { userService } from '../users/user.service';

/**
 * Client-qualification authority ranking.
 *
 * A qualification decision is only overridable by an actor that ranks strictly
 * higher than the actor who produced the decision that is currently stored:
 *
 *   SUPER_ADMIN (3) > ADMIN (2) > BD (1) > everyone else (0)
 *
 * This ordering is what makes a stale browser tab harmless: the winning state
 * lives in the database, and a lower-authority actor can never write over it.
 */
const QUALIFICATION_AUTHORITY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 3,
  [UserRole.ADMIN]: 2,
  [UserRole.BD]: 1,
  [UserRole.CLIENT]: 0,
  [UserRole.DEVELOPER]: 0,
  [UserRole.QA]: 0,
  [UserRole.PROJECT_MANAGER]: 0,
};

const ADMIN_QUALIFY_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

/**
 * Fail-closed floor for a lead that carries a decision but whose decider can no
 * longer be resolved (deleted/deactivated account).
 *
 * A stored APPROVED decision can only ever have been made by ADMIN or
 * SUPER_ADMIN (BD can never approve), and a stored REJECTED decision can only
 * have been made by BD or an administrator. Defaulting an unresolvable decider
 * to "lowest authority" would silently fail OPEN and let a lower role overwrite
 * an administrative decision, so we fall back to the strictest authority that
 * could have produced the stored state.
 */
const UNRESOLVED_DECIDER_FLOOR: Record<OrganizationQualificationStatus, number> = {
  [OrganizationQualificationStatus.PROSPECT]: 0,
  [OrganizationQualificationStatus.REJECTED]: QUALIFICATION_AUTHORITY[UserRole.BD],
  [OrganizationQualificationStatus.APPROVED]: QUALIFICATION_AUTHORITY[UserRole.ADMIN],
};

export class OrgService {
  async createOrg(input: CreateOrganizationInput, actor: AuthenticatedUser) {
    const existing = await prisma.organization.findUnique({
      where: { slug: input.slug.toLowerCase() },
    });
    if (existing) {
      throw AppError.conflict(`Organization slug "${input.slug}" is already taken`);
    }

    // Business-development owns client acquisition: a BD-created organization is
    // a PROSPECT awaiting qualification. An ADMIN/SUPER_ADMIN creating an
    // organization is directly onboarding a client, so it defaults to APPROVED
    // (existing behaviour, unchanged for non-BD creators).
    const isBd = actor.role === UserRole.BD;
    const qualificationStatus =
      input.qualificationStatus ??
      (isBd ? OrganizationQualificationStatus.PROSPECT : OrganizationQualificationStatus.APPROVED);

    // Only BD/ADMIN/SUPER_ADMIN may create organizations (enforced at the route
    // level too); a non-admin creator can never self-approve a prospect.
    if (
      qualificationStatus === OrganizationQualificationStatus.APPROVED &&
      isBd
    ) {
      throw AppError.forbidden('BD cannot self-approve a client; qualify it through the pipeline');
    }

    const org = await prisma.organization.create({
      data: {
        name: input.name,
        slug: input.slug.toLowerCase(),
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone || null,
        address: input.address || null,
        city: input.city || null,
        country: input.country || null,
        notes: input.notes || null,
        qualificationStatus,
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'ORGANIZATION_CREATED',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { name: org.name, slug: org.slug, qualificationStatus },
    });

    return org;
  }

  /**
   * BD client-acquisition qualification. Moves a prospect to APPROVED (handed
   * off to ADMIN onboarding) or REJECTED. ADMIN/SUPER_ADMIN may also qualify so
   * they can correct a bad decision, but the decision is always recorded against
   * the authenticated actor — never a client-supplied id.
   *
   * AUTHORITY / STATE-CONSISTENCY RULES (server-side and authoritative):
   *
   *  1. Only SUPER_ADMIN, ADMIN or BD may call this at all.
   *  2. APPROVED is an administrative act: only SUPER_ADMIN/ADMIN may perform it.
   *  3. A non-administrator (BD) may only ever decide a lead that is still
   *     PROSPECT. Once any decision (ADMIN/SUPER_ADMIN approval or a prior BD
   *     rejection) is stored, a BD may not reject, reverse, overwrite or
   *     otherwise re-decide it. This is what makes a stale client tab — which
   *     still renders a "Reject" button — harmless.
   *  4. Among administrators, a decision may only be corrected by a strictly
   *     higher authority (SUPER_ADMIN > ADMIN), so an ADMIN can never overwrite
   *     a SUPER_ADMIN decision.
   *  5. The write is a conditional/atomic update: it only lands if the stored
   *     status is still the one the decision was validated against, and the
   *     result is verified. Two conflicting concurrent requests therefore cannot
   *     both succeed — the loser gets a 409.
   */
  async qualifyOrg(
    id: string,
    decision: OrganizationQualificationStatus,
    notes: string | undefined,
    actor: AuthenticatedUser
  ) {
    const allowed = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BD];
    if (!allowed.includes(actor.role as UserRole)) {
      throw AppError.forbidden('Only BD or administrators can qualify a prospective client');
    }

    const isAdmin = ADMIN_QUALIFY_ROLES.includes(actor.role as UserRole);
    if (decision === OrganizationQualificationStatus.APPROVED && !isAdmin) {
      throw AppError.forbidden('Only administrators (ADMIN or SUPER_ADMIN) can approve a lead/prospective client');
    }

    // Read the CURRENT persisted state. Never trust a status supplied by, or
    // cached in, the client.
    const org = await prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!org) throw AppError.notFound('Organization not found');

    const currentStatus = org.qualificationStatus;
    const attemptedAction = decision === OrganizationQualificationStatus.APPROVED ? 'approve' : 'reject';

    if (decision === currentStatus) {
      throw AppError.badRequest(`Organization is already ${decision}`);
    }

    // --- Authority gate -----------------------------------------------------
    // A PROSPECT is undecided, so any permitted role may decide it. Once a
    // decision is stored, resolve who produced it so the actor can be compared
    // against it, defaulting to the fail-closed floor when it is unresolvable.
    const isDecided = currentStatus !== OrganizationQualificationStatus.PROSPECT;

    if (isDecided) {
      const decider = org.qualifiedById
        ? await prisma.user.findUnique({ where: { id: org.qualifiedById }, select: { role: true } })
        : null;
      const deciderAuthority = decider
        ? QUALIFICATION_AUTHORITY[decider.role]
        : UNRESOLVED_DECIDER_FLOOR[currentStatus];
      const actorAuthority = QUALIFICATION_AUTHORITY[actor.role as UserRole];

      if (!isAdmin) {
        // Rule 3: BD owns the initial pending decision and nothing else. A
        // lower role can never reject, reverse or overwrite a stored decision.
        throw AppError.conflict(
          `Cannot ${attemptedAction} this lead because it has already been ${currentStatus.toLowerCase()}` +
            `${deciderAuthority >= QUALIFICATION_AUTHORITY[UserRole.ADMIN] ? ' by an administrator' : ''}. ` +
            'A lower-authority role cannot reverse a stored decision.',
          'QUALIFICATION_STATE_CONFLICT'
        );
      }

      if (deciderAuthority >= actorAuthority) {
        // Rule 4: SUPER_ADMIN > ADMIN. Equal or lower authority may not overwrite.
        throw AppError.conflict(
          `Cannot ${attemptedAction} this lead because it has already been ${currentStatus.toLowerCase()} ` +
            `by a ${decider?.role ?? 'lower-authority'} actor, whose authority is not below yours. ` +
            'Escalate to a SUPER_ADMIN to reverse an administrative decision.',
          'QUALIFICATION_AUTHORITY_CONFLICT'
        );
      }
    }

    // --- Atomic conditional transition -------------------------------------
    // Equivalent to: UPDATE organization SET qualificationStatus = :decision
    //                WHERE id = :id AND deletedAt IS NULL
    //                  AND qualificationStatus = :expectedStatus
    // The expected status is the value the decision above was validated
    // against, so a concurrent writer invalidates this one instead of being
    // silently overwritten.
    const expectedStatus = currentStatus;
    const { count } = await prisma.organization.updateMany({
      where: { id, deletedAt: null, qualificationStatus: expectedStatus },
      data: {
        qualificationStatus: decision,
        qualificationNotes: notes ?? org.qualificationNotes,
        qualifiedById: actor.id,
        qualifiedAt: new Date(),
      },
    });

    if (count === 0) {
      // Someone else changed the lead between our read and our write.
      const current = await prisma.organization.findFirst({
        where: { id, deletedAt: null },
        select: { qualificationStatus: true },
      });
      if (!current) throw AppError.notFound('Organization not found');
      throw AppError.conflict(
        `Cannot ${attemptedAction} this lead because it was changed to ` +
          `${current.qualificationStatus.toLowerCase()} by another user while you were reviewing it. ` +
          'Reload the lead and re-check the current state.',
        'QUALIFICATION_STATE_CONFLICT'
      );
    }

    const updated = await prisma.organization.findUnique({ where: { id } });
    if (!updated) throw AppError.notFound('Organization not found');

    // Automatically invite client representative upon lead approval if contactEmail is available
    if (decision === OrganizationQualificationStatus.APPROVED && org.contactEmail) {
      const existingUser = await prisma.user.findFirst({
        where: { email: org.contactEmail },
      });
      if (!existingUser) {
        try {
          await userService.inviteUser(
            {
              email: org.contactEmail,
              firstName: org.name || 'Client',
              lastName: 'Representative',
              role: UserRole.CLIENT,
              organizationId: org.id,
            },
            actor
          );
        } catch (invErr) {
          console.error('[lead-approval] Auto-invite failed:', (invErr as Error).message);
        }
      }
    }

    return updated;
  }

  async updateOrg(id: string, input: UpdateOrganizationInput, actorId: string) {
    const org = await prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });
    if (!org) throw AppError.notFound('Organization not found');

    if (input.slug && input.slug !== org.slug) {
      const existing = await prisma.organization.findUnique({
        where: { slug: input.slug.toLowerCase() },
      });
      if (existing) throw AppError.conflict(`Organization slug "${input.slug}" is already taken`);
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug.toLowerCase() }),
        ...(input.contactEmail !== undefined && { contactEmail: input.contactEmail }),
        ...(input.contactPhone !== undefined && { contactPhone: input.contactPhone }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.country !== undefined && { country: input.country }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
    });

    await auditService.log({
      actorId,
      action: 'ORGANIZATION_UPDATED',
      entityType: 'Organization',
      entityId: id,
    });

    return updated;
  }

  async getOrgById(id: string, actor: AuthenticatedUser) {
    // Clients may only read their own organization.
    if (actor.role === UserRole.CLIENT && id !== actor.organizationId) {
      throw AppError.notFound('Organization not found');
    }

    // DEVELOPER/QA have no organizational read access (agency details are
    // internal). PROJECT_MANAGER may read organizations of their assigned
    // projects only ("View Project Team"). BD and ADMIN/SUPER_ADMIN have full
    // agency-wide organization visibility for the acquisition pipeline.
    if (
      actor.role === UserRole.DEVELOPER ||
      actor.role === UserRole.QA ||
      actor.role === UserRole.PROJECT_MANAGER
    ) {
      if (actor.role === UserRole.PROJECT_MANAGER) {
        const accessibleOrgIds = await getAccessibleOrganizationIds(actor);
        if (accessibleOrgIds && !accessibleOrgIds.includes(id)) {
          throw AppError.notFound('Organization not found');
        }
      } else {
        throw AppError.notFound('Organization not found');
      }
    }

    const org = await prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: {
        projects: { where: { deletedAt: null }, select: { id: true, name: true, code: true, status: true } },
        ...(actor.role === UserRole.CLIENT
          ? {}
          : { users: { select: { id: true, email: true, role: true, status: true, profile: true } } }),
      },
    });

    if (!org) throw AppError.notFound('Organization not found');
    return org;
  }

  async listOrgs(query: PaginationQueryInput, actor: AuthenticatedUser) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };

    // PROJECT_MANAGER gets a scoped view of the organizations covering their
    // assigned projects (not every client the agency deals with).
    if (
      actor.role === UserRole.PROJECT_MANAGER ||
      actor.role === UserRole.DEVELOPER ||
      actor.role === UserRole.QA
    ) {
      const accessibleOrgIds = await getAccessibleOrganizationIds(actor);
      if (accessibleOrgIds && accessibleOrgIds.length > 0) {
        where.id = { in: accessibleOrgIds };
      } else {
        where.id = { in: [] };
      }
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
        { contactEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: {
          _count: { select: { projects: true, users: true, invoices: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      prisma.organization.count({ where }),
    ]);

    return { orgs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
}

export const orgService = new OrgService();
