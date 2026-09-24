import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireProjectAccess } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { CreateProjectSchema, CreateProjectRequestSchema, DecideProjectRequestSchema, UpdateProjectSchema, AddProjectMemberSchema, PaginationQuerySchema } from '@deliveryos/shared';
import { projectController } from './project.controller';
import { projectRequestController } from './project-request.controller';

const router = Router();
router.use(authMiddleware);

router.get('/requests', projectRequestController.list);
router.post('/requests', validate(CreateProjectRequestSchema), projectRequestController.create);
router.get('/requests/:id', projectRequestController.getById);
router.patch('/requests/:id/decision', validate(DecideProjectRequestSchema), projectRequestController.decide);

router.get('/', validate(PaginationQuerySchema, 'query'), projectController.list);
router.post('/', validate(CreateProjectSchema), projectController.create);
router.get('/:id', requireProjectAccess(), projectController.getById);
router.patch('/:id', requireProjectAccess(), validate(UpdateProjectSchema), projectController.update);
router.delete('/:id', requireProjectAccess(), projectController.remove);
router.get('/:id/health', requireProjectAccess(), projectController.health);
router.get('/:id/activity', requireProjectAccess(), validate(PaginationQuerySchema, 'query'), projectController.getActivity);
router.post('/:id/members', requireProjectAccess(), validate(AddProjectMemberSchema), projectController.addMember);
router.delete('/:id/members/:userId', requireProjectAccess(), projectController.removeMember);

export default router;
