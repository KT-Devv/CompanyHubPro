import { chromium, type FullConfig } from '@playwright/test';

// The dev server compiles each page the first time anyone opens it. With several
// browsers starting at once that cold start can outlast a test's patience and
// look like a bug. Visit every page once, first, so the tests measure the app.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto('/login');
    await page.getByRole('button', { name: 'CEO', exact: true }).click();
    await page.getByTestId('button-sidebar-toggle').waitFor({ timeout: 60_000 });
    const hrefs = await page.locator('[data-sidebar=content] a').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    for (const href of [...hrefs, '/attendance']) {
      await page.goto(href);
      await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
    }
  } finally {
    await browser.close();
  }
}
