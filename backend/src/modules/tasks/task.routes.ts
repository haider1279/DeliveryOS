import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireProjectAccess, requireInternalRole } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  CreateTaskCommentSchema,
  CreateTimeEntrySchema,
  UpdateTimeEntrySchema,
  PaginationQuerySchema,
} from '@deliveryos/shared';
import { taskController } from './task.controller';

const router = Router();

// Developer "My Work" dashboard
router.get('/my-work', authMiddleware, requireInternalRole(), (req, res, next) => taskController.getMyWork(req, res, next));

// List tasks (supports query filtering)
router.get(
  '/',
  authMiddleware,
  validate(PaginationQuerySchema, 'query'),
  (req, res, next) => taskController.list(req, res, next)
);

// Create task in project (Internal team only)
router.post(
  '/',
  authMiddleware,
  requireInternalRole(),
  validate(CreateTaskSchema),
  requireProjectAccess('body'),
  (req, res, next) => taskController.create(req, res, next)
);

// Get task by ID
router.get('/:id', authMiddleware, (req, res, next) => taskController.getById(req, res, next));

// Update task
router.patch(
  '/:id',
  authMiddleware,
  validate(UpdateTaskSchema),
  (req, res, next) => taskController.update(req, res, next)
);

// Add task comment
router.post(
  '/:id/comments',
  authMiddleware,
  validate(CreateTaskCommentSchema),
  (req, res, next) => taskController.addComment(req, res, next)
);

// Log time entry
router.post(
  '/time-entries',
  authMiddleware,
  validate(CreateTimeEntrySchema),
  (req, res, next) => taskController.logTime(req, res, next)
);

// Edit time entry (own entries; managers may edit project entries)
router.patch('/time-entries/:id', authMiddleware, validate(UpdateTimeEntrySchema), (req, res, next) => taskController.updateTimeEntry(req, res, next));

// Delete time entry (own entries; managers may delete project entries)
router.delete('/time-entries/:id', authMiddleware, (req, res, next) => taskController.deleteTimeEntry(req, res, next));

export default router;
