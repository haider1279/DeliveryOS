import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { auditService } from '../../src/services/audit.service';
import * as supabaseAdminModule from '../../src/services/supabase-admin.service';
import {
  UserRole,
  UserStatus,
  OrganizationQualificationStatus,
  ProjectStatus,
  InvoiceStatus,
  ProjectMembershipRole,
  TaskStatus,
  NotificationType,
  RequirementStatus,
} from '@deliveryos/shared';

/**
 * Regression suite for TRUE (physical) user-account deletion.
 *
 * The central assertion of this file is that the `User` row is really gone
 * from the database — not deactivated, not soft-deleted — while every piece of
 * historical business data survives with a NULL actor reference.
 */

const SUPER_ADMIN_EMAIL = 'haider1.euroshub@gmail.com';
const ADMIN_EMAIL = 'haider2.euroshub@gmail.com';

let superAdminToken: string;
let adminToken: string;
let superAdmin: { id: string; email: string; role: UserRole };
let admin: { id: string; email: string; role: UserRole };

/** Emails of every throwaway fixture user, so cleanup can never touch seed data. */
const fixtureEmails: string[] = [];
const orgIds: string[] = [];
const projectIds: string[] = [];
const invoiceIds: string[] = [];

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

/** Creates a disposable user directly in the DB (no Supabase invite round-trip). */
async function makeUser(role: UserRole, opts: { orgId?: string | null; active?: boolean } = {}) {
  const email = `del-test-${role.toLowerCase()}-${uniq()}@deliveryos.local`;
  fixtureEmails.push(email);
  return prisma.user.create({
    data: {
      email,
      role,
      status: opts.active === false ? UserStatus.INVITED : UserStatus.ACTIVE,
      organizationId: opts.orgId ?? null,
      passwordHash: bcrypt.hashSync('DeleteTest#2026!', 10),
      profile: {
        create: { firstName: 'Delete', lastName: role, displayName: `Delete ${role}` },
      },
    },
  });
}

async function makeOrg() {
  const suffix = uniq();
  const org = await prisma.organization.create({
    data: {
      name: `Deletion Test Org ${suffix}`,
      slug: `deletion-test-org-${suffix}`,
      contactEmail: `org-${suffix}@deliveryos.local`,
      qualificationStatus: OrganizationQualificationStatus.APPROVED,
    },
  });
  orgIds.push(org.id);
  return org;
}

async function makeProject(orgId: string, managerId: string, memberIds: string[] = []) {
  const project = await prisma.project.create({
    data: {
      name: `Deletion Test Project ${uniq()}`,
      code: `DEL-${Math.floor(Math.random() * 1000000)}`,
      organizationId: orgId,
      projectManagerId: managerId,
      status: ProjectStatus.ACTIVE,
      members: {
        create: memberIds.map((userId) => ({
          userId,
          membershipRole: ProjectMembershipRole.DEVELOPER,
        })),
      },
    },
  });
  projectIds.push(project.id);
  return project;
}

/** Issues a real session token the way login does, so JWT verification is exercised. */
function tokenFor(user: { id: string; email: string; role: UserRole }) {
  return authService.createDevToken({ id: user.id, email: user.email, role: user.role });
}

