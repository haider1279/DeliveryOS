import { Request, Response, NextFunction } from 'express';
import { projectService } from './project.service';
import { computeProjectHealth } from './project-health.service';
import { sendSuccess, buildPaginationMeta } from '../../utils/response';
import { prisma } from '../../config/prisma';
import { UserRole, CommentVisibility } from '@deliveryos/shared';

export const projectController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await projectService.create(req.user!, req.body);
      sendSuccess(res, { data: result, statusCode: 201 });
    } catch (err) { next(err); }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await projectService.getById(req.user!, id);
      sendSuccess(res, { data: result });
    } catch (err) { next(err); }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt((req.query['page'] as string) ?? '1', 10);
      const pageSize = Math.min(parseInt((req.query['pageSize'] as string) ?? '25', 10), 100);
      const { items, total } = await projectService.list(req.user!, {
        organizationId: req.query['organizationId'] as string,
        status: req.query['status'] as string,
        search: req.query['search'] as string,
        page,
        pageSize,
      });
      sendSuccess(res, { data: items, meta: buildPaginationMeta(page, pageSize, total) });
    } catch (err) { next(err); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await projectService.update(req.user!, id, req.body);
      sendSuccess(res, { data: result });
    } catch (err) { next(err); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      await projectService.softDelete(req.user!, id);
      sendSuccess(res, { data: { archived: true } });
    } catch (err) { next(err); }
  },

  async health(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const health = await computeProjectHealth(id);
      sendSuccess(res, { data: health });
    } catch (err) { next(err); }
  },

  async addMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await projectService.addMember(req.user!, id, req.body);
      sendSuccess(res, { data: result, statusCode: 201 });
    } catch (err) { next(err); }
  },

  async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const userId = String(req.params.userId);
      const result = await projectService.removeMember(req.user!, id, userId);
      sendSuccess(res, { data: result });
    } catch (err) { next(err); }
  },

  async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const isClient = req.user!.role === UserRole.CLIENT;
      const page = parseInt((req.query['page'] as string) ?? '1', 10);
      const pageSize = Math.min(parseInt((req.query['pageSize'] as string) ?? '25', 10), 100);
      const projectId = String(req.params.id);

      const where: any = {
        projectId,
        ...(isClient ? { visibility: CommentVisibility.CLIENT_VISIBLE } : {}),
      };

      const [total, items] = await Promise.all([
        prisma.projectActivity.count({ where }),
        prisma.projectActivity.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { actor: { include: { profile: { select: { firstName: true, lastName: true, avatarUrl: true } } } } },
        }),
      ]);
      sendSuccess(res, { data: items, meta: buildPaginationMeta(page, pageSize, total) });
    } catch (err) { next(err); }
  },
};
