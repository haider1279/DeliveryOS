import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma';
import { config } from '../../config';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
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

    // Verify password if hash exists, or verify default dev password
    let isValid = false;
    if (user.passwordHash) {
      isValid = await bcrypt.compare(passwordPlain, user.passwordHash);
    } else if (config.nodeEnv !== 'production' && (passwordPlain === 'DeliveryOS123!' || passwordPlain === 'password')) {
      isValid = true;
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
   * Activates an invited user account by setting their password.
   */
  async completeInvite(input: { email: string; password: string; firstName?: string; lastName?: string }) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { profile: true, organization: true },
    });

    if (!user) {
      throw AppError.notFound('Account not found for invitation');
    }

    if (user.status === UserStatus.ACTIVE) {
      throw AppError.conflict('Account is already activated. Please log in.');
    }

    if (user.status === UserStatus.DEACTIVATED || user.status === UserStatus.SUSPENDED) {
      throw AppError.forbidden(`Your account is ${user.status.toLowerCase()}. Please contact an administrator.`);
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(),
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
   */
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, organization: true },
    });
    if (!user) throw AppError.notFound('User not found');
    return user;
  }
}

export const authService = new AuthService();
