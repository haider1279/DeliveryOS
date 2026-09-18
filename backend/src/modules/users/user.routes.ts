import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  InviteUserSchema,
  UpdateProfileSchema,
  PaginationQuerySchema,
  UserRole,
} from '@deliveryos/shared';
import { userController } from './user.controller';

const router = Router();

// Current user updates their own profile
router.patch(
  '/profile',
  authMiddleware,
  validate(UpdateProfileSchema),
  (req, res, next) => userController.updateProfile(req, res, next)
);

// Admin: list all users
router.get(
  '/',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
  validate(PaginationQuerySchema, 'query'),
  (req, res, next) => userController.list(req, res, next)
);

// Admin: invite user
router.post(
  '/invite',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validate(InviteUserSchema),
  (req, res, next) => userController.invite(req, res, next)
);

// Admin: update status (e.g. suspend / deactivate)
router.patch(
  '/:id/status',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  (req, res, next) => userController.updateStatus(req, res, next)
);

export default router;
