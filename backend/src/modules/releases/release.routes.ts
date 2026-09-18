import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole, requireProjectAccess } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreateReleaseSchema,
  UpdateReleaseStatusSchema,
  DecideClientReviewSchema,
  PaginationQuerySchema,
  UserRole,
} from '@deliveryos/shared';
import { releaseController } from './release.controller';

const router = Router();

// List releases
router.get(
  '/',
  authMiddleware,
  validate(PaginationQuerySchema, 'query'),
  (req, res, next) => releaseController.list(req, res, next)
);

// Create release (Internal PM / Admin only)
router.post(
  '/',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
  validate(CreateReleaseSchema),
  requireProjectAccess('body'),
  (req, res, next) => releaseController.create(req, res, next)
);

// Get release by ID
router.get('/:id', authMiddleware, (req, res, next) => releaseController.getById(req, res, next));

// Update release status
router.patch(
  '/:id/status',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
  validate(UpdateReleaseStatusSchema),
  (req, res, next) => releaseController.updateStatus(req, res, next)
);

// Record Client Review decision on a requirement
router.post(
  '/requirements/:requirementId/review',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.CLIENT]),
  validate(DecideClientReviewSchema),
  (req, res, next) => releaseController.recordClientReview(req, res, next)
);

export default router;
