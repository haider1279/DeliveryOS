import { Request, Response, NextFunction } from 'express';
import { auditService } from '../../services/audit.service';
import { sendSuccess, buildPaginationMeta } from '../../utils/response';

export class AuditController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50;

      const result = await auditService.query({
        entityType: req.query.entityType as string,
        entityId: req.query.entityId as string,
        actorId: req.query.actorId as string,
        action: req.query.action as string,
        page,
        pageSize,
      });

      sendSuccess(res, {
        data: result.logs,
        meta: buildPaginationMeta(page, pageSize, result.total),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const auditController = new AuditController();
