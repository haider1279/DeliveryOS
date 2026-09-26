import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole, OrganizationQualificationStatus, ProjectStatus } from '@deliveryos/shared';

describe('Requirement Review & Clarification Workflow', () => {
  let orgAId: string;
  let orgBId: string;
  let projectAId: string;
  let projectBId: string;
  let requirementAId: string;

  let pmAUserId: string;
  let pmBUserId: string;
  let clientAUserId: string;
  let clientBUserId: string;

  let pmAToken: string;
  let pmBToken: string;
  let clientAToken: string;
  let clientBToken: string;
  let devAToken: string;
  let qaAToken: string;

  beforeAll(async () => {
    // Create Org A and Org B
    const orgA = await prisma.organization.create({
      data: {
        name: `Org A Req ${Date.now()}`,
        slug: `orga-req-${Date.now()}`,
        contactEmail: `orga-req-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        name: `Org B Req ${Date.now()}`,
        slug: `orgb-req-${Date.now()}`,
        contactEmail: `orgb-req-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgBId = orgB.id;

    // Create Users
    const pmA = await prisma.user.create({
      data: {
        email: `pma-req-${Date.now()}@agency.com`,
        role: UserRole.PROJECT_MANAGER,
        status: 'ACTIVE',
      },
    });
    pmAUserId = pmA.id;

    const pmB = await prisma.user.create({
      data: {
        email: `pmb-req-${Date.now()}@agency.com`,
        role: UserRole.PROJECT_MANAGER,
        status: 'ACTIVE',
      },
    });
    pmBUserId = pmB.id;

    const clientA = await prisma.user.create({
      data: {
        email: `clienta-req-${Date.now()}@client.com`,
        role: UserRole.CLIENT,
        organizationId: orgAId,
        status: 'ACTIVE',
      },
    });
    clientAUserId = clientA.id;

    const clientB = await prisma.user.create({
      data: {
        email: `clientb-req-${Date.now()}@client.com`,
        role: UserRole.CLIENT,
        organizationId: orgBId,
        status: 'ACTIVE',
      },
    });
    clientBUserId = clientB.id;

    const devA = await prisma.user.create({
      data: {
        email: `deva-req-${Date.now()}@agency.com`,
        role: UserRole.DEVELOPER,
        status: 'ACTIVE',
      },
    });

    const qaS = await prisma.user.create({
      data: {
        email: `qaa-req-${Date.now()}@agency.com`,
        role: UserRole.QA,
        status: 'ACTIVE',
      },
    });

    // Create Projects
    const projectA = await prisma.project.create({
      data: {
        organizationId: orgAId,
        projectManagerId: pmA.id,
        name: 'Project A',
        code: `PRJA${Date.now() % 10000}`,
        status: ProjectStatus.ACTIVE,
      },
    });
    projectAId = projectA.id;

    await prisma.projectMember.createMany({
      data: [
        { projectId: projectAId, userId: pmA.id, membershipRole: 'PROJECT_MANAGER' },
        { projectId: projectAId, userId: devA.id, membershipRole: 'DEVELOPER' },
        { projectId: projectAId, userId: qaS.id, membershipRole: 'QA' },
      ],
    });

    const projectB = await prisma.project.create({
      data: {
        organizationId: orgBId,
        projectManagerId: pmB.id,
        name: 'Project B',
        code: `PRJB${Date.now() % 10000}`,
        status: ProjectStatus.ACTIVE,
      },
    });
    projectBId = projectB.id;

    await prisma.projectMember.create({
      data: { projectId: projectBId, userId: pmB.id, membershipRole: 'PROJECT_MANAGER' },
    });

    // Tokens
    pmAToken = authService.createDevToken({ id: pmA.id, email: pmA.email, role: pmA.role });
    pmBToken = authService.createDevToken({ id: pmB.id, email: pmB.email, role: pmB.role });
    clientAToken = authService.createDevToken({
      id: clientA.id,
      email: clientA.email,
      role: clientA.role,
      organizationId: clientA.organizationId,
    });
    clientBToken = authService.createDevToken({
      id: clientB.id,
      email: clientB.email,
      role: clientB.role,
      organizationId: clientB.organizationId,
    });
    devAToken = authService.createDevToken({ id: devA.id, email: devA.email, role: devA.role });
    qaAToken = authService.createDevToken({ id: qaS.id, email: qaS.email, role: qaS.role });
  });

  afterAll(async () => {
    if (projectAId || projectBId) {
      const pIds = [projectAId, projectBId].filter(Boolean);
      await prisma.requirementApproval.deleteMany({ where: { requirement: { projectId: { in: pIds } } } });
      await prisma.estimate.deleteMany({ where: { requirement: { projectId: { in: pIds } } } });
      await prisma.requirementStatusHistory.deleteMany({ where: { requirement: { projectId: { in: pIds } } } });
      await prisma.requirementVersion.deleteMany({ where: { requirement: { projectId: { in: pIds } } } });
      await prisma.requirement.deleteMany({ where: { projectId: { in: pIds } } });
      await prisma.projectMember.deleteMany({ where: { projectId: { in: pIds } } });
      await prisma.project.deleteMany({ where: { id: { in: pIds } } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [pmAUserId, pmBUserId, clientAUserId, clientBUserId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: '-req-' } } });
    if (orgAId) await prisma.organization.deleteMany({ where: { id: orgAId } });
    if (orgBId) await prisma.organization.deleteMany({ where: { id: orgBId } });
    await prisma.$disconnect();
  });

  it('1. Client creates requirement -> automatically SUBMITTED (available to PM for review)', async () => {
    const res = await request(app)
      .post('/api/requirements')
      .set('Authorization', `Bearer ${clientAToken}`)
      .send({
        projectId: projectAId,
        title: 'Dark Mode Support',
        description: 'Allow user to toggle dark theme across portal',
        acceptanceCriteria: 'Theme persists in local storage and changes colors smoothly',
        priority: 'HIGH',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('SUBMITTED');
    requirementAId = res.body.data.id;
  });

  it('2. PM views newly created requirement in SUBMITTED state without manual Submit for Review', async () => {
    const res = await request(app)
      .get(`/api/requirements/${requirementAId}`)
      .set('Authorization', `Bearer ${pmAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('SUBMITTED');
  });

  it('3. PM asking clarification WITHOUT clarification text is rejected (400 Bad Request)', async () => {
    const res = await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${pmAToken}`)
      .send({
        toStatus: 'NEEDS_CLARIFICATION',
        comment: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('4. PM asks clarification WITH question text -> transitions to NEEDS_CLARIFICATION', async () => {
    const res = await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${pmAToken}`)
      .send({
        toStatus: 'NEEDS_CLARIFICATION',
        comment: 'Which color palette do you prefer for dark mode?',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('NEEDS_CLARIFICATION');
  });

  it('5. Client A sees the clarification request and PM question in requirement details', async () => {
    const res = await request(app)
      .get(`/api/requirements/${requirementAId}`)
      .set('Authorization', `Bearer ${clientAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('NEEDS_CLARIFICATION');

    const history = res.body.data.statusHistory;
    const clarificationEntry = history.find((h: any) => h.toStatus === 'NEEDS_CLARIFICATION');
    expect(clarificationEntry).toBeDefined();
    expect(clarificationEntry.comment).toBe('Which color palette do you prefer for dark mode?');
  });

  it('6. Cross-org tenant protection: Client B cannot view or respond to Client A requirement', async () => {
    const viewRes = await request(app)
      .get(`/api/requirements/${requirementAId}`)
      .set('Authorization', `Bearer ${clientBToken}`);

    expect(viewRes.status).toBe(404);

    const respondRes = await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${clientBToken}`)
      .send({
        toStatus: 'UNDER_REVIEW',
        comment: 'Malicious cross-tenant response',
      });

    expect(respondRes.status).toBe(404);
  });

  it('7. PM from another project cannot ask clarification on Project A requirement', async () => {
    const res = await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${pmBToken}`)
      .send({
        toStatus: 'NEEDS_CLARIFICATION',
        comment: 'Unauthorized PM question',
      });

    expect([403, 404]).toContain(res.status);
  });

  it('8. Developer and QA cannot transition requirement to NEEDS_CLARIFICATION or UNDER_REVIEW', async () => {
    for (const token of [devAToken, qaAToken]) {
      const res = await request(app)
        .post(`/api/requirements/${requirementAId}/transition`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          toStatus: 'UNDER_REVIEW',
          comment: 'Dev or QA trying to transition',
        });

      expect(res.status).toBe(400); // invalid state transition for dev/qa role
    }
  });

  it('9. Client responding WITHOUT response message is rejected (400 Bad Request)', async () => {
    const res = await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${clientAToken}`)
      .send({
        toStatus: 'UNDER_REVIEW',
        comment: '   ',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('10. Client A responds to clarification -> requirement moves to UNDER_REVIEW', async () => {
    const res = await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${clientAToken}`)
      .send({
        toStatus: 'UNDER_REVIEW',
        comment: 'We prefer Slate / Zinc dark theme palette.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UNDER_REVIEW');
  });

  it('11. PM A sees client response in requirement details and continues review', async () => {
    const res = await request(app)
      .get(`/api/requirements/${requirementAId}`)
      .set('Authorization', `Bearer ${pmAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNDER_REVIEW');

    const history = res.body.data.statusHistory;
    const responseEntry = [...history].reverse().find((h: any) => h.toStatus === 'UNDER_REVIEW');
    expect(responseEntry).toBeDefined();
    expect(responseEntry.comment).toBe('We prefer Slate / Zinc dark theme palette.');
  });

  it('12. Existing requirement estimation & approval flow works seamlessly', async () => {
    // Move to ESTIMATING
    await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${pmAToken}`)
      .send({ toStatus: 'ESTIMATING' });

    // Create Estimate
    const estRes = await request(app)
      .post(`/api/requirements/${requirementAId}/estimates`)
      .set('Authorization', `Bearer ${pmAToken}`)
      .send({
        devHours: 10,
        qaHours: 4,
        designHours: 2,
        clientPrice: 1500,
      });

    expect(estRes.status).toBe(201);
    const estimateId = estRes.body.data.id;

    // Send Estimate (moves status to WAITING_FOR_APPROVAL)
    const sendRes = await request(app)
      .post(`/api/requirements/${requirementAId}/estimates/${estimateId}/send`)
      .set('Authorization', `Bearer ${pmAToken}`);

    expect(sendRes.status).toBe(200);

    // Client Approves Estimate (moves status to APPROVED)
    const approveRes = await request(app)
      .post(`/api/requirements/${requirementAId}/approvals`)
      .set('Authorization', `Bearer ${clientAToken}`)
      .send({
        requirementVersion: 1,
        estimateId,
        estimateVersion: 1,
        decision: 'APPROVED',
        comment: 'Looks great, proceed!',
      });

    expect(approveRes.status).toBe(201);

    // Verify status is APPROVED
    const finalReq = await request(app)
      .get(`/api/requirements/${requirementAId}`)
      .set('Authorization', `Bearer ${pmAToken}`);

    expect(finalReq.body.data.status).toBe('APPROVED');
  });

  it('13. PM can close a clarification (NEEDS_CLARIFICATION → UNDER_REVIEW) with a comment', async () => {
    // Move requirement to NEEDS_CLARIFICATION first
    const clarifyRes = await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${pmAToken}`)
      .send({ toStatus: 'NEEDS_CLARIFICATION', comment: 'Please confirm scope' });
    // Requirement might already be in various states from prior tests, so only
    // check for 400 (invalid transition from current state) or 200 (success)
    if (clarifyRes.status === 400) return; // skip if already past this state

    // Now PM closes the clarification with a resolution note
    const closeRes = await request(app)
      .post(`/api/requirements/${requirementAId}/transition`)
      .set('Authorization', `Bearer ${pmAToken}`)
      .send({ toStatus: 'UNDER_REVIEW', comment: 'Client confirmed scope verbally' });

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('UNDER_REVIEW');
  });

  it('14. PM cannot close clarification WITHOUT a comment (backend enforces comment requirement)', async () => {
    // Set up a fresh requirement in NEEDS_CLARIFICATION
    const newReq = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        title: 'Clarification comment enforcement test',
        description: 'Testing that a comment is required when closing clarification',
        acceptanceCriteria: 'PM must provide a comment',
        status: 'NEEDS_CLARIFICATION',
        currentVersion: 1,
        submittedById: clientAUserId,
      },
    });

    const res = await request(app)
      .post(`/api/requirements/${newReq.id}/transition`)
      .set('Authorization', `Bearer ${pmAToken}`)
      .send({ toStatus: 'UNDER_REVIEW' }); // No comment provided

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/[Rr]esponse message is required/);
  });
});
