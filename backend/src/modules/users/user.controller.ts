import { Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import { sendSuccess, sendCreated, buildPaginationMeta } from '../../utils/response';

export class UserController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await userService.listUsers(req.query as any);
      sendSuccess(res, {
        data: result.users,
        meta: buildPaginationMeta(result.page, result.pageSize, result.total),
      });
    } catch (err) {
      next(err);
    }
  }

  async invite(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userService.inviteUser(req.body, req.user!.id);
      sendCreated(res, user, 'User invited successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const user = await userService.updateUserStatus(
        id,
        req.body.status,
        req.user!.id
      );
      sendSuccess(res, { data: user, message: 'User status updated' });
    } catch (err) {
      next(err);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await userService.updateProfile(req.user!.id, req.body);
      sendSuccess(res, { data: profile, message: 'Profile updated successfully' });
    } catch (err) {
      next(err);
    }
  }
}

export const userController = new UserController();
