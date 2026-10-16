import { expect, test } from '@playwright/test';
import { THEMES, openMap, settle } from './helpers';

// Screenshots of every theme and view, compared with the ones in
// e2e/screenshots/. Run in the Playwright container (`bun run test:browser`)
// so fonts and rendering match CI; refresh them with
// `bun run test:browser -- --update-snapshots` after an intended change.

const VIEWS = ['focus', 'all'];

for (const theme of THEMES) {
  for (const view of VIEWS) {
    test(`${theme} theme, ${view === 'all' ? 'overview' : 'focus mode'}`, async ({ page }) => {
      await openMap(page, `theme=${theme}&view=${view}&instant`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveScreenshot(`${theme}-${view}.png`);
    });
  }
}

test('a branch in focus', async ({ page }) => {
  await openMap(page, 'focus=build&instant');
  await settle(page);
  await expect(page).toHaveScreenshot('build-focus.png');
});

test('long and non-Latin labels', async ({ page }) => {
  await openMap(page, 'sample=languages&instant');
  await expect(page).toHaveScreenshot('languages.png');
});

test('names inside planets that count more children than they show', async ({ page }, testInfo) => {
  // The size the website draws the large map at: names on two lines rise above the "+N" on their planet.
  if (testInfo.project.name === 'desktop') {
    await page.setViewportSize({ width: 1100, height: 560 });
  }

  await openMap(page, 'sample=library&instant');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('library.png');
});

test('statuses and checklists', async ({ page }) => {
  await openMap(page, 'sample=team&instant');
  await expect(page).toHaveScreenshot('team.png');
});

test('the detail sheet', async ({ page }) => {
  await openMap(page, 'focus=discovery&instant');
  await page.getByRole('button', { name: 'Read note' }).click();
  await expect(page.locator('dialog.orbit-sheet[open]')).toBeVisible();
  await expect(page).toHaveScreenshot('detail-sheet.png');
});
