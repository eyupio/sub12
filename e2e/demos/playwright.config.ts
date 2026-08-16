import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '..', '.env') });

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';

// Managed environments ship a pinned Chromium at $PLAYWRIGHT_BROWSERS_PATH/chromium
// (and block downloads), so prefer it when present rather than requiring the
// revision this Playwright version would download.
const pinnedChromium = process.env.PLAYWRIGHT_BROWSERS_PATH
  ? resolve(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
  : '';
const executablePath = pinnedChromium && existsSync(pinnedChromium) ? pinnedChromium : undefined;

/**
 * Demo recorder config — `npx playwright test --config demos/playwright.config.ts`
 * (or ./scripts/record-demos.sh from the repo root, which also boots the stack).
 *
 * Not part of the e2e test suite: one worker, generous timeouts, video always
 * on, and slowMo so interactions read at human pace on the recording.
 */
export default defineConfig({
  testDir: here,
  testMatch: '**/*.demo.ts',
  outputDir: resolve(here, '..', 'demo-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 300_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    trace: 'off',
    screenshot: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    launchOptions: { slowMo: 120, executablePath },
  },
  projects: [{ name: 'demos' }],
});
