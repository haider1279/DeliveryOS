import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole, OrganizationQualificationStatus } from '@deliveryos/shared';

describe('Project Assignment & Team Member Management RBAC', () => {
  let orgId: string;
  let projectId: string;

  let pmUser: any;
  let pmToken: string;

  let otherPmUser: any;
  let otherPmToken: string;

  let devUser: any;
  let devToken: string;

  let qaUser: any;
  let qaToken: string;

  let clientUser: any;
  let clientToken: string;

  let adminToken: string;
  let superAdminToken: string;

  beforeAll(async () => {
    // 1. Get tokens for seeded users
    const pmLogin = await authService.login('haider8.euroshub@gmail.com', 'ProjectManager#2026!DeliveryOS');
    pmUser = pmLogin.user;
    pmToken = pmLogin.token;

    const devLogin = await authService.login('haider7.euroshub@gmail.com', 'Developer#2026!DeliveryOS');
    devUser = devLogin.user;
    devToken = devLogin.token;

    const adminLogin = await authService.login('haider2.euroshub@gmail.com', 'Admin#2026!DeliveryOS');
    adminToken = adminLogin.token;

    superAdminToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000099',
      email: 'superadmin-team@agency.com',
      role: UserRole.SUPER_ADMIN,
    });

    const clientLogin = await authService.login('haider1.euroshub@gmail.com', 'Client#2026!DeliveryOS');
    clientUser = clientLogin.user;
    clientToken = clientLogin.token;

    // Create a second PM user
    const otherPm = await prisma.user.create({
      data: {
        email: `other-pm-${Date.now()}@agency.com`,
        role: UserRole.PROJECT_MANAGER,
        status: 'ACTIVE',
        profile: { create: { firstName: 'Other', lastName: 'PM', displayName: 'Other PM' } },
      },
    });
    otherPmUser = otherPm;
    otherPmToken = authService.createDevToken({
      id: otherPm.id,
      email: otherPm.email,
      role: UserRole.PROJECT_MANAGER,
    });

    // Create a QA user
    const qa = await prisma.user.create({
      data: {
        email: `qa-test-${Date.now()}@agency.com`,
        role: UserRole.QA,
        status: 'ACTIVE',
        profile: { create: { firstName: 'QA', lastName: 'Tester', displayName: 'QA Tester' } },
      },
    });
    qaUser = qa;
    qaToken = authService.createDevToken({
      id: qa.id,
      email: qa.email,
      role: UserRole.QA,
    });

    // 2. Create organization & project managed by pmUser
    const org = await prisma.organization.create({
      data: {
        name: `Team RBAC Org ${Date.now()}`,
        slug: `team-rbac-org-${Date.now()}`,
        contactEmail: `team-rbac-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgId = org.id;

    const project = await prisma.project.create({
      data: {
        name: `Team RBAC Project ${Date.now()}`,
        code: `TRP${(Date.now() % 10000).toString().padStart(4, '0')}`,
        organizationId: orgId,
        projectManagerId: pmUser.id,
      },
    });
    projectId = project.id;

    // Add PM as active project member
    await prisma.projectMember.create({
      data: { projectId, userId: pmUser.id, membershipRole: 'PROJECT_MANAGER' },
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.organization.delete({ where: { id: orgId } });
    if (otherPmUser?.id) await prisma.user.delete({ where: { id: otherPmUser.id } });
    if (qaUser?.id) await prisma.user.delete({ where: { id: qaUser.id } });
  });

  it('allows authorized PM to add a developer to their project', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        userId: devUser.id,
        membershipRole: 'DEVELOPER',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(devUser.id);
  });

  it('allows authorized PM to add a QA user to their project', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        userId: qaUser.id,
        membershipRole: 'QA',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(qaUser.id);
  });

  it('prevents adding an already active project member (Conflict)', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        userId: devUser.id,
        membershipRole: 'DEVELOPER',
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('prohibits adding a CLIENT user as a project team member', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        userId: clientUser.id,
        membershipRole: 'DEVELOPER',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/clients cannot be added/i);
  });

  it('rejects PM attempting to add members to a project they do not manage', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${otherPmToken}`)
      .send({
        userId: devUser.id,
        membershipRole: 'DEVELOPER',
      });

    expect(res.status).toBe(404);
  });

  it('rejects DEVELOPER or QA attempting to add project members', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        userId: qaUser.id,
        membershipRole: 'QA',
      });

    expect(res.status).toBe(403);
  });

  it('allows ADMIN to add members to any project', async () => {
    // Create temp developer
    const tempDev = await prisma.user.create({
      data: {
        email: `temp-dev-${Date.now()}@agency.com`,
        role: UserRole.DEVELOPER,
        status: 'ACTIVE',
        profile: { create: { firstName: 'Temp', lastName: 'Dev', displayName: 'Temp Dev' } },
      },
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: tempDev.id,
        membershipRole: 'DEVELOPER',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Clean up
    await prisma.projectMember.deleteMany({ where: { projectId, userId: tempDev.id } });
    await prisma.user.delete({ where: { id: tempDev.id } });
  });

  it('allows PM to assign task to the newly added developer', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        projectId,
        title: 'Team Assignment Task',
        assigneeId: devUser.id,
        priority: 'HIGH',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assigneeId).toBe(devUser.id);
  });

  it('allows PM to remove a developer from their project', async () => {
    const res = await request(app)
      .delete(`/api/projects/${projectId}/members/${devUser.id}`)
      .set('Authorization', `Bearer ${pmToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.openTasksNeedingReassignment).toBeDefined();
  });

  it('rejects task assignment to a developer who was removed from the project', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        projectId,
        title: 'Task for Removed Developer',
        assigneeId: devUser.id,
        priority: 'MEDIUM',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toMatch(/not an active member/i);
  });
});
