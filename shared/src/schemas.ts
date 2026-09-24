import { z } from 'zod';
import {
  UserRole,
  UserStatus,
  OrganizationStatus,
  OrganizationQualificationStatus,
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
  ProjectRequestStatus,
} from './enums';

// -------------------------------------------------------------
// Auth & User Schemas
// -------------------------------------------------------------
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const InviteUserSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(UserRole),
  organizationId: z.string().uuid().optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  jobTitle: z.string().optional(),
});

export const CompleteInviteSchema = z.object({
  email: z.string().email(),
  token: z.string().min(16, 'The invite token is missing or invalid'),
  password: z.string().min(8),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

export const UpdateUserStatusSchema = z.object({
  status: z.nativeEnum(UserStatus),
});

export const UpdateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  displayName: z.string().optional(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  timezone: z.string().optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

// -------------------------------------------------------------
// Organization Schemas
// -------------------------------------------------------------
export const CreateOrganizationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens'),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  /**
   * BD client-acquisition: creating an organization with PROSPECT records a
   * lead awaiting qualification. ADMIN-created organizations default to
   * APPROVED (direct onboarding) when omitted.
   */
  qualificationStatus: z.nativeEnum(OrganizationQualificationStatus).optional(),
});

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial().extend({
  status: z.nativeEnum(OrganizationStatus).optional(),
});

// BD qualification decision: APPROVED hands the prospect off to ADMIN
// onboarding; REJECTED declines it. PROSPECT is not a valid target here.
export const QualifyOrganizationSchema = z.object({
  decision: z.enum([
    OrganizationQualificationStatus.APPROVED,
    OrganizationQualificationStatus.REJECTED,
  ]),
  notes: z.string().optional(),
});

// -------------------------------------------------------------
// Project Schemas
// -------------------------------------------------------------
export const CreateProjectSchema = z.object({
  organizationId: z.string().uuid(),
  projectManagerId: z.string().uuid(),
  name: z.string().min(2),
  code: z.string().min(2).max(10).regex(/^[A-Z0-9_-]+$/, 'Must be uppercase alphanumeric code'),
  description: z.string().optional(),
  priority: z.nativeEnum(ProjectPriority).default(ProjectPriority.MEDIUM),
  startDate: z.string().datetime().optional().nullable(),
  targetDate: z.string().datetime().optional().nullable(),
  budget: z.number().nonnegative().optional().nullable(),
  currency: z.string().default('USD'),
  estimatedEffortHours: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional(),
});

export const CreateProjectRequestSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  budget: z.number().nonnegative().optional().nullable(),
  targetDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional(),
  organizationId: z.string().uuid().optional(),
});

export const DecideProjectRequestSchema = z.object({
  decision: z.nativeEnum(ProjectRequestStatus),
  notes: z.string().optional(),
});

// Project updates must NOT allow re-homing the project to another organization
// or silently swapping the project manager (both are ownership-level fields set
// only at creation time by trusted staff).
export const UpdateProjectSchema = z.object({
  name: z.string().min(2).optional(),
  code: z.string().min(2).max(10).regex(/^[A-Z0-9_-]+$/, 'Must be uppercase alphanumeric code').optional(),
  description: z.string().optional(),
  priority: z.nativeEnum(ProjectPriority).optional(),
  startDate: z.string().datetime().optional().nullable(),
  targetDate: z.string().datetime().optional().nullable(),
  budget: z.number().nonnegative().optional().nullable(),
  currency: z.string().optional(),
  estimatedEffortHours: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  actualEffortHours: z.number().nonnegative().optional(),
});

export const AddProjectMemberSchema = z.object({
  userId: z.string().uuid(),
  membershipRole: z.nativeEnum(ProjectMembershipRole),
});

// -------------------------------------------------------------
// Requirement & Estimation Schemas
// -------------------------------------------------------------
export const CreateRequirementSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().min(5),
  priority: z.nativeEnum(RequirementPriority).default(RequirementPriority.MEDIUM),
  category: z.string().optional().default('General'),
  acceptanceCriteria: z.string().min(5),
  targetDate: z.string().datetime().optional().nullable(),
});

export const UpdateRequirementSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(5).optional(),
  priority: z.nativeEnum(RequirementPriority).optional(),
  category: z.string().optional(),
  acceptanceCriteria: z.string().min(5).optional(),
  targetDate: z.string().datetime().optional().nullable(),
  changeSummary: z.string().min(3).optional(), // required if updating approved requirement
});

export const TransitionRequirementSchema = z.object({
  toStatus: z.nativeEnum(RequirementStatus),
  comment: z.string().optional(),
});

export const CreateEstimateSchema = z.object({
  devHours: z.number().nonnegative(),
  qaHours: z.number().nonnegative(),
  designHours: z.number().nonnegative().default(0),
  clientPrice: z.number().nonnegative(),
  estimatedCost: z.number().nonnegative().optional().default(0),
  proposedDeliveryDate: z.string().datetime().optional().nullable(),
  assumptions: z.string().optional(),
  exclusions: z.string().optional(),
  notes: z.string().optional(),
});

export const DecideApprovalSchema = z.object({
  requirementVersion: z.number().int().positive(),
  estimateId: z.string().uuid(),
  estimateVersion: z.number().int().positive(),
  decision: z.nativeEnum(RequirementApprovalDecision),
  comment: z.string().optional(),
});

