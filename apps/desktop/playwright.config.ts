import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm exec vite build && pnpm exec vite preview --port 5173',
    port: 5173,
    reuseExistingServer: true,
  },
});
