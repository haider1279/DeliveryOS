import { test, expect } from '@playwright/test';

test.describe.serial('DeliveryOS Full Role-Based E2E Lifecycle', () => {
  const timestamp = Date.now();
  const orgName = `Apex Corp ${timestamp}`;
  const projectCode = `APX${(timestamp % 10000).toString().padStart(4, '0')}`;
  const projectName = `Apex Delivery ${timestamp}`;

  test('Step 1: BD logs in and creates a prospect organization', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider4.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('BD#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    const leadsLink = page.getByRole('navigation').getByRole('link', { name: /Clients & Leads/i });
    await leadsLink.click();
    await expect(page).toHaveURL(/\/app\/leads/);

    // Open Add Prospect Modal
    await page.getByRole('button', { name: /Add Prospect/i }).click();
    await page.locator('input[placeholder="e.g. Acme Startup Inc."]').fill(orgName);
    await page.locator('input[placeholder="contact@company.com"]').fill(`contact-${timestamp}@apexcorp.com`);
    await page.getByRole('button', { name: /Add to Pipeline/i }).click();

    // Wait for prospect card heading to be visible in the cards grid
    const cardHeading = page.getByRole('heading', { name: orgName, exact: true });
    await expect(cardHeading).toBeVisible();

    // Verify BD cannot approve the prospect (Approve button is not visible for BD)
    const card = page.locator('div.group').filter({ has: cardHeading });
    await expect(card.getByRole('button', { name: /Approve/i })).not.toBeVisible();
  });

  test('Step 2: Admin logs in, approves the prospect organization, and creates a project for PM', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider2.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Admin#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    // Admin approves the prospect lead
    const leadsLink = page.getByRole('navigation').getByRole('link', { name: /Clients & Leads/i });
    await leadsLink.click();
    await expect(page).toHaveURL(/\/app\/leads/);

    const cardHeading = page.getByRole('heading', { name: orgName, exact: true });
    await expect(cardHeading).toBeVisible();

    const card = page.locator('div.group').filter({ has: cardHeading });
    await card.getByRole('button', { name: /Approve/i }).click();
    await page.getByRole('button', { name: /Confirm Approval/i }).click();

    // Now create project for approved organization
    await page.getByRole('link', { name: /^Projects$/i }).click();
    await expect(page).toHaveURL(/\/app\/projects/);

    await page.getByRole('button', { name: /New Project/i }).click();
    await page.locator('input[placeholder="e.g. Acme Mobile App V2"]').fill(projectName);
    await page.locator('input[placeholder="e.g. ACM-APP"]').fill(projectCode);
    
    // Select the newly approved organization inside the project creation modal
    const orgSelect = page.locator('form select').first();
    await orgSelect.selectOption({ label: orgName });

    // Select PM
    const pmSelect = page.locator('form select').nth(1);
    await pmSelect.selectOption({ label: 'Haider Project Manager' });

    await page.getByRole('dialog').getByRole('button', { name: /Create Project/i }).click();

    // Verify project appears in the project list for Admin
    await expect(page.getByText(projectName)).toBeVisible();
  });

  test('Step 3: PM logs in and accesses assigned project workspace', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider8.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('ProjectManager#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.getByRole('link', { name: /^Projects$/i }).click();
    await expect(page).toHaveURL(/\/app\/projects/);

    await expect(page.getByText(projectName)).toBeVisible();
    await page.getByRole('link', { name: new RegExp(projectName, 'i') }).click();
    await expect(page).toHaveURL(/\/app\/projects\/[a-f0-9-]+/);
  });

  test('Step 4: Admin logs in and verifies audit logs', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider2.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Admin#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.getByRole('link', { name: /Audit Log/i }).click();
    await expect(page).toHaveURL(/\/app\/audit/);
    await expect(page.getByText(/PROJECT_CREATED|ORGANIZATION_QUALIFIED/i).first()).toBeVisible();
  });

  test('Step 5: Client logs into client portal', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider6.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Client#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/portal\/dashboard/);

    await page.getByRole('link', { name: /Invoices & Payments/i }).click();
    await expect(page).toHaveURL(/\/portal\/invoices/);
  });

  test('Step 6: QA logs in to QA workspace', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider5.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('QA#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.getByRole('link', { name: /QA & Bugs/i }).click();
    await expect(page).toHaveURL(/\/app\/qa/);
    await expect(page.getByRole('heading', { name: /QA & Bug Tracker/i })).toBeVisible();
  });

  test('Step 7: Developer sees assigned work on the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('haider7.euroshub@gmail.com');
    await page.getByLabel(/password/i).fill('Developer#2026!DeliveryOS');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await expect(page.getByRole('heading', { name: /My Assigned Work/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^My Work$/i })).not.toBeVisible();
  });
});

