import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { RegisterFileSchema } from '@deliveryos/shared';
import { storageController } from './storage.controller';

const router = Router();

router.post('/', authMiddleware, validate(RegisterFileSchema), (req, res, next) => storageController.registerUpload(req, res, next));
router.get('/project/:projectId', authMiddleware, (req, res, next) => storageController.listProjectFiles(req, res, next));
router.get('/raw/:storageKey', authMiddleware, (req, res, next) => storageController.proxyDownload(req, res, next));
router.get('/:id', authMiddleware, (req, res, next) => storageController.getById(req, res, next));

export default router;