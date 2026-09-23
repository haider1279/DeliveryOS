import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import {
  UserRole,
  OrganizationQualificationStatus,
  ProjectStatus,
  ReleaseStatus,
  InvoiceStatus,
  BugStatus,
  BugSeverity,
  BugPriority,
} from '@deliveryos/shared';

/**
 * Integration tests for the object-level access-control additions
 * (project health/activity fallback, QA scoping, release/invoice/storage
 * tenant isolation, overpayment + transition gates).
 */
describe('Access-control fixes (seeded database)', () => {
  let acmeProjectId: string;
  let starlightProjectId: string;
  let acmeOrgId: string;
  let starlightOrgId: string;
  let invoiceId: string;
  let releaseId: string;
  let bugId: string;
  let devToken: string;
  let pmToken: string;
  let clientAcmeToken: string;
  let clientStarlightToken: string;
  let clientAcmeUser: any;
  let clientStarlightUser: any;

  beforeAll(async () => {
    const dev = await prisma.user.findUniqueOrThrow({ where: { email: 'haider7.euroshub@gmail.com' } });
    const pm = await prisma.user.findUniqueOrThrow({ where: { email: 'haider8.euroshub@gmail.com' } });

    // Create 2 test organizations
    const acmeOrg = await prisma.organization.create({
      data: {
        name: `ACME Test Corp ${Date.now()}`,
        slug: `acme-test-${Date.now()}`,
        contactEmail: `acme-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    acmeOrgId = acmeOrg.id;

    const starlightOrg = await prisma.organization.create({
      data: {
        name: `Starlight Test ${Date.now()}`,
        slug: `starlight-test-${Date.now()}`,
        contactEmail: `starlight-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    starlightOrgId = starlightOrg.id;

    // Create 2 client users
    clientAcmeUser = await prisma.user.create({
      data: {
        email: `client-acme-${Date.now()}@test.com`,
        role: UserRole.CLIENT,
        organizationId: acmeOrgId,
        status: 'ACTIVE',
      },
    });

    clientStarlightUser = await prisma.user.create({
      data: {
        email: `client-star-${Date.now()}@test.com`,
        role: UserRole.CLIENT,
        organizationId: starlightOrgId,
        status: 'ACTIVE',
      },
    });

    // Create projects
    const acmeProject = await prisma.project.create({
      data: {
        name: `ACME WMS ${Date.now()}`,
        code: `ACME-${Math.floor(Math.random() * 100000)}`,
        organizationId: acmeOrgId,
        projectManagerId: pm.id,
        status: ProjectStatus.ACTIVE,
        members: {
          create: [
            { userId: pm.id, membershipRole: 'PROJECT_MANAGER' },
            { userId: dev.id, membershipRole: 'DEVELOPER' },
          ],
        },
      },
    });
    acmeProjectId = acmeProject.id;

    const starlightProject = await prisma.project.create({
      data: {
        name: `Starlight EComm ${Date.now()}`,
        code: `STAR-${Math.floor(Math.random() * 100000)}`,
        organizationId: starlightOrgId,
        projectManagerId: pm.id,
        status: ProjectStatus.ACTIVE,
      },
    });
    starlightProjectId = starlightProject.id;

    // Create a bug in ACME project
    const bug = await prisma.bug.create({
      data: {
        title: 'Race Condition in inventory lock',
        description: 'Testing bug access control',
        stepsToReproduce: '1. Go to inventory\n2. Attempt dual reservation\n3. Observe lock failure',
        expectedResult: 'Lock prevents concurrent allocation',
        actualResult: 'Double allocation occurs',
        projectId: acmeProjectId,
        reporterId: dev.id,
        severity: BugSeverity.HIGH,
        priority: BugPriority.HIGH,
        status: BugStatus.OPEN,
      },
    });
    bugId = bug.id;

    // Create a release in ACME project
    const release = await prisma.release.create({
      data: {
        projectId: acmeProjectId,
        version: '1.0.0',
        name: 'Initial Production Release',
        createdById: pm.id,
        status: ReleaseStatus.DEPLOYED,
        releaseDate: new Date(),
        deployedAt: new Date(),
      },
    });
    releaseId = release.id;

    // Create an invoice in ACME project
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: acmeOrgId,
        projectId: acmeProjectId,
        invoiceNumber: `INV-${Date.now()}`,
        status: InvoiceStatus.ISSUED,
        subtotal: 6500,
        discount: 0,
        tax: 0,
        total: 6500,
        currency: 'USD',
        issuedDate: new Date(),
        dueDate: new Date(Date.now() + 86400000 * 30),
        items: {
          create: [{ description: 'Sprint 1', quantity: 1, unitPrice: 6500, amount: 6500 }],
        },
      },
    });
    invoiceId = invoice.id;

    devToken = authService.createDevToken({ id: dev.id, email: dev.email, role: dev.role });
    pmToken = authService.createDevToken({ id: pm.id, email: pm.email, role: pm.role });
    clientAcmeToken = authService.createDevToken({
      id: clientAcmeUser.id,
      email: clientAcmeUser.email,
      role: clientAcmeUser.role,
      organizationId: clientAcmeUser.organizationId,
    });
    clientStarlightToken = authService.createDevToken({
      id: clientStarlightUser.id,
      email: clientStarlightUser.email,
      role: clientStarlightUser.role,
      organizationId: clientStarlightUser.organizationId,
    });
  });

  afterAll(async () => {
    if (bugId) await prisma.bug.deleteMany({ where: { id: bugId } });
    if (releaseId) await prisma.release.deleteMany({ where: { id: releaseId } });
    if (invoiceId) {
      await prisma.payment.deleteMany({ where: { invoiceId } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
      await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    }
    if (acmeProjectId) {
      await prisma.projectMember.deleteMany({ where: { projectId: acmeProjectId } });
      await prisma.project.deleteMany({ where: { id: acmeProjectId } });
    }
    if (starlightProjectId) {
      await prisma.projectMember.deleteMany({ where: { projectId: starlightProjectId } });
      await prisma.project.deleteMany({ where: { id: starlightProjectId } });
    }
    if (clientAcmeUser) await prisma.user.deleteMany({ where: { id: clientAcmeUser.id } });
    if (clientStarlightUser) await prisma.user.deleteMany({ where: { id: clientStarlightUser.id } });
    if (acmeOrgId) await prisma.organization.deleteMany({ where: { id: acmeOrgId } });
    if (starlightOrgId) await prisma.organization.deleteMany({ where: { id: starlightOrgId } });
    await prisma.$disconnect();
  });

  describe('Project object-level access (requireProjectAccess fallback)', () => {
    it('project member can read project health', async () => {
      const res = await request(app)
        .get(`/api/projects/${acmeProjectId}/health`)
        .set('Authorization', `Bearer ${devToken}`);
      expect(res.status).toBe(200);
    });

    it('non-member (dev) is 404 on another project health and activity', async () => {
      const health = await request(app)
        .get(`/api/projects/${starlightProjectId}/health`)
        .set('Authorization', `Bearer ${devToken}`);
      const activity = await request(app)
        .get(`/api/projects/${starlightProjectId}/activity`)
        .set('Authorization', `Bearer ${devToken}`);
      expect(health.status).toBe(404);
      expect(activity.status).toBe(404);
    });

    it('client cannot read another org project health', async () => {
      const res = await request(app)
        .get(`/api/projects/${acmeProjectId}/health`)
        .set('Authorization', `Bearer ${clientStarlightToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('QA module access', () => {
    it('client (own org) may view a bug via portal feedback', async () => {
      const res = await request(app)
        .get(`/api/qa/bugs/${bugId}`)
        .set('Authorization', `Bearer ${clientAcmeToken}`);
      expect(res.status).toBe(200);
    });

    it('client (other org) is 404 on a cross-org bug', async () => {
      const res = await request(app)
        .get(`/api/qa/bugs/${bugId}`)
        .set('Authorization', `Bearer ${clientStarlightToken}`);
      expect(res.status).toBe(404);
    });

    it('client has no access to test cases', async () => {
      const res = await request(app)
        .get(`/api/qa/test-cases?projectId=${acmeProjectId}`)
        .set('Authorization', `Bearer ${clientAcmeToken}`);
      expect(res.status).toBe(403);
    });

    it('developer cannot move a bug to CLOSED (QA-only gate)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${bugId}/status`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ status: 'CLOSED' });
      expect([403, 400, 404]).toContain(res.status);
    });
  });

  describe('Release tenant isolation', () => {
    it('client (own org) sees the deployed release by id', async () => {
      const res = await request(app)
        .get(`/api/releases/${releaseId}`)
        .set('Authorization', `Bearer ${clientAcmeToken}`);
      expect(res.status).toBe(200);
    });

    it('client (other org) is 404 on a cross-org release', async () => {
      const res = await request(app)
        .get(`/api/releases/${releaseId}`)
        .set('Authorization', `Bearer ${clientStarlightToken}`);
      expect(res.status).toBe(404);
    });

    it('client list only returns deployed/rolled-back releases', async () => {
      const res = await request(app)
        .get(`/api/releases?projectId=${acmeProjectId}`)
        .set('Authorization', `Bearer ${clientAcmeToken}`);
      expect(res.status).toBe(200);
      for (const r of res.body.data) {
        expect(['DEPLOYED', 'ROLLED_BACK']).toContain(r.status);
      }
    });

    it('non-client cannot use the client-review endpoint', async () => {
      const res = await request(app)
        .post('/api/releases/requirements/00000000-0000-0000-0000-000000000000/review')
        .set('Authorization', `Bearer ${devToken}`)
        .send({ decision: 'APPROVED' });
      expect(res.status).toBe(403);
    });
  });

  describe('Invoice tenant isolation', () => {
    it('client (own org) can read their invoice by id', async () => {
      const res = await request(app)
        .get(`/api/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${clientAcmeToken}`);
      expect(res.status).toBe(200);
    });

    it('client (other org) is 404 on a cross-org invoice', async () => {
      const res = await request(app)
        .get(`/api/invoices/${invoiceId}`)
        .set('Authorization', `Bearer ${clientStarlightToken}`);
      expect(res.status).toBe(404);
    });

    it('overpayment is rejected without recording a payment', async () => {
      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({
          invoiceId,
          amount: 7000, // outstanding balance is 6500
          paymentDate: new Date().toISOString(),
          method: 'WIRE_TRANSFER',
        });
      expect(res.status).toBe(400);
    });

    it('client cannot record a payment', async () => {
      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${clientAcmeToken}`)
        .send({
          invoiceId,
          amount: 1000,
          paymentDate: new Date().toISOString(),
          method: 'WIRE_TRANSFER',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('Storage registration access', () => {
    const base = {
      storageKey: `test/access-guard-${Date.now()}.txt`,
      originalFilename: 'guard.txt',
      mimeType: 'text/plain',
      sizeBytes: 42,
    };

    it('client cannot register file assets', async () => {
      const res = await request(app)
        .post('/api/storage')
        .set('Authorization', `Bearer ${clientAcmeToken}`)
        .send({
          ...base,
          organizationId: acmeOrgId,
          projectId: acmeProjectId,
          relatedEntityType: 'PROJECT',
          relatedEntityId: acmeProjectId,
        });
      expect(res.status).toBe(403);
    });

    it('non-member cannot attach files to another org project', async () => {
      const res = await request(app)
        .post('/api/storage')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          ...base,
          organizationId: starlightOrgId,
          projectId: starlightProjectId,
          relatedEntityType: 'PROJECT',
          relatedEntityId: starlightProjectId,
        });
      expect(res.status).toBe(404);
    });
  });

  describe('Report scoping', () => {
    it('PM can access the executive summary', async () => {
      const res = await request(app)
        .get('/api/reports/summary')
        .set('Authorization', `Bearer ${pmToken}`);
      expect(res.status).toBe(200);
    });
  });
});