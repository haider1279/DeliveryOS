import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { config } from '../config';
import { UserStatus } from '@deliveryos/shared';
import { AppError } from '../errors/AppError';
import type { AuthenticatedUser } from '@deliveryos/shared';
import { auditService } from '../services/audit.service';

// Extend Express Request to carry the verified user
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies a Supabase JWT (HS256) using SUPABASE_JWT_SECRET.
 * In development with DEV_AUTH_SECRET header, allows test token bypass.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Missing or malformed authorization header', 401);
    }

    const token = authHeader.slice(7);

    // Verify token against jwtSecret, supabaseSecret, or devAuthSecret
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      try {
        if (config.supabase.jwtSecret && config.supabase.jwtSecret !== config.jwtSecret) {
          decoded = jwt.verify(token, config.supabase.jwtSecret);
        } else if (config.devAuthSecret) {
          decoded = jwt.verify(token, config.devAuthSecret);
        } else {
          throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
        }
      } catch {
        try {
          if (config.devAuthSecret) {
            decoded = jwt.verify(token, config.devAuthSecret);
          } else {
            throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
          }
        } catch {
          throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
        }
      }
    }

    const userId: string = decoded.sub;
    const email: string = decoded.email;

    // Look up user in our DB by id, supabaseUserId, OR email
    let dbUser: any = null;
    if (process.env['NODE_ENV'] === 'test' && !process.env['DATABASE_URL'] && decoded.role) {
      dbUser = {
        id: userId,
        email,
        role: decoded.role,
        status: UserStatus.ACTIVE,
        organizationId: decoded.organizationId ?? null,
      };
    } else {
      try {
        dbUser = await prisma.user.findFirst({
          where: {
            OR: [
              { id: userId },
              { supabaseUserId: userId },
              { email: email },
            ],
          },
          include: { profile: true },
        });
      } catch (dbErr) {
        if ((process.env['NODE_ENV'] === 'test' || config.isDev) && decoded.role) {
          dbUser = {
            id: userId,
            email,
            role: decoded.role,
            status: UserStatus.ACTIVE,
            organizationId: decoded.organizationId ?? null,
          };
        } else {
          throw dbErr;
        }
      }
    }

    if (!dbUser) {
      if ((process.env['NODE_ENV'] === 'test' || config.isDev) && decoded.role) {
        dbUser = {
          id: userId,
          email,
          role: decoded.role,
          status: UserStatus.ACTIVE,
          organizationId: decoded.organizationId ?? null,
        };
      } else {
        throw new AppError('UNAUTHORIZED', 'User account not found', 401);
      }
    }

    // Reject non-active users (deactivated, suspended, or pending invitation) on every request
    if (dbUser.status !== UserStatus.ACTIVE) {
      if (process.env['NODE_ENV'] !== 'test') {
        await auditService.log({
          actorId: dbUser.id,
          action: 'AUTH_REJECTED_INACTIVE',
          entityType: 'User',
          entityId: dbUser.id,
          metadata: { reason: dbUser.status, path: req.path },
        });
      }
      throw new AppError('FORBIDDEN', `Your account is ${dbUser.status.toLowerCase()}. Please contact your administrator.`, 403);
    }

    // Update last login timestamp (non-blocking)
    if (process.env['NODE_ENV'] !== 'test' && dbUser.id) {
      prisma.user.update({
        where: { id: dbUser.id },
        data: { lastLoginAt: new Date() },
      }).catch(() => {/* non-critical */});
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role as any,
      status: dbUser.status as any,
      organizationId: dbUser.organizationId,
      firstName: dbUser.profile?.firstName,
      lastName: dbUser.profile?.lastName,
      displayName: dbUser.profile?.displayName ?? undefined,
      avatarUrl: dbUser.profile?.avatarUrl,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      next(new AppError('UNAUTHORIZED', 'Invalid or expired token', 401));
      return;
    }
    next(new AppError('INTERNAL_ERROR', 'Authentication failed', 500));
  }
}
