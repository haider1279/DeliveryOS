import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole, UserStatus, OrganizationQualificationStatus } from '@deliveryos/shared';

/**
 * Regression coverage for the admin-approval authority race condition:
 *
 *   BD opens a lead  ->  ADMIN approves it  ->  BD's stale browser still shows
 *   "Reject"  ->  BD clicks Reject  ->  the backend MUST refuse and the lead
 *   MUST remain APPROVED.
 *
 * The DB is the only authority; role checks and frontend state are irrelevant.
 */
describe('Lead qualification authority / stale-client race condition', () => {
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let superAdminToken: string;
  let adminToken: string;
  let bdToken: string;
  let qaToken: string;

  /**
   * Real, persisted actors — the service resolves the authority of the stored
   * decision through `qualifiedById`, so the decider must be a real user row for
   * the SUPER_ADMIN > ADMIN ordering to be exercised faithfully.
   */
  const createActor = async (role: UserRole) => {
    const user = await prisma.user.create({
      data: {
        email: `authority-actor-${unique()}@test.com`,
        role,
        status: UserStatus.ACTIVE,
        passwordHash: 'not-used-in-these-tests',
      },
    });
    createdUserIds.push(user.id);
    return user;
  };

  beforeAll(async () => {
    const superAdmin = await createActor(UserRole.SUPER_ADMIN);
    const admin = await createActor(UserRole.ADMIN);
    const bd = await createActor(UserRole.BD);
    const qa = await createActor(UserRole.QA);

    superAdminToken = authService.createDevToken({
      id: superAdmin.id,
      email: superAdmin.email,
      role: UserRole.SUPER_ADMIN,
    });
    adminToken = authService.createDevToken({
      id: admin.id,
      email: admin.email,
      role: UserRole.ADMIN,
    });
    bdToken = authService.createDevToken({
      id: bd.id,
      email: bd.email,
      role: UserRole.BD,
    });
    qaToken = authService.createDevToken({
      id: qa.id,
      email: qa.email,
      role: UserRole.QA,
    });
  });

  const createProspect = async () => {
    const org = await prisma.organization.create({
      data: {
        name: `Authority Test Lead ${unique()}`,
        slug: `authority-test-${unique()}`,
        contactEmail: `authority-invite-${unique()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.PROSPECT,
      },
    });
    createdOrgIds.push(org.id);
    return org;
  };

  const readStatus = async (id: string) => {
    const org = await prisma.organization.findUnique({ where: { id } });
    return org?.qualificationStatus;
  };

  const qualify = (id: string, token: string, decision: OrganizationQualificationStatus) =>
    request(app)
      .patch(`/api/organizations/${id}/qualify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision });

  afterEach(async () => {
    // Approving a lead auto-invites its contact representative, so clear those.
    await prisma.user.deleteMany({ where: { email: { startsWith: 'authority-invite-' } } });
    if (createdOrgIds.length) {
      await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds.splice(0) } } });
    }
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
    }
  });

  it('rejects a stale BD rejection after ADMIN approval and keeps the lead APPROVED', async () => {
    // 1. Create pending lead.
    const lead = await createProspect();
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.PROSPECT);

    // 2. BD can legitimately reject a still-pending lead (baseline behaviour).
    const baseline = await prisma.organization.create({
      data: {
        name: `Authority Baseline ${unique()}`,
        slug: `authority-baseline-${unique()}`,
        contactEmail: `authority-invite-baseline-${unique()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.PROSPECT,
      },
    });
    createdOrgIds.push(baseline.id);

    const bdReject = await qualify(
      baseline.id,
      bdToken,
      OrganizationQualificationStatus.REJECTED
    );
    expect(bdReject.status).toBe(200);
    expect(bdReject.body.success).toBe(true);
    expect(await readStatus(baseline.id)).toBe(OrganizationQualificationStatus.REJECTED);

    // 3. ADMIN approves the real lead.
    const approved = await qualify(
      lead.id,
      adminToken,
      OrganizationQualificationStatus.APPROVED
    );
    expect(approved.status).toBe(200);
    expect(approved.body.data.qualificationStatus).toBe(OrganizationQualificationStatus.APPROVED);

    // 4. BD's browser is stale and submits REJECTED anyway.
    const staleReject = await qualify(
      lead.id,
      bdToken,
      OrganizationQualificationStatus.REJECTED
    );

    // 5. The backend must refuse with a 4xx and a clear message.
    expect(staleReject.status).toBeGreaterThanOrEqual(400);
    expect(staleReject.status).toBeLessThan(500);
    expect(staleReject.body.success).toBe(false);
    expect(staleReject.body.error.message).toMatch(
      /Cannot reject this lead because it has already been approved/i
    );

    // 6. The lead must still be APPROVED.
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);

    // 7. BD can never push it back to REJECTED, however many times it retries.
    const retry = await qualify(lead.id, bdToken, OrganizationQualificationStatus.REJECTED);
    expect(retry.status).toBeGreaterThanOrEqual(400);
    expect(retry.status).toBeLessThan(500);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);
  });

  it('rejects a stale BD rejection after SUPER_ADMIN approval and keeps the lead APPROVED', async () => {
    const lead = await createProspect();

    const approved = await qualify(
      lead.id,
      superAdminToken,
      OrganizationQualificationStatus.APPROVED
    );
    expect(approved.status).toBe(200);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);

    const staleReject = await qualify(lead.id, bdToken, OrganizationQualificationStatus.REJECTED);
    expect(staleReject.status).toBeGreaterThanOrEqual(400);
    expect(staleReject.status).toBeLessThan(500);
    expect(staleReject.body.success).toBe(false);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);
  });

  it('rejects a stale BD rejection after a BD rejection was later approved by an admin', async () => {
    // PROSPECT -> BD REJECTED -> ADMIN APPROVED (correction) -> BD tries to re-reject.
    const lead = await createProspect();

    const bdFirst = await qualify(lead.id, bdToken, OrganizationQualificationStatus.REJECTED);
    expect(bdFirst.status).toBe(200);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.REJECTED);

    const adminCorrection = await qualify(
      lead.id,
      adminToken,
      OrganizationQualificationStatus.APPROVED
    );
    expect(adminCorrection.status).toBe(200);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);

    const staleReReject = await qualify(lead.id, bdToken, OrganizationQualificationStatus.REJECTED);
    expect(staleReReject.status).toBeGreaterThanOrEqual(400);
    expect(staleReReject.status).toBeLessThan(500);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);
  });

  it('refuses to let ADMIN overwrite a SUPER_ADMIN decision (SUPER_ADMIN > ADMIN)', async () => {
    const lead = await createProspect();

    const superApproved = await qualify(
      lead.id,
      superAdminToken,
      OrganizationQualificationStatus.APPROVED
    );
    expect(superApproved.status).toBe(200);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);

    // ADMIN has strictly lower authority than the stored decision's actor.
    const adminReject = await qualify(lead.id, adminToken, OrganizationQualificationStatus.REJECTED);
    expect(adminReject.status).toBeGreaterThanOrEqual(400);
    expect(adminReject.status).toBeLessThan(500);
    expect(adminReject.body.success).toBe(false);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);
  });

  it('refuses to let a lower-role user overwrite an administrative decision', async () => {
    const lead = await createProspect();

    const approved = await qualify(
      lead.id,
      adminToken,
      OrganizationQualificationStatus.APPROVED
    );
    expect(approved.status).toBe(200);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);

    // QA cannot even reach the endpoint (403), and still cannot change the lead.
    const qaReject = await qualify(lead.id, qaToken, OrganizationQualificationStatus.REJECTED);
    expect(qaReject.status).toBe(403);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.APPROVED);
  });

  it('keeps legitimate ADMIN/SUPER_ADMIN actions working', async () => {
    // ADMIN approves a PROSPECT (2 > 1) — allowed.
    const adminLead = await createProspect();
    const adminApprove = await qualify(
      adminLead.id,
      adminToken,
      OrganizationQualificationStatus.APPROVED
    );
    expect(adminApprove.status).toBe(200);
    expect(await readStatus(adminLead.id)).toBe(OrganizationQualificationStatus.APPROVED);

    // ADMIN rejects a PROSPECT — allowed.
    const adminRejectLead = await createProspect();
    const adminReject = await qualify(
      adminRejectLead.id,
      adminToken,
      OrganizationQualificationStatus.REJECTED
    );
    expect(adminReject.status).toBe(200);
    expect(await readStatus(adminRejectLead.id)).toBe(OrganizationQualificationStatus.REJECTED);

    // ADMIN corrects a BD rejection back to APPROVED (2 > 1) — allowed.
    const corrected = await createProspect();
    await qualify(corrected.id, bdToken, OrganizationQualificationStatus.REJECTED);
    const correction = await qualify(
      corrected.id,
      adminToken,
      OrganizationQualificationStatus.APPROVED
    );
    expect(correction.status).toBe(200);
    expect(await readStatus(corrected.id)).toBe(OrganizationQualificationStatus.APPROVED);

    // SUPER_ADMIN overrides an ADMIN decision (3 > 2) — allowed.
    const superOverride = await qualify(
      corrected.id,
      superAdminToken,
      OrganizationQualificationStatus.REJECTED
    );
    expect(superOverride.status).toBe(200);
    expect(await readStatus(corrected.id)).toBe(OrganizationQualificationStatus.REJECTED);
  });

  it('refuses a redundant re-decision with a 4xx and leaves the lead untouched', async () => {
    const lead = await createProspect();

    await qualify(lead.id, bdToken, OrganizationQualificationStatus.REJECTED);
    const redundant = await qualify(lead.id, bdToken, OrganizationQualificationStatus.REJECTED);

    expect(redundant.status).toBe(400);
    expect(redundant.body.success).toBe(false);
    expect(await readStatus(lead.id)).toBe(OrganizationQualificationStatus.REJECTED);
  });

  it('lets only one of two concurrent conflicting decisions win', async () => {
    const lead = await createProspect();

    // ADMIN approves while BD rejects at the same time. Exactly one may land.
    const results = await Promise.all([
      qualify(lead.id, adminToken, OrganizationQualificationStatus.APPROVED),
      qualify(lead.id, bdToken, OrganizationQualificationStatus.REJECTED),
    ]);

    const okCount = results.filter((r) => r.status === 200).length;
    expect(okCount).toBe(1);

    const finalStatus = await readStatus(lead.id);
    expect([OrganizationQualificationStatus.APPROVED, OrganizationQualificationStatus.REJECTED]).toContain(
      finalStatus
    );

    // If the ADMIN approval won, the lead must still be APPROVED (BD lost).
    if (finalStatus === OrganizationQualificationStatus.APPROVED) {
      const loser = results.find((r) => r.status !== 200);
      expect(loser?.status).toBeGreaterThanOrEqual(400);
      expect(loser?.status).toBeLessThan(500);
    }
  });
});
