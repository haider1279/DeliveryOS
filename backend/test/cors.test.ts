import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('Production CORS Policy Verification', () => {
  const prodOrigin = 'https://delivery-os-frontend.vercel.app';

  it('handles OPTIONS preflight for /api/auth/login with correct CORS headers', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', prodOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

    expect(res.headers['access-control-allow-origin']).toBe(prodOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.status).toBeLessThan(400);
  });

  it('handles unauthorized/invalid POST login with CORS headers and application error payload', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', prodOrigin)
      .send({ email: 'invalid@example.com', password: 'wrongpassword' });

    expect(res.headers['access-control-allow-origin']).toBe(prodOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('preserves localhost origins for development', async () => {
    const devOrigin = 'http://localhost:5173';
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', devOrigin)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBe(devOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
