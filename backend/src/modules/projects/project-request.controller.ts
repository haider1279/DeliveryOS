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
      });
      sendSuccess(res, { data: result });
    } catch (err) {
      next(err);
    }
  },
};
