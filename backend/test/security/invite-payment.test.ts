import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import * as supabaseAdminModule from '../../src/services/supabase-admin.service';
import { OrganizationQualificationStatus, ProjectStatus, InvoiceStatus } from '@deliveryos/shared';

/**
 * Regression tests for the invite-token hardening (C1/C4) and the
 * payment race guard (C3).
 */
describe('Invite-token flow and payment guard (seeded database)', () => {
  let pmToken: string;
  let adminToken: string;
  let pmUser: any;
  let adminUser: any;
  let testOrgId: string;
  let testProjectId: string;
  let invoiceId: string;
  let createdEmails: string[] = [];

  beforeAll(async () => {
    pmUser = await prisma.user.findUniqueOrThrow({ where: { email: 'haider8.euroshub@gmail.com' } });
    adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'haider2.euroshub@gmail.com' } });

    // Create test organization and project for invoice test
    const testOrg = await prisma.organization.create({
      data: {
        name: `Test Org Invite ${Date.now()}`,
        slug: `test-org-invite-${Date.now()}`,
        contactEmail: `contact-${Date.now()}@testorg.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    testOrgId = testOrg.id;

    const testProject = await prisma.project.create({
      data: {
        name: `Test Project ${Date.now()}`,
        code: `TEST-${Math.floor(Math.random() * 100000)}`,
        organizationId: testOrgId,
        projectManagerId: pmUser.id,
        status: ProjectStatus.ACTIVE,
        members: {
          create: [{ userId: pmUser.id, membershipRole: 'PROJECT_MANAGER' }],
        },
      },
    });
    testProjectId = testProject.id;

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: testOrgId,
        projectId: testProjectId,
        invoiceNumber: `INV-TEST-${Date.now()}`,
        status: InvoiceStatus.ISSUED,
        subtotal: 10000,
        discount: 0,
        tax: 0,
        total: 10000,
        currency: 'USD',
        issuedDate: new Date(),
        dueDate: new Date(Date.now() + 86400000 * 30),
        items: {
          create: [
            { description: 'Phase 1 Delivery', quantity: 1, unitPrice: 10000, amount: 10000 },
          ],
        },
      },
    });
    invoiceId = invoice.id;

    pmToken = authService.createDevToken({ id: pmUser.id, email: pmUser.email, role: pmUser.role });
    adminToken = authService.createDevToken({ id: adminUser.id, email: adminUser.email, role: adminUser.role });

    vi.spyOn(supabaseAdminModule, 'getSupabaseAdmin').mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockImplementation(async (_email, _options) => ({
            data: { user: { id: `sp_user_${Date.now()}` } },
            error: null,
          })),
          updateUserById: vi.fn().mockResolvedValue({ data: { user: {} }, error: null }),
        },
      },
    } as any);
  });

  afterAll(async () => {
    if (invoiceId) {
      await prisma.payment.deleteMany({ where: { invoiceId } });
      await prisma.invoiceItem.deleteMany({ where: { invoiceId } });
      await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    }
    if (testProjectId) {
      await prisma.projectMember.deleteMany({ where: { projectId: testProjectId } });
      await prisma.project.deleteMany({ where: { id: testProjectId } });
    }
    if (testOrgId) {
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    }
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await prisma.$disconnect();
  });

  describe('Invite endpoint (C4 role restrictions)', () => {
    it('blocks non-admin (PM) from the invite endpoint', async () => {
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ email: 'nope@nowhere.local', firstName: 'N', lastName: 'O', role: 'DEVELOPER' });
      expect(res.status).toBe(403);
    });

    it('admin can invite a developer and receives a one-time token + link', async () => {
      const email = `invitetest-dev-${Date.now()}@deliveryos.local`;
      createdEmails.push(email);
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, firstName: 'Test', lastName: 'Dev', role: 'DEVELOPER' });

      expect(res.status).toBe(201);
      const data = res.body?.data;
      expect(data?.user?.status).toBe('INVITED');
      expect(data?.inviteToken).toMatch(/^[0-9a-f]{64}$/);
      // The stored value is the sha256 hash — never the plaintext token.
      expect(data?.user?.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(data?.user?.inviteTokenHash).not.toBe(data?.inviteToken);
      expect(data?.inviteUrl).toContain('accept-invite');
    });

    it('admin cannot invite a SUPER_ADMIN (C4 regardless of role)', async () => {
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'rogue@deliveryos.local', firstName: 'R', lastName: 'X', role: 'SUPER_ADMIN' });
      expect(res.status).toBe(403);
      expect(res.body?.error?.message).toMatch(/Super admin|permission to invite/);
    });

    it('admin cannot invite an ADMIN role higher than themselves', async () => {
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'rogue-admin@deliveryos.local', firstName: 'R', lastName: 'A', role: 'ADMIN' });
      expect(res.status).toBe(403);
    });
  });

  describe('Accept-invite activation (C1 single-use token)', () => {
    let inviteEmail: string;
    let inviteToken: string;

    beforeAll(async () => {
      inviteEmail = `invitetest-accept-${Date.now()}@deliveryos.local`;
      createdEmails.push(inviteEmail);
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: inviteEmail, firstName: 'Accept', lastName: 'Me', role: 'QA' });
      inviteToken = res.body?.data?.inviteToken;
      expect(inviteToken).toBeTruthy();
    });

    it('rejects an incorrect token', async () => {
      const res = await request(app)
        .post('/api/auth/accept-invite')
        .send({
          email: inviteEmail,
          token: 'f'.repeat(64),
          password: 'DeliveryOS123!',
        });
      expect(res.status).toBe(400);
    });

    it('activates the account with the correct token and returns a session', async () => {
      const res = await request(app)
        .post('/api/auth/accept-invite')
        .send({
          email: inviteEmail,
          token: inviteToken,
          password: 'NewPass123!',
          firstName: 'Accept',
          lastName: 'Me',
        });
      expect(res.status).toBe(200);
      expect(res.body?.data?.token).toBeTruthy();
      expect(res.body?.data?.user?.status).toBe('ACTIVE');

      const db = await prisma.user.findUniqueOrThrow({ where: { email: inviteEmail } });
      expect(db.inviteTokenHash).toBeNull();
      expect(db.inviteTokenExpiresAt).toBeNull();
      expect(db.passwordHash).toBeTruthy();
    });

    it('treats a replayed token as invalid (single use)', async () => {
      const res = await request(app)
        .post('/api/auth/accept-invite')
        .send({
          email: inviteEmail,
          token: inviteToken,
          password: 'NewPass123!',
        });
      expect(res.status).toBe(409);
    });

    it('activated user can log in with the new password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: inviteEmail, password: 'NewPass123!' });
      expect(res.status).toBe(200);
      expect(res.body?.data?.token).toBeTruthy();
    });

    it('legacy dev-password fallback is gone (plaintext passwords do not work)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: inviteEmail, password: 'DeliveryOS123!' });
      expect(res.status).toBe(401);
    });
  });

  describe('Payment race guard (C3 outstanding-balance check)', () => {
    it('rejects a payment that exceeds the outstanding balance', async () => {
      const before = await prisma.payment.count({ where: { invoiceId } });
      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({
          invoiceId,
          amount: 999999,
          paymentDate: new Date().toISOString(),
          reference: 'OVERTEST',
        });
      expect(res.status).toBe(400);
      expect(res.body?.error?.message).toContain('exceeds the outstanding balance');
      const after = await prisma.payment.count({ where: { invoiceId } });
      expect(after).toBe(before);
    });

    it('accepts a legitimately-sized part payment (immediate refund via cleanup)', async () => {
      const before = await prisma.payment.count({ where: { invoiceId } });
      const res = await request(app)
        .post(`/api/invoices/${invoiceId}/payments`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({
          invoiceId,
          amount: 1,
          paymentDate: new Date().toISOString(),
          reference: 'PART-TEST',
        });
      expect(res.status).toBe(201);

      // Undo the mutation so re-runs stay deterministic.
      const payment = await prisma.payment.findFirst({
        where: { invoiceId, reference: 'PART-TEST' },
      });
      if (payment) {
        await prisma.payment.delete({ where: { id: payment.id } });
      }
      const after = await prisma.payment.count({ where: { invoiceId } });
      expect(after).toBe(before);
    });
  });
});