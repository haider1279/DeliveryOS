import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../../services/notification.service';
import { sendSuccess } from '../../utils/response';

export class NotificationController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const notifications = await notificationService.getUserNotifications(req.user!.id);
      const unreadCount = await notificationService.getUnreadCount(req.user!.id);
      sendSuccess(res, { data: { notifications, unreadCount } });
    } catch (err) {
      next(err);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const updated = await notificationService.markAsRead(id, req.user!.id);
      sendSuccess(res, { data: updated });
    } catch (err) {
      next(err);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      await notificationService.markAllAsRead(req.user!.id);
      sendSuccess(res, { message: 'All notifications marked as read' });
    } catch (err) {
      next(err);
    }
  }
}

export const notificationController = new NotificationController();
