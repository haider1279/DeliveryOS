import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  PaginationQueryInput,
  UserRole,
} from '@deliveryos/shared';

export class OrgService {
  async createOrg(input: CreateOrganizationInput, actorId: string) {
    const existing = await prisma.organization.findUnique({
      where: { slug: input.slug.toLowerCase() },
    });
    if (existing) {
      throw AppError.conflict(`Organization slug "${input.slug}" is already taken`);
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
      },
    });

    await auditService.log({
      actorId,
      action: 'ORGANIZATION_CREATED',
      entityType: 'Organization',
      entityId: org.id,
      metadata: { name: org.name, slug: org.slug },
    });

    return org;
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

  async getOrgById(id: string, userRole: UserRole, userOrgId?: string | null) {
    if (userRole === UserRole.CLIENT && id !== userOrgId) {
      throw AppError.notFound('Organization not found');
    }

    const org = await prisma.organization.findFirst({
      where: { id, deletedAt: null },
      include: {
        projects: { where: { deletedAt: null }, select: { id: true, name: true, code: true, status: true } },
        users: { select: { id: true, email: true, role: true, status: true, profile: true } },
      },
    });

    if (!org) throw AppError.notFound('Organization not found');
    return org;
  }

  async listOrgs(query: PaginationQueryInput) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };
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
