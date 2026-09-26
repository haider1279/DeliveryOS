import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { tokenForRole } from '../helpers/role-token';
import { UserRole } from '@deliveryos/shared';

describe('RBAC and Tenant Security Matrix', () => {
  // Real seeded accounts, so every request below is authenticated against an
  // actual database row rather than a test-only synthetic identity.
  let devToken: string;
  let qaToken: string;
  let clientToken: string;

  beforeAll(async () => {
    [devToken, qaToken, clientToken] = await Promise.all([
      tokenForRole(UserRole.DEVELOPER),
      tokenForRole(UserRole.QA),
      tokenForRole(UserRole.CLIENT),
    ]);
  });

  it('GET /health returns 200 with status ok without authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/projects rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('Developer is forbidden from accessing billing invoices (GET /api/invoices)', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${devToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Developer is forbidden from accessing executive financials (GET /api/reports/summary)', async () => {
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${devToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('QA engineer is forbidden from viewing team audit logs (GET /api/audit)', async () => {
    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${qaToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Client is forbidden from creating development tasks directly (POST /api/tasks)', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        projectId: '22222222-2222-2222-2222-222222222222',
        title: 'Unauthorized Task Creation',
      });

    expect([403, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });
});
