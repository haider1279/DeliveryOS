import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { config } from '../../config';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { emailService } from '../../services/email.service';
import { requireQualifiedOrganizationForClient } from '../organizations/organization-eligibility.service';
import {
  UserRole,
  UserStatus,
  InviteUserInput,
  UpdateProfileInput,
  PaginationQueryInput,
  AuthenticatedUser,
} from '@deliveryos/shared';

import { getSupabaseAdmin } from '../../services/supabase-admin.service';

// Roles an ADMIN may invite. Role escalation beyond this is reserved for
// SUPER_ADMIN (and SUPER_ADMIN itself can never be created via invite).
// BD is included so ADMIN can onboard business-development staff without
// requiring SUPER_ADMIN involvement.
const ADMIN_INVITABLE_ROLES: UserRole[] = [
  UserRole.BD,
  UserRole.PROJECT_MANAGER,
  UserRole.DEVELOPER,
  UserRole.QA,
  UserRole.CLIENT,
];

export class UserService {
  async listUsers(query: PaginationQueryInput, actor: AuthenticatedUser) {
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 50, 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    // PROJECT_MANAGER exposes "View Project Team" only: users that belong to
    // the organizations of their assigned projects or are members of them.
    if (actor.role === UserRole.PROJECT_MANAGER) {
      const memberships = await prisma.projectMember.findMany({
        where: { userId: actor.id, leftAt: null },
        select: { project: { select: { organizationId: true } }, userId: true },
      });
      const orgIds = Array.from(
        new Set(memberships.map((m) => m.project.organizationId).filter(Boolean))
      );
      const memberUserIds = memberships.map((m) => m.userId);

      const scopeOrs: any[] = [
        { role: { in: [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER] } },
      ];
      if (orgIds.length > 0) scopeOrs.push({ organizationId: { in: orgIds } });
      if (memberUserIds.length > 0) scopeOrs.push({ id: { in: memberUserIds } });

      // A PM can never list arbitrary tenants: if they filter by an org
      // outside their scope, return an empty result rather than leaking rows.
      if (query.organizationId && !orgIds.includes(query.organizationId)) {
        where.id = { in: [] };
      }

      if (scopeOrs.length > 0 && !where.id) {
        where.AND = [{ OR: scopeOrs }];
      }
    } else if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    const searchOrs: any[] = [];
    if (query.search) {
      searchOrs.push(
        { email: { contains: query.search, mode: 'insensitive' } },
        { profile: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { profile: { lastName: { contains: query.search, mode: 'insensitive' } } }
      );
    }

    if (searchOrs.length > 0) {
      if (where.AND) {
        where.AND.push({ OR: searchOrs });
      } else {
        where.OR = searchOrs;
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          profile: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async inviteUser(input: InviteUserInput, inviter: AuthenticatedUser) {
    // Role escalation guard: an ADMIN may only invite staff below management.
    if (inviter.role !== UserRole.SUPER_ADMIN && !ADMIN_INVITABLE_ROLES.includes(input.role)) {
      throw AppError.forbidden(
        `You do not have permission to invite a user with the ${input.role} role`
      );
    }
    // Nobody can create a SUPER_ADMIN through the invite flow.
    if (input.role === UserRole.SUPER_ADMIN) {
      throw AppError.forbidden('Super admin accounts cannot be created through invitations');
    }

    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) {
      throw AppError.conflict('User with this email already exists');
    }

    // docs/workflows.md places the client invitation AFTER the organization has
    // been qualified ([PROSPECT] -> [APPROVED] -> invite client contact). The
    // Team Management screen already only offers APPROVED organizations, but the
    // API did not enforce it, so a CLIENT could be attached to a PROSPECT org —
    // stranding them in a tenant whose project requests can never be approved.
    // Enforcing it server-side keeps the pipeline synchronized and strengthens
    // the rule rather than weakening it.
    if (input.organizationId) {
      await requireQualifiedOrganizationForClient(input.organizationId);
    }

    // One-time invite token (returned once so the inviter can share it).
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
    const inviteTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        role: input.role,
        status: UserStatus.INVITED,
        organizationId: input.organizationId || null,
        inviteTokenHash,
        inviteTokenExpiresAt,
        profile: {
          create: {
            firstName: input.firstName,
            lastName: input.lastName,
            displayName: `${input.firstName} ${input.lastName}`,
            jobTitle: input.jobTitle || null,
          },
        },
      },
      include: {
        profile: true,
        organization: true,
      },
    });

    await auditService.log({
      actorId: inviter.id,
      action: 'USER_INVITED',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    // Build the one-time invitation URL the recipient needs to activate.
    const inviteUrl = `${config.frontendUrl}/accept-invite?email=${encodeURIComponent(user.email)}&token=${inviteToken}`;

    // Deliver invitation email.
    // In production (or whenever Supabase credentials are configured), use
    // Supabase Auth's built-in invitation system (inviteUserByEmail).
    const supabaseAdmin = getSupabaseAdmin();

    if (supabaseAdmin) {
      const { data: supabaseData, error: supabaseError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(user.email, {
          redirectTo: inviteUrl,
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.role,
            organizationId: input.organizationId || null,
          },
        });

      if (supabaseError) {
        // Rollback Prisma user creation if Supabase Auth invitation fails
        await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
        throw AppError.badRequest(`Failed to send invitation via Supabase Auth: ${supabaseError.message}`);
      }

      if (supabaseData?.user?.id) {
        const updatedUser = await prisma.user.update({
          where: { id: user.id },
          data: { supabaseUserId: supabaseData.user.id },
          include: {
            profile: true,
            organization: true,
          },
        });
        return {
          user: updatedUser,
          inviteToken,
          inviteUrl,
          inviteTokenExpiresAt,
        };
      }
    } else if (config.isProd) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
      throw new AppError('INTERNAL_ERROR', 'Supabase Auth service-role key is missing or not configured for production', 500);
    } else {
      // Dev/test mode fallback when Supabase credentials are not set
      try {
        await emailService.sendInvitationEmail({
          to: user.email,
          firstName: input.firstName,
          inviteUrl,
        });
      } catch (err) {
        console.error('[invite] failed to deliver invitation email (dev mode):', (err as Error).message);
      }
    }

    // Return the token exactly once — it is never persisted in plaintext.
    return {
      user,
      inviteToken,
      inviteUrl,
      inviteTokenExpiresAt,
    };
  }

  async updateUserStatus(
    userId: string,
    status: UserStatus,
    actorId: string,
    actorRole: string
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');

    // No state change requested.
    if (user.status === status) {
      throw AppError.badRequest(`User is already in ${status} status`);
    }

    // Invited users must go through the self-service accept-invite flow to
    // set their password — staff cannot flip an INVITED account to ACTIVE
    // (that would bypass the token + password creation).
    if (user.status === UserStatus.INVITED && status === UserStatus.ACTIVE) {
      throw AppError.forbidden('Invited users must accept their invitation to activate their account');
    }

    // Managers cannot mutate their own access state (prevents self-suspension).
    if (user.id === actorId && (status === UserStatus.SUSPENDED || status === UserStatus.DEACTIVATED)) {
      throw AppError.forbidden('You cannot suspend or deactivate your own account');
    }

    // Only a SUPER_ADMIN may deactivate another SUPER_ADMIN.
    if (
      user.role === 'SUPER_ADMIN' &&
      (status === UserStatus.DEACTIVATED || status === UserStatus.SUSPENDED) &&
      actorRole !== 'SUPER_ADMIN'
    ) {
      throw AppError.forbidden('Only a super admin can suspend a super admin');
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { status },
      include: { profile: true },
    });

    await auditService.log({
      actorId,
      action: 'USER_STATUS_UPDATED',
      entityType: 'User',
      entityId: userId,
      metadata: { fromStatus: user.status, toStatus: status },
    });

    return updated;
  }

