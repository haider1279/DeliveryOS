import { test, expect } from '@playwright/test';

test.describe('Client portal coverage', () => {
  test('client logs in and visits projects page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider6.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Client#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/projects/);
  });

  test('client can visit invoices and payments page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider6.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Client#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/projects/);

    await page.getByRole('link', { name: /invoices & payments/i }).click();
    await expect(page).toHaveURL(/\/portal\/invoices/);
  });
});