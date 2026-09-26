import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { tokenForRole } from '../helpers/role-token';
import { UserRole, OrganizationQualificationStatus } from '@deliveryos/shared';

describe('Lead Approval Authorization RBAC Matrix', () => {
  let prospectOrgId: string;
  let clientOrgId: string;

  let superAdminToken: string;
  let adminToken: string;
  let bdToken: string;
  let pmToken: string;
  let devToken: string;
  let qaToken: string;
  let clientToken: string;

  beforeAll(async () => {
    // Create a prospect organization for approval tests
    const prospectOrg = await prisma.organization.create({
      data: {
        name: `Prospect Lead Approval Test ${Date.now()}`,
        slug: `prospect-test-${Date.now()}`,
        contactEmail: `lead-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.PROSPECT,
      },
    });
    prospectOrgId = prospectOrg.id;

    // Create a separate client org for client token
    const clientOrg = await prisma.organization.create({
      data: {
        name: `Client Org ${Date.now()}`,
        slug: `client-org-${Date.now()}`,
        contactEmail: `client-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    clientOrgId = clientOrg.id;

    // Real seeded accounts so every request authenticates against an actual
    // database row (authMiddleware resolves identity from the DB per request).
    [superAdminToken, adminToken, bdToken, pmToken, devToken, qaToken, clientToken] =
      await Promise.all([
        tokenForRole(UserRole.SUPER_ADMIN),
        tokenForRole(UserRole.ADMIN),
        tokenForRole(UserRole.BD),
        tokenForRole(UserRole.PROJECT_MANAGER),
        tokenForRole(UserRole.DEVELOPER),
        tokenForRole(UserRole.QA),
        tokenForRole(UserRole.CLIENT),
      ]);
  });

  afterAll(async () => {
    if (prospectOrgId) await prisma.organization.deleteMany({ where: { id: prospectOrgId } });
    if (clientOrgId) await prisma.organization.deleteMany({ where: { id: clientOrgId } });
    await prisma.$disconnect();
  });

  it('BD receives authorization failure (403) when attempting lead approval directly via API', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${prospectOrgId}/qualify`)
      .set('Authorization', `Bearer ${bdToken}`)
      .send({ decision: OrganizationQualificationStatus.APPROVED, notes: 'BD attempt' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('PROJECT_MANAGER receives authorization failure (403) when attempting lead approval', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${prospectOrgId}/qualify`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ decision: OrganizationQualificationStatus.APPROVED });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('DEVELOPER receives authorization failure (403) when attempting lead approval', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${prospectOrgId}/qualify`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ decision: OrganizationQualificationStatus.APPROVED });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('QA receives authorization failure (403) when attempting lead approval', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${prospectOrgId}/qualify`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ decision: OrganizationQualificationStatus.APPROVED });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('CLIENT receives authorization failure (403) when attempting lead approval', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${prospectOrgId}/qualify`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ decision: OrganizationQualificationStatus.APPROVED });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('ADMIN can approve a lead', async () => {
    const res = await request(app)
      .patch(`/api/organizations/${prospectOrgId}/qualify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: OrganizationQualificationStatus.APPROVED, notes: 'Approved by Admin' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.qualificationStatus).toBe(OrganizationQualificationStatus.APPROVED);
  });

  it('SUPER_ADMIN can approve a lead', async () => {
    // Reset back to PROSPECT first
    await prisma.organization.update({
      where: { id: prospectOrgId },
      data: { qualificationStatus: OrganizationQualificationStatus.PROSPECT },
    });

    const res = await request(app)
      .patch(`/api/organizations/${prospectOrgId}/qualify`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ decision: OrganizationQualificationStatus.APPROVED, notes: 'Approved by SuperAdmin' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.qualificationStatus).toBe(OrganizationQualificationStatus.APPROVED);
  });
});
