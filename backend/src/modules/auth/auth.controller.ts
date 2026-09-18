import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { sendSuccess } from '../../utils/response';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      sendSuccess(res, { data: result, message: 'Logged in successfully' });
    } catch (err) {
      next(err);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await authService.getMe(req.user!.id);
      sendSuccess(res, { data: user });
    } catch (err) {
      next(err);
    }
  }

  async completeInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.completeInvite(req.body);
      sendSuccess(res, { data: result, message: 'Invite completed successfully. Account activated.' });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
