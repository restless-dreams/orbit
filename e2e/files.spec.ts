import { expect, test } from './fixtures';
import { openMap, settle } from './helpers';

// Ideas' files: a paperclip on their planets, with how many from two on, and
// a list in the detail sheet, each with its kind's icon, name, kind and size.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 18, 10, 0));
});

test('files on the planets and in the detail sheet, where pressing one asks the page first', async ({ page }) => {
  await openMap(page, 'sample=files&instant');
  await settle(page);
  await expect(page.locator('.orbit-node__files text')).toHaveText(['3', '2']);
  await expect(page.locator('.orbit-node__files')).toHaveCount(3);
  await expect(page.locator('[data-orbit-node-id="tickets"]')).toHaveAttribute('aria-label', /has 3 files/);

  await page.evaluate(() => (window as unknown as { map: { flyTo(id: string): void } }).map.flyTo('tickets'));
  await settle(page);
  await page.getByRole('button', { name: 'Show files' }).click();
  const sheet = page.locator('dialog.orbit-sheet[open]');
  await expect(sheet.locator('.orbit-sheet__file-name')).toHaveText(['Boarding pass.pdf', 'Train to Sintra.pdf', 'Hotel booking.docx']);
  await expect(sheet.locator('.orbit-sheet__file-facts')).toHaveText(['PDF · 48 kB', 'PDF · 210 kB', 'Document · 1.3 MB']);

  const opened = await page.evaluate(() => new Promise<string>((resolve) => {
    document.getElementById('map')!.addEventListener('orbit-file-open', (event) => {
      event.preventDefault();
      resolve((event as CustomEvent<{ file: { name: string } }>).detail.file.name);
    }, { once: true });

    document.querySelectorAll<HTMLButtonElement>('dialog.orbit-sheet[open] button.orbit-sheet__file')[1].click();
  }));

  expect(opened).toBe('Train to Sintra.pdf');
  await expect(sheet).toBeVisible();
});

test.describe('how files look', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'The screenshots are Chromium’s.');

  for (const theme of ['paper', 'night']) {
    test(`on the planets, ${theme}`, async ({ page }) => {
      await openMap(page, `sample=files&theme=${theme}&instant`);
      await settle(page);
      await expect(page).toHaveScreenshot(`files-${theme}.png`);
    });
  }

  test('in the detail sheet', async ({ page }) => {
    await openMap(page, 'sample=files&instant');
    await settle(page);
    await page.evaluate(() => (window as unknown as { map: { flyTo(id: string): void } }).map.flyTo('tickets'));
    await settle(page);
    await page.getByRole('button', { name: 'Show files' }).click();
    await expect(page.locator('dialog.orbit-sheet[open] .orbit-sheet__file')).toHaveCount(3);
    await expect(page).toHaveScreenshot('files-sheet.png');
  });
});
