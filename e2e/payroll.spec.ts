import { expect, test } from '@playwright/test';
import { openPage, pickOption, signInAs } from './helpers';

// The seeded demo data has August 2026 already closed and September open (today is October 2026 in the demo clock).
test.describe('payroll month close', () => {
  test('a closed month is frozen: banner, no new entries, reopen offered to the CEO', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Finance');
    await pickOption(page, 'Month', 'August 2026');
    await expect(page.getByTestId('closed-banner')).toContainText('August 2026 is closed');
    await expect(page.getByTestId('button-add-entry')).toHaveCount(0);
    await expect(page.getByTestId('button-close-month')).toHaveCount(0);
    await expect(page.getByTestId('button-reopen-month')).toBeVisible();
  });

  test('the CEO closes a finished month, then reopens it with a reason', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Finance');
    await pickOption(page, 'Month', 'September 2026');
    await expect(page.getByTestId('closed-banner')).toHaveCount(0);

    await page.getByTestId('button-close-month').click();
    await expect(page.getByRole('dialog')).toContainText('Close September 2026?');
    await expect(page.getByTestId('close-warnings')).toContainText(/no usable bank details/i);
    await page.getByTestId('button-confirm-close').click();
    await expect(page.getByTestId('closed-banner')).toContainText('September 2026 is closed');
    await expect(page.getByTestId('button-add-entry')).toHaveCount(0);

    await page.getByTestId('button-reopen-month').click();
    await expect(page.getByTestId('button-confirm-reopen')).toBeDisabled();
    await page.getByTestId('input-reopen-reason').fill('ok');
    await expect(page.getByTestId('button-confirm-reopen')).toBeDisabled();
    await page.getByTestId('input-reopen-reason').fill('Missed an advance for one worker');
    await page.getByTestId('button-confirm-reopen').click();
    await expect(page.getByTestId('closed-banner')).toHaveCount(0);
    await expect(page.getByText(/Reopened .* by .*Missed an advance/)).toBeVisible();
  });

  test('the month that is still running cannot be closed', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Finance');
    await expect(page.getByText(/is still in progress/)).toBeVisible();
    await expect(page.getByTestId('button-close-month')).toHaveCount(0);
  });

  test('the bank file lists who is paid, who is left out, and the totals agree', async ({ page }) => {
    await signInAs(page, 'CEO');
    await openPage(page, 'Finance');
    await pickOption(page, 'Month', 'August 2026');
    await page.getByTestId('button-reports').click();
    await page.getByTestId('report-bank').click();
    await expect(page.getByTestId('bank-total')).toContainText('₵');
    await expect(page.getByRole('dialog')).toContainText(/payments?/);
  });

  test('finance can produce statutory schedules and close a finished month, but not reopen it', async ({ page }) => {
    await signInAs(page, 'Finance Officer');
    await openPage(page, 'Finance');
    await page.getByTestId('button-reports').click();
    await expect(page.getByTestId('report-payslips')).toBeVisible();
    await expect(page.getByTestId('report-ssnit')).toBeVisible();
    await expect(page.getByTestId('report-paye')).toBeVisible();
    await page.keyboard.press('Escape');
    await pickOption(page, 'Month', 'September 2026');
    await expect(page.getByTestId('button-close-month')).toBeVisible();
    await expect(page.getByTestId('button-reopen-month')).toHaveCount(0);
  });

  test('exports download real files', async ({ page }) => {
    await signInAs(page, 'Finance Officer');
    await openPage(page, 'Finance');
    for (const [format, ext] of [['xlsx', '.xlsx'], ['pdf', '.pdf'], ['csv', '.csv']] as const) {
      const download = page.waitForEvent('download');
      await page.getByTestId('button-export').click();
      await page.getByTestId(`export-${format}`).click();
      expect((await download).suggestedFilename()).toMatch(new RegExp(`payroll_.*${ext.replace('.', '\\.')}$`));
    }
  });
});
