import { prisma } from '../config/prisma';
import { AppError } from '../errors/AppError';
import { NotificationType, CommentVisibility } from '@deliveryos/shared';

interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  linkUrl?: string;
}

interface ActivityPayload {
  projectId: string;
  actorId: string;
  type: string;
  message: string;
  visibility?: CommentVisibility;
  entityType?: string;
  entityId?: string;
  metadata?: any;
}

/**
 * Notification service.
 * Failures are non-blocking — the primary business transaction must not roll back
 * because a notification failed.
 */
export const notificationService = {
  async send(payload: NotificationPayload): Promise<void> {
    try {
      await prisma.notification.create({ data: payload });
    } catch (err) {
      console.error('[NOTIFICATION_FAILURE]', err);
    }
  },

  async notify(payload: NotificationPayload): Promise<void> {
    return this.send(payload);
  },

  async sendMany(payloads: NotificationPayload[]): Promise<void> {
    try {
      await prisma.notification.createMany({ data: payloads });
    } catch (err) {
      console.error('[NOTIFICATION_FAILURE]', err);
    }
  },

  async getUserNotifications(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  async getUnreadCount(userId: string) {
    return prisma.notification.count({
      where: { userId, readAt: null },
    });
  },

  async markAsRead(id: string, userId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) {
      throw AppError.notFound('Notification not found');
    }
    return prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  },

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  },
};

/**
 * Project Activity service.
 * Records human-readable activity timeline, visibility-filtered.
 */
export const activityService = {
  async record(payload: ActivityPayload): Promise<void> {
    try {
      await prisma.projectActivity.create({
        data: {
          projectId: payload.projectId,
          actorId: payload.actorId,
          type: payload.type,
          message: payload.message,
          visibility: payload.visibility ?? CommentVisibility.INTERNAL,
          entityType: payload.entityType || null,
          entityId: payload.entityId || null,
          metadata: payload.metadata ? (payload.metadata as any) : undefined,
        },
      });
    } catch (err) {
      console.error('[ACTIVITY_FAILURE]', err);
    }
  },

  async log(payload: ActivityPayload): Promise<void> {
    return this.record(payload);
  },
};
