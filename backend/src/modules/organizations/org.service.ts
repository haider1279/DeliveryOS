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

    if (decision === OrganizationQualificationStatus.APPROVED) {
      if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.ADMIN) {
        throw AppError.forbidden('Only administrators (ADMIN or SUPER_ADMIN) can approve a lead/prospective client');
      }
    }

    const org = await prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!org) throw AppError.notFound('Organization not found');

    if (decision === org.qualificationStatus) {
      throw AppError.badRequest(`Organization is already ${decision}`);
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: {
        qualificationStatus: decision,
        qualificationNotes: notes ?? org.qualificationNotes,
        qualifiedById: actor.id,
        qualifiedAt: new Date(),
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: decision === OrganizationQualificationStatus.APPROVED
        ? 'ORGANIZATION_QUALIFIED'
        : 'ORGANIZATION_REJECTED',
      entityType: 'Organization',
      entityId: id,
      metadata: { name: org.name, decision, notes: notes ?? null },
    });

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
