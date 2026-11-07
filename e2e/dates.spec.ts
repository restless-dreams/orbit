import { expect, test } from './fixtures';
import { openMap, settle } from './helpers';

// Ideas' dates on a Wednesday morning, on the page's clock: small on their
// planets, the past ones in the attention color unless they're done, in full
// in the outline and the detail sheet.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 18, 10, 0));
});

test('dates on the planets, in the outline and in the detail sheet', async ({ page }) => {
  await openMap(page, 'sample=dates&instant');
  await settle(page);
  await expect(page.locator('.orbit-date')).toHaveText(['6:30 PM', 'Tomorrow', 'Sat', 'Nov 16', 'Nov 14', 'Nov 30', 'Feb 14, 2027']);
  await expect(page.locator('.orbit-date--overdue')).toHaveText(['Nov 16']);

  await page.getByRole('button', { name: 'Show the map as a list' }).click();
  await expect(page.locator('.orbit-outline__date--overdue')).toHaveText('Overdue: Mon, Nov 16');
  await page.getByRole('button', { name: 'Show the map as a list' }).click();

  await page.evaluate(() => (window as unknown as { map: { flyTo(id: string): void } }).map.flyTo('hotel-deposit'));
  await settle(page);
  await page.getByRole('button', { name: 'Read note' }).click();
  await expect(page.locator('dialog.orbit-sheet[open] .orbit-sheet__chip--date .orbit-visually-hidden')).toHaveText('Date: Sat, Nov 21');
});

test.describe('how dates look', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'The screenshots are Chromium’s.');

  for (const theme of ['paper', 'night']) {
    test(`on the planets, ${theme}`, async ({ page }) => {
      await openMap(page, `sample=dates&theme=${theme}&instant`);
      await settle(page);
      await expect(page).toHaveScreenshot(`dates-${theme}.png`);
    });
  }

  test('in the outline and the detail sheet', async ({ page }) => {
    await openMap(page, 'sample=dates&instant');
    await settle(page);
    await page.getByRole('button', { name: 'Show the map as a list' }).click();
    await expect(page).toHaveScreenshot('dates-outline.png');
    await page.getByRole('button', { name: 'Show the map as a list' }).click();

    await page.evaluate(() => (window as unknown as { map: { flyTo(id: string): void } }).map.flyTo('visa-photos'));
    await settle(page);
    await page.getByRole('button', { name: 'Read note' }).click();
    await expect(page.locator('dialog.orbit-sheet[open] .orbit-sheet__chip--overdue')).toHaveText('Overdue: Mon, Nov 16');
    await expect(page).toHaveScreenshot('dates-sheet.png');
  });
});
