/**
 * Task Workflow RBAC — regression tests for the Developer / QA ownership model.
 *
 * Required invariants (all enforced by the backend; frontend is irrelevant here):
 *
 *  Developer:
 *    - CAN:  TODO → IN_PROGRESS → READY_FOR_QA
 *    - CAN:  BUG_REPORTED → IN_PROGRESS (fix cycle)
 *    - CANNOT: READY_FOR_QA → DONE          (bypasses QA)
 *    - CANNOT: READY_FOR_QA → BUG_REPORTED  (self-report)
 *    - CANNOT: READY_FOR_QA → TESTING       (QA-owned gate)
 *    - CANNOT: TESTING → DONE / BUG_REPORTED
 *
 *  QA:
 *    - CAN:  READY_FOR_QA → TESTING
 *    - CAN:  TESTING → DONE  (pass)
 *    - CAN:  TESTING → BUG_REPORTED  (fail)
 *    - CANNOT: create tasks
 *    - CANNOT: non-status field edits
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import {
  UserRole,
  TaskStatus,
  OrganizationQualificationStatus,
  ProjectMembershipRole,
} from '@deliveryos/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

async function createTaskAtStatus(
  projectId: string,
  creatorId: string,
  status: TaskStatus
): Promise<string> {
  const task = await prisma.task.create({
    data: {
      projectId,
      title: `Workflow test task [${status}] ${uniq()}`,
      creatorId,
      status,
    },
  });
  return task.id;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
describe('Task Workflow RBAC — Developer vs QA strict ownership', () => {
  let orgId: string;
  let projectId: string;
  let pmUser: any;
  let devUser: any;
  let qaUser: any;
  let pmToken: string;
  let devToken: string;
  let qaToken: string;

  beforeAll(async () => {
    // Resolve seed users
    pmUser = await prisma.user.findUniqueOrThrow({ where: { email: 'haider8.euroshub@gmail.com' } });
    devUser = await prisma.user.findUniqueOrThrow({ where: { email: 'haider7.euroshub@gmail.com' } });
    qaUser = await prisma.user.findUniqueOrThrow({ where: { email: 'haider5.euroshub@gmail.com' } });

    pmToken = authService.createDevToken({ id: pmUser.id, email: pmUser.email, role: UserRole.PROJECT_MANAGER });
    devToken = authService.createDevToken({ id: devUser.id, email: devUser.email, role: UserRole.DEVELOPER });
    qaToken = authService.createDevToken({ id: qaUser.id, email: qaUser.email, role: UserRole.QA });

    // Isolated org + project for this test run
    const org = await prisma.organization.create({
      data: {
        name: `TaskRBAC Org ${uniq()}`,
        slug: `task-rbac-${uniq()}`,
        contactEmail: `task-rbac-${uniq()}@test.local`,
        qualificationStatus: OrganizationQualificationStatus.APPROVED,
      },
    });
    orgId = org.id;

    const project = await prisma.project.create({
      data: {
        name: `TaskRBAC Project ${uniq()}`,
        code: `TRB${(Date.now() % 10000).toString().padStart(4, '0')}`,
        organizationId: orgId,
        projectManagerId: pmUser.id,
      },
    });
    projectId = project.id;

    await prisma.projectMember.createMany({
      data: [
        { projectId, userId: pmUser.id, membershipRole: ProjectMembershipRole.PROJECT_MANAGER },
        { projectId, userId: devUser.id, membershipRole: ProjectMembershipRole.DEVELOPER },
        { projectId, userId: qaUser.id, membershipRole: ProjectMembershipRole.QA },
      ],
    });
  });

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.organization.delete({ where: { id: orgId } });
  });

  // =========================================================================
  // 1. Developer happy path
  // =========================================================================
  it('Developer: TODO → IN_PROGRESS (allowed)', async () => {
    const taskId = await createTaskAtStatus(projectId, devUser.id, TaskStatus.TODO);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.IN_PROGRESS });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(TaskStatus.IN_PROGRESS);
  });

  it('Developer: IN_PROGRESS → READY_FOR_QA (allowed, direct handoff)', async () => {
    const taskId = await createTaskAtStatus(projectId, devUser.id, TaskStatus.IN_PROGRESS);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.READY_FOR_QA });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(TaskStatus.READY_FOR_QA);
  });

  // =========================================================================
  // 2. Developer CANNOT bypass QA
  // =========================================================================
  it('Developer: READY_FOR_QA → DONE is FORBIDDEN (role gate)', async () => {
    const taskId = await createTaskAtStatus(projectId, devUser.id, TaskStatus.READY_FOR_QA);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.DONE });
    expect(res.status).toBe(403);
    // READY_FOR_QA → DONE is not in the structural graph (structural check fires first)
    expect(res.body.error?.message).toMatch(/Cannot move task from READY_FOR_QA to DONE/i);
  });

  it('Developer: READY_FOR_QA → BUG_REPORTED is FORBIDDEN (role gate)', async () => {
    const taskId = await createTaskAtStatus(projectId, devUser.id, TaskStatus.READY_FOR_QA);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.BUG_REPORTED });
    expect(res.status).toBe(403);
    // READY_FOR_QA → BUG_REPORTED is not in the structural graph (structural check fires first)
    expect(res.body.error?.message).toMatch(/Cannot move task from READY_FOR_QA to BUG_REPORTED/i);
  });

  it('Developer: READY_FOR_QA → TESTING is FORBIDDEN (QA-owned gate)', async () => {
    const taskId = await createTaskAtStatus(projectId, devUser.id, TaskStatus.READY_FOR_QA);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.TESTING });
    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/not permitted|DEVELOPER/i);
  });

  it('Developer: IN_PROGRESS → DONE is FORBIDDEN (role gate)', async () => {
    const taskId = await createTaskAtStatus(projectId, devUser.id, TaskStatus.IN_PROGRESS);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.DONE });
    expect(res.status).toBe(403);
    // IN_PROGRESS → DONE is not in the structural graph (structural check fires first)
    expect(res.body.error?.message).toMatch(/Cannot move task from IN_PROGRESS to DONE/i);
  });

  // =========================================================================
  // 3. QA happy path
  // =========================================================================
  it('QA: READY_FOR_QA → TESTING (allowed — QA picks up the task)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.READY_FOR_QA);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ status: TaskStatus.TESTING });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(TaskStatus.TESTING);
  });

  it('QA: TESTING → DONE (pass — task completes)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.TESTING);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ status: TaskStatus.DONE });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(TaskStatus.DONE);
  });

  it('QA: TESTING → BUG_REPORTED (fail — sends back to developer)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.TESTING);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ status: TaskStatus.BUG_REPORTED });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(TaskStatus.BUG_REPORTED);
  });

  // =========================================================================
  // 4. Bug-fix cycle: Developer picks up BUG_REPORTED and re-submits
  // =========================================================================
  it('Developer: BUG_REPORTED → IN_PROGRESS (fix cycle — allowed)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.BUG_REPORTED);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.IN_PROGRESS });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(TaskStatus.IN_PROGRESS);
  });

  it('Full fix cycle: BUG_REPORTED → IN_PROGRESS (dev) → READY_FOR_QA (dev) → TESTING (QA) → DONE (QA)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.BUG_REPORTED);

    const step1 = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.IN_PROGRESS });
    expect(step1.status).toBe(200);

    const step2 = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: TaskStatus.READY_FOR_QA });
    expect(step2.status).toBe(200);

    const step3 = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ status: TaskStatus.TESTING });
    expect(step3.status).toBe(200);

    const step4 = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ status: TaskStatus.DONE });
    expect(step4.status).toBe(200);
    expect(step4.body.data.status).toBe(TaskStatus.DONE);
  });

  // =========================================================================
  // 5. QA cannot perform developer actions
  // =========================================================================
  it('QA: cannot create a task (403)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ projectId, title: 'QA should not create', priority: 'MEDIUM' });
    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/QA/i);
  });

  it('QA: cannot edit non-status fields on a task (403)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.READY_FOR_QA);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ title: 'QA cannot rename tasks' });
    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/QA.*status/i);
  });

  // =========================================================================
  // 6. Invalid structural transitions (rejected regardless of role)
  // =========================================================================
  it('PM: TODO → DONE is invalid (structural transition not in graph)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.TODO);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ status: TaskStatus.DONE });
    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/Cannot move task from TODO to DONE/i);
  });

  it('PM: TESTING → IN_PROGRESS is invalid (structural transition not in graph)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.TESTING);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ status: TaskStatus.IN_PROGRESS });
    expect(res.status).toBe(403);
    expect(res.body.error?.message).toMatch(/Cannot move task from TESTING to IN_PROGRESS/i);
  });

  it('Unauthenticated: cannot change task status (401)', async () => {
    const taskId = await createTaskAtStatus(projectId, pmUser.id, TaskStatus.TODO);
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .send({ status: TaskStatus.IN_PROGRESS });
    expect(res.status).toBe(401);
  });
});
