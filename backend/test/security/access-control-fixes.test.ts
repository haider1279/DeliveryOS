import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';

/**
 * Integration tests for the object-level access-control additions
 * (project health/activity fallback, QA scoping, release/invoice/storage
 * tenant isolation, overpayment + transition gates). These tests require the
 * seeded local database (npm run db:seed) and only exercise read paths or
 * guards that fail before any mutation.
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

  beforeAll(async () => {
    const acme = await prisma.project.findFirstOrThrow({ where: { code: 'ACME-WMS' }, select: { id: true, organizationId: true } });
    const starlight = await prisma.project.findFirstOrThrow({ where: { code: 'STAR-ECOMM' }, select: { id: true, organizationId: true } });
    const dev = await prisma.user.findUniqueOrThrow({ where: { email: 'dev@deliveryos.local' } });
    const pm = await prisma.user.findUniqueOrThrow({ where: { email: 'pm@deliveryos.local' } });
    const clientAcme = await prisma.user.findUniqueOrThrow({ where: { email: 'client@acmecorp.local' } });
    const clientStarlight = await prisma.user.findUniqueOrThrow({ where: { email: 'client@starlightretail.local' } });
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { invoiceNumber: 'INV-2026-001' }, select: { id: true } });
    const release = await prisma.release.findFirstOrThrow({ where: { version: '1.0.0' }, select: { id: true } });
    const bug = await prisma.bug.findFirstOrThrow({ where: { title: { contains: 'Race Condition' } }, select: { id: true } });

    acmeProjectId = acme.id;
    starlightProjectId = starlight.id;
    acmeOrgId = acme.organizationId;
    starlightOrgId = starlight.organizationId;
    invoiceId = invoice.id;
    releaseId = release.id;
    bugId = bug.id;

    devToken = authService.createDevToken({ id: dev.id, email: dev.email, role: dev.role });
    pmToken = authService.createDevToken({ id: pm.id, email: pm.email, role: pm.role });
    clientAcmeToken = authService.createDevToken({
      id: clientAcme.id,
      email: clientAcme.email,
      role: clientAcme.role,
      organizationId: clientAcme.organizationId,
    });
    clientStarlightToken = authService.createDevToken({
      id: clientStarlight.id,
      email: clientStarlight.email,
      role: clientStarlight.role,
      organizationId: clientStarlight.organizationId,
    });
  });

  afterAll(async () => {
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