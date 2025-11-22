import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  use: {
    headless: true,
    baseURL: process.env.PW_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  timeout: 30 * 1000,
});
