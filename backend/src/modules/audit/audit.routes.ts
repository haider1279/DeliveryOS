import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@deliveryos/shared';
import { auditController } from './audit.controller';

const router = Router();

// Only Super Admin and Admin can view system audit logs
router.get(
  '/',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
  (req, res, next) => auditController.list(req, res, next)
);

export default router;
