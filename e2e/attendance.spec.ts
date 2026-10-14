import { expect, test } from '@playwright/test';
import { firstUnmarkedId, openPage, openSidebarIfHidden, signInAs, signOut, toast } from './helpers';

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

test.describe('which day can be marked', () => {
  test('a supervisor can only mark today: no date picker, and the page is for today', async ({ page }) => {
    await signInAs(page, 'Supervisor');
    await openPage(page, 'Mark attendance');
    await expect(page.getByTestId('fixed-date')).toContainText('Today');
    await expect(page.getByTestId('input-date')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /previous day/i })).toHaveCount(0);
  });

  test('a supervisor cannot reach an earlier day by other means either', async ({ page }) => {
    await signInAs(page, 'Supervisor');
    await openPage(page, 'Mark attendance');
    // Even a direct write for yesterday is refused by the (demo copy of the) database rule.
    const refused = await page.evaluate(async () => {
      const db = (window as any).__demoDb;
      const sup = db.users.find((u: any) => u.role === 'supervisor');
      const worker = db.workers.find((w: any) => w.site_id === sup.site_id);
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const path = '/src/lib/supabase.ts';
      const { supabase } = await import(/* @vite-ignore */ path);
      const { error } = await supabase.from('attendance').insert({ worker_id: worker.id, date: yesterday, status: 'Present', marked_by: sup.id, worker_type: 'casual' });
      return !!error;
    });
    expect(refused).toBe(true);
  });

  test('HR and the system manager can step back and mark an earlier day', async ({ page }) => {
    for (const role of ['HR Manager', 'System Manager'] as const) {
      await signInAs(page, role);
      await openPage(page, 'Mark attendance');
      await expect(page.getByTestId('input-date')).toBeVisible();
      await page.getByRole('button', { name: /previous day/i }).click();
      const id = await firstUnmarkedId(page);
      await page.getByTestId(`button-present-${id}`).click();
      await page.getByRole('alertdialog').getByRole('button', { name: /mark present/i }).click();
      await expect(toast(page, 'Attendance recorded')).toBeVisible();
      await expect(page.getByTestId(`worker-row-${id}`).getByText('Present')).toBeVisible();
      await signOut(page);
    }
  });

  test('the CEO is read-only for attendance: no marking page, only the records', async ({ page }) => {
    await signInAs(page, 'CEO');
    await expect(page.getByRole('link', { name: 'Mark attendance', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Attendance records', exact: true })).toBeVisible();
    await page.goto('/attendance');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test('a secretary is also limited to today', async ({ page }) => {
    await signInAs(page, 'Secretary');
    await openPage(page, 'Mark attendance');
    await expect(page.getByTestId('fixed-date')).toContainText('Today');
    await expect(page.getByTestId('input-date')).toHaveCount(0);
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
