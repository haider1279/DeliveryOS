import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  QualifyOrganizationSchema,
  PaginationQuerySchema,
  UserRole,
} from '@deliveryos/shared';
import { orgController } from './org.controller';

const router = Router();

// List organizations — BD needs full visibility for the acquisition pipeline
router.get(
  '/',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BD, UserRole.PROJECT_MANAGER]),
  validate(PaginationQuerySchema, 'query'),
  (req, res, next) => orgController.list(req, res, next)
);

// Create organization — BD creates PROSPECT orgs, ADMIN creates onboarded clients
router.post(
  '/',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BD]),
  validate(CreateOrganizationSchema),
  (req, res, next) => orgController.create(req, res, next)
);

// Get organization by ID (clients can only view their own organization)
router.get('/:id', authMiddleware, (req, res, next) => orgController.getById(req, res, next));

// BD qualification pipeline: APPROVE or REJECT a prospect
// Service-layer enforces that only BD/ADMIN/SUPER_ADMIN can call this.
router.patch(
  '/:id/qualify',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BD]),
  validate(QualifyOrganizationSchema),
  (req, res, next) => orgController.qualify(req, res, next)
);

// Update organization details (admin only)
router.patch(
  '/:id',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  validate(UpdateOrganizationSchema),
  (req, res, next) => orgController.update(req, res, next)
);

export default router;
