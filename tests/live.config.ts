import { defineConfig } from '@playwright/test'

/**
 * Live-production config — runs live-e2e.spec.ts against the deployed app.
 * No webServer; auth is a direct sign-in per run (never touches the
 * localhost storageState cache).
 *
 *   npx playwright test --config tests/live.config.ts
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/live-e2e.spec.ts',
  timeout: 300_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'https://octolens-clone.app.space',
    headless: true,
  },
})
