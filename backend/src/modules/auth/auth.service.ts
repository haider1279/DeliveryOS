import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { config } from '../../config';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { getSupabaseAdmin } from '../../services/supabase-admin.service';
import { UserRole, UserStatus } from '@deliveryos/shared';

export class AuthService {
  /**
   * Logs in a user using email and password.
   * Enforces that suspended and deactivated users are rejected.
   */
  async login(email: string, passwordPlain: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { profile: true, organization: true },
    });

    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }

    if (user.status === UserStatus.DEACTIVATED || user.status === UserStatus.SUSPENDED) {
      throw AppError.forbidden(`Your account is ${user.status.toLowerCase()}. Please contact an administrator.`);
    }

    if (user.status === UserStatus.INVITED) {
      throw AppError.forbidden('Your account invitation is pending activation. Please accept your invite to set up your password.');
    }

    // Verify the password hash. Accounts without a hash (Supabase-managed)
    // can never authenticate via this local path.
    let isValid = false;
    if (user.passwordHash) {
      isValid = await bcrypt.compare(passwordPlain, user.passwordHash);
    }

    if (!isValid) {
      throw AppError.unauthorized('Invalid email or password');
    }

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    await auditService.log({
      actorId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        organizationId: user.organizationId,
        organization: user.organization,
        profile: user.profile,
      },
    };
  }

  /**
   * Activates an invited user account by verifying their one-time invite token
   * and setting their password. The token is single-use and expires.
   */
  async completeInvite(input: { email: string; token: string; password: string; firstName?: string; lastName?: string }) {
    const email = input.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true, organization: true },
    });

    if (!user) {
      throw AppError.notFound('Account not found for invitation');
    }

    if (user.status !== UserStatus.INVITED) {
      // Sensible message regardless of the actual status (active/suspended)
      // so pending invitees don't learn the real account state.
      throw AppError.conflict('This invitation is no longer valid. Please contact your administrator.');
    }

    // Verify the one-time token (compare against the stored hash).
    if (!user.inviteTokenHash) {
      throw AppError.conflict('This invitation has no activation token. Please contact your administrator for a new invite.');
    }
    const providedHash = crypto.createHash('sha256').update(input.token).digest('hex');
    const tokenMatches = crypto.timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(user.inviteTokenHash, 'hex')
    );
    if (!tokenMatches) {
      throw AppError.badRequest('The invitation token is invalid. Please check the invite link and try again.');
    }
    if (!user.inviteTokenExpiresAt || user.inviteTokenExpiresAt < new Date()) {
      throw AppError.conflict('This invitation has expired. Please contact your administrator for a new invite.');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(),
        // Single-use: clear the token on successful activation.
        inviteTokenHash: null,
        inviteTokenExpiresAt: null,
        profile: {
          upsert: {
            create: {
              firstName: input.firstName || user.profile?.firstName || 'User',
              lastName: input.lastName || user.profile?.lastName || '',
              displayName: `${input.firstName || user.profile?.firstName || 'User'} ${input.lastName || user.profile?.lastName || ''}`.trim(),
            },
            update: {
              ...(input.firstName && { firstName: input.firstName }),
              ...(input.lastName && { lastName: input.lastName }),
              ...(input.firstName && { displayName: `${input.firstName} ${input.lastName || user.profile?.lastName || ''}`.trim() }),
            },
          },
        },
      },
      include: { profile: true, organization: true },
    });

    if (user.supabaseUserId) {
      const supabaseAdmin = getSupabaseAdmin();
      if (supabaseAdmin) {
        try {
          await supabaseAdmin.auth.admin.updateUserById(user.supabaseUserId, {
            password: input.password,
            email_confirm: true,
          });
        } catch (err) {
          console.error('[completeInvite] failed to sync password to Supabase Auth:', (err as Error).message);
        }
      }
    }

    await auditService.log({
      actorId: updatedUser.id,
      action: 'USER_INVITE_COMPLETED',
      entityType: 'User',
      entityId: updatedUser.id,
    });

    const token = jwt.sign(
      {
        sub: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        organizationId: updatedUser.organizationId,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    return {
      token,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status,
        organizationId: updatedUser.organizationId,
        organization: updatedUser.organization,
        profile: updatedUser.profile,
      },
    };
  }

  /**
   * Generates a fast dev token for any role (useful for seed accounts and automated integration testing).
   */
  createDevToken(user: { id: string; email: string; role: UserRole; organizationId?: string | null }) {
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || null,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );
  }

  /**
   * Retrieves the currently authenticated user's profile and organization.
   * Never exposes passwordHash / supabaseUserId back to the client.
   */
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, organization: true },
    });
    if (!user) throw AppError.notFound('User not found');
    const { passwordHash, supabaseUserId, ...safeUser } = user as any;
    return safeUser;
  }
}

export const authService = new AuthService();
