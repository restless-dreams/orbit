import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mapState, openMap, settle } from './helpers';

/**
 * Where keyboard focus is: a node's id, a button's name, or `body` when it
 * has dropped onto the page, off the map's keys. Tests wait for it to get
 * where it goes: a closing dialog gives focus back in its `close` event, a
 * task after it has closed.
 */
const focused = (page: Page): Promise<string> => {
  return page.evaluate(() => {
    let active = document.activeElement;

    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }

    if (!active || active === document.body) {
      return 'body';
    }

    return active.getAttribute('data-orbit-node-id') ?? active.getAttribute('aria-label') ?? active.textContent?.trim() ?? active.tagName;
  });
};

const setLanguage = (page: Page, language: string): Promise<void> => {
  return page.evaluate((tag) => {
    (window as unknown as { map: { setOptions(options: { language: string }): void } }).map.setOptions({ language: tag });
  }, language);
};

test.describe('keyboard focus stays on the map', () => {
  test('going up from the path, with its first crumb or the back button, puts focus on the idea the map came from, as Escape does', async ({ page }) => {
    await openMap(page, 'focus=build&instant');
    await settle(page);
    // A wide map shows the path; a narrow one, a back button in its place.
    const up = page.locator('.orbit-breadcrumbs__item:not([disabled]):visible, .orbit-back:visible').first();
    await up.focus();
    await page.keyboard.press('Enter');
    await settle(page);
    expect((await mapState(page)).focus).toBe('product-roadmap-2027');
    await expect.poll(() => focused(page)).toBe('build');
  });

  test('a crumb keeps focus while the path is written again', async ({ page, isMobile }) => {
    test.skip(isMobile, 'A narrow map shows a back button instead of the path.');
    await openMap(page, 'focus=build&instant');
    await settle(page);
    await page.locator('.orbit-breadcrumbs__item:not([disabled])').first().focus();
    await setLanguage(page, 'es');
    await expect.poll(() => focused(page)).toBe('Product Roadmap 2027');
  });

  test('a content button keeps focus while the buttons are made again', async ({ page }) => {
    await openMap(page, 'focus=discovery&instant');
    await settle(page);
    await page.getByRole('button', { name: 'Read note' }).focus();
    await setLanguage(page, 'es');
    await expect(page.getByRole('button', { name: 'Leer nota' })).toBeVisible();
    await expect.poll(() => focused(page)).toBe('Leer nota');
  });

  test('the detail sheet gives focus back to the map when the button that opened it was made again', async ({ page }) => {
    await openMap(page, 'focus=discovery&instant');
    await settle(page);
    await page.getByRole('button', { name: 'Read note' }).focus();
    await page.keyboard.press('Enter');
    const sheet = page.locator('dialog.orbit-sheet[open]');
    await expect(sheet).toBeVisible();
    await setLanguage(page, 'es');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => focused(page)).toBe('discovery');
  });

  test('a content button whose idea changes leaves focus on the map', async ({ page }) => {
    await openMap(page, 'focus=discovery&instant');
    await settle(page);
    await page.getByRole('button', { name: 'Read note' }).focus();

    await page.evaluate(() => {
      (window as unknown as { map: { updateNode(id: string, changes: { status: string }): void } }).map.updateNode('discovery', { status: 'done' });
    });

    await settle(page);
    await expect.poll(() => focused(page)).toMatch(/^(Read note|discovery)$/);
  });
});
