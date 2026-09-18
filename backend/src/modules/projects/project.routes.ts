import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { CreateProjectSchema, UpdateProjectSchema, AddProjectMemberSchema, PaginationQuerySchema } from '@deliveryos/shared';
import { projectController } from './project.controller';

const router = Router();
router.use(authMiddleware);

router.get('/', validate(PaginationQuerySchema, 'query'), projectController.list);
router.post('/', validate(CreateProjectSchema), projectController.create);
router.get('/:id', projectController.getById);
router.patch('/:id', validate(UpdateProjectSchema), projectController.update);
router.delete('/:id', projectController.remove);
router.get('/:id/health', projectController.health);
router.get('/:id/activity', validate(PaginationQuerySchema, 'query'), projectController.getActivity);
router.post('/:id/members', validate(AddProjectMemberSchema), projectController.addMember);
router.delete('/:id/members/:userId', projectController.removeMember);

export default router;
