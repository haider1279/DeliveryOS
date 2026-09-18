import { Request, Response, NextFunction } from 'express';
import { releaseService } from './release.service';
import { sendSuccess, sendCreated, buildPaginationMeta } from '../../utils/response';

export class ReleaseController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const release = await releaseService.createRelease(req.body, req.user!.id);
      sendCreated(res, release, 'Release created successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const release = await releaseService.updateReleaseStatus(
        id,
        req.body,
        req.user!.id
      );
      sendSuccess(res, { data: release, message: 'Release status updated' });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const release = await releaseService.getReleaseById(id);
      sendSuccess(res, { data: release });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await releaseService.listReleases(req.query as any);
      sendSuccess(res, {
        data: result.releases,
        meta: buildPaginationMeta(result.page, result.pageSize, result.total),
      });
    } catch (err) {
      next(err);
    }
  }

  async recordClientReview(req: Request, res: Response, next: NextFunction) {
    try {
      const requirementId = String(req.params.requirementId);
      const result = await releaseService.recordClientReview(
        requirementId,
        req.body,
        req.user!.id,
        req.user!.role,
        req.user!.organizationId
      );
      sendSuccess(res, { data: result, message: 'Client review recorded' });
    } catch (err) {
      next(err);
    }
  }
}

export const releaseController = new ReleaseController();
