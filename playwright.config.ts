import { defineConfig, devices } from '@playwright/test';

// Allow overriding the target URL/port via env so the real-API spec can
// point at a long-running standalone server (e.g. port 3217) instead of
// having Playwright spin up its own `pnpm dev` instance.
const PLAYWRIGHT_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002';

const useStandaloneServer = !!process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // When PLAYWRIGHT_BASE_URL is set we assume a server is already running
  // (e.g. the standalone build on port 3217) and skip the webServer block
  // entirely. Otherwise fall back to the dev/CI behaviour.
  ...(useStandaloneServer
    ? {}
    : {
        webServer: {
          command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
          url: PLAYWRIGHT_BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { PORT: '3002', NEXT_PUBLIC_Nova_EDITOR_ENABLED: 'true' },
        },
      }),
});
