import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { UserRole } from '@deliveryos/shared';
import { reportController } from './report.controller';

const router = Router();

// Executive reports are restricted to PMs and Admins (Clients & Devs do not see overall software house revenue)
router.use(authMiddleware, requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER]));

router.get('/summary', (req, res, next) => reportController.getExecutiveSummary(req, res, next));
router.get('/workload', (req, res, next) => reportController.getDeveloperWorkload(req, res, next));
router.get('/qa', (req, res, next) => reportController.getQaMetrics(req, res, next));
router.get('/financials', (req, res, next) => reportController.getFinancialOverview(req, res, next));

export default router;
