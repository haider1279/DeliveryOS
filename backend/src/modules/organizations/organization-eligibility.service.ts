import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';
import { OrganizationQualificationStatus as PrismaQualificationStatus } from '@prisma/client';
import { AppError } from '../../errors/AppError';

const ORG_SELECT = {
  id: true,
  name: true,
  status: true,
  qualificationStatus: true,
} as const;

/** Exactly the organization shape the eligibility checks need. */
export type QualifiedOrganization = Prisma.OrganizationGetPayload<{ select: typeof ORG_SELECT }>;

const load = (organizationId: string): Promise<QualifiedOrganization | null> =>
  prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: ORG_SELECT,
  });

/**
 * THE organization-qualification rule, in one place.
 *
 * docs/workflows.md defines the client-acquisition pipeline as
 *
 *     [PROSPECT] -> [APPROVED] -> (admin invites the client contact)
 *               -> [ACTIVE PROJECT CREATION]
 *
 * and states plainly: "Projects may only be created for APPROVED
 * organizations." Organization qualification is therefore a SEPARATE, earlier
 * administrative step (BD pipeline -> ADMIN/SUPER_ADMIN qualification); it is
 * NOT implied by a project request, and nothing here may weaken it.
 *
 * Every caller that needs an organization eligible to own a project goes
 * through this function, so the rule has exactly one implementation and cannot
 * drift between the manual "New Project" flow and the client project-request
 * approval flow.
 *
 * `subject` is woven into the error so the caller learns WHICH organization
 * blocked them and which step unblocks it, instead of a bare rule statement.
 */
export async function requireQualifiedOrganization(
  organizationId: string,
  subject: string
): Promise<QualifiedOrganization> {
  const org = await load(organizationId);

  if (!org) {
    throw new AppError('NOT_FOUND', 'Organization not found', 404);
  }
  if (org.status === 'INACTIVE') {
    throw new AppError(
      'FORBIDDEN',
      `"${org.name}" is inactive and cannot accept new projects`,
      403
    );
  }
  if (
    org.qualificationStatus &&
    org.qualificationStatus !== PrismaQualificationStatus.APPROVED
  ) {
    const hint =
      org.qualificationStatus === PrismaQualificationStatus.REJECTED
        ? 'This organization was rejected during qualification and cannot receive projects.'
        : 'Qualify the organization (BD Leads -> Approve) before approving a project request for it.';
    throw new AppError(
      'BUSINESS_RULE_VIOLATION',
      `${subject} requires a qualified and approved organization. ` +
        `"${org.name}" is currently ${org.qualificationStatus.toLowerCase()}. ${hint}`,
      400
    );
  }

  return org;
}

/**
 * The same rule for the client-account side of the pipeline: a CLIENT contact
 * may only be attached to a qualified organization, because docs/workflows.md
 * places the client invitation AFTER the organization is approved. Without
 * this, a client can be stranded inside a PROSPECT organization whose project
 * requests can never be approved.
 */
export async function requireQualifiedOrganizationForClient(
  organizationId: string
): Promise<QualifiedOrganization> {
  return requireQualifiedOrganization(organizationId, 'Adding a client account');
}
