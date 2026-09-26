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
 * End-to-end coverage for CLIENT project request -> ADMIN approval -> ACTIVE
 * project.
 *
 * The invariant under test: the DATABASE is the source of truth. Approving a
 * request must materialise exactly one Project with the status the existing
 * "Active Projects" filter matches, link it back to the request, drop the
 * request out of the pending set, and be safe against duplicate/stale approvals.
 *
 * Every test builds its own tenant so cases stay independent.
 */
describe('Project request approval -> Active Projects', () => {
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const token = (user: { id: string; email: string; role: UserRole; organizationId?: string | null }) =>
    authService.createDevToken({
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId ?? null,
    });

  const createUser = async (role: UserRole, organizationId?: string) => {
    const user = await prisma.user.create({
      data: {
        email: `apr-${role.toLowerCase()}-${unique()}@test.com`,
        role,
        status: UserStatus.ACTIVE,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    createdUserIds.push(user.id);
    return user;
  };

  const createOrg = async (qualificationStatus = OrganizationQualificationStatus.APPROVED) => {
    const org = await prisma.organization.create({
      data: {
        name: `Approval Org ${unique()}`,
        slug: `approval-org-${unique()}`,
        contactEmail: `approval-${unique()}@test.com`,
        qualificationStatus,
      },
    });
    createdOrgIds.push(org.id);
    return org;
  };

  /** Fresh tenant: org + client + PM + admin + super admin. */
  const setup = async (qualificationStatus = OrganizationQualificationStatus.APPROVED) => {
    const org = await createOrg(qualificationStatus);
    const client = await createUser(UserRole.CLIENT, org.id);
    const pm = await createUser(UserRole.PROJECT_MANAGER);
    const admin = await createUser(UserRole.ADMIN);
    const superAdmin = await createUser(UserRole.SUPER_ADMIN);
    return {
      org,
      pm,
      client,
      adminToken: token(admin),
      superAdminToken: token(superAdmin),
      pmToken: token(pm),
      clientToken: token(client),
    };
  };

  afterEach(async () => {
    const orgIds = createdOrgIds.splice(0);
    if (orgIds.length) {
      // Approving materialises Projects, and Project.organizationId is
      // ON DELETE RESTRICT, so projects/members must go first.
      const projects = await prisma.project.findMany({
        where: { organizationId: { in: orgIds } },
        select: { id: true },
      });
      const projectIds = projects.map((p) => p.id);
      if (projectIds.length) {
        await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
        await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      }
      await prisma.projectRequest.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
    }
  });

  const submitRequest = async (clientToken: string, name = `Portal Build ${unique()}`) => {
    const res = await request(app)
      .post('/api/projects/requests')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ name, description: 'Client requested delivery', budget: 25000 });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  };

  const decide = (id: string, authToken: string, body: Record<string, unknown>) =>
    request(app)
      .patch(`/api/projects/requests/${id}/decision`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(body);

  const listProjects = async (authToken: string, query: Record<string, string> = {}) => {
    const res = await request(app)
      .get('/api/projects')
      .query(query)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    return res.body.data as Array<{ id: string; status: string; code: string; name: string }>;
  };

  const requestIdsByStatus = async (authToken: string, status: ProjectRequestStatus) => {
    const res = await request(app)
      .get('/api/projects/requests')
      .query({ status })
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    return (res.body.data as Array<{ id: string }>).map((r) => r.id);
  };

  it('runs the full flow: submit -> pending -> approve -> active, leaving no pending request', async () => {
    const { org, pm, adminToken, clientToken } = await setup();

    // 1. Client submits a project request.
    const requestId = await submitRequest(clientToken);

    // 2. It appears as PENDING in the admin pending list.
    expect(await requestIdsByStatus(adminToken, ProjectRequestStatus.PENDING)).toContain(requestId);

    // 3. Admin approves it.
    const approved = await decide(requestId, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe(ProjectRequestStatus.APPROVED);

    // 4. + 5. The resulting project is ACTIVE and matches the existing
    // "Active Projects" filter (status=ACTIVE).
    const projectId = approved.body.data.projectId as string;
    expect(projectId).toBeTruthy();
    expect((await listProjects(adminToken, { status: ProjectStatus.ACTIVE })).map((p) => p.id)).toContain(
      projectId
    );

    const stored = await prisma.project.findUnique({ where: { id: projectId } });
    expect(stored?.status).toBe(ProjectStatus.ACTIVE);
    expect(stored?.organizationId).toBe(org.id);
    expect(stored?.projectManagerId).toBe(pm.id);

    // 6. The request no longer appears as pending.
    expect(await requestIdsByStatus(adminToken, ProjectRequestStatus.PENDING)).not.toContain(requestId);
    expect(await requestIdsByStatus(adminToken, ProjectRequestStatus.APPROVED)).toContain(requestId);

    // Traceability: the project stays linked to the original client request.
    const linked = await prisma.projectRequest.findUnique({
      where: { id: requestId },
      include: { project: { select: { id: true, code: true, status: true } } },
    });
    expect(linked?.projectId).toBe(projectId);
    expect(linked?.project?.id).toBe(projectId);
    expect(linked?.project?.status).toBe(ProjectStatus.ACTIVE);
  });

  it('creates exactly one project no matter how many times approval is repeated', async () => {
    const { org, pm, adminToken, superAdminToken, clientToken } = await setup();
    const requestId = await submitRequest(clientToken);

    const first = await decide(requestId, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(first.status).toBe(200);
    const projectId = first.body.data.projectId as string;

    // Stale frontend replays, including a higher-authority retry: all refused.
    const replays = await Promise.all([
      decide(requestId, adminToken, { decision: ProjectRequestStatus.APPROVED }),
      decide(requestId, superAdminToken, { decision: ProjectRequestStatus.APPROVED }),
      decide(requestId, adminToken, { decision: ProjectRequestStatus.REJECTED }),
    ]);
    for (const replay of replays) {
      expect(replay.status).toBeGreaterThanOrEqual(400);
      expect(replay.status).toBeLessThan(500);
      expect(replay.body.success).toBe(false);
    }

    // No duplicate project, and the original project is untouched.
    expect(await prisma.project.count({ where: { organizationId: org.id } })).toBe(1);

    const stored = await prisma.project.findUnique({ where: { id: projectId } });
    expect(stored?.status).toBe(ProjectStatus.ACTIVE);
    expect(stored?.deletedAt).toBeNull();

    const reloaded = await prisma.projectRequest.findUnique({ where: { id: requestId } });
    expect(reloaded?.status).toBe(ProjectRequestStatus.APPROVED);
    expect(reloaded?.projectId).toBe(projectId);
  });

  it('lets only one of two concurrent approvals win (no duplicate projects)', async () => {
    const { pm, adminToken, superAdminToken, clientToken } = await setup();
    const requestId = await submitRequest(clientToken);

    const results = await Promise.all([
      decide(requestId, adminToken, { decision: ProjectRequestStatus.APPROVED, projectManagerId: pm.id }),
      decide(requestId, superAdminToken, { decision: ProjectRequestStatus.APPROVED, projectManagerId: pm.id }),
    ]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);

    const stored = await prisma.projectRequest.findUnique({ where: { id: requestId } });
    expect(stored?.status).toBe(ProjectRequestStatus.APPROVED);
    expect(stored?.projectId).toBeTruthy();
    expect(await prisma.project.findMany({ where: { id: stored!.projectId! } })).toHaveLength(1);
  });

  it('never activates a REJECTED request through a stale approve action', async () => {
    const { org, pm, adminToken, clientToken } = await setup();
    const requestId = await submitRequest(clientToken);

    const rejected = await decide(requestId, adminToken, { decision: ProjectRequestStatus.REJECTED });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe(ProjectRequestStatus.REJECTED);
    expect(rejected.body.data.projectId).toBeFalsy();

    // Stale "Approve" click from another tab must fail and create nothing.
    const staleApprove = await decide(requestId, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(staleApprove.status).toBeGreaterThanOrEqual(400);
    expect(staleApprove.status).toBeLessThan(500);
    expect(staleApprove.body.success).toBe(false);

    const stored = await prisma.projectRequest.findUnique({ where: { id: requestId } });
    expect(stored?.status).toBe(ProjectRequestStatus.REJECTED);
    expect(stored?.projectId).toBeNull();
    expect(await prisma.project.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it('survives a reload: the active project is returned again on fresh list calls', async () => {
    const { pm, adminToken, clientToken } = await setup();
    const requestId = await submitRequest(clientToken);
    const approved = await decide(requestId, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    const projectId = approved.body.data.projectId as string;

    // Two independent list cycles (i.e. a reload / fresh session).
    for (let i = 0; i < 2; i += 1) {
      const projects = await listProjects(adminToken, { status: ProjectStatus.ACTIVE });
      expect(projects.map((p) => p.id)).toContain(projectId);
    }
  });

  it('is visible to the assigned PM and the requesting client, and hidden from unrelated PMs', async () => {
    const { pm, adminToken, superAdminToken, pmToken, clientToken } = await setup();
    const requestId = await submitRequest(clientToken);
    const approved = await decide(requestId, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    const projectId = approved.body.data.projectId as string;

    // Assigned PM sees it through the existing assignment rules.
    const pmView = await listProjects(pmToken);
    expect(pmView.map((p) => p.id)).toContain(projectId);
    expect(pmView.find((p) => p.id === projectId)?.status).toBe(ProjectStatus.ACTIVE);

    // Client sees it in their own portal scope.
    const clientView = await listProjects(clientToken);
    expect(clientView.map((p) => p.id)).toContain(projectId);

    // Client sees the request itself, APPROVED and still linked.
    const clientRequests = await request(app)
      .get('/api/projects/requests')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(clientRequests.status).toBe(200);
    const own = (
      clientRequests.body.data as Array<{ id: string; status: string; projectId: string | null }>
    ).find((r) => r.id === requestId);
    expect(own?.status).toBe(ProjectRequestStatus.APPROVED);
    expect(own?.projectId).toBe(projectId);

    // SUPER_ADMIN sees it too (global scope).
    expect((await listProjects(superAdminToken, { status: ProjectStatus.ACTIVE })).map((p) => p.id)).toContain(
      projectId
    );

    // A PM with no assignment to this project does not see it.
    const stranger = await createUser(UserRole.PROJECT_MANAGER);
    const strangerView = await listProjects(token(stranger));
    expect(strangerView.map((p) => p.id)).not.toContain(projectId);
  });

  it('keeps approval authority at ADMIN/SUPER_ADMIN only', async () => {
    const { pm, adminToken, superAdminToken, pmToken, clientToken } = await setup();
    const requestId = await submitRequest(clientToken);

    for (const otherToken of [clientToken, pmToken]) {
      const res = await decide(requestId, otherToken, { decision: ProjectRequestStatus.APPROVED });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    }

    // Still approvable by an admin afterwards — the refusals changed nothing.
    const approved = await decide(requestId, superAdminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.project.status).toBe(ProjectStatus.ACTIVE);
  });

  it('refuses approval for a non-qualified organization and creates nothing', async () => {
    // Simulates legacy/stale data: a request that exists against an organization
    // which never went through qualification. The request row is written
    // directly so the approval gate itself is what is under test.
    const { org, pm, adminToken } = await setup(OrganizationQualificationStatus.PROSPECT);
    const seeded = await prisma.projectRequest.create({
      data: {
        organizationId: org.id,
        requestedById: createdUserIds[0],
        name: `Stale request ${unique()}`,
        status: ProjectRequestStatus.PENDING,
      },
    });

    const res = await decide(seeded.id, adminToken, {
      decision: ProjectRequestStatus.APPROVED,
      projectManagerId: pm.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    // The error must name the organization and the step that unblocks it.
    expect(res.body.error.message).toContain(org.name);
    expect(res.body.error.message.toLowerCase()).toContain('qualif');

    // The request must be left untouched and no project created.
    const stored = await prisma.projectRequest.findUnique({ where: { id: seeded.id } });
    expect(stored?.status).toBe(ProjectRequestStatus.PENDING);
    expect(stored?.projectId).toBeNull();
    expect(await prisma.project.count({ where: { organizationId: org.id } })).toBe(0);
  });
});
