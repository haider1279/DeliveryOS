import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  PaginationQuerySchema,
  UserRole,
} from '@deliveryos/shared';
import { orgController } from './org.controller';

const router = Router();

// List organizations (internal staff only)
router.get(
  '/',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
  validate(PaginationQuerySchema, 'query'),
  (req, res, next) => orgController.list(req, res, next)
);

// Create organization (admin only)
router.post(
  '/',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validate(CreateOrganizationSchema),
  (req, res, next) => orgController.create(req, res, next)
);

// Get organization by ID (clients can only view their own organization)
router.get('/:id', authMiddleware, (req, res, next) => orgController.getById(req, res, next));

// Update organization (admin only)
router.patch(
  '/:id',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validate(UpdateOrganizationSchema),
  (req, res, next) => orgController.update(req, res, next)
);

export default router;
