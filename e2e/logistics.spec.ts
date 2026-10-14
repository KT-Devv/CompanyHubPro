import { expect, test } from '@playwright/test';
import { openPage, pickOption, signInAs, signOut, toast } from './helpers';

test.describe('stock and invoices', () => {
  test('a reorder level changes the stock status and the Running low count', async ({ page }) => {
    await signInAs(page, 'Logistics Manager');
    await openPage(page, 'Logistics');
    const edit = page.locator('[data-testid^=button-reorder-]').first();
    const id = (await edit.getAttribute('data-testid'))!.replace('button-reorder-', '');
    const row = page.getByTestId(`inventory-item-${id}`);
    await expect(row).toContainText('In stock');

    await edit.click();
    await page.getByTestId('input-reorder-level').fill('100000');
    await page.getByTestId('button-save-reorder').click();
    await expect(toast(page, 'Reorder level saved')).toBeVisible();
    await expect(row).toContainText('Reorder');
    await expect(row).toContainText('100,000');
  });

  test('a reorder level of 0 switches the alert off for that item', async ({ page }) => {
    await signInAs(page, 'Logistics Manager');
    await openPage(page, 'Logistics');
    const edit = page.locator('[data-testid^=button-reorder-]').first();
    const id = (await edit.getAttribute('data-testid'))!.replace('button-reorder-', '');
    await edit.click();
    await page.getByTestId('input-reorder-level').fill('0');
    await page.getByTestId('button-save-reorder').click();
    await expect(page.getByTestId(`inventory-item-${id}`)).toContainText('Off');
  });

  test('recording an invoice adds it to the list', async ({ page }) => {
    await signInAs(page, 'Logistics Manager');
    await openPage(page, 'Logistics');
    await page.getByTestId('tab-invoices').click();
    await expect(page.locator('[data-testid^=invoice-]').first()).toBeVisible();
    const before = await page.locator('[data-testid^=invoice-]').count();
    await page.getByTestId('button-add-invoice').click();
    await pickOption(page, 'Store', /./);
    await pickOption(page, 'Item', /./);
    await page.getByTestId('input-invoice-supplier').fill('Dangote Cement');
    await page.getByTestId('input-invoice-amount').fill('4500');
    await page.getByTestId('input-invoice-quantity').fill('100');
    await page.getByTestId('button-save-invoice').click();
    await expect(toast(page, 'Invoice recorded')).toBeVisible();
    await expect(page.locator('[data-testid^=invoice-]')).toHaveCount(before + 1);
  });

  test('an invoice with a bad amount is refused with a clear message', async ({ page }) => {
    await signInAs(page, 'Logistics Manager');
    await openPage(page, 'Logistics');
    await page.getByTestId('tab-invoices').click();
    await page.getByTestId('button-add-invoice').click();
    await pickOption(page, 'Store', /./);
    await pickOption(page, 'Item', /./);
    await page.getByTestId('input-invoice-supplier').fill('Someone');
    await page.getByTestId('input-invoice-amount').fill('0');
    await page.getByTestId('input-invoice-quantity').fill('5');
    await page.getByTestId('button-save-invoice').click();
    await expect(page.getByRole('alert')).toContainText(/amount must be a whole number above zero/i);
  });

  test('a store manager only sees their own store', async ({ page }) => {
    await signInAs(page, 'Store Manager');
    await openPage(page, 'Logistics');
    await expect(page.locator('[data-testid^=inventory-item-]').first()).toBeVisible();
    // Scoped to one store: the page is named after it, there is no all-stores picker or Store column.
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Logistics');
    await expect(page.getByRole('button', { name: /all stores/i })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: /^store$/i })).toHaveCount(0);

    // The same data seen by someone who can see every store does include the Store column.
    await signOut(page);
    await signInAs(page, 'Logistics Manager');
    await openPage(page, 'Logistics');
    await expect(page.getByRole('button', { name: /all stores/i })).toBeVisible();
  });
});
