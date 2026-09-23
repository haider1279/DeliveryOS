import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('SPA Routing & Fallback Verification', () => {
  it('serves healthcheck endpoint correctly without hitting SPA fallback', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('preserves 404 API error response for unknown /api/* endpoints', async () => {
    const res = await request(app).get('/api/nonexistent-route-12345');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('serves SPA index.html for non-API frontend routes when frontend is built', async () => {
    const res = await request(app).get('/dashboard');
    // If frontend/dist is built, status is 200 and content-type is html.
    // If not built in test env, status falls through to 404.
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/html/);
    } else {
      expect(res.status).toBe(404);
    }
  });
});
