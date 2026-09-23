import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is missing`);
  }
  return value;
}

const nodeEnv = process.env['NODE_ENV'] ?? 'development';

// Default JWT secrets are only acceptable for local development/tests.
// In production a weakly known default secret would defeat the entire
// authentication layer, so we refuse to start rather than fall back.
const DEV_JWT_SECRET = 'deliveryos-dev-jwt-secret-not-for-production';
const jwtSecret = process.env['JWT_SECRET'] ?? process.env['SUPABASE_JWT_SECRET'] ?? null;
if (!jwtSecret && nodeEnv === 'production') {
  throw new Error('Required environment variable JWT_SECRET (or SUPABASE_JWT_SECRET) is missing in production');
}

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://delivery-os-frontend.vercel.app',
];

const rawOrigins = [
  process.env['FRONTEND_URL'],
  process.env['CORS_ORIGIN'],
  ...defaultCorsOrigins,
].filter(Boolean) as string[];

const parsedCorsOrigins = new Set<string>();
for (const item of rawOrigins) {
  item.split(',').forEach((origin) => {
    const trimmed = origin.trim().replace(/\/$/, '');
    if (trimmed) parsedCorsOrigins.add(trimmed);
  });
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '4000', 10),
  nodeEnv,
  frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
  corsOrigins: Array.from(parsedCorsOrigins),
  isDev: nodeEnv === 'development',
  isProd: nodeEnv === 'production',
  isTest: nodeEnv === 'test',

  jwtSecret: jwtSecret ?? DEV_JWT_SECRET,
  jwtExpiresIn: '7d',

  supabase: {
    url: process.env['SUPABASE_URL'] ?? '',
    anonKey: process.env['SUPABASE_ANON_KEY'] ?? '',
    serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
    jwtSecret: process.env['SUPABASE_JWT_SECRET'] ?? '',
    storageBucket: process.env['SUPABASE_STORAGE_BUCKET'] ?? 'deliveryos-files',
  },

  // Dev/test-only signing secret for integration test suites. Never honored
  // in production. Falls back to a random per-process value so a known
  // default cannot be used as a bypass key in a real deployment.
  devAuthSecret:
    nodeEnv === 'production'
      ? ''
      : (process.env['DEV_AUTH_SECRET'] ?? crypto.randomBytes(32).toString('hex')),

  upload: {
    maxFileSizeBytes: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
      'application/zip',
    ],
  },

  email: {
    // When SMTP_HOST is set, real emails are delivered via SMTP. Otherwise the
    // app falls back to a local dev "mailbox" (filesystem) so no environment
    // silently pretends an email was sent.
    smtpHost: process.env['SMTP_HOST'] ?? '',
    smtpPort: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    smtpSecure: process.env['SMTP_SECURE'] === 'true',
    smtpUser: process.env['SMTP_USER'] ?? '',
    smtpPass: process.env['SMTP_PASS'] ?? '',
    from: process.env['MAIL_FROM'] ?? 'DeliveryOS <no-reply@deliveryos.local>',
    devMailDir: process.env['DEV_MAIL_DIR'] ?? path.resolve(__dirname, '../../dev-mail'),
  },
};
