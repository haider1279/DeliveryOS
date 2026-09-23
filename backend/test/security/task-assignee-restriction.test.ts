import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole, OrganizationQualificationStatus } from '@deliveryos/shared';

describe('Task Assignee Selection & Authorization Restrictions', () => {
  let orgId: string;
  let projectId: string;
  let pmUser: any;
  let pmToken: string;
  let devUser: any;
  let devToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // 1. Get auth tokens for seeded PM, DEV, and ADMIN
    const pmLogin = await authService.login('haider8.euroshub@gmail.com', 'ProjectManager#2026!DeliveryOS');
    pmUser = pmLogin.user;
    pmToken = pmLogin.token;

    const devLogin = await authService.login('haider7.euroshub@gmail.com', 'Developer#2026!DeliveryOS');
    devUser = devLogin.user;
    devToken = devLogin.token;

    const adminLogin = await authService.login('haider2.euroshub@gmail.com', 'Admin#2026!DeliveryOS');
    adminToken = adminLogin.token;

    // 2. Create isolated test organization and project
    const org = await prisma.organization.create({
      data: {
        name: `Assignee Test Org ${Date.now()}`,
        slug: `assignee-test-org-${Date.now()}`,
        contactEmail: `assignee-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgId = org.id;

    const project = await prisma.project.create({
      data: {
        name: `Assignee Test Project ${Date.now()}`,
        code: `ATP${(Date.now() % 10000).toString().padStart(4, '0')}`,
        organizationId: orgId,
        projectManagerId: pmUser.id,
      },
    });
    projectId = project.id;

    // 3. Add PM and DEV as project members
    await prisma.projectMember.createMany({
      data: [
        { projectId, userId: pmUser.id, membershipRole: 'PROJECT_MANAGER' },
        { projectId, userId: devUser.id, membershipRole: 'DEVELOPER' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  it('rejects PM attempting to assign a development task to themselves', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        projectId,
        title: 'PM Self-Assignment Task',
        assigneeId: pmUser.id,
        priority: 'MEDIUM',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/only assign development tasks to project developers/i);
  });

  it('rejects PM attempting to assign a task to a non-developer or user outside the project', async () => {
    // Other user not on project
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'haider2.euroshub@gmail.com' } });

    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        projectId,
        title: 'Invalid Member Assignment',
        assigneeId: adminUser.id,
        priority: 'MEDIUM',
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('allows PM to assign task to an eligible project DEVELOPER', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        projectId,
        title: 'Valid Developer Task',
        assigneeId: devUser.id,
        priority: 'HIGH',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assigneeId).toBe(devUser.id);
  });

  it('preserves ADMIN capability to manage and assign tasks', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId,
        title: 'Admin Created Task',
        assigneeId: devUser.id,
        priority: 'MEDIUM',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
