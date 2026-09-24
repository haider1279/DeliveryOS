import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole, OrganizationQualificationStatus } from '@deliveryos/shared';

describe('Project Creation & Request Authorization Matrix', () => {
  let approvedOrgId: string;
  let otherOrgId: string;
  let createdProjectId: string;
  let pmUserId: string;

  let superAdminToken: string;
  let adminToken: string;
  let bdToken: string;
  let pmToken: string;
  let devToken: string;
  let qaToken: string;
  let clientToken: string;

  beforeAll(async () => {
    // Find active PM user
    const pm = await prisma.user.findFirstOrThrow({ where: { role: UserRole.PROJECT_MANAGER, status: 'ACTIVE' } });
    pmUserId = pm.id;

    // Create approved organization
    const approvedOrg = await prisma.organization.create({
      data: {
        name: `Approved Org Test ${Date.now()}`,
        slug: `approved-org-${Date.now()}`,
        contactEmail: `approved-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    approvedOrgId = approvedOrg.id;

    // Create a second organization for tenant isolation tests
    const otherOrg = await prisma.organization.create({
      data: {
        name: `Other Org Test ${Date.now()}`,
        slug: `other-org-${Date.now()}`,
        contactEmail: `other-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    otherOrgId = otherOrg.id;

    superAdminToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000089',
      email: 'superadmin-proj@agency.com',
      role: UserRole.SUPER_ADMIN,
    });

    adminToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000088',
      email: 'admin-proj@agency.com',
      role: UserRole.ADMIN,
    });

    bdToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000087',
      email: 'bd-proj@agency.com',
      role: UserRole.BD,
    });

    pmToken = authService.createDevToken({
      id: pmUserId,
      email: pm.email,
      role: UserRole.PROJECT_MANAGER,
    });

    devToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000085',
      email: 'dev-proj@agency.com',
      role: UserRole.DEVELOPER,
    });

    qaToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000084',
      email: 'qa-proj@agency.com',
      role: UserRole.QA,
    });

    const clientUser = await prisma.user.create({
      data: {
        email: `client-proj-${Date.now()}@client.com`,
        role: UserRole.CLIENT,
        organizationId: approvedOrgId,
        status: 'ACTIVE',
      },
    });

    clientToken = authService.createDevToken({
      id: clientUser.id,
      email: clientUser.email,
      role: clientUser.role,
      organizationId: clientUser.organizationId,
    });
  });

  afterAll(async () => {
    if (createdProjectId) {
      await prisma.projectMember.deleteMany({ where: { projectId: createdProjectId } });
      await prisma.project.deleteMany({ where: { id: createdProjectId } });
    }
    await prisma.projectRequest.deleteMany({ where: { organizationId: { in: [approvedOrgId, otherOrgId] } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'client-proj-' } } });
    if (approvedOrgId) await prisma.organization.deleteMany({ where: { id: approvedOrgId } });
    if (otherOrgId) await prisma.organization.deleteMany({ where: { id: otherOrgId } });
    await prisma.$disconnect();
  });

  it('CLIENT can submit a project request for their own organization', async () => {
    const res = await request(app)
      .post('/api/projects/requests')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        name: 'Client Redesign Request',
        description: 'Needs mobile support and dark mode',
        budget: 15000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organizationId).toBe(approvedOrgId);
    expect(res.body.data.status).toBe('PENDING');
  });

  it('CLIENT cannot submit a project request for another organization', async () => {
    const res = await request(app)
      .post('/api/projects/requests')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        name: 'Cross-Tenant Request Attack',
        organizationId: otherOrgId, // attempting to submit for another org
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('CLIENT cannot create an official project directly', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        name: 'Official Project By Client',
        code: `CLT-${Date.now() % 10000}`,
        organizationId: approvedOrgId,
        projectManagerId: pmUserId,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('BD cannot create an official project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${bdToken}`)
      .send({
        name: 'Official Project By BD',
        code: `BD-${Date.now() % 10000}`,
        organizationId: approvedOrgId,
        projectManagerId: pmUserId,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('PROJECT_MANAGER cannot create an official project (direct API returns 403)', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        name: 'Official Project By PM',
        code: `PM-${Date.now() % 10000}`,
        organizationId: approvedOrgId,
        projectManagerId: pmUserId,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('DEVELOPER cannot create an official project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        name: 'Official Project By Dev',
        code: `DEV-${Date.now() % 10000}`,
        organizationId: approvedOrgId,
        projectManagerId: pmUserId,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('QA cannot create an official project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${qaToken}`)
      .send({
        name: 'Official Project By QA',
        code: `QA-${Date.now() % 10000}`,
        organizationId: approvedOrgId,
        projectManagerId: pmUserId,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('ADMIN can create an official project', async () => {
    const projectCode = `ADM${Math.floor(Math.random() * 8999 + 1000)}`;
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Official Admin Project',
        code: projectCode,
        organizationId: approvedOrgId,
        projectManagerId: pmUserId,
        budget: 50000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe(projectCode);
    createdProjectId = res.body.data.id;
  });

  it('SUPER_ADMIN can create an official project', async () => {
    const projectCode = `SA${Math.floor(Math.random() * 8999 + 1000)}`;
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Official SuperAdmin Project',
        code: projectCode,
        organizationId: approvedOrgId,
        projectManagerId: pmUserId,
        budget: 75000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Cleanup this test project
    await prisma.projectMember.deleteMany({ where: { projectId: res.body.data.id } });
    await prisma.project.deleteMany({ where: { id: res.body.data.id } });
  });

  it('PM retains project-management capabilities for assigned project', async () => {
    // PM can fetch project health for assigned project
    const res = await request(app)
      .get(`/api/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${pmToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdProjectId);
  });
});
