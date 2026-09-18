import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireProjectAccess } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreateRequirementSchema,
  UpdateRequirementSchema,
  TransitionRequirementSchema,
  CreateEstimateSchema,
  DecideApprovalSchema,
  PaginationQuerySchema,
} from '@deliveryos/shared';
import { requirementController } from './requirement.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// List requirements (filtered by role/tenant in service)
router.get('/', validate(PaginationQuerySchema, 'query'), requirementController.list);

// Create requirement
router.post('/', validate(CreateRequirementSchema), requirementController.create);

// Get requirement by ID
router.get('/:id', requirementController.getById);

// Update requirement
router.patch('/:id', validate(UpdateRequirementSchema), requirementController.update);

// Delete requirement (soft)
router.delete('/:id', requirementController.remove);

// State machine transition
router.post('/:id/transition', validate(TransitionRequirementSchema), requirementController.transition);

// Estimate management
router.post('/:id/estimates', validate(CreateEstimateSchema), requirementController.createEstimate);
router.post('/:id/estimates/:estimateId/send', requirementController.sendEstimate);

// Client approval
router.post('/:id/approvals', validate(DecideApprovalSchema), requirementController.decideApproval);

// Version history
router.get('/:id/versions', requirementController.getVersions);
router.get('/:id/approvals', requirementController.getApprovals);

export default router;
