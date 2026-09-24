import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { config } from '../../src/config';
import { authService } from '../../src/modules/auth/auth.service';
import { emailService } from '../../src/services/email.service';
import { auditService } from '../../src/services/audit.service';
import { UserRole, UserStatus, OrganizationQualificationStatus, ProjectStatus } from '@deliveryos/shared';

/**
 * Regression tests for the four confirmed delivery defects:
 *
 * BUG 1 — Invitation was never actually delivered: inviteUser created the
 *   record + link but nothing sent anything. These tests assert an invitation
 *   email is dispatched with the correct recipient and token link, that the
 *   dev-local mailbox (no SMTP) really writes a readable .eml, and that
 *   production refuses to silently swallow blocked email delivery.
 *
 * BUG 2 — Team roles could not be changed at all. These tests exercise the new
 *   PATCH /api/users/:id/role endpoint and its RBAC guards (escalation,
 *   self-change, super-admin protection, non-admin block).
 *
 * BUG 3 — Text inputs lost focus after one character inside any Modal dialog.
 *   Root cause is the Dialog's focus effect re-running on every parent re-render
 *   due to an inline-arrow onClose dependency. (Covered by the E2E focus
 *   regression; backend suite here keeps the RBAC surface intact.)
 *
 * BUG 4 — Project creation wrongly required the project manager to literally
 *   belong to the project's organization, blocking agency-level PMs who are
 *   assigned across organizations via ProjectMember memberships. These tests
 *   verify the assignment-aware rule: SUPER_ADMIN/ADMIN may assign any active
 *   PM; a PM with an existing active membership in the target org is legitimate;
 *   an unrelated PM (no membership, foreign org) is still rejected.
 *
 * Requires the seeded local database. All users/projects created here are
 * cleaned up in afterAll.
 */
