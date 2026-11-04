import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 12000 },
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'msedge',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
