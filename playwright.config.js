// @ts-check
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'https://foodios-rose.vercel.app'

export default defineConfig({
  testDir: './tests',
  // Solo le spec e2e (*.spec.js). Gli unit Vitest (tests/unit/*.test.js) NON
  // devono essere raccolti da Playwright (usano vi.mock / import.meta.env).
  testMatch: '**/*.spec.js',
  globalSetup: './global-setup.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
