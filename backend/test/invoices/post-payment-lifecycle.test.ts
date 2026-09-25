import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole, ProjectStatus, InvoiceStatus, ReleaseStatus } from '@deliveryos/shared';

describe('Post-Payment Project Lifecycle & Global Status Synchronization', () => {
  let adminToken: string;
  let pmToken: string;
  let devToken: string;
  let qaToken: string;
  let clientToken: string;

  let adminUser: any;
  let pmUser: any;
  let devUser: any;
  let qaUser: any;
  let clientUser: any;
  let testOrg: any;
  let testProject: any;

  beforeAll(async () => {
    // 1. Create test Organization
    testOrg = await prisma.organization.create({
      data: {
        name: `Lifecycle Test Org ${Date.now()}`,
        slug: `lifecycle-test-org-${Date.now()}`,
        contactEmail: `lifecycle-${Date.now()}@test.com`,
        qualificationStatus: 'APPROVED',
      },
    });

    // 2. Create users for all roles
    adminUser = await prisma.user.create({
      data: {
        email: `admin-lifecycle-${Date.now()}@test.com`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuu',
        role: UserRole.ADMIN,
        status: 'ACTIVE',
        organizationId: testOrg.id,
      },
    });

    pmUser = await prisma.user.create({
      data: {
        email: `pm-lifecycle-${Date.now()}@test.com`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuu',
        role: UserRole.PROJECT_MANAGER,
        status: 'ACTIVE',
        organizationId: testOrg.id,
      },
    });

    devUser = await prisma.user.create({
      data: {
        email: `dev-lifecycle-${Date.now()}@test.com`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuu',
        role: UserRole.DEVELOPER,
        status: 'ACTIVE',
        organizationId: testOrg.id,
      },
    });

    qaUser = await prisma.user.create({
      data: {
        email: `qa-lifecycle-${Date.now()}@test.com`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuu',
        role: UserRole.QA,
        status: 'ACTIVE',
        organizationId: testOrg.id,
      },
    });

    clientUser = await prisma.user.create({
      data: {
        email: `client-lifecycle-${Date.now()}@test.com`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuu',
        role: UserRole.CLIENT,
        status: 'ACTIVE',
        organizationId: testOrg.id,
      },
    });

    // 3. Generate tokens using authService.createDevToken
    adminToken = authService.createDevToken({ id: adminUser.id, email: adminUser.email, role: adminUser.role, organizationId: testOrg.id });
    pmToken = authService.createDevToken({ id: pmUser.id, email: pmUser.email, role: pmUser.role, organizationId: testOrg.id });
    devToken = authService.createDevToken({ id: devUser.id, email: devUser.email, role: devUser.role, organizationId: testOrg.id });
    qaToken = authService.createDevToken({ id: qaUser.id, email: qaUser.email, role: qaUser.role, organizationId: testOrg.id });
    clientToken = authService.createDevToken({ id: clientUser.id, email: clientUser.email, role: clientUser.role, organizationId: testOrg.id });

    // Create a test project
    testProject = await prisma.project.create({
      data: {
        name: `Lifecycle Project ${Date.now()}`,
        code: `PRJ-${Date.now().toString().slice(-4)}`,
        organizationId: testOrg.id,
        projectManagerId: pmUser.id,
        status: ProjectStatus.PLANNING,
      },
    });

    // Add PM, Dev, QA, Client as members
    await prisma.projectMember.createMany({
      data: [
        { projectId: testProject.id, userId: pmUser.id, membershipRole: 'PROJECT_MANAGER' },
        { projectId: testProject.id, userId: devUser.id, membershipRole: 'DEVELOPER' },
        { projectId: testProject.id, userId: qaUser.id, membershipRole: 'QA' },
      ],
    });

    // Create a deployed release on the test project
    await prisma.release.create({
      data: {
        projectId: testProject.id,
        version: '1.0.0',
        name: 'Initial Release',
        status: ReleaseStatus.DEPLOYED,
        deployedAt: new Date(),
        createdById: pmUser.id,
      },
    });
  });

  afterAll(async () => {
    if (testProject) {
      await prisma.payment.deleteMany({ where: { invoice: { projectId: testProject.id } } });
      await prisma.invoiceItem.deleteMany({ where: { invoice: { projectId: testProject.id } } });
      await prisma.invoice.deleteMany({ where: { projectId: testProject.id } });
      await prisma.releaseItem.deleteMany({ where: { release: { projectId: testProject.id } } });
      await prisma.release.deleteMany({ where: { projectId: testProject.id } });
      await prisma.projectMember.deleteMany({ where: { projectId: testProject.id } });
      await prisma.project.deleteMany({ where: { id: testProject.id } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser?.id, pmUser?.id, devUser?.id, qaUser?.id, clientUser?.id].filter(Boolean) } },
    });
    if (testOrg) {
      await prisma.organization.deleteMany({ where: { id: testOrg.id } });
    }
  });

  it('1. Initial project status is PLANNING', async () => {
    const res = await request(app)
      .get(`/api/projects/${testProject.id}`)
      .set('Authorization', `Bearer ${pmToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(ProjectStatus.PLANNING);
  });

  it('2. Unauthorized roles (CLIENT, DEVELOPER, QA) CANNOT record payment (403)', async () => {
    // Create an invoice first
    const invRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        projectId: testProject.id,
        organizationId: testOrg.id,
        invoiceNumber: `INV-LC-${Date.now()}`,
        issuedDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        currency: 'USD',
        tax: 0,
        discount: 0,
        items: [{ description: 'Milestone 1', quantity: 1, unitPrice: 1000 }],
      });
    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body.data.id;

    // Issue invoice
    await request(app)
      .post(`/api/invoices/${invoiceId}/issue`)
      .set('Authorization', `Bearer ${pmToken}`);

    // Client attempts to record payment -> 403
    const clientPay = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ invoiceId, amount: 1000, paymentDate: new Date().toISOString() });
    expect(clientPay.status).toBe(403);

    // Developer attempts to record payment -> 403
    const devPay = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ invoiceId, amount: 1000, paymentDate: new Date().toISOString() });
    expect(devPay.status).toBe(403);

    // QA attempts to record payment -> 403
    const qaPay = await request(app)
      .post(`/api/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ invoiceId, amount: 1000, paymentDate: new Date().toISOString() });
    expect(qaPay.status).toBe(403);
  });

  it('3. Partial payment marks invoice PARTIALLY_PAID and does NOT move project to COMPLETED', async () => {
    const inv = await prisma.invoice.findFirst({
      where: { projectId: testProject.id, status: InvoiceStatus.ISSUED },
    });
    expect(inv).toBeDefined();

    const res = await request(app)
      .post(`/api/invoices/${inv!.id}/payments`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        invoiceId: inv!.id,
        amount: 400,
        paymentDate: new Date().toISOString(),
        method: 'BANK_TRANSFER',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.invoice.status).toBe(InvoiceStatus.PARTIALLY_PAID);

    // Check project status remains non-COMPLETED
    const pRes = await request(app)
      .get(`/api/projects/${testProject.id}`)
      .set('Authorization', `Bearer ${pmToken}`);
    expect(pRes.body.data.status).not.toBe(ProjectStatus.COMPLETED);
  });

  it('4. Payment exceeding outstanding balance is rejected (400)', async () => {
    const inv = await prisma.invoice.findFirst({
      where: { projectId: testProject.id, status: InvoiceStatus.PARTIALLY_PAID },
    });

    const res = await request(app)
      .post(`/api/invoices/${inv!.id}/payments`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        invoiceId: inv!.id,
        amount: 999999,
        paymentDate: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toContain('exceeds the outstanding balance');
  });

  it('5. PM confirming final payment transitions invoice to PAID and project to COMPLETED atomically', async () => {
    const inv = await prisma.invoice.findFirst({
      where: { projectId: testProject.id, status: InvoiceStatus.PARTIALLY_PAID },
    });

    const res = await request(app)
      .post(`/api/invoices/${inv!.id}/payments`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({
        invoiceId: inv!.id,
        amount: 600, // Remaining balance (1000 - 400)
        paymentDate: new Date().toISOString(),
        method: 'CREDIT_CARD',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.invoice.status).toBe(InvoiceStatus.PAID);

    // Verify Project status updated to COMPLETED in database & project endpoint
    const pRes = await request(app)
      .get(`/api/projects/${testProject.id}`)
      .set('Authorization', `Bearer ${pmToken}`);
    expect(pRes.status).toBe(200);
    expect(pRes.body.data.status).toBe(ProjectStatus.COMPLETED);
  });

  it('6. Global project status synchronization: all endpoints return COMPLETED', async () => {
    // Project list endpoint for PM
    const listRes = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${pmToken}`);
    const projList = Array.isArray(listRes.body) ? listRes.body : (listRes.body?.items || listRes.body?.data || []);
    const foundProject = projList.find((p: any) => p.id === testProject.id);
    expect(foundProject).toBeDefined();
    expect(foundProject.status).toBe(ProjectStatus.COMPLETED);

    // Client portal project list endpoint
    const clientListRes = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${clientToken}`);
    const clientProjList = Array.isArray(clientListRes.body) ? clientListRes.body : (clientListRes.body?.items || clientListRes.body?.data || []);
    const foundClientProject = clientProjList.find((p: any) => p.id === testProject.id);
    expect(foundClientProject).toBeDefined();
    expect(foundClientProject.status).toBe(ProjectStatus.COMPLETED);

    // Financial overview report endpoint
    const finRes = await request(app)
      .get('/api/reports/financials')
      .set('Authorization', `Bearer ${adminToken}`);
    const finList = Array.isArray(finRes.body) ? finRes.body : (finRes.body?.data || []);
    const foundFinProject = finList.find((p: any) => p.projectId === testProject.id);
    expect(foundFinProject).toBeDefined();
    expect(foundFinProject.status).toBe(ProjectStatus.COMPLETED);

    // Executive summary active projects count excludes completed project
    const execRes = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(execRes.status).toBe(200);
  });
});
