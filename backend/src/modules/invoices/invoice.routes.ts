import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole, requireProjectAccess } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreateInvoiceSchema,
  RecordPaymentSchema,
  PaginationQuerySchema,
  UserRole,
} from '@deliveryos/shared';
import { invoiceController } from './invoice.controller';

const router = Router();

// List invoices (Clients only see their org's; Devs/QA forbidden)
router.get(
  '/',
  authMiddleware,
  validate(PaginationQuerySchema, 'query'),
  (req, res, next) => invoiceController.list(req, res, next)
);

// Create invoice (Internal PM / Admin only)
router.post(
  '/',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
  validate(CreateInvoiceSchema),
  requireProjectAccess('body'),
  (req, res, next) => invoiceController.create(req, res, next)
);

// Get invoice by ID (Tenant isolated)
router.get('/:id', authMiddleware, (req, res, next) => invoiceController.getById(req, res, next));

// Issue invoice
router.post(
  '/:id/issue',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
  (req, res, next) => invoiceController.issue(req, res, next)
);

// Record payment (Internal PM / Admin only)
router.post(
  '/:id/payments',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
  validate(RecordPaymentSchema),
  (req, res, next) => invoiceController.recordPayment(req, res, next)
);

// Project profitability calculation (Internal PM / Admin only)
router.get(
  '/project/:projectId/profitability',
  authMiddleware,
  requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
  (req, res, next) => invoiceController.getProfitability(req, res, next)
);

export default router;
