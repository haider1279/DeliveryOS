import { Request, Response, NextFunction } from 'express';
import { orgService } from './org.service';
import { sendSuccess, sendCreated, buildPaginationMeta } from '../../utils/response';

export class OrgController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const org = await orgService.createOrg(req.body, req.user!);
      sendCreated(res, org, 'Organization created successfully');
    } catch (err) {
      next(err);
    }
  }

  async qualify(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const org = await orgService.qualifyOrg(id, req.body.decision, req.body.notes, req.user!);
      sendSuccess(res, { data: org, message: 'Client qualification updated' });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const org = await orgService.updateOrg(id, req.body, req.user!.id);
      sendSuccess(res, { data: org, message: 'Organization updated' });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const org = await orgService.getOrgById(id, req.user!);
      sendSuccess(res, { data: org });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await orgService.listOrgs(req.query as any, req.user!);
      sendSuccess(res, {
        data: result.orgs,
        meta: buildPaginationMeta(result.page, result.pageSize, result.total),
      });
    } catch (err) {
      next(err);
    }
  }
}

export const orgController = new OrgController();
