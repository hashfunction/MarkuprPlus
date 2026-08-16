import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  outputDir: './test-results/playwright',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
