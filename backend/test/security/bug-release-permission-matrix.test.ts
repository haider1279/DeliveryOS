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
  BugStatus,
  BugSeverity,
  BugPriority,
  RequirementStatus,
  ClientReviewDecision,
} from '@deliveryos/shared';

describe('Bug & Release Permission Matrix + Post-Deployment Security', () => {
  let orgAId: string;
  let orgBId: string;
  let projectAId: string;
  let deployedProjectAId: string;
  let projectBId: string;
  let requirementAId: string;

  let devUser: any;
  let dev2User: any;
  let qaUser: any;
  let pmUser: any;
  let adminUser: any;
  let clientAUser: any;
  let clientBUser: any;

  let devToken: string;
  let dev2Token: string;
  let qaToken: string;
  let pmToken: string;
  let adminToken: string;
  let clientAToken: string;
  let clientBToken: string;

  beforeAll(async () => {
    // 1. Create 2 test organizations
    const orgA = await prisma.organization.create({
      data: {
        name: `Org A Matrix ${Date.now()}`,
        slug: `org-a-matrix-${Date.now()}`,
        contactEmail: `orga-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        name: `Org B Matrix ${Date.now()}`,
        slug: `org-b-matrix-${Date.now()}`,
        contactEmail: `orgb-${Date.now()}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgBId = orgB.id;

    // 2. Create users with different roles
    pmUser = await prisma.user.create({
      data: {
        email: `pm-matrix-${Date.now()}@test.com`,
        role: UserRole.PROJECT_MANAGER,
        status: 'ACTIVE',
      },
    });

    devUser = await prisma.user.create({
      data: {
        email: `dev-matrix-${Date.now()}@test.com`,
        role: UserRole.DEVELOPER,
        status: 'ACTIVE',
      },
    });

    dev2User = await prisma.user.create({
      data: {
        email: `dev2-matrix-${Date.now()}@test.com`,
        role: UserRole.DEVELOPER,
        status: 'ACTIVE',
      },
    });

    qaUser = await prisma.user.create({
      data: {
        email: `qa-matrix-${Date.now()}@test.com`,
        role: UserRole.QA,
        status: 'ACTIVE',
      },
    });

    adminUser = await prisma.user.create({
      data: {
        email: `admin-matrix-${Date.now()}@test.com`,
        role: UserRole.ADMIN,
        status: 'ACTIVE',
      },
    });

    clientAUser = await prisma.user.create({
      data: {
        email: `client-a-${Date.now()}@test.com`,
        role: UserRole.CLIENT,
        organizationId: orgAId,
        status: 'ACTIVE',
      },
    });

    clientBUser = await prisma.user.create({
      data: {
        email: `client-b-${Date.now()}@test.com`,
        role: UserRole.CLIENT,
        organizationId: orgBId,
        status: 'ACTIVE',
      },
    });

    // 3. Create active Project A (under Org A)
    const projectA = await prisma.project.create({
      data: {
        name: `Matrix Delivery Project A ${Date.now()}`,
        code: `PRJA-${Math.floor(Math.random() * 100000)}`,
        organizationId: orgAId,
        projectManagerId: pmUser.id,
        status: ProjectStatus.ACTIVE,
        members: {
          create: [
            { userId: pmUser.id, membershipRole: 'PROJECT_MANAGER' },
            { userId: devUser.id, membershipRole: 'DEVELOPER' },
            { userId: dev2User.id, membershipRole: 'DEVELOPER' },
            { userId: qaUser.id, membershipRole: 'QA' },
          ],
        },
      },
    });
    projectAId = projectA.id;

    // Create a requirement under Project A for release inclusion
    const reqA = await prisma.requirement.create({
      data: {
        projectId: projectAId,
        title: 'Core Delivery Requirement A',
        description: 'Testing release packaging',
        acceptanceCriteria: 'Criteria verified',
        priority: 'HIGH',
        status: RequirementStatus.APPROVED,
        currentVersion: 1,
        submittedById: pmUser.id,
      },
    });
    requirementAId = reqA.id;

    // 4. Create Deployed Project A (under Org A with deployed release)
    const deployedProjectA = await prisma.project.create({
      data: {
        name: `Matrix Deployed Project A ${Date.now()}`,
        code: `DEP-${Math.floor(Math.random() * 100000)}`,
        organizationId: orgAId,
        projectManagerId: pmUser.id,
        status: ProjectStatus.COMPLETED,
        members: {
          create: [
            { userId: pmUser.id, membershipRole: 'PROJECT_MANAGER' },
            { userId: devUser.id, membershipRole: 'DEVELOPER' },
            { userId: qaUser.id, membershipRole: 'QA' },
          ],
        },
      },
    });
    deployedProjectAId = deployedProjectA.id;

    // Create deployed release on deployedProjectA
    await prisma.release.create({
      data: {
        projectId: deployedProjectAId,
        version: 'v1.0.0',
        name: 'Initial Production Release',
        status: ReleaseStatus.DEPLOYED,
        deployedAt: new Date(),
        createdById: pmUser.id,
      },
    });

    // 5. Create Project B (under Org B)
    const projectB = await prisma.project.create({
      data: {
        name: `Matrix Project B ${Date.now()}`,
        code: `PRJB-${Math.floor(Math.random() * 100000)}`,
        organizationId: orgBId,
        projectManagerId: pmUser.id,
        status: ProjectStatus.ACTIVE,
      },
    });
    projectBId = projectB.id;

    // 6. Generate auth tokens
    devToken = authService.createDevToken({ id: devUser.id, email: devUser.email, role: devUser.role });
    dev2Token = authService.createDevToken({ id: dev2User.id, email: dev2User.email, role: dev2User.role });
    qaToken = authService.createDevToken({ id: qaUser.id, email: qaUser.email, role: qaUser.role });
    pmToken = authService.createDevToken({ id: pmUser.id, email: pmUser.email, role: pmUser.role });
    adminToken = authService.createDevToken({ id: adminUser.id, email: adminUser.email, role: adminUser.role });
    clientAToken = authService.createDevToken({
      id: clientAUser.id,
      email: clientAUser.email,
      role: clientAUser.role,
      organizationId: orgAId,
    });
    clientBToken = authService.createDevToken({
      id: clientBUser.id,
      email: clientBUser.email,
      role: clientBUser.role,
      organizationId: orgBId,
    });
  });

  afterAll(async () => {
    await prisma.bug.deleteMany({ where: { projectId: { in: [projectAId, deployedProjectAId, projectBId] } } });
    await prisma.releaseItem.deleteMany({});
    await prisma.release.deleteMany({ where: { projectId: { in: [projectAId, deployedProjectAId, projectBId] } } });
    await prisma.requirement.deleteMany({ where: { projectId: { in: [projectAId, deployedProjectAId, projectBId] } } });
    await prisma.projectMember.deleteMany({ where: { projectId: { in: [projectAId, deployedProjectAId, projectBId] } } });
    await prisma.project.deleteMany({ where: { id: { in: [projectAId, deployedProjectAId, projectBId] } } });
    await prisma.user.deleteMany({
      where: {
        id: { in: [pmUser.id, devUser.id, dev2User.id, qaUser.id, adminUser.id, clientAUser.id, clientBUser.id] },
      },
    });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  });

  // =========================================================================
  // SECTION 1: BUG PERMISSION MATRIX & STATE TRANSITIONS
  // =========================================================================
  describe('Bug Permissions & State Machine Gates', () => {
    let testBugId: string;

    it('Client can report a bug but cannot assign internal staff', async () => {
      // Forbidden when client attempts to assign staff
      const forbiddenRes = await request(app)
        .post('/api/qa/bugs')
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          projectId: projectAId,
          title: 'Client reported UI overlap',
          description: 'Login button overlaps banner',
          severity: 'MEDIUM',
          stepsToReproduce: '1. Open login page\n2. Resize window\n3. Overlap appears',
          expectedResult: 'Elements remain aligned',
          actualResult: 'Elements overlap',
          assigneeId: devUser.id,
        });

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.error?.message).toContain('Clients cannot assign internal staff');

      // Allowed without assignee
      const okRes = await request(app)
        .post('/api/qa/bugs')
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          projectId: projectAId,
          title: 'Client reported UI overlap',
          description: 'Login button overlaps banner',
          severity: 'MEDIUM',
          stepsToReproduce: '1. Open login page\n2. Resize window\n3. Overlap appears',
          expectedResult: 'Elements remain aligned',
          actualResult: 'Elements overlap',
        });

      expect(okRes.status).toBe(201);
      expect(okRes.body.data.status).toBe(BugStatus.OPEN);
      testBugId = okRes.body.data.id;
    });

    it('Client cannot transition bug statuses', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${testBugId}/status`)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({ status: BugStatus.TRIAGED });

      expect(res.status).toBe(403);
    });

    it('Developer cannot assign bugs to other developers', async () => {
      const res = await request(app)
        .post('/api/qa/bugs')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          projectId: projectAId,
          title: 'Dev reported race condition',
          description: 'Cache invalidation lag',
          severity: 'HIGH',
          stepsToReproduce: '1. Trigger write\n2. Immediate read\n3. Stale data returned',
          expectedResult: 'Fresh cache data',
          actualResult: 'Stale cache data',
          assigneeId: dev2User.id, // Assigning another developer
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toMatch(/Only QA and Administrators|Developers cannot/);
    });

    it('Cannot skip states: OPEN cannot transition straight to IN_PROGRESS (must be TRIAGED first)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${testBugId}/status`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ status: BugStatus.IN_PROGRESS });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Cannot move bug from OPEN to IN_PROGRESS');
    });

    it('PM can triage the bug (OPEN -> TRIAGED)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${testBugId}/status`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ status: BugStatus.TRIAGED });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(BugStatus.TRIAGED);
    });

    it('Developer can start work on triaged bug (TRIAGED -> IN_PROGRESS)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${testBugId}/status`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ status: BugStatus.IN_PROGRESS });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(BugStatus.IN_PROGRESS);
    });

    it('Developer can mark bug ready for retest (IN_PROGRESS -> READY_FOR_RETEST)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${testBugId}/status`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ status: BugStatus.READY_FOR_RETEST });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(BugStatus.READY_FOR_RETEST);
    });

    it('Developer CANNOT close the bug (READY_FOR_RETEST -> CLOSED is restricted to QA)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${testBugId}/status`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ status: BugStatus.CLOSED });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Your role cannot move a bug to CLOSED');
    });

    it('PM CANNOT close the bug (QA verification gate strictly enforced)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${testBugId}/status`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ status: BugStatus.CLOSED });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Your role cannot move a bug to CLOSED');
    });

    it('QA can verify and close the bug (READY_FOR_RETEST -> CLOSED)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${testBugId}/status`)
        .set('Authorization', `Bearer ${qaToken}`)
        .send({ status: BugStatus.CLOSED });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(BugStatus.CLOSED);
    });

    it('Fixer self-verification check: Developer who fixed a bug cannot close it even if having elevated permissions', async () => {
      // Create bug assigned to QA user as fixer
      const bugSelfFix = await prisma.bug.create({
        data: {
          title: 'Bug assigned to QA person as fixer',
          description: 'Self-verification testing',
          stepsToReproduce: '1. Step\n2. Step\n3. Observe',
          expectedResult: 'Pass',
          actualResult: 'Fail',
          projectId: projectAId,
          reporterId: pmUser.id,
          assigneeId: qaUser.id,
          status: BugStatus.READY_FOR_RETEST,
          severity: BugSeverity.MEDIUM,
          priority: BugPriority.P2,
        },
      });

      const res = await request(app)
        .patch(`/api/qa/bugs/${bugSelfFix.id}/status`)
        .set('Authorization', `Bearer ${qaToken}`)
        .send({ status: BugStatus.CLOSED });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Cannot QA-verify your own fix');
    });
  });

  // =========================================================================
  // SECTION 2: RELEASE PERMISSION MATRIX & GATES
  // =========================================================================
  describe('Release Permissions & State Machine Gates', () => {
    let releaseId: string;

    it('Developer cannot create a release (403)', async () => {
      const res = await request(app)
        .post('/api/releases')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          projectId: projectAId,
          version: 'v1.0.1',
          name: 'Unauthorized Release',
          itemIds: [{ itemType: 'REQUIREMENT', requirementId: requirementAId }],
        });

      expect(res.status).toBe(403);
    });

    it('Client cannot create a release (403)', async () => {
      const res = await request(app)
        .post('/api/releases')
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          projectId: projectAId,
          version: 'v1.0.1',
          name: 'Client Release Attempt',
          itemIds: [{ itemType: 'REQUIREMENT', requirementId: requirementAId }],
        });

      expect(res.status).toBe(403);
    });

    it('PM can create a release in PLANNED status', async () => {
      const res = await request(app)
        .post('/api/releases')
        .set('Authorization', `Bearer ${pmToken}`)
        .send({
          projectId: projectAId,
          version: 'v2.0.0',
          name: 'Major Milestone Release',
          itemIds: [{ itemType: 'REQUIREMENT', requirementId: requirementAId }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(ReleaseStatus.PLANNED);
      releaseId = res.body.data.id;
    });

    it('Cannot skip release pipeline: PLANNED cannot jump straight to DEPLOYED (403/400)', async () => {
      const res = await request(app)
        .patch(`/api/releases/${releaseId}/status`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ status: ReleaseStatus.DEPLOYED });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Cannot move release from PLANNED to DEPLOYED');
    });

    it('PM starts release progress (PLANNED -> IN_PROGRESS)', async () => {
      const res = await request(app)
        .patch(`/api/releases/${releaseId}/status`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ status: ReleaseStatus.IN_PROGRESS });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ReleaseStatus.IN_PROGRESS);
    });

    it('QA can sign off and mark release as READY (QA Gate)', async () => {
      const res = await request(app)
        .patch(`/api/releases/${releaseId}/status`)
        .set('Authorization', `Bearer ${qaToken}`)
        .send({ status: ReleaseStatus.READY });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ReleaseStatus.READY);
    });

    it('QA CANNOT deploy release to production (DEPLOYED gate strictly PM/Admin)', async () => {
      const res = await request(app)
        .patch(`/api/releases/${releaseId}/status`)
        .set('Authorization', `Bearer ${qaToken}`)
        .send({ status: ReleaseStatus.DEPLOYED });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('is not permitted to transition release to DEPLOYED');
    });

    it('PM can deploy the release to production once marked READY', async () => {
      const res = await request(app)
        .patch(`/api/releases/${releaseId}/status`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ status: ReleaseStatus.DEPLOYED, deploymentNotes: 'Production rollout successful' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ReleaseStatus.DEPLOYED);
      expect(res.body.data.deployedAt).toBeDefined();
    });
  });

  // =========================================================================
  // SECTION 3: CLIENT PORTAL POST-DEPLOYMENT BEHAVIOR
  // =========================================================================
  describe('Client Portal Post-Deployment Restrictions', () => {
    it('Client CANNOT submit new requirements on a completed/deployed project (403)', async () => {
      const res = await request(app)
        .post('/api/requirements')
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          projectId: deployedProjectAId,
          title: 'Post-deploy feature request',
          description: 'Try to submit feature to completed project',
          acceptanceCriteria: 'Should fail',
          priority: 'MEDIUM',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Cannot submit new requirements to a completed or deployed project');
    });

    it('Client CANNOT record client review decisions on a completed/deployed project (403)', async () => {
      // Create a requirement under deployedProjectA in CLIENT_REVIEW status
      const req = await prisma.requirement.create({
        data: {
          projectId: deployedProjectAId,
          title: 'Stale review requirement',
          description: 'A requirement left in client review',
          acceptanceCriteria: 'Criteria',
          priority: 'MEDIUM',
          status: RequirementStatus.CLIENT_REVIEW,
          currentVersion: 1,
          submittedById: pmUser.id,
        },
      });

      const res = await request(app)
        .post(`/api/releases/requirements/${req.id}/review`)
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          requirementVersion: 1,
          decision: ClientReviewDecision.APPROVED,
          comment: 'Approving post-deployment',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Cannot review requirements on a completed or deployed project');
    });

    it('Client CAN report bugs / warranty issues on a deployed/completed project (201)', async () => {
      const res = await request(app)
        .post('/api/qa/bugs')
        .set('Authorization', `Bearer ${clientAToken}`)
        .send({
          projectId: deployedProjectAId,
          title: 'Production SSL error on checkout subdomain',
          description: 'Certificate warning appears on mobile browsers',
          severity: 'HIGH',
          stepsToReproduce: '1. Go to checkout\n2. Observe cert prompt',
          expectedResult: 'Valid trusted cert',
          actualResult: 'Untrusted cert warning',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(BugStatus.OPEN);
      expect(res.body.data.projectId).toBe(deployedProjectAId);
    });

    it('Tenant isolation: Client from Org B cannot report bugs on Org A project (404)', async () => {
      const res = await request(app)
        .post('/api/qa/bugs')
        .set('Authorization', `Bearer ${clientBToken}`)
        .send({
          projectId: deployedProjectAId,
          title: 'Cross-tenant bug report attempt',
          description: 'Testing cross-tenant isolation',
          severity: 'LOW',
          stepsToReproduce: '1. Step\n2. Step\n3. Observe',
          expectedResult: 'None',
          actualResult: 'None',
        });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // SECTION 4: QA REOPEN / REJECT CYCLE
  // =========================================================================
  describe('QA Reject & Reopen Cycle', () => {
    let cycleTestBugId: string;

    beforeAll(async () => {
      // Create a bug directly in READY_FOR_RETEST for cycle testing
      const bug = await prisma.bug.create({
        data: {
          title: 'Cycle test bug: payment gateway timeout',
          description: 'Payment gateway times out after 30s on slow connections',
          stepsToReproduce: '1. Add item to cart\n2. Proceed to checkout\n3. Enter payment details\n4. Submit on a throttled connection',
          expectedResult: 'Payment processes within 60 seconds',
          actualResult: 'Hard timeout at 30 seconds with generic error',
          projectId: projectAId,
          reporterId: pmUser.id,
          assigneeId: devUser.id,
          status: BugStatus.READY_FOR_RETEST,
          severity: BugSeverity.HIGH,
          priority: BugPriority.P1,
        },
      });
      cycleTestBugId = bug.id;
    });

    it('QA can reject fix and reopen bug (READY_FOR_RETEST -> REOPENED)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${cycleTestBugId}/status`)
        .set('Authorization', `Bearer ${qaToken}`)
        .send({ status: BugStatus.REOPENED, comment: 'Fix did not address slow-connection case' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(BugStatus.REOPENED);
    });

    it('Developer can pick up reopened bug (REOPENED -> IN_PROGRESS)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${cycleTestBugId}/status`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ status: BugStatus.IN_PROGRESS });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(BugStatus.IN_PROGRESS);
    });

    it('Developer marks fixed again for QA (IN_PROGRESS -> READY_FOR_RETEST)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${cycleTestBugId}/status`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ status: BugStatus.READY_FOR_RETEST });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(BugStatus.READY_FOR_RETEST);
    });

    it('QA can verify passing fix (READY_FOR_RETEST -> CLOSED)', async () => {
      const res = await request(app)
        .patch(`/api/qa/bugs/${cycleTestBugId}/status`)
        .set('Authorization', `Bearer ${qaToken}`)
        .send({ status: BugStatus.CLOSED, comment: 'Verified on slow 3G — fix confirmed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(BugStatus.CLOSED);
    });

    it('QA cannot jump from TRIAGED directly to CLOSED (invalid transition)', async () => {
      // Create a freshly triaged bug
      const freshBug = await prisma.bug.create({
        data: {
          title: 'Jump test: session token refresh',
          description: 'Session tokens not refreshed after idle timeout',
          stepsToReproduce: '1. Login\n2. Wait 30 mins\n3. Attempt an action',
          expectedResult: 'Silent token refresh or prompt to re-login',
          actualResult: 'Hard 401 with no recovery UX',
          projectId: projectAId,
          reporterId: pmUser.id,
          status: BugStatus.TRIAGED,
          severity: BugSeverity.MEDIUM,
          priority: BugPriority.P2,
        },
      });

      const res = await request(app)
        .patch(`/api/qa/bugs/${freshBug.id}/status`)
        .set('Authorization', `Bearer ${qaToken}`)
        .send({ status: BugStatus.CLOSED });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toContain('Cannot move bug from TRIAGED to CLOSED');
    });
  });

  // =========================================================================
  // SECTION 5: DEVELOPER CROSS-ORG & UNAUTHORIZED RELEASE OPERATIONS
  // =========================================================================
  describe('Developer & Cross-Org Release Access Restrictions', () => {
    let validReleaseId: string;

    beforeAll(async () => {
      // PM creates a release for direct testing of developer restrictions
      const rel = await prisma.release.create({
        data: {
          projectId: projectAId,
          version: 'v3.0.0-dev-gate',
          name: 'Developer Gate Test Release',
          status: ReleaseStatus.IN_PROGRESS,
          createdById: pmUser.id,
        },
      });
      validReleaseId = rel.id;
    });

    it('Developer cannot update release status (role-restricted endpoint)', async () => {
      const res = await request(app)
        .patch(`/api/releases/${validReleaseId}/status`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ status: ReleaseStatus.READY });

      expect(res.status).toBe(403);
    });

    it('Developer cannot access a release from another org (404)', async () => {
      // Create a release in Org B's project
      const orgBRelease = await prisma.release.create({
        data: {
          projectId: projectBId,
          version: 'v1.0.0-orgb',
          name: 'Org B Isolated Release',
          status: ReleaseStatus.PLANNED,
          createdById: pmUser.id,
        },
      });

      const res = await request(app)
        .get(`/api/releases/${orgBRelease.id}`)
        .set('Authorization', `Bearer ${devToken}`);

      // Developer has no membership in projectB → should receive 404
      expect(res.status).toBe(404);
    });

    it('Client can view DEPLOYED releases on their project (200)', async () => {
      const res = await request(app)
        .get('/api/releases')
        .query({ projectId: deployedProjectAId })
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      // Should contain the deployed release created in beforeAll
      const releases = res.body.data as any[];
      expect(releases.every((r: any) => [ReleaseStatus.DEPLOYED, ReleaseStatus.ROLLED_BACK].includes(r.status))).toBe(true);
    });

    it('Client cannot view PLANNED / IN_PROGRESS releases — only deployed ones visible', async () => {
      // The validReleaseId is IN_PROGRESS — client should NOT see it via list
      const res = await request(app)
        .get('/api/releases')
        .query({ projectId: projectAId })
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(200);
      const releases = res.body.data as any[];
      // Every release returned must be client-visible status
      releases.forEach((r: any) => {
        expect([ReleaseStatus.DEPLOYED, ReleaseStatus.ROLLED_BACK]).toContain(r.status);
      });
    });

    it('Client cannot access an in-progress release by direct ID (404)', async () => {
      const res = await request(app)
        .get(`/api/releases/${validReleaseId}`)
        .set('Authorization', `Bearer ${clientAToken}`);

      expect(res.status).toBe(404);
    });

    it('Client from Org B cannot access Org A deployed release by ID (404)', async () => {
      // Get the deployed release id from deployedProjectA
      const deployed = await prisma.release.findFirst({
        where: { projectId: deployedProjectAId, status: ReleaseStatus.DEPLOYED },
      });

      const res = await request(app)
        .get(`/api/releases/${deployed!.id}`)
        .set('Authorization', `Bearer ${clientBToken}`);

      expect(res.status).toBe(404);
    });
  });
});

