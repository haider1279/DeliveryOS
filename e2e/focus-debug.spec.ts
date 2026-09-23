import { test, expect } from '@playwright/test';

/**
 * Regression tests for BUG 3 — text inputs lost focus after a single character.
 *
 * Root cause: the Modal focus/keydown effect depended on an inline-arrow
 * `onClose` prop whose identity changed on every parent re-render. Typing a
 * character updated parent state, re-rendered the Modal, re-ran the effect, and
 * yanked focus back to the first focusable element — so only one character could
 * be entered before the blinking cursor disappeared.
 *
 * These tests type a multi-character string continuously and assert the full
 * value landed in the field while it stayed focused. They cover plain inputs
 * (login) and modal form inputs (create project), which is where the defect was
 * observed. They must fail if an effect re-focuses the field on each keystroke.
 */
test.describe('BUG 3 — inputs keep focus while typing', () => {
  test('login fields accept continuous typing without re-clicking', async ({ page }) => {
    await page.goto('/login');

    const email = page.getByLabel(/email/i);
    await email.click();
    await page.keyboard.type('admin@deliveryos.local', { delay: 25 });

    // The full value must be present (a focus-stealing bug truncates it to 1).
    await expect(email).toHaveValue('admin@deliveryos.local');
    // And the cursor must still be in the field for the next keystroke.
    await expect(email).toBeFocused();

    const password = page.getByLabel(/password/i);
    await password.click();
    await page.keyboard.type('DeliveryOS123!', { delay: 25 });
    await expect(password).toHaveValue('DeliveryOS123!');
    await expect(password).toBeFocused();
  });

  test('modal form inputs accept continuous typing without re-clicking', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@deliveryos.local');
    await page.getByLabel(/password/i).fill('DeliveryOS123!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.getByRole('link', { name: /^Projects$/i }).click();
    await expect(page).toHaveURL(/\/app\/projects/);
    await page.getByRole('button', { name: /new project/i }).click();

    const nameInput = page.locator('input[placeholder="e.g. Acme Mobile App V2"]');
    await nameInput.click();

    // Type a long string character-by-character; each keystroke triggers a
    // parent re-render. A focus-stealing effect would drop the value to one char.
    await page.keyboard.type('StableFocusCheck', { delay: 30 });
    await expect(nameInput).toHaveValue('StableFocusCheck');
    await expect(nameInput).toBeFocused();

    // The second field in the same modal must also behave.
    const codeInput = page.locator('input[placeholder="e.g. ACM-APP"]');
    await codeInput.click();
    await page.keyboard.type('FOCUS-CHK', { delay: 30 });
    await expect(codeInput).toHaveValue('FOCUS-CHK');
    await expect(codeInput).toBeFocused();
  });
});