import { test, expect } from '@playwright/test';

async function login(page: import('@playwright/test').Page, email: string, pass: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(pass);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
}

test.describe('Staff portal coverage', () => {
  test('developer sees assigned work on the dashboard and Projects navigation', async ({ page }) => {
    await login(page, 'haider7.euroshub@gmail.com', 'Developer#2026!DeliveryOS');

    await expect(page.getByRole('heading', { name: /My Assigned Work/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^My Work$/i })).not.toBeVisible();

    await page.getByRole('link', { name: /^Projects$/i }).click();
    await expect(page).toHaveURL(/\/app\/projects/);

    // QA & Bugs link is hidden for developer
    await expect(page.getByRole('link', { name: /QA & Bugs/i })).not.toBeVisible();
  });

  test('QA user can open the QA workspace', async ({ page }) => {
    await login(page, 'haider5.euroshub@gmail.com', 'QA#2026!DeliveryOS');

    await page.getByRole('link', { name: /QA & Bugs/i }).click();
    await expect(page).toHaveURL(/\/app\/qa/);
    await expect(page.getByRole('heading', { name: /QA & Bug Tracker/i })).toBeVisible();
  });

  test('admin sees People navigation with separate Team and Clients pages', async ({ page }) => {
    await login(page, 'haider2.euroshub@gmail.com', 'Admin#2026!DeliveryOS');

    const peopleToggle = page.getByRole('button', { name: /^People$/i });
    await expect(peopleToggle).toBeVisible();
    await expect(peopleToggle).toHaveAttribute('aria-expanded', 'true');

    const teamLink = page.getByRole('navigation').getByRole('link', { name: /^Team$/i });
    const clientsLink = page.getByRole('navigation').getByRole('link', { name: /^Clients$/i });
    await expect(teamLink).toBeVisible();
    await expect(clientsLink).toBeVisible();

    await teamLink.click();
    await expect(page).toHaveURL(/\/app\/users/);
    await expect(page.getByRole('heading', { name: /^Team$/i, level: 2 })).toBeVisible();
    await expect(page.getByText('haider2.euroshub@gmail.com', { exact: true })).toBeVisible();
    await expect(page.getByText('haider6.euroshub@gmail.com', { exact: true })).not.toBeVisible();

    await clientsLink.click();
    await expect(page).toHaveURL(/\/app\/clients/);
    await expect(page.getByRole('heading', { name: /^Clients$/i, level: 2 })).toBeVisible();
    await expect(page.getByText('haider6.euroshub@gmail.com', { exact: true })).toBeVisible();
    await expect(page.getByText('haider2.euroshub@gmail.com', { exact: true })).not.toBeVisible();

    await page.getByRole('link', { name: /Audit Log/i }).click();
    await expect(page).toHaveURL(/\/app\/audit/);

    await page.getByRole('link', { name: /Invoices & Billing/i }).click();
    await expect(page).toHaveURL(/\/app\/invoices/);

    await page.getByRole('link', { name: /^Reports$/i }).click();
    await expect(page).toHaveURL(/\/app\/reports/);
  });

  test('super admin sees the same People navigation', async ({ page }) => {
    await login(page, 'haider1.euroshub@gmail.com', 'SuperAdmin#2026!DeliveryOS');

    await expect(page.getByRole('button', { name: /^People$/i })).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: /^Team$/i }).click();
    await expect(page).toHaveURL(/\/app\/users/);
    await expect(page.getByRole('heading', { name: /^Team$/i, level: 2 })).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: /^Clients$/i }).click();
    await expect(page).toHaveURL(/\/app\/clients/);
    await expect(page.getByRole('heading', { name: /^Clients$/i, level: 2 })).toBeVisible();
  });


  test('PM does not see admin-only People navigation (Team / Clients / Audit Log)', async ({ page }) => {
    await login(page, 'haider8.euroshub@gmail.com', 'ProjectManager#2026!DeliveryOS');
    await expect(page.getByRole('button', { name: /^People$/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /^Team$/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /^Clients$/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Audit Log/i })).not.toBeVisible();
  });

  test('BD sees Leads navigation and CRM dashboard', async ({ page }) => {
    await login(page, 'haider4.euroshub@gmail.com', 'BD#2026!DeliveryOS');
    const leadsNav = page.getByRole('navigation').getByRole('link', { name: /Clients & Leads/i });
    await expect(leadsNav).toBeVisible();
    await leadsNav.click();
    await expect(page).toHaveURL(/\/app\/leads/);
    await expect(page.getByText(/Manage the client acquisition pipeline/i)).toBeVisible();
  });
});