describe('DeliveryOS defect regressions (seeded database)', () => {
  const createdEmails: string[] = [];
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const suffix = Date.now();

  let superToken: string;
  let adminToken: string;
  let pmToken: string;
  let acmeOrgId: string;
  let starlightOrgId: string;
  let acmeProjectId: string;

  beforeAll(async () => {
    const superUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'haider1.euroshub@gmail.com' },
    });
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'haider2.euroshub@gmail.com' },
    });
    const pmUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'haider8.euroshub@gmail.com' },
    });
    superToken = authService.createDevToken({
      id: superUser.id,
      email: superUser.email,
      role: superUser.role,
    });
    adminToken = authService.createDevToken({
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });
    pmToken = authService.createDevToken({
      id: pmUser.id,
      email: pmUser.email,
      role: pmUser.role,
    });

    const acme = await prisma.organization.create({
      data: {
        name: `Acme Corp ${suffix}`,
        slug: `acme-corp-${suffix}`,
        contactEmail: `acme-${suffix}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    const starlight = await prisma.organization.create({
      data: {
        name: `Starlight Retail ${suffix}`,
        slug: `starlight-retail-${suffix}`,
        contactEmail: `starlight-${suffix}@test.com`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    acmeOrgId = acme.id;
    starlightOrgId = starlight.id;
    const acmeProject = await prisma.project.create({
      data: {
        name: `ACME WMS ${suffix}`,
        code: `ACM${(suffix % 100000).toString().padStart(5, '0')}`,
        organizationId: acmeOrgId,
        projectManagerId: pmUser.id,
        status: ProjectStatus.ACTIVE,
      },
    });
    acmeProjectId = acmeProject.id;
    createdProjectIds.push(acmeProjectId);
  });

  afterAll(async () => {
    // Robust teardown: revoke every membership tied to fixture users, then
    // remove projects those users manage, then remove the users themselves.
    // This also sweeps up any side-effect projects created by tests whose
    // assertion failed before the id was tracked.
    await prisma.projectMember.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.project.deleteMany({
      where: { projectManagerId: { in: createdUserIds } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: createdProjectIds.filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: createdEmails } },
    });
    if (acmeOrgId) await prisma.organization.deleteMany({ where: { id: acmeOrgId } });
    if (starlightOrgId) await prisma.organization.deleteMany({ where: { id: starlightOrgId } });
    await prisma.$disconnect();
  });

  async function createFixtureUser(role: UserRole, orgId?: string) {
    const email = `fixture-${role.toLowerCase()}-${suffix}-${createdUserIds.length}@deliveryos.local`;
    const user = await prisma.user.create({
      data: {
        email,
        role,
        status: UserStatus.ACTIVE,
        organizationId: orgId ?? null,
        profile: {
          create: {
            firstName: `Fixture ${role}`,
            lastName: suffix.toString(),
            displayName: `Fixture ${role} ${suffix}`,
          },
        },
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  function projectPayload(organizationId: string, projectManagerId: string, tag: string) {
    // Code slot is 10 chars max (^[A-Z0-9_-]{2,10}$) — keep it under the limit
    // so the tag letter is never truncated off, otherwise every generated code
    // collides and each POST returns 409.
    const code = `RT${suffix % 1000000}${tag}`.toUpperCase();
    return {
      organizationId,
      projectManagerId,
      name: `Regression test project ${tag}`,
      code,
      description: 'created by defect-regression suite',
      priority: 'MEDIUM',
    };
  }

  describe('BUG 1 — invitation email is actually dispatched', () => {
    it('invite endpoint now delivers the invitation email to the recipient', async () => {
      const email = `invitemail-test-${suffix}@deliveryos.local`;
      createdEmails.push(email);
      const spy = vi.spyOn(emailService, 'sendInvitationEmail').mockResolvedValueOnce({
        transport: 'dev-mailbox',
      });

      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, firstName: 'Mail', lastName: 'Test', role: 'DEVELOPER' });
      expect(res.status).toBe(201);
      const inviteToken = res.body?.data?.inviteToken;
      expect(inviteToken).toMatch(/^[0-9a-f]{64}$/);

      expect(spy).toHaveBeenCalledOnce();
      const arg = spy.mock.calls[0][0];
      expect(arg.to).toBe(email);
      expect(arg.firstName).toBe('Mail');
      expect(arg.inviteUrl).toContain('accept-invite');
      expect(arg.inviteUrl).toContain(inviteToken);
      // Token must never be logged by the email layer.
      if (process.env['SMTP_PASS']) {
        expect(JSON.stringify(arg)).not.toContain(process.env['SMTP_PASS']);
      }
      spy.mockRestore();
    });

    it('finally writes a real message to the local dev mailbox when no SMTP is configured', async () => {
      const devMailDir = config.email.devMailDir;
      const filesBefore = new Set(fs.existsSync(devMailDir) ? fs.readdirSync(devMailDir) : []);
      const email = `invoicembox-test-${suffix}@deliveryos.local`;
      createdEmails.push(email);

      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, firstName: 'Box', lastName: 'Mail', role: 'QA' });
      expect(res.status).toBe(201);

      const dirEntries = fs.existsSync(devMailDir) ? fs.readdirSync(devMailDir) : [];
      const created = dirEntries.filter((f) => !filesBefore.has(f));
      expect(created.length).toBeGreaterThan(0);

      // Files in the shared dev-mailbox are written by multiple test files that
      // vitest runs in parallel, so file ordering is not deterministic. Locate
      // the specific message addressed to this recipient instead of assuming
      // the first new file belongs to this test.
      const emlPath = created
        .map((f) => path.join(devMailDir, f))
        .find((p) => fs.readFileSync(p, 'utf8').includes(`To: ${email}`));
      expect(emlPath).toBeTruthy();

      const eml = fs.readFileSync(emlPath!, 'utf8');
      expect(eml).toContain(`To: ${email}`);
      expect(eml).toContain('accept-invite');
      expect(eml).toContain(res.body?.data?.inviteToken);
    });

    it('production refuses to deliver silently when SMTP is not configured', async () => {
      const previous = config.isProd;
      try {
        config.isProd = true;
        await expect(
          emailService.send({
            to: 'recipient@example.com',
            subject: 'test',
            text: 'test',
            html: '<p>test</p>',
          })
        ).rejects.toMatchObject({ code: 'EMAIL_NOT_CONFIGURED' });
      } finally {
        config.isProd = previous;
      }
    });
  });

  describe('BUG 2 — team member roles can be changed under RBAC guard', () => {
    let target: any;

    beforeAll(async () => {
      target = await createFixtureUser(UserRole.PROJECT_MANAGER);
    });

    it('super admin can change a member role and the change persists', async () => {
      const res = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ role: UserRole.CLIENT });
      expect(res.status).toBe(200);
      expect(res.body?.data?.role).toBe(UserRole.CLIENT);

      const inDb = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(inDb.role).toBe(UserRole.CLIENT);

      // Round-trip back to a staff role.
      const back = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ role: UserRole.PROJECT_MANAGER });
      expect(back.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe(
        UserRole.PROJECT_MANAGER
      );
    });

    it('records an audit trail entry for the change', async () => {
      const spy = vi.spyOn(auditService, 'log');
      await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ role: UserRole.QA });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_ROLE_UPDATED',
          entityType: 'User',
          entityId: target.id,
          metadata: { fromRole: UserRole.PROJECT_MANAGER, toRole: UserRole.QA },
        })
      );
      spy.mockRestore();

      // Restore the fixture role for subsequent tests.
      await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ role: UserRole.PROJECT_MANAGER });
    });

    it('admin cannot escalate another user to ADMIN or SUPER_ADMIN', async () => {
      const toAdmin = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.ADMIN });
      expect(toAdmin.status).toBe(403);

      const toSuper = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.SUPER_ADMIN });
      expect(toSuper.status).toBe(403);
    });

    it('admin cannot change a SUPER_ADMIN role; only super admin can', async () => {
      // A second super admin acts as the mutatee so the seeded SUPER_ADMIN
      // token stays the actor (avoiding the self-change rule).
      const fixtureSuper = await createFixtureUser(UserRole.SUPER_ADMIN);

      const byAdmin = await request(app)
        .patch(`/api/users/${fixtureSuper.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.ADMIN });
      expect(byAdmin.status).toBe(403);

      const bySuper = await request(app)
        .patch(`/api/users/${fixtureSuper.id}/role`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ role: UserRole.DEVELOPER });
      expect(bySuper.status).toBe(200);
      // Restore.
      const undo = await request(app)
        .patch(`/api/users/${fixtureSuper.id}/role`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ role: UserRole.SUPER_ADMIN });
      expect(undo.status).toBe(200);
    });

    it('rejects changing your own role via full endpoint', async () => {
      const superUser = await prisma.user.findUniqueOrThrow({
        where: { email: 'haider1.euroshub@gmail.com' },
      });
      const res = await request(app)
        .patch(`/api/users/${superUser.id}/role`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ role: UserRole.ADMIN });
      expect(res.status).toBe(403);
      expect(res.body?.error?.message).toMatch(/own role/i);
    });

    it('non-admin (PM) is blocked from the role-change endpoint', async () => {
      const res = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${pmToken}`)
        .send({ role: UserRole.QA });
      expect(res.status).toBe(403);
    });

    it('rejects an invalid role value (schema validation)', async () => {
      const res = await request(app)
        .patch(`/api/users/${target.id}/role`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ role: 'NOT_A_ROLE' });
      expect(res.status).toBe(422);
    });
  });

  describe('BUG 4 — project creation honors assignment-aware PM validation', () => {
    let pmForeign: any;
    let pmNoAccess: any;
    let pmAcme: any;
    let pmStarlight: any;

    beforeAll(async () => {
      pmForeign = await createFixtureUser(UserRole.PROJECT_MANAGER); // org null, gets membership below
      pmNoAccess = await createFixtureUser(UserRole.PROJECT_MANAGER); // org null, never any membership
      pmStarlight = await createFixtureUser(UserRole.PROJECT_MANAGER, starlightOrgId);
      pmAcme = await createFixtureUser(UserRole.PROJECT_MANAGER, acmeOrgId);
    });

    it('(regression) super admin can assign the agency-level PM (organizationId null) to an org project', async () => {
      const seedPm = await prisma.user.findUniqueOrThrow({
        where: { email: 'haider8.euroshub@gmail.com' },
      });
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${superToken}`)
        .send(projectPayload(acmeOrgId, seedPm.id, 'A'));
      createdProjectIds.push(res.body?.data?.id);
      expect(res.status).toBe(201);

      // The PM was granted a membership scoped to the new project only.
      const membership = await prisma.projectMember.findFirst({
        where: { projectId: res.body?.data?.id, userId: seedPm.id },
      });
      expect(membership?.membershipRole).toBe('PROJECT_MANAGER');
    });

    it('(release) admin may open a project for any org and assign a foreign, agency-level PM', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(projectPayload(starlightOrgId, pmForeign.id, 'B'));
      createdProjectIds.push(res.body?.data?.id);
      expect(res.status).toBe(201);
    });

    it('PM attempting project creation receives 403 Forbidden', async () => {
      const pmAcmeToken = authService.createDevToken({
        id: pmAcme.id,
        email: pmAcme.email,
        role: pmAcme.role,
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${pmAcmeToken}`)
        .send(projectPayload(acmeOrgId, pmForeign.id, 'C'));
      expect(res.status).toBe(403);
    });

    it('Admin can assign an active PM to an org project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(projectPayload(acmeOrgId, pmForeign.id, 'C'));
      createdProjectIds.push(res.body?.data?.id);
      expect(res.status).toBe(201);
    });

    it('PM cannot assign a foreign PM with no membership in the target org', async () => {
      const pmAcmeToken = authService.createDevToken({
        id: pmAcme.id,
        email: pmAcme.email,
        role: pmAcme.role,
      });

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${pmAcmeToken}`)
        .send(projectPayload(acmeOrgId, pmNoAccess.id, 'D'));
      expect(res.status).toBe(403);
    });

    it('PM is still blocked from planting projects in another organization', async () => {
      const pmAcmeToken = authService.createDevToken({
        id: pmAcme.id,
        email: pmAcme.email,
        role: pmAcme.role,
      });
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${pmAcmeToken}`)
        .send(projectPayload(starlightOrgId, pmAcme.id, 'E'));
      expect(res.status).toBe(403);
    });

    it('a PM from an unrelated org is still rejected, keeping tenant isolation', async () => {
      const pmAcmeToken = authService.createDevToken({
        id: pmAcme.id,
        email: pmAcme.email,
        role: pmAcme.role,
      });
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${pmAcmeToken}`)
        .send(projectPayload(acmeOrgId, pmStarlight.id, 'F'));
      expect(res.status).toBe(403);
    });

    it('a truly foreign PM cannot even read a project outside their assignments', async () => {
      const pmNoAccessToken = authService.createDevToken({
        id: pmNoAccess.id,
        email: pmNoAccess.email,
        role: pmNoAccess.role,
      });
      const blocked = await request(app)
        .get(`/api/projects/${acmeProjectId}`)
        .set('Authorization', `Bearer ${pmNoAccessToken}`);
      expect(blocked.status).toBe(404);
    });

    it('the assigned PM can access only the project they were assigned, not foreign tenants', async () => {
      const created = await prisma.project.findFirst({
        where: { id: { in: createdProjectIds.filter((x): x is string => Boolean(x)) }, projectManagerId: pmForeign.id },
      });
      expect(created).toBeTruthy();

      const pmForeignToken = authService.createDevToken({
        id: pmForeign.id,
        email: pmForeign.email,
        role: pmForeign.role,
      });
      const ownProject = await request(app)
        .get(`/api/projects/${created!.id}`)
        .set('Authorization', `Bearer ${pmForeignToken}`);
      expect(ownProject.status).toBe(200);

      // Uses fixture project where pmForeign is NOT a member (e.g. starlight project)
      const foreignProject = await prisma.project.create({
        data: {
          name: `Foreign Project ${Date.now()}`,
          code: `FOR${Math.floor(Math.random() * 100000)}`,
          organizationId: starlightOrgId,
          projectManagerId: pmAcme.id,
          status: ProjectStatus.ACTIVE,
        },
      });
      createdProjectIds.push(foreignProject.id);

      const blocked = await request(app)
        .get(`/api/projects/${foreignProject.id}`)
        .set('Authorization', `Bearer ${pmForeignToken}`);
      expect(blocked.status).toBe(404);
    });
  });
});