beforeAll(async () => {
  superAdmin = await prisma.user.findUniqueOrThrow({ where: { email: SUPER_ADMIN_EMAIL } });
  admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  superAdminToken = tokenFor(superAdmin as never);
  adminToken = tokenFor(admin as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Tear down in reverse dependency order. Fixtures that were already deleted
  // by the endpoint under test simply match zero rows here.
  if (invoiceIds.length) {
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  }
  if (projectIds.length) {
    await prisma.requirement.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.taskComment.deleteMany({ where: { task: { projectId: { in: projectIds } } } });
    await prisma.timeEntry.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectActivity.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  }
  if (fixtureEmails.length) {
    // Only users still present are removed; deleted accounts are already gone.
    const remaining = await prisma.user.findMany({
      where: { email: { in: fixtureEmails } },
      select: { id: true },
    });
    const ids = remaining.map((u) => u.id);
    if (ids.length) {
      await prisma.project.deleteMany({ where: { projectManagerId: { in: ids }, id: { notIn: projectIds } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
  }
  if (orgIds.length) {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }
  await prisma.$disconnect();
});

// ===========================================================================
describe('1. ADMIN deletion authority', () => {
  it('ADMIN can permanently delete an eligible Team member (DEVELOPER)', async () => {
    const target = await makeUser(UserRole.DEVELOPER);
    const project = await makeProject((await makeOrg()).id, superAdmin.id, [target.id]);

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);

    // The User row must actually be gone from the database.
    const after = await prisma.user.findUnique({ where: { id: target.id } });
    expect(after).toBeNull();

    // Project membership is an assignment, not history: it is removed.
    expect(await prisma.projectMember.count({ where: { userId: target.id } })).toBe(0);
    // The project itself is untouched.
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(1);
  });

  it('ADMIN can permanently delete an eligible Client', async () => {
    const org = await makeOrg();
    const target = await makeUser(UserRole.CLIENT, { orgId: org.id });

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    // The client organization itself is business data and must survive.
    expect(await prisma.organization.count({ where: { id: org.id } })).toBe(1);
  });

  it('ADMIN cannot delete a SUPER_ADMIN', async () => {
    const res = await request(app)
      .delete(`/api/users/${superAdmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body?.error?.message).toMatch(/super admin/i);
    // Higher-authority protection: the target is completely untouched.
    expect(await prisma.user.findUnique({ where: { id: superAdmin.id } })).not.toBeNull();
  });

  it('ADMIN cannot delete themselves', async () => {
    const res = await request(app)
      .delete(`/api/users/${admin.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body?.error?.message).toMatch(/your own account/i);
    expect(await prisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it('ADMIN cannot delete another ADMIN (peer authority)', async () => {
    const otherAdmin = await makeUser(UserRole.ADMIN);
    const res = await request(app)
      .delete(`/api/users/${otherAdmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { id: otherAdmin.id } })).not.toBeNull();
  });
});

// ===========================================================================
describe('2. SUPER_ADMIN deletion authority', () => {
  it('SUPER_ADMIN can permanently delete an eligible Team member', async () => {
    const target = await makeUser(UserRole.QA);
    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });

  it('SUPER_ADMIN can permanently delete an eligible Client', async () => {
    const org = await makeOrg();
    const target = await makeUser(UserRole.CLIENT, { orgId: org.id });
    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });

  it('SUPER_ADMIN can delete a peer ADMIN (higher authority)', async () => {
    const target = await makeUser(UserRole.ADMIN);
    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });

  it('SUPER_ADMIN cannot delete themselves (no system-owner escape hatch)', async () => {
    const res = await request(app)
      .delete(`/api/users/${superAdmin.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body?.error?.message).toMatch(/your own account/i);
    expect(await prisma.user.findUnique({ where: { id: superAdmin.id } })).not.toBeNull();
  });

  it('SUPER_ADMIN remains above ADMIN: an ADMIN cannot remove a super admin', async () => {
    // Cross-checked from the ADMIN side to prove the hierarchy is not one-way.
    const res = await request(app)
      .delete(`/api/users/${superAdmin.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { id: superAdmin.id } })).not.toBeNull();
  });
});

// ===========================================================================
describe('3. LOWER roles cannot delete anyone', () => {
  const lowerRoles: Array<[UserRole, string]> = [
    [UserRole.PROJECT_MANAGER, 'haider8.euroshub@gmail.com'],
    [UserRole.DEVELOPER, 'haider7.euroshub@gmail.com'],
    [UserRole.QA, 'haider5.euroshub@gmail.com'],
    [UserRole.CLIENT, 'haider6.euroshub@gmail.com'],
  ];

  for (const [role, email] of lowerRoles) {
    it(`${role} cannot delete another user`, async () => {
      const lowerUser = await prisma.user.findUniqueOrThrow({ where: { email } });
      const target = await makeUser(UserRole.DEVELOPER);
      const token = tokenFor(lowerUser as never);

      const res = await request(app)
        .delete(`/api/users/${target.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
    });
  }

  it('BD cannot delete another user', async () => {
    const bd = await prisma.user.findUniqueOrThrow({ where: { email: 'haider4.euroshub@gmail.com' } });
    const target = await makeUser(UserRole.DEVELOPER);
    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${tokenFor(bd as never)}`);

    expect(res.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
  });
});

// ===========================================================================
describe('4. Database integrity: true delete, history preserved', () => {
  it('deletes the account while preserving every historical business record', async () => {
    const org = await makeOrg();
    const target = await makeUser(UserRole.DEVELOPER, { orgId: org.id });
    const project = await makeProject(org.id, superAdmin.id, [target.id]);

    // --- Historical records attributable to the departing user ------------
    const requirement = await prisma.requirement.create({
      data: {
        projectId: project.id,
        title: 'Requirement preserved after account deletion',
        description: 'History must survive the author.',
        acceptanceCriteria: 'Still here.',
        submittedById: target.id,
        status: RequirementStatus.SUBMITTED,
      },
    });
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        requirementId: requirement.id,
        title: 'Task created by the departing user',
        creatorId: target.id,
        assigneeId: target.id,
        status: TaskStatus.IN_PROGRESS,
      },
    });
    const taskComment = await prisma.taskComment.create({
      data: { taskId: task.id, authorId: target.id, content: 'Historical comment.' },
    });
    const timeEntry = await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        taskId: task.id,
        userId: target.id,
        date: new Date(),
        durationMinutes: 90,
      },
    });
    const activity = await prisma.projectActivity.create({
      data: {
        projectId: project.id,
        actorId: target.id,
        type: 'TASK_COMPLETED',
        message: 'Historical activity.',
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        invoiceNumber: `INV-DEL-${uniq()}`,
        status: InvoiceStatus.PAID,
        subtotal: 500,
        discount: 0,
        tax: 0,
        total: 500,
        issuedDate: new Date(),
        dueDate: new Date(Date.now() + 86400000),
      },
    });
    invoiceIds.push(invoice.id);
    const payment = await prisma.payment.create({
      data: { invoiceId: invoice.id, amount: 500, recordedById: target.id },
    });
    const auditLog = await prisma.auditLog.create({
      data: {
        actorId: target.id,
        action: 'TASK_UPDATED',
        entityType: 'Task',
        entityId: task.id,
        actorEmail: target.email,
        actorName: 'Delete DEVELOPER',
        actorRole: UserRole.DEVELOPER,
      },
    });
    const notification = await prisma.notification.create({
      data: {
        userId: target.id,
        type: NotificationType.GENERAL,
        title: 'Personal notification',
        message: 'Belongs to the departing account.',
      },
    });

    // --- Act ------------------------------------------------------------
    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // --- 1. The account itself is physically gone ------------------------
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.profile.count({ where: { userId: target.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { id: notification.id } })).toBe(0);
    expect(await prisma.projectMember.count({ where: { userId: target.id } })).toBe(0);

    // --- 2. Historical business records survive, actor reference NULLed ---
    const taskAfter = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(taskAfter.creatorId).toBeNull();
    expect(taskAfter.assigneeId).toBeNull();

    const commentAfter = await prisma.taskComment.findUniqueOrThrow({ where: { id: taskComment.id } });
    expect(commentAfter.authorId).toBeNull();

    const timeAfter = await prisma.timeEntry.findUniqueOrThrow({ where: { id: timeEntry.id } });
    expect(timeAfter.userId).toBeNull();
    expect(timeAfter.durationMinutes).toBe(90);

    const requirementAfter = await prisma.requirement.findUniqueOrThrow({ where: { id: requirement.id } });
    expect(requirementAfter.submittedById).toBeNull();

    const activityAfter = await prisma.projectActivity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(activityAfter.actorId).toBeNull();
    expect(activityAfter.message).toBe('Historical activity.');

    // --- 3. Financial records are NEVER destroyed ------------------------
    const paymentAfter = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(paymentAfter.recordedById).toBeNull();
    expect(Number(paymentAfter.amount)).toBe(500);
    expect(await prisma.invoice.count({ where: { id: invoice.id } })).toBe(1);

    // --- 4. Audit history survives and stays attributable ----------------
    const auditAfter = await prisma.auditLog.findUniqueOrThrow({ where: { id: auditLog.id } });
    expect(auditAfter.actorId).toBeNull();
    expect(auditAfter.action).toBe('TASK_UPDATED');
    expect(auditAfter.actorEmail).toBe(target.email);
    expect(auditAfter.actorRole).toBe(UserRole.DEVELOPER);

    // --- 5. The API reports what was preserved ---------------------------
    expect(res.body?.data?.deletedUserId).toBe(target.id);
    expect(res.body?.data?.preserved?.payments).toBeGreaterThanOrEqual(1);
    expect(res.body?.data?.preserved?.timeEntries).toBeGreaterThanOrEqual(1);
    expect(res.body?.data?.preserved?.auditLogs).toBeGreaterThanOrEqual(1);
    expect(res.body?.data?.preserved?.projectActivities).toBeGreaterThanOrEqual(1);
  });

  it('leaves no orphaned foreign-key rows pointing at the deleted user', async () => {
    const org = await makeOrg();
    const target = await makeUser(UserRole.QA);
    const project = await makeProject(org.id, superAdmin.id, [target.id]);
    const task = await prisma.task.create({
      data: { projectId: project.id, title: 'Orphan check', creatorId: target.id },
    });
    await prisma.taskComment.create({
      data: { taskId: task.id, authorId: target.id, content: 'x' },
    });
    await prisma.auditLog.create({
      data: { actorId: target.id, action: 'X', entityType: 'Task', entityId: task.id },
    });

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Every column that could still reference the user must now be NULL.
    expect(
      await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM "Task" WHERE "creatorId" = $1`,
        target.id
      ).then((r) => Number(r[0].n))
    ).toBe(0);
    expect(
      await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM "TaskComment" WHERE "authorId" = $1`,
        target.id
      ).then((r) => Number(r[0].n))
    ).toBe(0);
    expect(
      await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM "AuditLog" WHERE "actorId" = $1`,
        target.id
      ).then((r) => Number(r[0].n))
    ).toBe(0);
  });
});

// ===========================================================================
describe('5. Refuses to half-delete: blocked relationships', () => {
  it('refuses to delete a user who still manages an active project, leaving everything intact', async () => {
    const org = await makeOrg();
    const pmTarget = await makeUser(UserRole.PROJECT_MANAGER);
    const project = await makeProject(org.id, pmTarget.id);

    const before = await prisma.project.count({ where: { id: project.id } });

    const res = await request(app)
      .delete(`/api/users/${pmTarget.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body?.error?.message).toMatch(/cannot be deleted yet/i);

    // No partial deletion: the user AND the project are both still there.
    expect(await prisma.user.findUnique({ where: { id: pmTarget.id } })).not.toBeNull();
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(before);
  });

  it('the deletion preview reports the blocker without deleting anything', async () => {
    const org = await makeOrg();
    const pmTarget = await makeUser(UserRole.PROJECT_MANAGER);
    await makeProject(org.id, pmTarget.id);

    const res = await request(app)
      .get(`/api/users/${pmTarget.id}/deletion-preview`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body?.data?.deletable).toBe(false);
    expect(res.body?.data?.blockers?.[0]?.reason).toBe('MANAGES_ACTIVE_PROJECTS');
    expect(await prisma.user.findUnique({ where: { id: pmTarget.id } })).not.toBeNull();
  });

  it('the deletion preview reports a user as deletable when no blocker exists', async () => {
    const target = await makeUser(UserRole.DEVELOPER);
    const res = await request(app)
      .get(`/api/users/${target.id}/deletion-preview`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body?.data?.deletable).toBe(true);
    expect(res.body?.data?.blockers).toEqual([]);
  });
});

// ===========================================================================
describe('6. Authentication access is revoked', () => {
  it('an existing session token stops working immediately after deletion', async () => {
    const target = await makeUser(UserRole.DEVELOPER);
    const targetToken = tokenFor(target as never);

    // The token works before deletion.
    const before = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${targetToken}`);
    expect(before.status).toBe(200);
    expect(before.body?.data?.id).toBe(target.id);

    const del = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    // The SAME, still-unexpired JWT is now rejected: authMiddleware re-resolves
    // the caller from the database on every request, and the row is gone.
    const after = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${targetToken}`);
    expect(after.status).toBe(401);
    expect(after.body?.error?.message).toMatch(/not found|unauthorized/i);
  });

  it('the deleted user can no longer log in with their old password', async () => {
    const target = await makeUser(UserRole.DEVELOPER);

    const del = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: target.email, password: 'DeleteTest#2026!' });
    expect(login.status).toBe(401);
  });

  it('removes the Supabase Auth identity so the account cannot be used to authenticate', async () => {
    const supabaseUserId = `sp_delete_${uniq()}`;
    const target = await makeUser(UserRole.DEVELOPER);
    await prisma.user.update({ where: { id: target.id }, data: { supabaseUserId } });

    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.spyOn(supabaseAdminModule, 'getSupabaseAdmin').mockReturnValue({
      auth: { admin: { deleteUser } },
    } as never);

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(supabaseUserId);
    // The application record is gone regardless of the external provider.
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(res.body?.data?.warnings).toEqual([]);
  });

  it('still deletes the account and reports a warning when Supabase cleanup fails', async () => {
    const target = await makeUser(UserRole.DEVELOPER);
    await prisma.user.update({
      where: { id: target.id },
      data: { supabaseUserId: `sp_fail_${uniq()}` },
    });

    vi.spyOn(supabaseAdminModule, 'getSupabaseAdmin').mockReturnValue({
      auth: {
        admin: { deleteUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) },
      },
    } as never);

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(res.body?.data?.warnings?.[0]).toMatch(/boom|authentication identity/i);
  });

  it('deletes the invited (never-activated) account too', async () => {
    const target = await makeUser(UserRole.DEVELOPER, { active: false });
    expect(target.status).toBe(UserStatus.INVITED);

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });
});

// ===========================================================================
describe('7. Security: IDOR and forged input', () => {
  it('rejects an unauthenticated deletion attempt', async () => {
    const target = await makeUser(UserRole.DEVELOPER);
    const res = await request(app).delete(`/api/users/${target.id}`);

    expect(res.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
  });

  it('ignores forged actor/role/organizationId in the request body', async () => {
    const target = await makeUser(UserRole.DEVELOPER);

    // A crafted body claiming to be the super admin must not be trusted: the
    // actor is resolved from the bearer token, not from the payload.
    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ actorId: superAdmin.id, role: 'SUPER_ADMIN', organizationId: null, userId: target.id });

    // The ADMIN is still only authorised for the roles in its allow-list, so a
    // forged payload cannot upgrade anything; the request is handled by the
    // real actor's authority alone.
    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });

  it('a forged role claim in the token cannot grant deletion rights', async () => {
    // authMiddleware re-reads role from the database, so a token signed with a
    // fabricated role still resolves to the real (low-privilege) role.
    const forged = authService.createDevToken({
      id: '00000000-0000-0000-0000-0000000000ff',
      email: 'ghost@nowhere.local',
      role: UserRole.SUPER_ADMIN,
    });

    const target = await makeUser(UserRole.DEVELOPER);
    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
  });

  it('cannot delete a user by supplying a different userId than the path target', async () => {
    const target = await makeUser(UserRole.DEVELOPER);
    const bystander = await makeUser(UserRole.QA);

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: bystander.id });

    // Only the path target is affected; the body cannot redirect the deletion.
    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: bystander.id } })).not.toBeNull();
  });

  it('returns 404 for a target that does not exist', async () => {
    const res = await request(app)
      .delete('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
describe('8. Audit attribution snapshot', () => {
  it('resolves an actor snapshot that survives the account being deleted', async () => {
    const target = await makeUser(UserRole.DEVELOPER);

    const snapshot = await auditService.resolveActorSnapshot(target.id);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.email).toBe(target.email);
    expect(snapshot?.role).toBe(UserRole.DEVELOPER);
    expect(snapshot?.name).toBe('Delete DEVELOPER');

    // The snapshot was captured before deletion, so the deleted account stays
    // identifiable in history.
    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // The account is gone, but the identity it leaves behind is intact.
    expect(snapshot?.email).toBe(target.email);
    expect(await auditService.resolveActorSnapshot(target.id)).toBeNull();
  });
});
