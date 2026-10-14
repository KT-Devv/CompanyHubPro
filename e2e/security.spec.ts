import { expect, test } from '@playwright/test';
import { enrolAuthenticator, openPage, signInAs, signInAsGated, signOut, toast } from './helpers';

test.describe('two-step sign-in', () => {
  test('enrolling rejects a wrong code and accepts the right one', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Security');
    await expect(page.getByTestId('mfa-status')).toContainText('Not set up');
    await page.getByTestId('button-mfa-setup').click();
    await expect(page.getByTestId('mfa-secret')).toBeVisible();

    await page.getByTestId('input-mfa-code').fill('000000');
    await page.getByTestId('button-mfa-enroll-verify').click();
    await expect(page.getByRole('alert')).toContainText(/not right/i);

    await enrolAuthenticator(page);
    await expect(page.getByTestId('mfa-status')).toContainText('is on for your account');
  });

  test('the CEO can require it, and then Finance cannot see anything until they enrol', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Security');
    // Cannot require it before having set up their own, so they cannot lock themselves out.
    await expect(page.getByTestId('switch-require-mfa')).toBeDisabled();

    await page.getByTestId('button-mfa-setup').click();
    await enrolAuthenticator(page);
    await expect(page.getByTestId('switch-require-mfa')).toBeEnabled();
    await page.getByTestId('switch-require-mfa').click();
    await expect(toast(page, 'Two-step sign-in is now required')).toBeVisible();

    await signOut(page);
    await signInAsGated(page, 'Finance Officer');
    await expect(page.getByRole('heading', { name: 'Set up two-step sign-in' })).toBeVisible();
    await expect(page.getByTestId('button-sidebar-toggle')).toHaveCount(0);

    await enrolAuthenticator(page);
    await expect(page.getByTestId('button-sidebar-toggle')).toBeVisible();
    await openPage(page, 'Finance');
    await expect(page.locator('[data-testid^=payroll-row-]').first()).toBeVisible();
  });

  test('roles outside the privileged set are never gated', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Security');
    await page.getByTestId('button-mfa-setup').click();
    await enrolAuthenticator(page);
    await page.getByTestId('switch-require-mfa').click();
    await expect(toast(page, 'Two-step sign-in is now required')).toBeVisible();
    await signOut(page);
    await signInAs(page, 'Supervisor');
    await expect(page.getByRole('heading', { name: /two-step/i })).toHaveCount(0);
  });
});
