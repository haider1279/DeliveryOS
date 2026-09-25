import { Request, Response, NextFunction } from 'express';
import { taskService } from './task.service';
import { sendSuccess, sendCreated, buildPaginationMeta } from '../../utils/response';

export class TaskController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await taskService.createTask(req.user!, req.body);
      sendCreated(res, task, 'Task created successfully');
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const task = await taskService.updateTask(id, req.body, req.user!);
      sendSuccess(res, { data: task, message: 'Task updated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const task = await taskService.getTaskById(req.user!, id);
      sendSuccess(res, { data: task });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await taskService.listTasks(req.user!, req.query as any);
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
      const comment = await taskService.addComment(req.user!, id, req.body);
      sendCreated(res, comment, 'Comment added successfully');
    } catch (err) {
      next(err);
    }
  }

  async logTime(req: Request, res: Response, next: NextFunction) {
    try {
      const timeEntry = await taskService.logTime(req.user!, req.body);
      sendCreated(res, timeEntry, 'Time logged successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateTimeEntry(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const timeEntry = await taskService.updateTimeEntry(req.user!, id, req.body);
      sendSuccess(res, { data: timeEntry, message: 'Time entry updated successfully' });
    } catch (err) {
      next(err);
    }
  }

  async deleteTimeEntry(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await taskService.deleteTimeEntry(req.user!, id);
      sendSuccess(res, { data: result, message: 'Time entry deleted successfully' });
    } catch (err) {
      next(err);
    }
  }

  async getMyWork(req: Request, res: Response, next: NextFunction) {
    try {
      const myWork = await taskService.getMyWork(req.user!);
      sendSuccess(res, { data: myWork });
    } catch (err) {
      next(err);
    }
  }
}

export const taskController = new TaskController();
