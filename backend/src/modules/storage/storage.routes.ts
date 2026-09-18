import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { storageController } from './storage.controller';

const router = Router();

router.post('/', authMiddleware, (req, res, next) => storageController.registerUpload(req, res, next));
router.get('/:id', authMiddleware, (req, res, next) => storageController.getById(req, res, next));
router.get('/project/:projectId', authMiddleware, (req, res, next) => storageController.listProjectFiles(req, res, next));

export default router;
