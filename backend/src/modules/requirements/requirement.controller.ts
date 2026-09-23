import { Request, Response, NextFunction } from 'express';
import { requirementService } from './requirement.service';
import { notificationService, activityService } from '../../services/notification.service';
import { auditService } from '../../services/audit.service';
import { sendSuccess, buildPaginationMeta } from '../../utils/response';
import { NotificationType, CommentVisibility, RequirementApprovalDecision } from '@deliveryos/shared';
import { prisma } from '../../config/prisma';

export const requirementController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await requirementService.create(req.user!, req.body);
      sendSuccess(res, { data: result, statusCode: 201 });
    } catch (err) { next(err); }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await requirementService.getById(req.user!, id);
      sendSuccess(res, { data: result });
    } catch (err) { next(err); }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt((req.query['page'] as string) ?? '1', 10);
      const pageSize = Math.min(parseInt((req.query['pageSize'] as string) ?? '25', 10), 100);
      const { items, total } = await requirementService.list(req.user!, {
        projectId: req.query['projectId'] as string,
        status: req.query['status'] as string,
        priority: req.query['priority'] as string,
        search: req.query['search'] as string,
        page,
        pageSize,
      });
      sendSuccess(res, { data: items, meta: buildPaginationMeta(page, pageSize, total) });
    } catch (err) { next(err); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await requirementService.update(req.user!, id, req.body);
      sendSuccess(res, { data: result });
    } catch (err) { next(err); }
  },

  async transition(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await requirementService.transition(req.user!, id, req.body);
      sendSuccess(res, { data: result });
    } catch (err) { next(err); }
  },

  async createEstimate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await requirementService.createEstimate(req.user!, id, req.body);
      sendSuccess(res, { data: result, statusCode: 201 });
    } catch (err) { next(err); }
  },

  async sendEstimate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const estimateId = String(req.params.estimateId);
      const result = await requirementService.sendEstimate(req.user!, id, estimateId);
      sendSuccess(res, { data: result });
    } catch (err) { next(err); }
  },

  async decideApproval(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const approval = await requirementService.decideApproval(req.user!, id, req.body);
      
      // Post-transaction notifications
      const req2 = await prisma.requirement.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              members: {
                where: { leftAt: null, membershipRole: 'PROJECT_MANAGER' },
                include: { user: true },
              },
            },
          },
        },
      });
      if (req2 && req2.project) {
        const decision = req.body.decision as RequirementApprovalDecision;
        const pmUsers = req2.project.members.map((m: any) => m.user);
        await notificationService.sendMany(
          pmUsers.map((pm: any) => ({
            userId: pm.id,
            type: NotificationType.ESTIMATE_DECIDED,
            title: `Estimate ${decision === RequirementApprovalDecision.APPROVED ? 'Approved' : decision === RequirementApprovalDecision.REJECTED ? 'Rejected' : 'Changes Requested'} by Client`,
            message: `Client decision on "${req2.title}": ${decision}`,
            entityType: 'Requirement',
            entityId: req2.id,
            linkUrl: `/app/projects/${req2.projectId}?tab=requirements&requirementId=${req2.id}`,
          }))
        );
        await activityService.record({
          projectId: req2.projectId,
          actorId: req.user!.id,
          type: 'APPROVAL_DECIDED',
          message: `Client ${decision === RequirementApprovalDecision.APPROVED ? 'approved' : 'declined'} estimate for "${req2.title}"`,
          visibility: CommentVisibility.CLIENT_VISIBLE,
          entityType: 'RequirementApproval',
          entityId: approval.id,
        });
        await auditService.log({
          actorId: req.user!.id,
          action: `REQUIREMENT_APPROVAL_${decision}`,
          entityType: 'RequirementApproval',
          entityId: approval.id,
          metadata: { requirementId: req2.id, estimateId: req.body.estimateId },
        });
      }

      sendSuccess(res, { data: approval, statusCode: 201 });
    } catch (err) { next(err); }
  },

  async getVersions(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      await requirementService.assertAccessible(req.user!, id);
      const versions = await prisma.requirementVersion.findMany({
        where: { requirementId: id },
        orderBy: { versionNumber: 'desc' },
        include: { createdBy: { include: { profile: true } } },
      });
      sendSuccess(res, { data: versions });
    } catch (err) { next(err); }
  },

  async getApprovals(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      await requirementService.assertAccessible(req.user!, id);
      const approvals = await prisma.requirementApproval.findMany({
        where: { requirementId: id },
        orderBy: { decidedAt: 'desc' },
        include: { decidedBy: { include: { profile: true } }, estimate: true },
      });
      sendSuccess(res, { data: approvals });
    } catch (err) { next(err); }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      await requirementService.softDelete(req.user!, id);
      sendSuccess(res, { data: { deleted: true } });
    } catch (err) { next(err); }
  },
};
