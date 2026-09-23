import { Request, Response, NextFunction } from 'express';
import { qaService } from './qa.service';
import { sendSuccess, sendCreated, buildPaginationMeta } from '../../utils/response';

export class QaController {
  async createTestCase(req: Request, res: Response, next: NextFunction) {
    try {
      const testCase = await qaService.createTestCase(req.body, req.user!);
      sendCreated(res, testCase, 'Test case created successfully');
    } catch (err) {
      next(err);
    }
  }

  async listTestCases(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await qaService.listTestCases(req.query as any, req.user!);
      sendSuccess(res, {
        data: result.testCases,
        meta: buildPaginationMeta(result.page, result.pageSize, result.total),
      });
    } catch (err) {
      next(err);
    }
  }

  async executeTestRun(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await qaService.executeTestRun(req.body, req.user!);
      sendCreated(res, result, 'Test run executed successfully');
    } catch (err) {
      next(err);
    }
  }

  async createBug(req: Request, res: Response, next: NextFunction) {
    try {
      const bug = await qaService.createBug(req.body, req.user!);
      sendCreated(res, bug, 'Bug created successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateBugStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const bug = await qaService.updateBugStatus(id, req.body, req.user!);
      sendSuccess(res, { data: bug, message: 'Bug status updated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async getBugById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const bug = await qaService.getBugById(id, req.user!);
      sendSuccess(res, { data: bug });
    } catch (err) {
      next(err);
    }
  }

  async listBugs(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await qaService.listBugs(req.query as any, req.user!);
      sendSuccess(res, {
        data: result.bugs,
        meta: buildPaginationMeta(result.page, result.pageSize, result.total),
      });
    } catch (err) {
      next(err);
    }
  }

  async addBugComment(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const comment = await qaService.addComment(id, req.body, req.user!);
      sendCreated(res, comment, 'Comment added successfully');
    } catch (err) {
      next(err);
    }
  }
}

export const qaController = new QaController();