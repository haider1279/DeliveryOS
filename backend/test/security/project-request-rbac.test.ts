import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { auditService } from '../../src/services/audit.service';
import { UserRole, OrganizationQualificationStatus } from '@deliveryos/shared';

describe('Project Request Admin/SuperAdmin Management RBAC & Decision Flow', () => {
  let orgAId: string;
  let orgBId: string;
  let requestA1Id: string;
  let requestA2Id: string;
  let requestB1Id: string;

  let superAdminToken: string;
  let adminToken: string;
  let bdToken: string;
  let pmToken: string;
  let devToken: string;
  let qaToken: string;
  let clientAUserId: string;
  let clientBUserId: string;
  let clientAToken: string;
  let clientBToken: string;

  beforeAll(async () => {
    // Create Org A and Org B
    const orgA = await prisma.organization.create({
      data: {
        name: `Org A Test ${Date.now()}`,
        slug: `org-a-${Date.now()}`,
        contactEmail: `orga-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        name: `Org B Test ${Date.now()}`,
        slug: `org-b-${Date.now()}`,
        contactEmail: `orgb-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgBId = orgB.id;

    // Tokens for staff roles
    superAdminToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000099',
      email: 'superadmin-req@agency.com',
      role: UserRole.SUPER_ADMIN,
    });

    adminToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000098',
      email: 'admin-req@agency.com',
      role: UserRole.ADMIN,
    });

    bdToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000097',
      email: 'bd-req@agency.com',
      role: UserRole.BD,
    });

    pmToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000096',
      email: 'pm-req@agency.com',
      role: UserRole.PROJECT_MANAGER,
    });

    devToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000095',
      email: 'dev-req@agency.com',
      role: UserRole.DEVELOPER,
    });

    qaToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000094',
      email: 'qa-req@agency.com',
      role: UserRole.QA,
    });

    // Client user in Org A
    const clientAUser = await prisma.user.create({
      data: {
        email: `client-a-${Date.now()}@client.com`,
        role: UserRole.CLIENT,
        organizationId: orgAId,
        status: 'ACTIVE',
      },
    });
    clientAUserId = clientAUser.id;

    clientAToken = authService.createDevToken({
      id: clientAUser.id,
      email: clientAUser.email,
      role: clientAUser.role,
      organizationId: clientAUser.organizationId,
    });

    // Client user in Org B
    const clientBUser = await prisma.user.create({
      data: {
        email: `client-b-${Date.now()}@client.com`,
        role: UserRole.CLIENT,
        organizationId: orgBId,
        status: 'ACTIVE',
      },
    });
    clientBUserId = clientBUser.id;

    clientBToken = authService.createDevToken({
      id: clientBUser.id,
      email: clientBUser.email,
      role: clientBUser.role,
      organizationId: clientBUser.organizationId,
    });

    // Create Project Requests
    const reqA1 = await prisma.projectRequest.create({
      data: {
        organizationId: orgAId,
        requestedById: clientAUser.id,
        name: 'Request A1',
        description: 'First request for Org A',
        budget: 10000,
        status: 'PENDING',
      },
    });
    requestA1Id = reqA1.id;

    const reqA2 = await prisma.projectRequest.create({
      data: {
        organizationId: orgAId,
        requestedById: clientAUser.id,
        name: 'Request A2',
        description: 'Second request for Org A',
        budget: 20000,
        status: 'PENDING',
      },
    });
    requestA2Id = reqA2.id;

    const reqB1 = await prisma.projectRequest.create({
      data: {
        organizationId: orgBId,
        requestedById: clientBUser.id,
        name: 'Request B1',
        description: 'First request for Org B',
        budget: 15000,
        status: 'PENDING',
      },
    });
    requestB1Id = reqB1.id;
  });

  afterAll(async () => {
    if (orgAId || orgBId) {
      await prisma.projectRequest.deleteMany({
        where: { organizationId: { in: [orgAId, orgBId].filter(Boolean) } },
      });
    }
    if (clientAUserId || clientBUserId) {
      await prisma.user.deleteMany({
        where: { id: { in: [clientAUserId, clientBUserId].filter(Boolean) } },
      });
    }
    if (orgAId) await prisma.organization.deleteMany({ where: { id: orgAId } });
    if (orgBId) await prisma.organization.deleteMany({ where: { id: orgBId } });
    await prisma.$disconnect();
  });

  describe('Listing & Viewing Requests (RBAC)', () => {
    it('SUPER_ADMIN can list all project requests', async () => {
      const res = await request(app)
        .get('/api/projects/requests')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((r: any) => r.id);
      expect(ids).toContain(requestA1Id);
      expect(ids).toContain(requestB1Id);
    });

    it('ADMIN can list all project requests', async () => {
      const res = await request(app)
        .get('/api/projects/requests')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((r: any) => r.id);
      expect(ids).toContain(requestA1Id);
      expect(ids).toContain(requestB1Id);
    });

    it('CLIENT A can only list their own organization requests', async () => {
      const res = await request(app)
        .get('/api/projects/requests')
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((r: any) => r.id);
      expect(ids).toContain(requestA1Id);
      expect(ids).toContain(requestA2Id);
      expect(ids).not.toContain(requestB1Id);
    });

    it('CLIENT A cannot view request details of Org B (returns 403)', async () => {
      const res = await request(app)
        .get(`/api/projects/requests/${requestB1Id}`)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('PM, BD, DEVELOPER, QA receive 403 on GET /api/projects/requests', async () => {
      for (const token of [pmToken, bdToken, devToken, qaToken]) {
        const res = await request(app)
          .get('/api/projects/requests')
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      }
    });

    it('ADMIN / SUPER_ADMIN can view specific request details', async () => {
      const res = await request(app)
        .get(`/api/projects/requests/${requestA1Id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(requestA1Id);
      expect(res.body.data.organization).toBeDefined();
    });
  });

  describe('Decision Flow (Approve / Reject)', () => {
    it('Non-admin roles receive 403 on PATCH /api/projects/requests/:id/decision', async () => {
      for (const token of [clientAToken, pmToken, bdToken, devToken, qaToken]) {
        const res = await request(app)
          .patch(`/api/projects/requests/${requestA1Id}/decision`)
          .set('Authorization', `Bearer ${token}`)
          .send({ decision: 'APPROVED' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      }
    });

    it('ADMIN can approve a PENDING request', async () => {
      const spy = vi.spyOn(auditService, 'log');

      const res = await request(app)
        .patch(`/api/projects/requests/${requestA1Id}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED', notes: 'Scope approved' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.notes).toBe('Scope approved');

      // Verify auditService.log was invoked with right payload
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_REQUEST_APPROVED',
          entityType: 'ProjectRequest',
          entityId: requestA1Id,
        })
      );
      spy.mockRestore();
    });

    it('Attempting to decision an already APPROVED request returns 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/projects/requests/${requestA1Id}/decision`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ decision: 'REJECTED', notes: 'Trying to reject approved request' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('SUPER_ADMIN can reject a PENDING request', async () => {
      const spy = vi.spyOn(auditService, 'log');

      const res = await request(app)
        .patch(`/api/projects/requests/${requestA2Id}/decision`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ decision: 'REJECTED', notes: 'Out of budget' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.notes).toBe('Out of budget');

      // Verify auditService.log was invoked with right payload
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PROJECT_REQUEST_REJECTED',
          entityType: 'ProjectRequest',
          entityId: requestA2Id,
        })
      );
      spy.mockRestore();
    });

    it('Attempting to decision an already REJECTED request returns 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/projects/requests/${requestA2Id}/decision`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'APPROVED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
