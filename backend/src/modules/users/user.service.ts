import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import {
  UserRole,
  UserStatus,
  InviteUserInput,
  UpdateProfileInput,
  PaginationQueryInput,
} from '@deliveryos/shared';

export class UserService {
  async listUsers(query: PaginationQueryInput) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { profile: { firstName: { contains: query.search, mode: 'insensitive' } } },
        { profile: { lastName: { contains: query.search, mode: 'insensitive' } } },
      ];
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

  async inviteUser(input: InviteUserInput, inviterId: string) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) {
      throw AppError.conflict('User with this email already exists');
    }

    // Default hashed password for invited user
    const defaultPasswordHash = await bcrypt.hash('DeliveryOS123!', 10);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        role: input.role,
        status: UserStatus.INVITED,
        organizationId: input.organizationId || null,
        passwordHash: defaultPasswordHash,
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
      actorId: inviterId,
      action: 'USER_INVITED',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    return user;
  }

  async updateUserStatus(userId: string, status: UserStatus, actorId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User not found');

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
