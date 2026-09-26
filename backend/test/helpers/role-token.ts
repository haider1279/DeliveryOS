import { prisma } from '../../src/config/prisma';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole } from '@deliveryos/shared';

/**
 * Seeded development accounts, one per authoritative role.
 * (Documented in .env.example and created by prisma/seed.ts.)
 */
const SEED_EMAIL_BY_ROLE: Record<string, string> = {
  [UserRole.SUPER_ADMIN]: 'haider1.euroshub@gmail.com',
  [UserRole.ADMIN]: 'haider2.euroshub@gmail.com',
  [UserRole.BD]: 'haider4.euroshub@gmail.com',
  [UserRole.QA]: 'haider5.euroshub@gmail.com',
  [UserRole.CLIENT]: 'haider6.euroshub@gmail.com',
  [UserRole.DEVELOPER]: 'haider7.euroshub@gmail.com',
  [UserRole.PROJECT_MANAGER]: 'haider8.euroshub@gmail.com',
};

/**
 * Issues a session token for a real, seeded account of the given role.
 *
 * Tests must authenticate as a user that actually exists in the database:
 * authMiddleware resolves the identity from the database row on every request,
 * so a fabricated id/email would either be rejected (401) or — worse — be
 * silently replaced by a test-only synthetic identity, which would let a test
 * pass without ever exercising real authentication.
 */
export async function tokenForRole(role: UserRole): Promise<string> {
  const email = SEED_EMAIL_BY_ROLE[role];
  if (!email) throw new Error(`No seeded account configured for role ${role}`);

  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, email: true, role: true, organizationId: true },
  });

  return authService.createDevToken({
    id: user.id,
    email: user.email,
    role: user.role as never,
    organizationId: user.organizationId,
  });
}
