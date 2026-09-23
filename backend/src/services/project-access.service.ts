import { prisma } from '../config/prisma';
import { AppError } from '../errors/AppError';
import { UserRole } from '@deliveryos/shared';
import type { AuthenticatedUser } from '@deliveryos/shared';

/**
 * Centralized object-level access control for projects.
 *
 * - SUPER_ADMIN / ADMIN: global access (agency management layer).
 * - PROJECT_MANAGER / DEVELOPER / QA: must be an active project member.
 * - CLIENT: the project must belong to their organization (no membership row).
 *
 * 404 (rather than 403) is returned so unauthorized callers cannot enumerate
 * which project ids exist.
 */
export async function canAccessProject(
  actor: AuthenticatedUser,
  projectId: string
): Promise<boolean> {
  if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.ADMIN) {
    return true;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!project) return false;

  if (actor.role === UserRole.CLIENT) {
    return project.organizationId === actor.organizationId;
  }

  // PM, DEVELOPER, QA: must be an active member
  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId: actor.id, leftAt: null },
    select: { id: true },
  });
  return membership !== null;
}

export async function requireProjectAccess(
  actor: AuthenticatedUser,
  projectId: string
): Promise<void> {
  if (!(await canAccessProject(actor, projectId))) {
    throw new AppError('NOT_FOUND', 'Project not found', 404);
  }
}

/**
 * Enforces that a project may still accept new work (create/edit operations).
 * Archived and cancelled projects are read-only; the owning organization must
 * also still be active. Returns the project for the caller's further checks.
 */
export async function assertProjectWritable(
  actor: AuthenticatedUser,
  projectId: string
): Promise<{ status: string }> {
  await requireProjectAccess(actor, projectId);

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      status: true,
      organization: { select: { status: true } },
    },
  });
  if (!project) throw new AppError('NOT_FOUND', 'Project not found', 404);

  if (project.status === 'ARCHIVED' || project.status === 'CANCELLED') {
    throw new AppError(
      'FORBIDDEN',
      `This project is ${project.status.toLowerCase()} and can no longer accept changes`,
      403
    );
  }
  if (project.organization.status === 'INACTIVE') {
    throw new AppError('FORBIDDEN', 'This organization is inactive and cannot accept new work', 403);
  }
  return { status: project.status };
}

/**
 * Returns the set of project ids the actor may work in (SA/ADMIN -> all).
 * Used to scope cross-cutting list queries for PM/DEV/QA/CLIENT.
 */
export async function getAccessibleProjectIds(
  actor: AuthenticatedUser
): Promise<string[] | null> {
  if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.ADMIN) {
    return null; // null means "no project-level filter"
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId: actor.id, leftAt: null },
    select: { projectId: true },
  });
  const memberProjectIds = memberships.map((m) => m.projectId);

  if (actor.role === UserRole.CLIENT) {
    if (!actor.organizationId) return memberProjectIds;
    const clientProjects = await prisma.project.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null },
      select: { id: true },
    });
    return Array.from(new Set([...memberProjectIds, ...clientProjects.map((p) => p.id)]));
  }

  return memberProjectIds;
}

/**
 * Organization ids that internal staff may legitimately read (used to scope
 * org/user listing for PROJECT_MANAGER per the "Read Assigned" permission).
 */
export async function getAccessibleOrganizationIds(
  actor: AuthenticatedUser
): Promise<string[] | null> {
  if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.ADMIN) {
    return null;
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId: actor.id, leftAt: null },
    select: { project: { select: { organizationId: true } } },
  });
  const orgIds = memberships.map((m) => m.project.organizationId).filter(Boolean);
  if (actor.organizationId) orgIds.push(actor.organizationId);

  return Array.from(new Set(orgIds));
}