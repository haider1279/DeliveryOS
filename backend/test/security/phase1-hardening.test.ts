import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateProjectSchema, UpdateTaskSchema } from '@deliveryos/shared';

describe('Production secret hardening', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    originalEnv['NODE_ENV'] = process.env['NODE_ENV'];
    originalEnv['JWT_SECRET'] = process.env['JWT_SECRET'];
    originalEnv['SUPABASE_JWT_SECRET'] = process.env['SUPABASE_JWT_SECRET'];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('refuses to boot in production when no JWT secret is configured', async () => {
    // Blank (not undefined) so dotenv cannot re-inject committed defaults.
    process.env['JWT_SECRET'] = '';
    process.env['SUPABASE_JWT_SECRET'] = '';
    process.env['NODE_ENV'] = 'production';

    await expect(async () => {
      await import('../../src/config');
    }).rejects.toThrow(/JWT_SECRET/);
  });

  it('never exposes a dev auth secret in production', async () => {
    process.env['JWT_SECRET'] = 'production-test-secret';
    process.env['NODE_ENV'] = 'production';

    const mod = await import('../../src/config');
    expect(mod.config.devAuthSecret).toBe('');
    expect(mod.config.isProd).toBe(true);
  });
});

describe('Update schema hardening (no project/task re-homing)', () => {
  it('UpdateProjectSchema strips organizationId/projectManagerId attempts', () => {
    const parsed = UpdateProjectSchema.parse({
      name: 'Renamed',
      organizationId: 'org-1',
      projectManagerId: 'pm-1',
    });
    expect(parsed.name).toBe('Renamed');
    expect('organizationId' in parsed).toBe(false);
    expect('projectManagerId' in parsed).toBe(false);
  });

  it('UpdateProjectSchema accepts editable fields only', () => {
    const parsed = UpdateProjectSchema.parse({
      name: 'Renamed',
      status: 'COMPLETED',
      actualEffortHours: 42,
    });
    expect(parsed.status).toBe('COMPLETED');
    expect(parsed.actualEffortHours).toBe(42);
  });

  it('UpdateTaskSchema strips projectId/requirementId attempts', () => {
    const parsed = UpdateTaskSchema.parse({
      title: 'Retitled',
      projectId: 'other-project',
      requirementId: 'other-requirement',
    });
    expect(parsed.title).toBe('Retitled');
    expect('projectId' in parsed).toBe(false);
    expect('requirementId' in parsed).toBe(false);
  });
});