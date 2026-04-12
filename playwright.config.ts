import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Electron singleton per test-file — must run serially
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/playwright-report', open: 'never' as const }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
})
