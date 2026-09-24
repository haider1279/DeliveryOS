import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { config } from '../../src/config';
import { authService } from '../../src/modules/auth/auth.service';
import * as supabaseAdminModule from '../../src/services/supabase-admin.service';

describe('Supabase Auth User Invitation Flow', () => {
  let adminToken: string;
  let adminUser: any;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'haider2.euroshub@gmail.com' },
    });
    adminToken = authService.createDevToken({
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({
        where: { email: { in: createdEmails } },
      });
    }
    await prisma.$disconnect();
  });

  it('uses Supabase Auth inviteUserByEmail when Supabase Admin is available', async () => {
    const email = `supabase-invite-${Date.now()}@deliveryos.local`;
    createdEmails.push(email);

    const mockInviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: `sp_user_${Date.now()}` } },
      error: null,
    });

    const mockSupabaseAdmin = {
      auth: {
        admin: {
          inviteUserByEmail: mockInviteUserByEmail,
        },
      },
    } as any;

    const spy = vi.spyOn(supabaseAdminModule, 'getSupabaseAdmin').mockReturnValue(mockSupabaseAdmin);

    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, firstName: 'Supa', lastName: 'Base', role: 'DEVELOPER' });

    expect(res.status).toBe(201);
    expect(mockInviteUserByEmail).toHaveBeenCalledOnce();

    const [calledEmail, options] = mockInviteUserByEmail.mock.calls[0];
    expect(calledEmail).toBe(email);
    expect(options.redirectTo).toContain('/accept-invite');
    expect(options.redirectTo).toContain(`email=${encodeURIComponent(email)}`);
    expect(options.data).toEqual(
      expect.objectContaining({
        firstName: 'Supa',
        lastName: 'Base',
        role: 'DEVELOPER',
      })
    );

    const userInDb = await prisma.user.findUnique({ where: { email } });
    expect(userInDb).toBeTruthy();
    expect(userInDb?.supabaseUserId).toBe(res.body?.data?.user?.supabaseUserId);
    expect(userInDb?.supabaseUserId).toMatch(/^sp_user_/);

    spy.mockRestore();
  });

  it('handles Supabase Auth error properly and rolls back user creation', async () => {
    const email = `supabase-fail-${Date.now()}@deliveryos.local`;
    createdEmails.push(email);

    const mockInviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'Rate limit exceeded' },
    });

    const mockSupabaseAdmin = {
      auth: {
        admin: {
          inviteUserByEmail: mockInviteUserByEmail,
        },
      },
    } as any;

    const spy = vi.spyOn(supabaseAdminModule, 'getSupabaseAdmin').mockReturnValue(mockSupabaseAdmin);

    const res = await request(app)
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, firstName: 'Fail', lastName: 'Test', role: 'DEVELOPER' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.message).toContain('Failed to send invitation via Supabase Auth');
    expect(res.body?.error?.message).toContain('Rate limit exceeded');

    // Confirm DB rollback (user was deleted on error)
    const userInDb = await prisma.user.findUnique({ where: { email } });
    expect(userInDb).toBeNull();

    spy.mockRestore();
  });

  it('rejects invitations in production if Supabase credentials are missing', async () => {
    const email = `prod-missing-supabase-${Date.now()}@deliveryos.local`;
    createdEmails.push(email);

    const spyAdmin = vi.spyOn(supabaseAdminModule, 'getSupabaseAdmin').mockReturnValue(null);
    const prevProd = config.isProd;
    config.isProd = true;

    try {
      const res = await request(app)
        .post('/api/users/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, firstName: 'Prod', lastName: 'Missing', role: 'DEVELOPER' });

      expect(res.status).toBe(500);
      expect(res.body?.error?.message).toContain('Supabase Auth service-role key is missing');

      const userInDb = await prisma.user.findUnique({ where: { email } });
      expect(userInDb).toBeNull();
    } finally {
      config.isProd = prevProd;
      spyAdmin.mockRestore();
    }
  });
});