// -------------------------------------------------------------
// Task & Time Tracking Schemas
// -------------------------------------------------------------
export const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid().optional().nullable(),
  title: z.string().min(2),
  description: z.string().optional(),
  assigneeId: z.string().uuid().optional().nullable(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  estimatedHours: z.number().nonnegative().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  labels: z.array(z.string()).default([]),
});

export const UpdateTaskSchema = CreateTaskSchema.partial()
  .omit({ projectId: true, requirementId: true })
  .extend({
    status: z.nativeEnum(TaskStatus).optional(),
    actualHours: z.number().nonnegative().optional(),
  });

export const CreateTaskCommentSchema = z.object({
  content: z.string().min(1),
  visibility: z.nativeEnum(CommentVisibility).default(CommentVisibility.INTERNAL),
});

export const CreateTimeEntrySchema = z.object({
  taskId: z.string().uuid(),
  date: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  note: z.string().optional(),
  billable: z.boolean().default(true),
});

export const UpdateTimeEntrySchema = z.object({
  date: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  note: z.string().nullable().optional(),
  billable: z.boolean().optional(),
});

// -------------------------------------------------------------
// QA & Bug Schemas
// -------------------------------------------------------------
export const CreateTestCaseSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid().optional().nullable(),
  title: z.string().min(3),
  steps: z.string().min(5),
  expectedResult: z.string().min(3),
});

export const ExecuteTestRunSchema = z.object({
  testCaseId: z.string().uuid(),
  taskId: z.string().uuid().optional().nullable(),
  result: z.nativeEnum(TestRunResult),
  actualResult: z.string().min(1),
  notes: z.string().optional(),
  evidenceFileId: z.string().uuid().optional().nullable(),
});

export const CreateBugSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid().optional().nullable(),
  taskId: z.string().uuid().optional().nullable(),
  testCaseId: z.string().uuid().optional().nullable(),
  title: z.string().min(3),
  description: z.string().min(5),
  severity: z.nativeEnum(BugSeverity).default(BugSeverity.MEDIUM),
  priority: z.nativeEnum(BugPriority).default(BugPriority.MEDIUM),
  stepsToReproduce: z.string().min(5),
  expectedResult: z.string().min(3),
  actualResult: z.string().min(3),
  environment: z.string().optional(),
  assigneeId: z.string().uuid().optional().nullable(),
});

export const UpdateBugStatusSchema = z.object({
  status: z.nativeEnum(BugStatus),
  comment: z.string().optional(),
});

export const CreateBugCommentSchema = z.object({
  content: z.string().min(1),
  visibility: z.nativeEnum(CommentVisibility).default(CommentVisibility.INTERNAL),
});

// -------------------------------------------------------------
// Client Review & Releases
// -------------------------------------------------------------
export const DecideClientReviewSchema = z.object({
  requirementVersion: z.number().int().positive(),
  decision: z.nativeEnum(ClientReviewDecision),
  comment: z.string().optional(),
});

export const CreateReleaseSchema = z.object({
  projectId: z.string().uuid(),
  version: z.string().regex(/^v?\d+\.\d+\.\d+/, 'Must follow semantic versioning, e.g. 1.0.0 or v1.0.0'),
  name: z.string().min(2),
  releaseDate: z.string().datetime().optional().nullable(),
  releaseNotes: z.string().optional(),
  deploymentNotes: z.string().optional(),
  itemIds: z.array(z.object({
    itemType: z.nativeEnum(ReleaseItemType),
    requirementId: z.string().uuid().optional().nullable(),
    bugId: z.string().uuid().optional().nullable(),
    description: z.string().optional(),
  })).min(1, 'A release must include at least one requirement or bug fix'),
});

export const UpdateReleaseStatusSchema = z.object({
  status: z.nativeEnum(ReleaseStatus),
  deploymentNotes: z.string().optional(),
});

// -------------------------------------------------------------
// Billing & Invoices Schemas
// -------------------------------------------------------------
export const CreateInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  invoiceNumber: z.string().min(3),
  issuedDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  currency: z.string().default('USD'),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
  })).min(1, 'Invoice must have at least one line item'),
});

export const RecordPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().datetime(),
  method: z.string().default('BANK_TRANSFER'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

// -------------------------------------------------------------
// Storage / File Asset Schemas
// -------------------------------------------------------------
export const FileEntityTypeSchema = z.enum([
  'DOCUMENT',
  'REQUIREMENT',
  'TASK',
  'BUG',
  'TEST_RUN',
  'PROJECT',
  'GENERAL',
]);

// Allowed MIME types for uploaded files (defense in depth: the object store
// itself must also enforce this, but we reject junk at the API boundary).
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'application/xml',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export const RegisterFileSchema = z
  .object({
    organizationId: z.string().uuid(),
    projectId: z.string().uuid(),
    relatedEntityType: FileEntityTypeSchema,
    relatedEntityId: z.string().uuid(),
    storageKey: z.string().min(1).max(500),
    originalFilename: z.string().min(1).max(255),
    mimeType: z
      .string()
      .min(1)
      .max(120)
      .refine((m) => ALLOWED_UPLOAD_MIME_TYPES.has(m.toLowerCase()), {
        message: 'This file type is not allowed',
      }),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024, 'Files must not exceed 25 MB'),
    visibility: z.nativeEnum(FileVisibility).default(FileVisibility.INTERNAL),
  })
  .strict();

// -------------------------------------------------------------
// Pagination & Query Filter Schemas
// -------------------------------------------------------------
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
  projectId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});
