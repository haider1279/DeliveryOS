import { test, expect } from '@playwright/test';

test.describe('Client portal coverage', () => {
  test('client sees their projects and can open project detail', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('client@acmecorp.local');
    await page.getByLabel(/password/i).fill('DeliveryOS123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/projects/);

    await page.getByRole('link', { name: /ACME-WMS/i }).first().click();
    await expect(page).toHaveURL(/\/portal\/projects\/[a-f0-9-]+/);

    // Requirements submitted by the client render in the portal.
    await expect(page.getByText(/Requirements & Milestone Scope/i)).toBeVisible();
  });

  test('client can visit invoices and payments page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('client@acmecorp.local');
    await page.getByLabel(/password/i).fill('DeliveryOS123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/projects/);

    await page.getByRole('link', { name: /invoices & payments/i }).click();
    await expect(page).toHaveURL(/\/portal\/invoices/);
  });

  test('a second client organization never sees another orgs requirements', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('client@starlightretail.local');
    await page.getByLabel(/password/i).fill('DeliveryOS123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/projects/);

    // Starlight has its own project, not ACME.
    await expect(page.getByText(/ACME/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /STAR-ECOMM|Starlight/i }).first()).toBeVisible();
  });
});