  async updateUserRole(userId: string, role: UserRole, actor: AuthenticatedUser) {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.role !== UserRole.ADMIN) {
      throw AppError.forbidden('Only administrators can change user roles');
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw AppError.notFound('User not found');

    if (target.id === actor.id) {
      throw AppError.forbidden('You cannot change your own role');
    }
    if (target.role === role) {
      throw AppError.badRequest(`User already has the ${role} role`);
    }

    // Role escalation guard (mirrors the invite flow): ADMIN cannot grant
    // ADMIN/SUPER_ADMIN, and only SUPER_ADMIN may alter a SUPER_ADMIN account.
    if (target.role === UserRole.SUPER_ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw AppError.forbidden('Only a super admin can change a super admin role');
    }
    if (actor.role !== UserRole.SUPER_ADMIN && (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN)) {
      throw AppError.forbidden(
        `You do not have permission to assign the ${role} role`
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      include: { profile: true },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'USER_ROLE_UPDATED',
      entityType: 'User',
      entityId: userId,
      metadata: { fromRole: target.role, toRole: role },
    });

    return updated;
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const profile = await prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: input.firstName || 'User',
        lastName: input.lastName || '',
        displayName: input.displayName || null,
        phone: input.phone || null,
        jobTitle: input.jobTitle || null,
        timezone: input.timezone || 'UTC',
        avatarUrl: input.avatarUrl || null,
      },
      update: {
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.jobTitle !== undefined && { jobTitle: input.jobTitle }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      },
    });

    return profile;
  }
}

export const userService = new UserService();
