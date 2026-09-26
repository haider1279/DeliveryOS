import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import {
  UserRole,
  UserStatus,
  ProjectStatus,
  ProjectRequestStatus,
  OrganizationQualificationStatus,
} from '@deliveryos/shared';

/**
 * Regression coverage for the client project-request -> ACTIVE project flow
 * against the REAL organization-acquisition workflow documented in
 * docs/workflows.md:
 *
 *     [PROSPECT] -> [APPROVED] -> (admin invites the client contact)
 *               -> [ACTIVE PROJECT CREATION]
 *
 * Two things are asserted together, because they were previously out of step:
 *
 *  1. The legitimate pipeline works end to end: once the organization really is
 *     APPROVED, an ADMIN/SUPER_ADMIN approval of a client request must create
 *     exactly one ACTIVE project in that same organization, visible in Active
 *     Projects, with the request no longer pending.
 *
 *  2. The organization-qualification security rule is NOT weakened. Projects
 *     still cannot be created for a PROSPECT or REJECTED organization by any
 *     route, and a client can no longer be attached to (or request a project
 *     for) an organization that was never qualified.
 */
describe('Project request approval vs organization qualification', () => {
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const token = (user: {
    id: string;
    email: string;
    role: UserRole;
    organizationId?: string | null;
  }) =>
    authService.createDevToken({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId ?? null,
    });

  const createUser = async (role: UserRole, organizationId?: string) => {
    const user = await prisma.user.create({
      data: {
        email: `elig-${role.toLowerCase()}-${unique()}@test.com`,
        role,
        status: UserStatus.ACTIVE,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    createdUserIds.push(user.id);
    return user;
  };

  /** Staff that exist for every scenario. */
  const staff = async () => {
    const bd = await createUser(UserRole.BD);
    const admin = await createUser(UserRole.ADMIN);
    const superAdmin = await createUser(UserRole.SUPER_ADMIN);
    const pm = await createUser(UserRole.PROJECT_MANAGER);
    return {
      bd,
      admin,
      superAdmin,
      pm,
      bdToken: token(bd),
      adminToken: token(admin),
      superAdminToken: token(superAdmin),
      pmToken: token(pm),
    };
  };

  afterEach(async () => {
    // Strict FK-safe teardown. Several tables reference these rows with
    // ON DELETE RESTRICT, so children must go before parents.
    const orgIds = createdOrgIds.splice(0);
    const userIds = createdUserIds.splice(0);

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          ...(orgIds.length ? [{ organizationId: { in: orgIds } }] : []),
          ...(userIds.length ? [{ projectManagerId: { in: userIds } }] : []),
        ],
      },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length) {
      await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.projectActivity.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }

    await prisma.projectRequest.deleteMany({
      where: {
        OR: [
          ...(orgIds.length ? [{ organizationId: { in: orgIds } }] : []),
          ...(userIds.length ? [{ requestedById: { in: userIds } }] : []),
        ],
      },
    });

    if (userIds.length) {
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (orgIds.length) {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
  });

  // --- API helpers ---------------------------------------------------------

  const createLead = async (bdToken: string, name = `Lead ${unique()}`) => {
    const res = await request(app)
      .post('/api/organizations')
      .set('Authorization', `Bearer ${bdToken}`)
      .send({ name, slug: `lead-${unique()}`, contactEmail: `${unique()}@client.test` });
    expect(res.status).toBe(201);
    // Tracked so afterEach removes it: Organization rows are created through the
    // API here, not through the createOrg helper.
    createdOrgIds.push(res.body.data.id as string);
    return res.body.data as { id: string; name: string; qualificationStatus: string };
  };

  const qualify = async (orgId: string, actorToken: string, decision: 'APPROVED' | 'REJECTED') => {
    const res = await request(app)
      .patch(`/api/organizations/${orgId}/qualify`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ decision });
    expect(res.status).toBe(200);
    return res.body.data as { qualificationStatus: string };
  };

  const invite = async (orgId: string, actorToken: string, email: string) =>
    request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ email, firstName: 'Test', lastName: 'Contact', role: UserRole.CLIENT, organizationId: orgId });

  const submitRequest = async (clientToken: string, name = `Delivery ${unique()}`) => {
    const res = await request(app)
      .post('/api/projects/requests')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ name, description: 'requested through the portal', budget: 42000 });
    return res;
  };

  const decide = (requestId: string, actorToken: string, body: Record<string, unknown>) =>
    request(app)
      .patch(`/api/projects/requests/${requestId}/decision`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send(body);

  const listProjects = async (actorToken: string, query: Record<string, string> = {}) => {
    const res = await request(app)
      .get('/api/projects')
      .query(query)
      .set('Authorization', `Bearer ${actorToken}`);
    expect(res.status).toBe(200);
    return res.body.data as Array<{ id: string; status: string }>;
  };

  const createProjectDirectly = (actorToken: string, organizationId: string, projectManagerId: string, code: string) =>
    request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ organizationId, projectManagerId, name: 'Direct project', code, description: 'x' });

  // ------------------------------------------------------------------------

  it('runs the documented pipeline for ADMIN approval: qualified org -> client request -> ACTIVE project', async () => {
    const { bdToken, adminToken, pm } = await staff();

    // 1. BD raises the lead. It is a PROSPECT and cannot take a project yet.
    const lead = await createLead(bdToken);
    expect(lead.qualificationStatus).toBe(OrganizationQualificationStatus.PROSPECT);

    // 2. A client cannot be pulled into an unqualified organization, and cannot
    //    raise a project request for one either. Without this the pipeline would
    //    desync into a request that can never be approved.
    const earlyInvite = await invite(lead.id, adminToken, `early-${unique()}@client.test`);
    expect(earlyInvite.status).toBe(400);
    expect(earlyInvite.body.success).toBe(false);
    expect(earlyInvite.body.error.message).toContain(lead.name);

    // 3. ADMIN qualifies the organization.
    const qualified = await qualify(lead.id, adminToken, 'APPROVED');
    expect(qualified.qualificationStatus).toBe(OrganizationQualificationStatus.APPROVED);

    // 4. The client contact joins the now-qualified organization. The user row is
    //    written directly because the invite endpoint performs a real Supabase
    //    email invitation, which is rate limited in CI; the eligibility rule being
    //    asserted here is already covered by the `earlyInvite` check above.
    const client = await createUser(UserRole.CLIENT, lead.id);
    const clientToken = token(client);

    // 5. The client submits a project request against their own organization.
    const submitted = await submitRequest(clientToken);
    expect(submitted.status).toBe(201);
    const requestId = submitted.body.data.id as string;
    expect(submitted.body.data.organizationId).toBe(lead.id);

    // 6. ADMIN approves it.
    const approved = await decide(requestId, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(approved.status).toBe(200);
    const projectId = approved.body.data.projectId as string;
    expect(projectId).toBeTruthy();

    // 7. Exactly one project, in the correct organization, with the ACTIVE
    //    status the existing Active Projects query matches.
    expect(await prisma.project.count({ where: { organizationId: lead.id } })).toBe(1);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.organizationId).toBe(lead.id);
    expect(project.status).toBe(ProjectStatus.ACTIVE);
    expect(project.projectManagerId).toBe(pm.id);

    // 8. It is returned by the Active Projects filter, and is not pending.
    expect((await listProjects(adminToken, { status: ProjectStatus.ACTIVE })).map((p) => p.id)).toContain(
      projectId
    );
    const stored = await prisma.projectRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(stored.status).toBe(ProjectRequestStatus.APPROVED);
    expect(stored.projectId).toBe(projectId);

    // 9. No duplicate organization or client account was created along the way.
    expect(await prisma.organization.count({ where: { id: lead.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: client.id } })).toBe(1);
  });

  it('runs the documented pipeline for SUPER_ADMIN approval', async () => {
    const { bdToken, superAdminToken, pm } = await staff();

    const lead = await createLead(bdToken);
    await qualify(lead.id, superAdminToken, 'APPROVED');

    const client = await createUser(UserRole.CLIENT, lead.id);
    const requestId = (await submitRequest(token(client))).body.data.id as string;
    const approved = await decide(requestId, superAdminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(approved.status).toBe(200);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: approved.body.data.projectId as string },
    });
    expect(project.status).toBe(ProjectStatus.ACTIVE);
    expect(project.organizationId).toBe(lead.id);
    expect(await prisma.project.count({ where: { organizationId: lead.id } })).toBe(1);
  });

  it('keeps the security rule: a PROSPECT organization can never receive a project', async () => {
    const { bdToken, adminToken, superAdminToken, pm } = await staff();
    const lead = await createLead(bdToken);

    // Direct project creation is refused for both administrator roles.
    for (const actorToken of [adminToken, superAdminToken]) {
      const res = await createProjectDirectly(actorToken, lead.id, pm.id, `PR${unique()}`.slice(0, 10));
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain(lead.name);
    }

    // Even with a request already on file (legacy/stale data), approval is
    // refused and nothing is created.
    const client = await createUser(UserRole.CLIENT, lead.id);
    const stale = await prisma.projectRequest.create({
      data: {
        organizationId: lead.id,
        requestedById: client.id,
        name: `Stale ${unique()}`,
        status: ProjectRequestStatus.PENDING,
      },
    });

    const approval = await decide(stale.id, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(approval.status).toBe(400);
    expect(approval.body.success).toBe(false);

    const stored = await prisma.projectRequest.findUniqueOrThrow({ where: { id: stale.id } });
    expect(stored.status).toBe(ProjectRequestStatus.PENDING);
    expect(stored.projectId).toBeNull();
    expect(await prisma.project.count({ where: { organizationId: lead.id } })).toBe(0);
  });

  it('keeps the security rule: a REJECTED organization can never receive a project', async () => {
    const { bdToken, bdToken: _bd, adminToken, superAdminToken, pm } = await staff();
    const lead = await createLead(bdToken);
    await qualify(lead.id, adminToken, 'REJECTED');

    const direct = await createProjectDirectly(superAdminToken, lead.id, pm.id, `RJ${unique()}`.slice(0, 10));
    expect(direct.status).toBe(400);
    expect(direct.body.success).toBe(false);

    const client = await createUser(UserRole.CLIENT, lead.id);
    const stale = await prisma.projectRequest.create({
      data: {
        organizationId: lead.id,
        requestedById: client.id,
        name: `Rejected stale ${unique()}`,
        status: ProjectRequestStatus.PENDING,
      },
    });
    const approval = await decide(stale.id, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(approval.status).toBe(400);

    expect(await prisma.project.count({ where: { organizationId: lead.id } })).toBe(0);
    // The organization is NOT silently promoted to approved.
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: lead.id } });
    expect(org.qualificationStatus).toBe(OrganizationQualificationStatus.REJECTED);
  });

  it('qualifying the organization is what unblocks the pending request, with no duplicate project', async () => {
    const { bdToken, adminToken, pm } = await staff();
    const lead = await createLead(bdToken);

    const client = await createUser(UserRole.CLIENT, lead.id);
    const pending = await prisma.projectRequest.create({
      data: {
        organizationId: lead.id,
        requestedById: client.id,
        name: `Awaiting qualification ${unique()}`,
        status: ProjectRequestStatus.PENDING,
      },
    });

    // Blocked while PROSPECT...
    expect(
      (await decide(pending.id, adminToken, { decision: ProjectRequestStatus.APPROVED, projectManagerId: pm.id }))
        .status
    ).toBe(400);

    // ...and the same approval succeeds once the organization is qualified.
    await qualify(lead.id, adminToken, 'APPROVED');
    const approved = await decide(pending.id, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(approved.status).toBe(200);
    expect(await prisma.project.count({ where: { organizationId: lead.id } })).toBe(1);

    // Re-approving (stale double-click) does not create a second project.
    const replay = await decide(pending.id, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(replay.status).toBeGreaterThanOrEqual(400);
    expect(replay.status).toBeLessThan(500);
    expect(await prisma.project.count({ where: { organizationId: lead.id } })).toBe(1);
    const kept = await prisma.project.findUniqueOrThrow({
      where: { id: approved.body.data.projectId as string },
    });
    expect(kept.status).toBe(ProjectStatus.ACTIVE);
  });
});
