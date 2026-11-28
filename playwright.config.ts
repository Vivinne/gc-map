/*
 * System tests (layer 4) and site-wide quality checks (layer 5): the built site in a real browser.
 * Build first (npm run build), then npm run e2e.
 * npm run e2e: what every deploy runs (core flows, accessibility, shared links); npm run e2e:full adds the
 * long system runs (every state transition, every path with its detours, about 30 minutes), run before going live.
 * SITE_DIR serves another build (e.g. the old version) instead of out/.
 * PW_CHROMIUM: a local Chromium to use where Playwright cannot download its own (the test environment).
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE = process.env.BASE_PATH || '';
const launchOptions = {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  // the map draws with WebGL: software drawing where there is no graphics card
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: `http://localhost:${PORT}${BASE}/`, trace: 'retain-on-failure', launchOptions },
  webServer: { command: `npx tsx scripts/tools/serve.ts ${process.env.SITE_DIR || 'out'} ${PORT} ${BASE}`, port: PORT, reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['iPhone 14 Pro'], defaultBrowserType: 'chromium' } },
  ],
});
