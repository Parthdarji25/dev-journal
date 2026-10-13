import { defineConfig } from '@playwright/test';

/*
 * Runs against the static export served from out/ (port 4400) plus the
 * artifacts site from artifacts-out/ (port 4401), both served by global-setup.ts. scripts/e2e.ts builds the
 * site twice: with the real (empty) content for the "empty" project and with
 * CONTENT_DIR=tests/fixtures/content for "fixtures". Tests in shared/ run in both.
 */
const channel = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : 'chrome');

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4400',
    channel,
    trace: 'retain-on-failure',
  },
  projects: [
    // The admin suite mocks GitHub entirely, so it runs once, with the real (empty) content.
    { name: 'empty', testMatch: /(empty|shared|admin)[\\/].*\.spec\.ts/ },
    { name: 'fixtures', testMatch: /(fixtures|shared)[\\/].*\.spec\.ts/ },
  ],
  globalSetup: './tests/e2e/global-setup.ts',
});
