import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { UserRole, ProjectRequestStatus } from '@deliveryos/shared';
import type { CreateProjectRequestDTO, DecideProjectRequestDTO, AuthenticatedUser } from '@deliveryos/shared';

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
        organization: { select: { id: true, name: true, slug: true } },
        requestedBy: { include: { profile: { select: { firstName: true, lastName: true, displayName: true } } } },
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

  async list(actor: AuthenticatedUser, query: { organizationId?: string; status?: string }) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.ADMIN &&
      actor.role !== UserRole.CLIENT
    ) {
      throw new AppError('FORBIDDEN', 'You do not have permission to list project requests', 403);
    }

    const where: any = {};

    if (actor.role === UserRole.CLIENT) {
      where.organizationId = actor.organizationId || '00000000-0000-0000-0000-000000000000';
    } else if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    if (query.status && Object.values(ProjectRequestStatus).includes(query.status as any)) {
      where.status = query.status;
    }

    const requests = await prisma.projectRequest.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        requestedBy: { include: { profile: { select: { firstName: true, lastName: true, displayName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests;
  },

  async getById(actor: AuthenticatedUser, id: string) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.ADMIN &&
      actor.role !== UserRole.CLIENT
    ) {
      throw new AppError('FORBIDDEN', 'You do not have permission to view project request details', 403);
    }

    const request = await prisma.projectRequest.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        requestedBy: { include: { profile: { select: { firstName: true, lastName: true, displayName: true } } } },
      },
    });

    if (!request) {
      throw new AppError('NOT_FOUND', 'Project request not found', 404);
    }

    if (actor.role === UserRole.CLIENT && request.organizationId !== actor.organizationId) {
      throw new AppError('FORBIDDEN', 'You do not have access to this project request', 403);
    }

    return request;
  },

  async decide(actor: AuthenticatedUser, id: string, dto: DecideProjectRequestDTO) {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.ADMIN) {
      throw new AppError('FORBIDDEN', 'Only administrators can approve or reject project requests', 403);
    }

    const request = await prisma.projectRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new AppError('NOT_FOUND', 'Project request not found', 404);
    }

    if (request.status !== ProjectRequestStatus.PENDING) {
      throw new AppError(
        'BAD_REQUEST',
        `Project request has already been ${request.status.toLowerCase()} and cannot be modified`,
        400
      );
    }

    if (dto.decision !== ProjectRequestStatus.APPROVED && dto.decision !== ProjectRequestStatus.REJECTED) {
      throw new AppError('BAD_REQUEST', 'Decision must be APPROVED or REJECTED', 400);
    }

    const updated = await prisma.projectRequest.update({
      where: { id },
      data: {
        status: dto.decision,
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        requestedBy: { include: { profile: { select: { firstName: true, lastName: true, displayName: true } } } },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: dto.decision === ProjectRequestStatus.APPROVED ? 'PROJECT_REQUEST_APPROVED' : 'PROJECT_REQUEST_REJECTED',
      entityType: 'ProjectRequest',
      entityId: id,
      metadata: { decision: dto.decision, notes: dto.notes },
    });

    return updated;
  },
};
