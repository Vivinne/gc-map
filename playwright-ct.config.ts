/*
 * Component tests (layer 2): one module at a time in a real browser, driven by fake data and fake presses.
 * Test files sit next to their module as *.ct.tsx. Run: npm run ct.
 */
import { defineConfig, devices } from '@playwright/experimental-ct-react';

const launchOptions = {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};

export default defineConfig({
  testDir: 'src',
  testMatch: '**/*.ct.tsx',
  outputDir: 'test-results/ct',
  snapshotPathTemplate: '{testDir}/{testFileDir}/__snapshots__/{arg}{ext}',
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/ct.json' }]],
  use: { ctPort: 3100, launchOptions },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['iPhone 14 Pro'], defaultBrowserType: 'chromium' } },
  ],
});
