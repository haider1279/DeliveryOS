import { Request, Response, NextFunction } from 'express';
import { projectRequestService } from './project-request.service';
import { sendSuccess } from '../../utils/response';

export const projectRequestController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await projectRequestService.create(req.user!, req.body);
      sendSuccess(res, { data: result, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await projectRequestService.list(req.user!, {
        organizationId: req.query['organizationId'] as string,
        status: req.query['status'] as string,
      });
      sendSuccess(res, { data: result });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await projectRequestService.getById(req.user!, req.params['id'] as string);
      sendSuccess(res, { data: result });
    } catch (err) {
      next(err);
    }
  },

  async decide(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await projectRequestService.decide(req.user!, req.params['id'] as string, req.body);
      sendSuccess(res, { data: result });
    } catch (err) {
      next(err);
    }
  },
};
