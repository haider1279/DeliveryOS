import { Request, Response, NextFunction } from 'express';
import { reportService } from './report.service';
import { sendSuccess } from '../../utils/response';

export class ReportController {
  async getExecutiveSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await reportService.getExecutiveSummary(req.user!);
      sendSuccess(res, { data: summary });
    } catch (err) {
      next(err);
    }
  }

  async getDeveloperWorkload(req: Request, res: Response, next: NextFunction) {
    try {
      const workload = await reportService.getDeveloperWorkload(req.user!);
      sendSuccess(res, { data: workload });
    } catch (err) {
      next(err);
    }
  }

  async getQaMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const metrics = await reportService.getQaMetrics(req.user!);
      sendSuccess(res, { data: metrics });
    } catch (err) {
      next(err);
    }
  }

  async getFinancialOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const overview = await reportService.getFinancialOverview(req.user!);
      sendSuccess(res, { data: overview });
    } catch (err) {
      next(err);
    }
  }
}

export const reportController = new ReportController();
