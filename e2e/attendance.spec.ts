import { expect, test } from '@playwright/test';
import { firstUnmarkedId, openPage, openSidebarIfHidden, signInAs, toast } from './helpers';

test.describe('marking attendance', () => {
  test('a supervisor marks a worker present and the row locks', async ({ page }) => {
    await signInAs(page, 'Supervisor');
    await openPage(page, 'Mark attendance');
    const id = await firstUnmarkedId(page);
    const row = page.getByTestId(`worker-row-${id}`);
    await page.getByTestId(`button-present-${id}`).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /mark present/i }).click();
    await expect(toast(page, 'Attendance recorded')).toBeVisible();
    await expect(page.getByTestId(`button-present-${id}`)).toHaveCount(0);
    await expect(row.getByText('Present')).toBeVisible();
  });

  test('marking several at once', async ({ page }) => {
    await signInAs(page, 'Supervisor');
    await openPage(page, 'Mark attendance');
    await page.getByLabel('Select all unmarked workers').check();
    await page.getByTestId('button-mark-selected').click();
    await page.getByRole('alertdialog').getByRole('button', { name: /mark present/i }).click();
    await expect(toast(page, /marked present/)).toBeVisible();
    await expect(page.getByLabel('Select all unmarked workers')).toHaveCount(0);
  });
});

test.describe('working with no signal', () => {
  test('marks made offline are kept, shown as waiting, and sent when the connection returns', async ({ page, context }) => {
    await signInAs(page, 'Supervisor');
    await openPage(page, 'Mark attendance');
    const id = await firstUnmarkedId(page);

    await context.setOffline(true);
    await expect(page.getByTestId('sync-status')).toContainText(/offline/i);

    await page.getByTestId(`button-present-${id}`).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /mark present/i }).click();

    await expect(toast(page, 'Saved on this phone')).toBeVisible();
    await expect(page.getByTestId(`queued-${id}`)).toContainText(/waiting to sync/i);
    await expect(page.getByTestId('sync-status')).toContainText(/1 attendance mark saved/i);

    await context.setOffline(false);
    await expect(toast(page, 'Attendance synced')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(`queued-${id}`)).toHaveCount(0);
    await expect(page.getByTestId('sync-status')).toHaveCount(0);
  });

  test('signing out with unsent marks warns first', async ({ page, context }) => {
    await signInAs(page, 'Supervisor');
    await openPage(page, 'Mark attendance');
    const id = await firstUnmarkedId(page);
    await context.setOffline(true);
    await page.getByTestId(`button-present-${id}`).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /mark present/i }).click();
    await expect(page.getByTestId(`queued-${id}`)).toBeVisible();

    await openSidebarIfHidden(page);
    await page.getByTestId('button-user-menu').click();
    await page.getByTestId('button-logout').click();
    await expect(page.getByRole('alertdialog')).toContainText(/still saved only on this phone/i);
    await page.getByRole('alertdialog').getByRole('button', { name: /cancel/i }).click();
    await expect(page.getByTestId('button-sidebar-toggle')).toBeVisible();
    await expect(page.getByTestId(`queued-${id}`)).toBeVisible();
  });
});
