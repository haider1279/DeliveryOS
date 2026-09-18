import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireProjectAccess } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  CreateTestCaseSchema,
  ExecuteTestRunSchema,
  CreateBugSchema,
  UpdateBugStatusSchema,
  CreateBugCommentSchema,
  PaginationQuerySchema,
} from '@deliveryos/shared';
import { qaController } from './qa.controller';

const router = Router();

// Test Cases
router.post(
  '/test-cases',
  authMiddleware,
  validate(CreateTestCaseSchema),
  requireProjectAccess('body'),
  (req, res, next) => qaController.createTestCase(req, res, next)
);

router.get(
  '/test-cases',
  authMiddleware,
  validate(PaginationQuerySchema, 'query'),
  (req, res, next) => qaController.listTestCases(req, res, next)
);

// Test Runs (recording QA execution & spawning bugs on failure)
router.post(
  '/test-runs',
  authMiddleware,
  validate(ExecuteTestRunSchema),
  (req, res, next) => qaController.executeTestRun(req, res, next)
);

// Bugs
router.get(
  '/bugs',
  authMiddleware,
  validate(PaginationQuerySchema, 'query'),
  (req, res, next) => qaController.listBugs(req, res, next)
);

router.post(
  '/bugs',
  authMiddleware,
  validate(CreateBugSchema),
  requireProjectAccess('body'),
  (req, res, next) => qaController.createBug(req, res, next)
);

router.get('/bugs/:id', authMiddleware, (req, res, next) => qaController.getBugById(req, res, next));

router.patch(
  '/bugs/:id/status',
  authMiddleware,
  validate(UpdateBugStatusSchema),
  (req, res, next) => qaController.updateBugStatus(req, res, next)
);

router.post(
  '/bugs/:id/comments',
  authMiddleware,
  validate(CreateBugCommentSchema),
  (req, res, next) => qaController.addBugComment(req, res, next)
);

export default router;
