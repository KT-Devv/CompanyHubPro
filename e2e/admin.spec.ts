import { expect, test } from '@playwright/test';
import { openPage, pickOption, signInAs, signOut, toast } from './helpers';

test.describe('accounts and audit', () => {
  test('a system manager invites someone and cannot hand out the CEO role', async ({ page }) => {
    await signInAs(page, 'System Manager');
    await openPage(page, 'Accounts');
    await expect(page.locator('[data-testid^=account-row-]').first()).toBeVisible();
    const before = await page.locator('[data-testid^=account-row-]').count();

    await page.getByTestId('button-invite').click();
    await page.getByTestId('input-invite-name').fill('Test Person');
    await page.getByTestId('input-invite-email').fill('test.person@example.com');
    await page.getByRole('combobox', { name: 'Role' }).click();
    await expect(page.getByRole('option', { name: 'CEO', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Secretary' }).click();
    await page.getByTestId('button-send-invite').click();
    await expect(toast(page, 'Invitation sent')).toBeVisible();
    await expect(page.locator('[data-testid^=account-row-]')).toHaveCount(before + 1);
  });

  test('a supervisor invite needs a site', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Accounts');
    await page.getByTestId('button-invite').click();
    await page.getByTestId('input-invite-name').fill('Site Person');
    await page.getByTestId('input-invite-email').fill('site.person@example.com');
    await page.getByRole('combobox', { name: 'Role' }).click();
    await page.getByRole('option', { name: 'Supervisor' }).click();
    await expect(page.getByTestId('button-send-invite')).toBeDisabled();
    await pickOption(page, 'Site', /^(?!No site).+/);
    await expect(page.getByTestId('button-send-invite')).toBeEnabled();
  });

  test('switching an account off is allowed for others but not for yourself', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Accounts');
    const own = page.locator('[data-testid^=account-row-]', { hasText: '(you)' });
    await own.getByRole('button', { name: /edit/i }).click();
    await expect(page.getByTestId('switch-active')).toBeDisabled();
    await page.keyboard.press('Escape');

    const other = page.locator('[data-testid^=account-row-]', { hasNotText: '(you)' }).first();
    await other.getByRole('button', { name: /edit/i }).click();
    await expect(page.getByTestId('switch-active')).toBeEnabled();
  });

  test('changes made in the app show up in the audit log with who and what', async ({ page }) => {
    await signInAs(page, 'Logistics Manager');
    await openPage(page, 'Logistics');
    await page.getByTestId('tab-invoices').click();
    await page.getByTestId('button-add-invoice').click();
    await pickOption(page, 'Store', /./);
    await pickOption(page, 'Item', /./);
    await page.getByTestId('input-invoice-supplier').fill('Audit Trail Supplies');
    await page.getByTestId('input-invoice-amount').fill('1200');
    await page.getByTestId('input-invoice-quantity').fill('3');
    await page.getByTestId('button-save-invoice').click();
    await expect(toast(page, 'Invoice recorded')).toBeVisible();

    // Same page, same in-memory data: sign in as someone who can read the log.
    await signOut(page);
    await signInAs(page, 'CEO');
    await openPage(page, 'Audit log');
    const entry = page.locator('[data-testid^=audit-row-]', { hasText: 'Invoices' }).first();
    await expect(entry).toBeVisible();
    await expect(entry).toContainText('Added');
    await expect(entry).toContainText('Nana Ofori');
    await entry.click();
    await expect(page.getByText('Audit Trail Supplies').first()).toBeVisible();
  });

  test('the audit log is closed to roles without a reason to read it', async ({ page }) => {
    await signInAs(page, 'Finance Officer');
    await page.goto('/audit');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });
});
