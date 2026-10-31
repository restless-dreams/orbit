import { cpus } from 'node:os';
import { defineConfig, devices } from '@playwright/test';

/**
 * The most browsers a run opens at once, outside CI. Playwright's default
 * is half the cores: twelve on a 24-core machine, where Firefox crashed
 * ("Target crashed") while the machine was busy with other work. All four
 * projects passed with three, run after run, under the same load. CI keeps
 * Playwright's default, and so does any machine where half its cores are
 * three or fewer; `--workers` still overrides it.
 */
const MOST_WORKERS = 3;

/**
 * Browser tests for how the map feels (spinning, zooming, navigating) and
 * looks (screenshots of every theme and view). Run them in the Playwright
 * container so screenshots match CI: `bun run test:browser`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: !process.env.CI && Math.floor(cpus().length / 2) > MOST_WORKERS ? MOST_WORKERS : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/screenshots/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    // How the map works in Firefox and Safari's engine: everything but the screenshots, which are Chromium's.
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } }, testIgnore: '**/visual.spec.ts' },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } }, testIgnore: '**/visual.spec.ts' },
  ],
  webServer: {
    command: 'node e2e/serve.mjs 4174',
    url: 'http://localhost:4174/fixture.html',
    reuseExistingServer: !process.env.CI,
  },
});
