import { z } from 'zod';
import {
  UserRole,
  UserStatus,
  OrganizationStatus,
  ProjectStatus,
  ProjectPriority,
  ProjectMembershipRole,
  RequirementPriority,
  RequirementStatus,
  EstimateStatus,
  RequirementApprovalDecision,
  TaskPriority,
  TaskStatus,
  CommentVisibility,
  TestCaseStatus,
  TestRunResult,
  BugSeverity,
  BugPriority,
  BugStatus,
  ClientReviewDecision,
  ReleaseStatus,
  ReleaseItemType,
  FileVisibility,
  InvoiceStatus,
  ProjectHealthStatus,
  NotificationType,
} from './enums';

import {
  LoginSchema,
  InviteUserSchema,
  CompleteInviteSchema,
  UpdateProfileSchema,
  CreateOrganizationSchema,
  UpdateOrganizationSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  AddProjectMemberSchema,
  CreateRequirementSchema,
  UpdateRequirementSchema,
  TransitionRequirementSchema,
  CreateEstimateSchema,
  DecideApprovalSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  CreateTaskCommentSchema,
  CreateTimeEntrySchema,
  CreateTestCaseSchema,
  ExecuteTestRunSchema,
  CreateBugSchema,
  UpdateBugStatusSchema,
  CreateBugCommentSchema,
  DecideClientReviewSchema,
  CreateReleaseSchema,
  UpdateReleaseStatusSchema,
  CreateInvoiceSchema,
  RecordPaymentSchema,
  PaginationQuerySchema,
} from './schemas';

// Inferred DTO types
export type LoginDTO = z.infer<typeof LoginSchema>;
export type InviteUserDTO = z.infer<typeof InviteUserSchema>;
export type CompleteInviteDTO = z.infer<typeof CompleteInviteSchema>;
export type UpdateProfileDTO = z.infer<typeof UpdateProfileSchema>;
export type CreateOrganizationDTO = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganizationDTO = z.infer<typeof UpdateOrganizationSchema>;
export type CreateProjectDTO = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectDTO = z.infer<typeof UpdateProjectSchema>;
export type AddProjectMemberDTO = z.infer<typeof AddProjectMemberSchema>;
export type CreateRequirementDTO = z.infer<typeof CreateRequirementSchema>;
export type UpdateRequirementDTO = z.infer<typeof UpdateRequirementSchema>;
export type TransitionRequirementDTO = z.infer<typeof TransitionRequirementSchema>;
export type CreateEstimateDTO = z.infer<typeof CreateEstimateSchema>;
export type DecideApprovalDTO = z.infer<typeof DecideApprovalSchema>;
export type CreateTaskDTO = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskDTO = z.infer<typeof UpdateTaskSchema>;
export type CreateTaskCommentDTO = z.infer<typeof CreateTaskCommentSchema>;
export type CreateTimeEntryDTO = z.infer<typeof CreateTimeEntrySchema>;
export type CreateTestCaseDTO = z.infer<typeof CreateTestCaseSchema>;
export type ExecuteTestRunDTO = z.infer<typeof ExecuteTestRunSchema>;
export type CreateBugDTO = z.infer<typeof CreateBugSchema>;
export type UpdateBugStatusDTO = z.infer<typeof UpdateBugStatusSchema>;
export type CreateBugCommentDTO = z.infer<typeof CreateBugCommentSchema>;
export type DecideClientReviewDTO = z.infer<typeof DecideClientReviewSchema>;
export type CreateReleaseDTO = z.infer<typeof CreateReleaseSchema>;
export type UpdateReleaseStatusDTO = z.infer<typeof UpdateReleaseStatusSchema>;
export type CreateInvoiceDTO = z.infer<typeof CreateInvoiceSchema>;
export type RecordPaymentDTO = z.infer<typeof RecordPaymentSchema>;
export type PaginationQueryDTO = z.infer<typeof PaginationQuerySchema>;

// Standard API Response Envelopes
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

// Session User Context
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  organizationId?: string | null;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

// Health Calculation
export interface ProjectHealthResult {
  status: ProjectHealthStatus;
  reasons: string[];
  metrics: {
    progressPercent: number | null;
    overdueTasksCount: number;
    openBlockedTasksCount: number;
    criticalBugsCount: number;
    pendingApprovalDays: number | null;
    daysUntilDeadline: number | null;
  };
}

// Input aliases
export type LoginInput = LoginDTO;
export type InviteUserInput = InviteUserDTO;
export type CompleteInviteInput = CompleteInviteDTO;
export type UpdateProfileInput = UpdateProfileDTO;
export type CreateOrganizationInput = CreateOrganizationDTO;
export type UpdateOrganizationInput = UpdateOrganizationDTO;
export type CreateProjectInput = CreateProjectDTO;
export type UpdateProjectInput = UpdateProjectDTO;
export type AddProjectMemberInput = AddProjectMemberDTO;
export type CreateRequirementInput = CreateRequirementDTO;
export type UpdateRequirementInput = UpdateRequirementDTO;
export type TransitionRequirementInput = TransitionRequirementDTO;
export type CreateEstimateInput = CreateEstimateDTO;
export type DecideApprovalInput = DecideApprovalDTO;
export type CreateTaskInput = CreateTaskDTO;
export type UpdateTaskInput = UpdateTaskDTO;
export type CreateTaskCommentInput = CreateTaskCommentDTO;
export type CreateTimeEntryInput = CreateTimeEntryDTO;
export type CreateTestCaseInput = CreateTestCaseDTO;
export type ExecuteTestRunInput = ExecuteTestRunDTO;
export type CreateBugInput = CreateBugDTO;
export type UpdateBugStatusInput = UpdateBugStatusDTO;
export type CreateBugCommentInput = CreateBugCommentDTO;
export type DecideClientReviewInput = DecideClientReviewDTO;
export type CreateReleaseInput = CreateReleaseDTO;
export type UpdateReleaseStatusInput = UpdateReleaseStatusDTO;
export type CreateInvoiceInput = CreateInvoiceDTO;
export type RecordPaymentInput = RecordPaymentDTO;
export type PaginationQueryInput = PaginationQueryDTO;
