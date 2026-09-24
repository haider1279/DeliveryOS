import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { UserRole, ProjectRequestStatus } from '@deliveryos/shared';
import type { CreateProjectRequestDTO, AuthenticatedUser } from '@deliveryos/shared';

export const projectRequestService = {
  async create(actor: AuthenticatedUser, dto: CreateProjectRequestDTO) {
    let targetOrgId: string;

    if (actor.role === UserRole.CLIENT) {
      if (!actor.organizationId) {
        throw new AppError('FORBIDDEN', 'Client user must belong to an organization to submit project requests', 403);
      }
      if (dto.organizationId && dto.organizationId !== actor.organizationId) {
        throw new AppError('FORBIDDEN', 'Client can only submit project requests for their own organization', 403);
      }
      targetOrgId = actor.organizationId;
    } else if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.ADMIN) {
      targetOrgId = dto.organizationId || actor.organizationId!;
      if (!targetOrgId) {
        throw new AppError('BAD_REQUEST', 'Organization ID is required', 400);
      }
    } else {
      throw new AppError('FORBIDDEN', 'Insufficient permissions to submit project requests', 403);
    }

    const org = await prisma.organization.findFirst({
      where: { id: targetOrgId, deletedAt: null },
    });
    if (!org) {
      throw new AppError('NOT_FOUND', 'Organization not found', 404);
    }

    const request = await prisma.projectRequest.create({
      data: {
        organizationId: targetOrgId,
        requestedById: actor.id,
        name: dto.name,
        description: dto.description || null,
        budget: dto.budget ?? null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        notes: dto.notes || null,
        status: ProjectRequestStatus.PENDING,
      },
      include: {
        organization: { select: { id: true, name: true } },
        requestedBy: { include: { profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'PROJECT_REQUEST_SUBMITTED',
      entityType: 'ProjectRequest',
      entityId: request.id,
      metadata: { name: request.name, organizationId: targetOrgId },
    });

    return request;
  },

  async list(actor: AuthenticatedUser, query: { organizationId?: string }) {
    const where: any = {};

    if (actor.role === UserRole.CLIENT) {
      where.organizationId = actor.organizationId || '00000000-0000-0000-0000-000000000000';
    } else if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.ADMIN) {
      if (query.organizationId) {
        where.organizationId = query.organizationId;
      }
    } else {
      where.organizationId = actor.organizationId || '00000000-0000-0000-0000-000000000000';
    }

    const requests = await prisma.projectRequest.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        requestedBy: { include: { profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests;
  },
};
