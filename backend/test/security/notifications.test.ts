import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole, NotificationType } from '@deliveryos/shared';

describe('Notification Mark All As Read & Ownership Hardening', () => {
  let userA: any;
  let userB: any;
  let tokenA: string;
  let tokenB: string;
  let notifA1: any;
  let notifA2: any;
  let notifB1: any;

  beforeAll(async () => {
    userA = await prisma.user.create({
      data: {
        email: `notif-user-a-${Date.now()}@test.com`,
        role: UserRole.DEVELOPER,
        status: 'ACTIVE',
      },
    });

    userB = await prisma.user.create({
      data: {
        email: `notif-user-b-${Date.now()}@test.com`,
        role: UserRole.DEVELOPER,
        status: 'ACTIVE',
      },
    });

    tokenA = authService.createDevToken({ id: userA.id, email: userA.email, role: userA.role });
    tokenB = authService.createDevToken({ id: userB.id, email: userB.email, role: userB.role });

    // Create 2 unread notifications for User A
    notifA1 = await prisma.notification.create({
      data: {
        userId: userA.id,
        type: NotificationType.GENERAL,
        title: 'Title A1',
        message: 'Message A1',
      },
    });

    notifA2 = await prisma.notification.create({
      data: {
        userId: userA.id,
        type: NotificationType.GENERAL,
        title: 'Title A2',
        message: 'Message A2',
      },
    });

    // Create 1 unread notification for User B
    notifB1 = await prisma.notification.create({
      data: {
        userId: userB.id,
        type: NotificationType.GENERAL,
        title: 'Title B1',
        message: 'Message B1',
      },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { id: { in: [notifA1?.id, notifA2?.id, notifB1?.id].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA?.id, userB?.id].filter(Boolean) } },
    });
  });

  it('1. Initial unread counts are correct for User A (2) and User B (1)', async () => {
    const resA = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.unreadCount).toBe(2);

    const resB = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(200);
    expect(resB.body.data.unreadCount).toBe(1);
  });

  it('2. User B CANNOT mark User A notification as read (404 / ownership enforced)', async () => {
    const res = await request(app)
      .patch(`/api/notifications/${notifA1.id}/read`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it('3. POST /api/notifications/read-all marks all of User A unread notifications as read', async () => {
    const res = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);

    // Verify User A unread count is now 0
    const checkA = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(checkA.body.data.unreadCount).toBe(0);
    expect(checkA.body.data.notifications.every((n: any) => n.readAt !== null)).toBe(true);

    // Verify User B notification remains unread (1)
    const checkB = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(checkB.body.data.unreadCount).toBe(1);
  });
});
