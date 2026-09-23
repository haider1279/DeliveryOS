import path from 'path';
import dotenv from 'dotenv';

// Load .env from workspace root if DATABASE_URL is not already in environment
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

import bcrypt from 'bcryptjs';
import {
  PrismaClient,
  UserRole,
  UserStatus,
  OrganizationStatus,
  OrganizationQualificationStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// Strong development passwords for the seeded development role accounts.
// Documented as comments in .env.example.
export const SEED_PASSWORDS = {
  SUPER_ADMIN: 'SuperAdmin#2026!DeliveryOS',
  ADMIN: 'Admin#2026!DeliveryOS',
  BD: 'BD#2026!DeliveryOS',
  QA: 'QA#2026!DeliveryOS',
  CLIENT: 'Client#2026!DeliveryOS',
  DEVELOPER: 'Developer#2026!DeliveryOS',
  PROJECT_MANAGER: 'ProjectManager#2026!DeliveryOS',
};

async function main() {
  console.log('Cleaning and resetting DeliveryOS database...');

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

  console.log('Previous data wiped. Seeding authoritative 7 role accounts...');

  // 2. Baseline Client Organization (for the seeded CLIENT role)
  const clientOrg = await prisma.organization.create({
    data: {
      name: 'Euroshub Client Organization',
      slug: 'euroshub-client',
      contactEmail: 'haider6.euroshub@gmail.com',
      contactPhone: '+1-555-0100',
      address: '100 Innovation Boulevard',
      city: 'London',
      country: 'United Kingdom',
      status: OrganizationStatus.ACTIVE,
      qualificationStatus: OrganizationQualificationStatus.APPROVED,
      qualificationNotes: 'Approved enterprise client for DeliveryOS testing.',
      notes: 'Initial client organization for verified client portal testing.',
    },
  });

  // 3. Seed Users across all 7 authoritative roles
  const usersToSeed = [
    {
      email: 'haider1.euroshub@gmail.com',
      role: UserRole.SUPER_ADMIN,
      password: SEED_PASSWORDS.SUPER_ADMIN,
      firstName: 'Haider',
      lastName: 'Ali',
      displayName: 'Haider Ali (Super Admin)',
      jobTitle: 'Chief Executive Officer',
      phone: '+1-555-1001',
      organizationId: null,
    },
    {
      email: 'haider2.euroshub@gmail.com',
      role: UserRole.ADMIN,
      password: SEED_PASSWORDS.ADMIN,
      firstName: 'Haider',
      lastName: 'Admin',
      displayName: 'Haider Admin',
      jobTitle: 'Operations Director',
      phone: '+1-555-1002',
      organizationId: null,
    },
    {
      email: 'haider4.euroshub@gmail.com',
      role: UserRole.BD,
      password: SEED_PASSWORDS.BD,
      firstName: 'Haider',
      lastName: 'BD',
      displayName: 'Haider BD',
      jobTitle: 'Business Development Manager',
      phone: '+1-555-1004',
      organizationId: null,
    },
    {
      email: 'haider5.euroshub@gmail.com',
      role: UserRole.QA,
      password: SEED_PASSWORDS.QA,
      firstName: 'Haider',
      lastName: 'QA',
      displayName: 'Haider QA',
      jobTitle: 'QA Lead',
      phone: '+1-555-1005',
      organizationId: null,
    },
    {
      email: 'haider6.euroshub@gmail.com',
      role: UserRole.CLIENT,
      password: SEED_PASSWORDS.CLIENT,
      firstName: 'Haider',
      lastName: 'Client',
      displayName: 'Haider Client',
      jobTitle: 'VP of Product',
      phone: '+1-555-1006',
      organizationId: clientOrg.id,
    },
    {
      email: 'haider7.euroshub@gmail.com',
      role: UserRole.DEVELOPER,
      password: SEED_PASSWORDS.DEVELOPER,
      firstName: 'Haider',
      lastName: 'Developer',
      displayName: 'Haider Developer',
      jobTitle: 'Senior Full-Stack Engineer',
      phone: '+1-555-1007',
      organizationId: null,
    },
    {
      email: 'haider8.euroshub@gmail.com',
      role: UserRole.PROJECT_MANAGER,
      password: SEED_PASSWORDS.PROJECT_MANAGER,
      firstName: 'Haider',
      lastName: 'PM',
      displayName: 'Haider Project Manager',
      jobTitle: 'Delivery Project Manager',
      phone: '+1-555-1008',
      organizationId: null,
    },
  ];

  for (const item of usersToSeed) {
    const passwordHash = bcrypt.hashSync(item.password, 10);
    await prisma.user.create({
      data: {
        email: item.email.toLowerCase(),
        role: item.role,
        status: UserStatus.ACTIVE,
        passwordHash,
        organizationId: item.organizationId,
        profile: {
          create: {
            firstName: item.firstName,
            lastName: item.lastName,
            displayName: item.displayName,
            jobTitle: item.jobTitle,
            phone: item.phone,
          },
        },
      },
    });
    console.log(`  ✓ Seeded ${item.role}: ${item.email}`);
  }

  console.log('Seed completed successfully. Exactly 7 role accounts seeded, 0 fake projects created.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
