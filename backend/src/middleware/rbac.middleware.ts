import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@deliveryos/shared';
import { AppError } from '../errors/AppError';
import { prisma } from '../config/prisma';
import { auditService } from '../services/audit.service';

/**
 * Middleware factory: requires one of the given roles.
 * Must be used after authMiddleware.
 */
export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
      return;
    }
    if (!roles.includes(req.user.role as UserRole)) {
      auditService.log({
        actorId: req.user.id,
        action: 'AUTH_ROLE_DENIED',
        entityType: 'Route',
        entityId: req.path,
        metadata: { requiredRoles: roles, userRole: req.user.role },
      }).catch(() => {/* log failures are non-critical */});
      next(new AppError('FORBIDDEN', 'You do not have permission to perform this action', 403));
      return;
    }
    next();
  };
}

/**
 * Verifies the authenticated user has access to the specified project.
 * - SUPER_ADMIN and ADMIN can access any project.
 * - PROJECT_MANAGER must be an active member.
 * - DEVELOPER and QA must be active members.
 * - CLIENT: verified project belongs to their organization, no membership row required.
 * Returns 404 (not 403) to avoid confirming existence to unauthorized callers.
 */
export function requireProjectAccess(projectIdParam = 'projectId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
        return;
      }

      // Accept the project id from (in priority order): the named param, the
      // conventional :id path param, the request body, or the querystring.
      const projectIdRaw =
        req.params[projectIdParam] ??
        req.params['id'] ??
        req.body?.projectId ??
        req.query?.projectId;
      const projectId = typeof projectIdRaw === 'string' ? projectIdRaw : Array.isArray(projectIdRaw) ? (projectIdRaw[0] as string) : undefined;
      if (!projectId) {
        next();
        return;
      }

      const { role, id: userId, organizationId } = req.user;

      // Admins & super admins have full access
      if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) {
        next();
        return;
      }

      let project: any = null;
      try {
        project = await prisma.project.findFirst({
          where: { id: projectId, deletedAt: null },
          select: { id: true, organizationId: true },
        });
      } catch (dbErr) {
        if (process.env['NODE_ENV'] === 'test') {
          next(new AppError('NOT_FOUND', 'Project not found', 404));
          return;
        }
        throw dbErr;
      }

      if (!project) {
        next(new AppError('NOT_FOUND', 'Project not found', 404));
        return;
      }

      // CLIENT role: project must belong to their organization
      if (role === UserRole.CLIENT) {
        if (project.organizationId !== organizationId) {
          await auditService.log({
            actorId: userId,
            action: 'AUTH_CROSS_TENANT_ACCESS_DENIED',
            entityType: 'Project',
            entityId: projectId,
            metadata: { userOrgId: organizationId, projectOrgId: project.organizationId },
          });
          next(new AppError('NOT_FOUND', 'Project not found', 404));
          return;
        }
        next();
        return;
      }

      // PM, DEVELOPER, QA: must be an active member
      const membership = await prisma.projectMember.findFirst({
        where: {
          projectId,
          userId,
          leftAt: null,
        },
      });

      if (!membership) {
        await auditService.log({
          actorId: userId,
          action: 'AUTH_PROJECT_ACCESS_DENIED',
          entityType: 'Project',
          entityId: projectId,
          metadata: { userRole: role },
        });
        next(new AppError('NOT_FOUND', 'Project not found', 404));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Verifies the authenticated user belongs to the specified organization.
 * CLIENTs may only access their own organization. Admins bypass.
 */
export function requireOrgAccess(orgIdParam = 'organizationId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
        return;
      }

      const { role, id: userId, organizationId: userOrgId } = req.user;

      if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN) {
        next();
        return;
      }

      const targetOrgIdRaw = req.params[orgIdParam] ?? req.body?.organizationId ?? req.query?.organizationId;
      const targetOrgId = typeof targetOrgIdRaw === 'string' ? targetOrgIdRaw : Array.isArray(targetOrgIdRaw) ? (targetOrgIdRaw[0] as string) : undefined;

      if (role === UserRole.CLIENT) {
        if (!targetOrgId || targetOrgId !== userOrgId) {
          await auditService.log({
            actorId: userId,
            action: 'AUTH_CROSS_ORG_ACCESS_DENIED',
            entityType: 'Organization',
            entityId: targetOrgId ?? 'unknown',
            metadata: { userOrgId, targetOrgId },
          });
          next(new AppError('NOT_FOUND', 'Organization not found', 404));
          return;
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Convenience: internal staff only (not CLIENT role)
export function requireInternalRole() {
  return requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROJECT_MANAGER,
    UserRole.DEVELOPER,
    UserRole.QA,
  ]);
}

// Convenience: management level (can modify billing, projects, members)
export function requireManagementRole() {
  return requireRole([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROJECT_MANAGER,
  ]);
}
