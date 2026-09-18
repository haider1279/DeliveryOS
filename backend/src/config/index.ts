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

export const config = {
  port: parseInt(process.env['PORT'] ?? '4000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
  corsOrigins: [
    process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
  ],
  isDev: process.env['NODE_ENV'] === 'development',
  isProd: process.env['NODE_ENV'] === 'production',

  jwtSecret: process.env['JWT_SECRET'] ?? process.env['SUPABASE_JWT_SECRET'] ?? 'deliveryos-super-secret-jwt-key-for-auth',
  jwtExpiresIn: '7d',

  supabase: {
    url: process.env['SUPABASE_URL'] ?? '',
    anonKey: process.env['SUPABASE_ANON_KEY'] ?? '',
    serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
    jwtSecret: process.env['SUPABASE_JWT_SECRET'] ?? 'deliveryos-super-secret-jwt-key-for-auth',
    storageBucket: process.env['SUPABASE_STORAGE_BUCKET'] ?? 'deliveryos-files',
  },

  // Dev testing bypass: cryptographic token for integration test suites
  devAuthSecret: process.env['DEV_AUTH_SECRET'] ?? 'deliveryos-dev-secret-change-in-production',

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
};
