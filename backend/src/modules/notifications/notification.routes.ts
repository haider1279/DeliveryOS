import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { notificationController } from './notification.controller';

const router = Router();

router.get('/', authMiddleware, (req, res, next) => notificationController.list(req, res, next));
router.patch('/:id/read', authMiddleware, (req, res, next) => notificationController.markAsRead(req, res, next));
router.post('/read-all', authMiddleware, (req, res, next) => notificationController.markAllAsRead(req, res, next));

export default router;
