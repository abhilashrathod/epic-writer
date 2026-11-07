import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // One worker: every spec shares the e2e database.
  workers: 1,
  fullyParallel: false,
  // The dev server compiles each route on first request, which can outlast the 5s default.
  expect: { timeout: 15_000 },
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    // The smoke test runs first: it expects the freshly emptied database.
    { name: 'smoke', testMatch: 'smoke.spec.ts', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium',
      testIgnore: 'smoke.spec.ts',
      dependencies: ['smoke'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Uses the app's .next folder, so stop `pnpm dev` before running e2e.
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Throwaway values: auth is bypassed in test mode and nothing is encrypted.
    env: {
      E2E_AUTH_BYPASS: '1',
      MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://localhost:27018/?replicaSet=rs0',
      MONGODB_DB: 'epic-writer-e2e',
      AUTH_SECRET: 'e2e-only-placeholder-value-not-used-for-anything',
      AUTH_GITHUB_ID: 'e2e',
      AUTH_GITHUB_SECRET: 'e2e',
      ALLOWED_GITHUB_LOGIN: 'e2e-user',
      KEY_ENCRYPTION_SECRET: Buffer.alloc(32).toString('base64'),
    },
  },
});
