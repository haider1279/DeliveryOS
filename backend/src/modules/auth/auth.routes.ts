import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { authMiddleware } from '../../middleware/auth.middleware';
import { LoginSchema, CompleteInviteSchema } from '@deliveryos/shared';
import { authController } from './auth.controller';

const router = Router();

router.post('/login', validate(LoginSchema), (req, res, next) => authController.login(req, res, next));
router.post('/accept-invite', validate(CompleteInviteSchema), (req, res, next) => authController.completeInvite(req, res, next));
router.get('/me', authMiddleware, (req, res, next) => authController.me(req, res, next));

export default router;
