import path from 'path';
import dotenv from 'dotenv';

// Load .env from workspace root if DATABASE_URL is not already in environment
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole, UserStatus, OrganizationStatus, ProjectStatus, ProjectPriority, ProjectMembershipRole, RequirementPriority, RequirementStatus, EstimateStatus, RequirementApprovalDecision, TaskPriority, TaskStatus, CommentVisibility, TestCaseStatus, TestRunResult, BugSeverity, BugPriority, BugStatus, ReleaseStatus, ReleaseItemType, FileVisibility, InvoiceStatus, NotificationType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding DeliveryOS database with realistic agency data...');

  // 1. Clean existing records in reverse dependency order
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.releaseItem.deleteMany();
  await prisma.release.deleteMany();
  await prisma.clientReview.deleteMany();
  await prisma.bugComment.deleteMany();
  await prisma.bug.deleteMany();
  await prisma.testRun.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.requirementApproval.deleteMany();
  await prisma.estimate.deleteMany();
  await prisma.requirementStatusHistory.deleteMany();
  await prisma.requirementVersion.deleteMany();
  await prisma.requirement.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.projectActivity.deleteMany();
  await prisma.fileAsset.deleteMany();
  await prisma.project.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // 2. Seed Organizations
  const acmeOrg = await prisma.organization.create({
    data: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      contactEmail: 'operations@acmecorp.com',
      contactPhone: '+1-555-0199',
      address: '100 Enterprise Way, Suite 400',
      city: 'San Francisco',
      country: 'USA',
      status: OrganizationStatus.ACTIVE,
      notes: 'Enterprise logistics client on dedicated monthly delivery retainer.',
    },
  });

  const starlightOrg = await prisma.organization.create({
    data: {
      name: 'Starlight Retail Group',
      slug: 'starlight-retail',
      contactEmail: 'contact@starlightretail.io',
      contactPhone: '+1-555-0244',
      address: '750 Broadway Ave',
      city: 'New York',
      country: 'USA',
      status: OrganizationStatus.ACTIVE,
      notes: 'Omnichannel retailer scaling their headless commerce engine.',
    },
  });

  // 3. Seed Users across all roles with explicit passwordHash
  const defaultPasswordHash = bcrypt.hashSync('DeliveryOS123!', 10);

  const superAdmin = await prisma.user.create({
    data: {
      email: 'superadmin@deliveryos.local',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: defaultPasswordHash,
      profile: {
        create: {
          firstName: 'Elena',
          lastName: 'Vance',
          displayName: 'Elena Vance (Super Admin)',
          jobTitle: 'Chief Executive Officer',
          phone: '+1-555-1001',
        },
      },
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@deliveryos.local',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash: defaultPasswordHash,
      profile: {
        create: {
          firstName: 'Marcus',
          lastName: 'Brody',
          displayName: 'Marcus Brody',
          jobTitle: 'Operations Director',
          phone: '+1-555-1002',
        },
      },
    },
  });

  const pm = await prisma.user.create({
    data: {
      email: 'pm@deliveryos.local',
      role: UserRole.PROJECT_MANAGER,
      status: UserStatus.ACTIVE,
      passwordHash: defaultPasswordHash,
      profile: {
        create: {
          firstName: 'Sarah',
          lastName: 'Connor',
          displayName: 'Sarah Connor (Lead PM)',
          jobTitle: 'Senior Delivery Manager',
          phone: '+1-555-1003',
        },
      },
    },
  });

  const dev = await prisma.user.create({
    data: {
      email: 'dev@deliveryos.local',
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
      passwordHash: defaultPasswordHash,
      profile: {
        create: {
          firstName: 'David',
          lastName: 'Kim',
          displayName: 'David Kim',
          jobTitle: 'Senior Full-Stack Engineer',
          phone: '+1-555-1004',
        },
      },
    },
  });

  const qa = await prisma.user.create({
    data: {
      email: 'qa@deliveryos.local',
      role: UserRole.QA,
      status: UserStatus.ACTIVE,
      passwordHash: defaultPasswordHash,
      profile: {
        create: {
          firstName: 'Priya',
          lastName: 'Patel',
          displayName: 'Priya Patel',
          jobTitle: 'QA Lead',
          phone: '+1-555-1005',
        },
      },
    },
  });

  const clientUser = await prisma.user.create({
    data: {
      email: 'client@acmecorp.local',
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      organizationId: acmeOrg.id,
      passwordHash: defaultPasswordHash,
      profile: {
        create: {
          firstName: 'Alexander',
          lastName: 'Pierce',
          displayName: 'Alexander Pierce (VP Tech)',
          jobTitle: 'VP of Technology & Operations',
          phone: '+1-555-2001',
        },
      },
    },
  });

  const starlightClientUser = await prisma.user.create({
    data: {
      email: 'client@starlightretail.local',
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      organizationId: starlightOrg.id,
      passwordHash: defaultPasswordHash,
      profile: {
        create: {
          firstName: 'Chloe',
          lastName: 'Zhao',
          displayName: 'Chloe Zhao (Director)',
          jobTitle: 'Director of Digital Platforms',
          phone: '+1-555-3001',
        },
      },
    },
  });

  // 4. Seed Projects
  const acmeProject = await prisma.project.create({
    data: {
      organizationId: acmeOrg.id,
      projectManagerId: pm.id,
      name: 'Acme Warehouse Sync & Dispatch Platform',
      code: 'ACME-WMS',
      description: 'Unified automated warehouse inventory synchronization and real-time dispatch dashboard.',
      status: ProjectStatus.ACTIVE,
      priority: ProjectPriority.HIGH,
      startDate: new Date('2026-08-01T00:00:00Z'),
      targetDate: new Date('2026-11-30T00:00:00Z'),
      budget: 85000.00,
      currency: 'USD',
      estimatedEffortHours: 420.00,
      actualEffortHours: 185.00,
      members: {
        create: [
          { userId: pm.id, membershipRole: ProjectMembershipRole.PROJECT_MANAGER },
          { userId: dev.id, membershipRole: ProjectMembershipRole.DEVELOPER },
          { userId: qa.id, membershipRole: ProjectMembershipRole.QA },
        ],
      },
    },
  });

  const starlightProject = await prisma.project.create({
    data: {
      organizationId: starlightOrg.id,
      projectManagerId: pm.id,
      name: 'Starlight Headless Commerce Storefront',
      code: 'STAR-ECOMM',
      description: 'Next.js storefront integrated with headless catalog API and Stripe payment gateway.',
      status: ProjectStatus.ACTIVE,
      priority: ProjectPriority.MEDIUM,
      startDate: new Date('2026-09-01T00:00:00Z'),
      targetDate: new Date('2026-12-15T00:00:00Z'),
      budget: 60000.00,
      currency: 'USD',
      estimatedEffortHours: 300.00,
      actualEffortHours: 45.00,
      members: {
        create: [
          { userId: pm.id, membershipRole: ProjectMembershipRole.PROJECT_MANAGER },
        ],
      },
    },
  });

  // 5. Seed Requirements & Versions
  const req1 = await prisma.requirement.create({
    data: {
      projectId: acmeProject.id,
      title: 'Real-Time Inventory Level Synchronization Engine',
      description: 'Sync live SKU counts across regional fulfillment nodes using webhook events.',
      priority: RequirementPriority.CRITICAL,
      category: 'Backend Core',
      acceptanceCriteria: '1. Webhook payloads parsed under 100ms.\n2. Deduplication of concurrent SKU events.\n3. Automatic rollback on ledger mismatch.',
      status: RequirementStatus.IN_DEVELOPMENT,
      currentVersion: 1,
      submittedById: clientUser.id,
      requestedByUserId: clientUser.id,
      targetDate: new Date('2026-10-15T00:00:00Z'),
      approvedAt: new Date('2026-08-10T14:30:00Z'),
      versions: {
        create: {
          versionNumber: 1,
          title: 'Real-Time Inventory Level Synchronization Engine',
          description: 'Sync live SKU counts across regional fulfillment nodes using webhook events.',
          acceptanceCriteria: '1. Webhook payloads parsed under 100ms.\n2. Deduplication of concurrent SKU events.\n3. Automatic rollback on ledger mismatch.',
          changeSummary: 'Initial client-approved specification',
          createdById: clientUser.id,
        },
      },
    },
  });

  const req2 = await prisma.requirement.create({
    data: {
      projectId: acmeProject.id,
      title: 'Automated Carrier Dispatch Alerts & SMS Dispatch',
      description: 'Trigger customer notification SMS and carrier webhook upon dock departure.',
      priority: RequirementPriority.HIGH,
      category: 'Integrations',
      acceptanceCriteria: '1. SMS queued within 5 seconds of departure scan.\n2. Carrier tracking link embedded.\n3. Retry queue with exponential backoff on Twilio errors.',
      status: RequirementStatus.WAITING_FOR_APPROVAL,
      currentVersion: 1,
      submittedById: pm.id,
      targetDate: new Date('2026-10-30T00:00:00Z'),
      versions: {
        create: {
          versionNumber: 1,
          title: 'Automated Carrier Dispatch Alerts & SMS Dispatch',
          description: 'Trigger customer notification SMS and carrier webhook upon dock departure.',
          acceptanceCriteria: '1. SMS queued within 5 seconds of departure scan.\n2. Carrier tracking link embedded.',
          createdById: pm.id,
        },
      },
    },
  });

  // 6. Seed Estimates & Approvals
  const est1 = await prisma.estimate.create({
    data: {
      requirementId: req1.id,
      requirementVersion: 1,
      version: 1,
      devHours: 60,
      qaHours: 20,
      designHours: 10,
      totalHours: 90,
      estimatedCost: 9000.00,
      clientPrice: 13500.00,
      proposedDeliveryDate: new Date('2026-10-15T00:00:00Z'),
      assumptions: 'Client provides active webhook endpoints and staging API credentials.',
      exclusions: 'Custom hardware RFID barcode firmware development.',
      status: EstimateStatus.APPROVED,
      createdById: pm.id,
    },
  });

  await prisma.requirementApproval.create({
    data: {
      requirementId: req1.id,
      requirementVersion: 1,
      estimateId: est1.id,
      estimateVersion: 1,
      decision: RequirementApprovalDecision.APPROVED,
      decidedById: clientUser.id,
      comment: 'Approved proposal as scoped during sprint planning.',
      decidedAt: new Date('2026-08-10T14:30:00Z'),
    },
  });

  const est2 = await prisma.estimate.create({
    data: {
      requirementId: req2.id,
      requirementVersion: 1,
      version: 1,
      devHours: 40,
      qaHours: 15,
      designHours: 5,
      totalHours: 60,
      estimatedCost: 6000.00,
      clientPrice: 9000.00,
      proposedDeliveryDate: new Date('2026-10-30T00:00:00Z'),
      assumptions: 'Twilio account credentials provisioned by Acme Corp.',
      status: EstimateStatus.SENT,
      createdById: pm.id,
    },
  });

  // 7. Seed Tasks & Time Entries
  const task1 = await prisma.task.create({
    data: {
      projectId: acmeProject.id,
      requirementId: req1.id,
      title: 'Design PostgreSQL Inventory Schema & High-Throughput Indexes',
      description: 'Implement tables for skus, warehouse_locations, and delta_events with proper FKs and indexes.',
      assigneeId: dev.id,
      creatorId: pm.id,
      priority: TaskPriority.HIGH,
      status: TaskStatus.DONE,
      estimatedHours: 16.00,
      actualHours: 14.50,
      completedAt: new Date('2026-08-20T17:00:00Z'),
      labels: ['backend', 'db', 'performance'],
    },
  });

  const task2 = await prisma.task.create({
    data: {
      projectId: acmeProject.id,
      requirementId: req1.id,
      title: 'Build Webhook Ingestion Pipeline & Signature Validation',
      description: 'Implement HMAC verification and transactional queue for incoming SKU updates.',
      assigneeId: dev.id,
      creatorId: pm.id,
      priority: TaskPriority.CRITICAL,
      status: TaskStatus.IN_PROGRESS,
      estimatedHours: 24.00,
      actualHours: 18.00,
      dueDate: new Date('2026-09-25T00:00:00Z'),
      labels: ['backend', 'api', 'security'],
    },
  });

  const task3 = await prisma.task.create({
    data: {
      projectId: acmeProject.id,
      title: 'Resolve Redis Sentinel connection pool exhaustion',
      description: 'Connection timeout observed during stress test batch runs.',
      assigneeId: dev.id,
      creatorId: pm.id,
      priority: TaskPriority.HIGH,
      status: TaskStatus.BLOCKED,
      estimatedHours: 8.00,
      actualHours: 6.00,
      dueDate: new Date('2026-09-22T00:00:00Z'),
      labels: ['infrastructure', 'caching'],
    },
  });

  await prisma.timeEntry.create({
    data: {
      projectId: acmeProject.id,
      taskId: task1.id,
      userId: dev.id,
      date: new Date('2026-08-19T00:00:00Z'),
      durationMinutes: 480,
      note: 'Drafted schema migrations and ran explain analyze on test query plan.',
      billable: true,
    },
  });

  // 8. Seed QA Test Cases & Runs
  const testCase1 = await prisma.testCase.create({
    data: {
      projectId: acmeProject.id,
      requirementId: req1.id,
      title: 'Verify HMAC Signature Validation on SKU Webhooks',
      steps: '1. Send POST request with valid HMAC header.\n2. Send POST with forged HMAC header.\n3. Send POST with expired timestamp.',
      expectedResult: 'Valid payload returns 200 OK; invalid/forged signature returns 401 Unauthorized.',
      createdById: qa.id,
      status: TestCaseStatus.ACTIVE,
    },
  });

  await prisma.testRun.create({
    data: {
      testCaseId: testCase1.id,
      taskId: task2.id,
      executedById: qa.id,
      result: TestRunResult.PASS,
      actualResult: 'Signature validation rejected forged payload as expected.',
      executedAt: new Date('2026-08-25T11:00:00Z'),
    },
  });

  const testCase2 = await prisma.testCase.create({
    data: {
      projectId: acmeProject.id,
      requirementId: req1.id,
      title: 'Deduplication of Concurrent SKU Webhooks',
      steps: 'Fire 10 concurrent requests with identical idempotency key within 50ms.',
      expectedResult: 'Exactly 1 update processed; 9 duplicate responses return cached result without double increment.',
      createdById: qa.id,
      status: TestCaseStatus.ACTIVE,
    },
  });

  const failedTestRun = await prisma.testRun.create({
    data: {
      testCaseId: testCase2.id,
      taskId: task2.id,
      executedById: qa.id,
      result: TestRunResult.FAIL,
      actualResult: 'Race condition detected: 2 out of 10 requests bypassed cache lock and incremented inventory twice.',
      executedAt: new Date('2026-09-02T16:00:00Z'),
    },
  });

  // 9. Seed Bugs (Linked to Failed Test Run)
  await prisma.bug.create({
    data: {
      projectId: acmeProject.id,
      requirementId: req1.id,
      taskId: task2.id,
      testCaseId: testCase2.id,
      title: 'Race Condition in SKU Deduplication Under Concurrent Bursts',
      description: 'High-frequency webhook bursts with identical idempotency keys cause double counting in the ledger.',
      severity: BugSeverity.CRITICAL,
      priority: BugPriority.CRITICAL,
      stepsToReproduce: '1. Run concurrent runner with 10 workers.\n2. Dispatch identical payload to /api/webhooks/inventory.\n3. Inspect SKU stock count.',
      expectedResult: 'Stock incremented by 1.',
      actualResult: 'Stock incremented by 2.',
      reporterId: qa.id,
      assigneeId: dev.id,
      status: BugStatus.IN_PROGRESS,
    },
  });

  // 10. Seed Releases
  const release1 = await prisma.release.create({
    data: {
      projectId: acmeProject.id,
      version: '1.0.0',
      name: 'Initial Warehouse Ingestion Release',
      status: ReleaseStatus.DEPLOYED,
      releaseDate: new Date('2026-08-25T00:00:00Z'),
      deployedAt: new Date('2026-08-25T18:00:00Z'),
      releaseNotes: 'Deployed base webhook handler, database schema, and initial health monitoring endpoints.',
      createdById: pm.id,
      items: {
        create: [
          {
            itemType: ReleaseItemType.REQUIREMENT,
            requirementId: req1.id,
            description: 'Core schema and data ingestion baseline',
          },
        ],
      },
    },
  });

  // 11. Seed Invoices & Payments
  const invoice1 = await prisma.invoice.create({
    data: {
      organizationId: acmeOrg.id,
      projectId: acmeProject.id,
      invoiceNumber: 'INV-2026-001',
      status: InvoiceStatus.PARTIALLY_PAID,
      subtotal: 13500.00,
      discount: 500.00,
      tax: 0.00,
      total: 13000.00,
      currency: 'USD',
      issuedDate: new Date('2026-08-15T00:00:00Z'),
      dueDate: new Date('2026-09-15T00:00:00Z'),
      notes: 'Milestone 1 — Initial Architecture & Warehouse Ingestion Pipeline',
      items: {
        create: [
          {
            description: 'Architecture Design & Schema Ingestion Core',
            quantity: 1,
            unitPrice: 13500.00,
            amount: 13500.00,
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      invoiceId: invoice1.id,
      amount: 6500.00,
      paymentDate: new Date('2026-08-28T00:00:00Z'),
      method: 'WIRE_TRANSFER',
      reference: 'WIRE-ACME-88291',
      recordedById: pm.id,
      notes: 'Initial 50% deposit received upon contract kickoff.',
    },
  });

  // 12. Seed Project Activity & Notifications
  await prisma.projectActivity.create({
    data: {
      projectId: acmeProject.id,
      actorId: clientUser.id,
      type: 'REQUIREMENT_APPROVED',
      message: 'Alexander Pierce approved Requirement: Real-Time Inventory Level Synchronization Engine',
      visibility: CommentVisibility.CLIENT_VISIBLE,
      entityType: 'REQUIREMENT',
      entityId: req1.id,
    },
  });

  await prisma.notification.create({
    data: {
      userId: pm.id,
      type: NotificationType.ESTIMATE_DECIDED,
      title: 'Estimate Approved by Client',
      message: 'Acme Corporation approved estimate of $13,500 for Real-Time Inventory Level Synchronization Engine',
      linkUrl: `/app/projects/${acmeProject.id}`,
    },
  });

  console.log('Seeding completed successfully!');
  console.log('Seed summary:');
  console.log(`- Organizations: 2 (${acmeOrg.name}, ${starlightOrg.name})`);
  console.log(`- Users: 7 (SuperAdmin, Admin, PM, Dev, QA, Client Acme, Client Starlight)`);
  console.log(`- Projects: 2 (${acmeProject.name}, ${starlightProject.name})`);
  console.log(`- Invoices: 1 (Total: $13,000, Paid: $6,500 -> PARTIALLY_PAID)`);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
