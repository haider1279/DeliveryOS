import { test, expect } from '@playwright/test';

test.describe('Authentication & route guards', () => {
  test('logs in as admin and lands on the internal dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider2.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Admin#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/app\/dashboard/);
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('rejects a wrong password with a visible error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider2.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('wrong-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('cannot access an internal route while logged out', async ({ page }) => {
    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('client is redirected to the portal, not the internal app', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider6.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Client#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/portal\/projects/);

    // Client browsing /app is bounced back into the portal.
    await page.goto('/app/dashboard');
    await expect(page).toHaveURL(/\/portal\/projects/);
  });

  test('admin cannot reach the client portal (redirected to dashboard)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider2.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Admin#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.goto('/portal/projects');
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });

  test('logs out back to the login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider7.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Developer#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.getByTitle('Sign Out').click();
    await expect(page).toHaveURL(/\/login/);
  });
});