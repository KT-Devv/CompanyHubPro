import { expect, test } from '@playwright/test';
import { navLabels, signInAs, signOut, type RoleButton } from './helpers';

// What each role sees in the sidebar. This is the UI half of access control
// (the database enforces the real rules; tests/sql covers those).
const NAV: Record<RoleButton, string[]> = {
  CEO: ['Dashboard', 'Insights', 'Workers', 'Attendance records', 'Transfers', 'Finance', 'Logistics', 'Accounts', 'Audit log', 'Security'],
  'HR Manager': ['Dashboard', 'Insights', 'Workers', 'Mark attendance', 'Attendance records', 'Transfers', 'Finance', 'Logistics', 'Audit log', 'Security'],
  'Finance Officer': ['Dashboard', 'Insights', 'Finance', 'Security'],
  'System Manager': ['Dashboard', 'Insights', 'Workers', 'Mark attendance', 'Attendance records', 'Transfers', 'Finance', 'Logistics', 'Accounts', 'Audit log', 'Security'],
  'Project Manager': ['Dashboard', 'Insights', 'Workers', 'Attendance records', 'Transfers', 'Logistics', 'Security'],
  Supervisor: ['Dashboard', 'Mark attendance', 'Security'],
  'Logistics Manager': ['Dashboard', 'Insights', 'Logistics', 'Security'],
  'Store Manager': ['Dashboard', 'Mark attendance', 'Logistics', 'Security'],
  Secretary: ['Dashboard', 'Mark attendance', 'Security'],
};

for (const [role, expected] of Object.entries(NAV) as [RoleButton, string[]][]) {
  test(`${role} sees exactly their own pages`, async ({ page }) => {
    await signInAs(page, role);
    expect((await navLabels(page)).map((s) => s.trim())).toEqual(expected);
  });
}

test('every page a role can open loads without an error', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', (e) => crashes.push(e.message));
  await signInAs(page, 'CEO');
  const hrefs = await page.locator('[data-sidebar=content] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(5);
  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.getByTestId('button-user-menu')).toBeVisible();
    await expect(page.getByText(/couldn.t load|something went wrong|unexpected problem/i)).toHaveCount(0);
  }
  expect(crashes).toEqual([]);
});

test('a page outside a role sends them home instead of showing it', async ({ page }) => {
  await signInAs(page, 'Supervisor');
  await page.goto('/finance');
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.goto('/accounts');
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/finance');
  await expect(page).toHaveURL(/\/login$/);
});

test('signing out returns to login and the next person starts clean', async ({ page }) => {
  await signInAs(page, 'CEO');
  await signOut(page);
  await signInAs(page, 'Supervisor');
  await expect(page.getByRole('link', { name: 'Accounts', exact: true })).toHaveCount(0);
});

test('no green anywhere in the palette', async ({ page }) => {
  await signInAs(page, 'CEO');
  // Resolve every theme colour the stylesheet defines and reject green hues.
  const greens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const found: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule) || !/^:root|^\.dark/.test(rule.selectorText)) continue;
        for (const name of Array.from(rule.style)) {
          const value = rule.style.getPropertyValue(name).trim();
          const m = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(value); // "H S% L%"
          if (m && name.startsWith('--') && +m[2] > 15 && +m[3] > 8 && +m[3] < 97 && +m[1] >= 75 && +m[1] <= 165) found.push(`${name}: ${value}`);
        }
      }
    }
    void styles;
    return found;
  });
  expect(greens).toEqual([]);
});
