import { expect, type Page } from '@playwright/test';

export type RoleButton =
  | 'CEO'
  | 'HR Manager'
  | 'Finance Officer'
  | 'System Manager'
  | 'Project Manager'
  | 'Supervisor'
  | 'Logistics Manager'
  | 'Store Manager'
  | 'Secretary';

// Demo mode: the login page has one button per role. The demo's one-time code
// for two-step sign-in is always 123456.
export const TOTP = '123456';

// Demo data lives in memory, so a page reload resets it. After signing out the
// app is already on /login, so switching person there keeps everything done so far.
export async function openLogin(page: Page) {
  if (!/\/login$/.test(page.url())) await page.goto('/login');
}

export async function signInAs(page: Page, role: RoleButton) {
  await openLogin(page);
  await page.getByRole('button', { name: role, exact: true }).click();
  await expect(page.getByTestId('button-sidebar-toggle')).toBeVisible();
}

// For roles that must pass two-step sign-in: the app shell does not show until they do.
export async function signInAsGated(page: Page, role: RoleButton) {
  await openLogin(page);
  await page.getByRole('button', { name: role, exact: true }).click();
  await expect(page.getByTestId('input-mfa-code')).toBeVisible();
}

// On a phone the sidebar (and the account menu in it) is behind the menu button.
export async function openSidebarIfHidden(page: Page) {
  if (!(await page.getByTestId('button-user-menu').isVisible())) await page.getByTestId('button-sidebar-toggle').click();
}

export async function signOut(page: Page) {
  await openSidebarIfHidden(page);
  await page.getByTestId('button-user-menu').click();
  await page.getByTestId('button-logout').click();
  await expect(page).toHaveURL(/\/login$/);
}

// A link in the sidebar (the phone layout hides it behind the menu button).
export async function openPage(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true }).first();
  if (!(await link.isVisible())) await page.getByTestId('button-sidebar-toggle').click();
  await link.click();
}

export async function navLabels(page: Page): Promise<string[]> {
  if (!(await page.locator('[data-sidebar=content]').first().isVisible())) await page.getByTestId('button-sidebar-toggle').click();
  return page.locator('[data-sidebar=content] a').allInnerTexts();
}

export async function pickOption(page: Page, trigger: string | RegExp, option: string | RegExp) {
  await page.getByLabel(trigger).first().click();
  await page.getByRole('option', { name: option }).first().click();
}

// Completes two-step enrolment from the enrol panel (the demo accepts 123456).
export async function enrolAuthenticator(page: Page) {
  await page.getByTestId('input-mfa-code').fill(TOTP);
  await page.getByTestId('button-mfa-enroll-verify').click();
}

// The first worker still waiting to be marked (earlier tests or the seed may have marked others).
export async function firstUnmarkedId(page: Page): Promise<string> {
  const button = page.locator('[data-testid^=button-present-]').first();
  await expect(button).toBeVisible();
  return (await button.getAttribute('data-testid'))!.replace('button-present-', '');
}

// Toasts render the text twice (visible copy and a screen-reader copy), so match the visible one.
export const toast = (page: Page, text: string | RegExp) => page.locator('li[data-state=open]').getByText(text).first();
