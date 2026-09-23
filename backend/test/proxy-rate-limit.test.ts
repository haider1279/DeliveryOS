import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('Reverse Proxy & Rate Limiter Verification', () => {
  it('handles requests with X-Forwarded-For header without throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Forwarded-For', '203.0.113.195');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('handles X-Forwarded-For header on rate-limited auth endpoints', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.195')
      .send({ email: 'nonexistent@example.com', password: 'WrongPassword123!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
