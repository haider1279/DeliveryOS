import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { authService } from '../../src/modules/auth/auth.service';
import { UserRole } from '@deliveryos/shared';

describe('RBAC and Tenant Security Matrix', () => {
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
    const devToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'dev@agency.com',
      role: UserRole.DEVELOPER,
    });

    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${devToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Developer is forbidden from accessing executive financials (GET /api/reports/summary)', async () => {
    const devToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'dev@agency.com',
      role: UserRole.DEVELOPER,
    });

    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${devToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('QA engineer is forbidden from viewing team audit logs (GET /api/audit)', async () => {
    const qaToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000002',
      email: 'qa@agency.com',
      role: UserRole.QA,
    });

    const res = await request(app)
      .get('/api/audit')
      .set('Authorization', `Bearer ${qaToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('Client is forbidden from creating development tasks directly (POST /api/tasks)', async () => {
    const clientToken = authService.createDevToken({
      id: '00000000-0000-0000-0000-000000000003',
      email: 'client@acme.com',
      role: UserRole.CLIENT,
      organizationId: '11111111-1111-1111-1111-111111111111',
    });

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
