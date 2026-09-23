import { defineConfig, devices } from '@playwright/test';

/**
 * DeliveryOS end-to-end tests.
 *
 * Playwright drives the installed Microsoft Edge (channel: 'msedge') so no
 * browser binary download is required. Run the app first:
 *
 *   npm run db:seed        # reseed the local database (needs Postgres running)
 *   npm run dev            # backend on :4000, frontend on :5173
 *
 * then execute:
 *
 *   npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // serial — tests share one seeded database
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'msedge',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
  ],
});