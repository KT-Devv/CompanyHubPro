import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive the real UI in demo mode (in-memory sample data, no
// database), so they run anywhere, in CI included, with no secrets.
//
//   npx playwright install chromium     (once)
//   npm run test:e2e
//
// To use a browser that is already installed instead of downloading one:
//   PW_CHANNEL=msedge npm run test:e2e      (or chrome)
const port = 5174;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined } },
    // The field apps run on phones: attendance has to work at this size too.
    { name: 'phone', testMatch: /attendance|offline/, use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL || undefined } },
  ],
  webServer: {
    command: `npm run dev:demo -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
