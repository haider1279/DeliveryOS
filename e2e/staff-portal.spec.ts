import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill('DeliveryOS123!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
}

test.describe('Staff portal coverage', () => {
  test('developer sees My Work and a project workspace', async ({ page }) => {
    await login(page, 'dev@deliveryos.local');

    await page.getByRole('link', { name: /^My Work$/i }).click();
    await expect(page).toHaveURL(/\/app\/my-work/);

    await page.getByRole('link', { name: /^Projects$/i }).click();
    await expect(page).toHaveURL(/\/app\/projects/);

    // Open the ACME-WMS project and verify its workspace renders.
    await page.getByRole('link', { name: /ACME-WMS/i }).first().click();
    await expect(page).toHaveURL(/\/app\/projects\//);
  });

  test('project manager can open every workspace tab', async ({ page }) => {
    await login(page, 'pm@deliveryos.local');

    await page.getByRole('link', { name: /^Projects$/i }).click();
    await page.getByRole('link', { name: /ACME-WMS/i }).first().click();
    await expect(page).toHaveURL(/\/app\/projects\//);

    const tabs = ['requirements', 'tasks', 'qa', 'releases', 'finance', 'activity'];
    for (const tab of tabs) {
      await page.goto(new URL(page.url()).pathname + `?tab=${tab}`);
      // The tab headings are rendered by the workspace; just confirm no crash.
      await expect(page.locator('main')).toBeVisible();
    }

    // Requirements tab shows the scoped requirements.
    await page.goto(new URL(page.url()).pathname + '?tab=requirements');
    await expect(page.getByText(/Scoped Requirements/i)).toBeVisible();
  });

  test('QA user can open the QA workspace and see test cases', async ({ page }) => {
    await login(page, 'qa@deliveryos.local');

    await page.getByRole('link', { name: /QA & Bugs/i }).click();
    await expect(page).toHaveURL(/\/app\/qa/);
    await expect(page.getByText(/Test Cases/i).first()).toBeVisible();
  });

  test('admin sees Team, Audit Log, Invoices, and Reports navigation', async ({ page }) => {
    await login(page, 'admin@deliveryos.local');

    await page.getByRole('link', { name: /^Team$/i }).click();
    await expect(page).toHaveURL(/\/app\/users/);

    await page.getByRole('link', { name: /Audit Log/i }).click();
    await expect(page).toHaveURL(/\/app\/audit/);

    await page.getByRole('link', { name: /Invoices & Billing/i }).click();
    await expect(page).toHaveURL(/\/app\/invoices/);

    await page.getByRole('link', { name: /^Reports$/i }).click();
    await expect(page).toHaveURL(/\/app\/reports/);
  });

  test('PM does not see admin-only navigation (Team / Audit Log)', async ({ page }) => {
    await login(page, 'pm@deliveryos.local');
    await expect(page.getByRole('link', { name: /^Team$/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Audit Log/i })).not.toBeVisible();
  });
});