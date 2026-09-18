import { Request, Response, NextFunction } from 'express';
import { taskService } from './task.service';
import { sendSuccess, sendCreated, buildPaginationMeta } from '../../utils/response';

export class TaskController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.createTask(req.body, req.user!.id);
      sendCreated(res, task, 'Task created successfully');
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const task = await taskService.updateTask(
        id,
        req.body,
        req.user!.id,
        req.user!.role
      );
      sendSuccess(res, { data: task, message: 'Task updated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const task = await taskService.getTaskById(
        id,
        req.user!.role,
        req.user!.organizationId
      );
      sendSuccess(res, { data: task });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await taskService.listTasks(
        req.query as any,
        req.user!.role,
        req.user!.organizationId
      );
      sendSuccess(res, {
        data: result.tasks,
        meta: buildPaginationMeta(result.page, result.pageSize, result.total),
      });
    } catch (err) {
      next(err);
    }
  }

  async addComment(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const comment = await taskService.addComment(
        id,
        req.body,
        req.user!.id,
        req.user!.role
      );
      sendCreated(res, comment, 'Comment added successfully');
    } catch (err) {
      next(err);
    }
  }

  async logTime(req: Request, res: Response, next: NextFunction) {
    try {
      const timeEntry = await taskService.logTime(
        req.body,
        req.user!.id,
        req.user!.role
      );
      sendCreated(res, timeEntry, 'Time logged successfully');
    } catch (err) {
      next(err);
    }
  }

  async getMyWork(req: Request, res: Response, next: NextFunction) {
    try {
      const myWork = await taskService.getMyWork(req.user!.id);
      sendSuccess(res, { data: myWork });
    } catch (err) {
      next(err);
    }
  }
}

export const taskController = new TaskController();
