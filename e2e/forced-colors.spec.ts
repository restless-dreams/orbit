import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { THEMES, openMap, settle } from './helpers';

/**
 * In forced colors (Windows' contrast themes), the browser paints the page
 * in the reader's few colors, but leaves SVG strokes as the map wrote them:
 * the map has to draw what must show in system colors itself.
 */
test.use({ colorScheme: 'light' });

/** What a CSS system color is on this page, such as `CanvasText` or `Highlight`. */
const systemColor = (page: Page, name: string): Promise<string> => {
  return page.evaluate((color) => {
    const probe = document.createElement('div');
    probe.style.color = color;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);
};

/** The stroke and its opacity of the first element `selector` finds, or null when there's none. */
const strokeOf = (page: Page, selector: string): Promise<{ stroke: string; opacity: string } | null> => {
  return page.evaluate((query) => {
    const element = document.querySelector(query);

    if (!element) {
      return null;
    }

    const style = getComputedStyle(element);
    return { stroke: style.stroke, opacity: style.strokeOpacity };
  }, selector);
};

test.describe('forced colors', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });

  for (const theme of THEMES) {
    test(`${theme}: orbits, lines and the edges of ideas show in the reader's colors`, async ({ page, browserName }) => {
      // WebKit matches the media query but paints nothing in the reader's colors (night keeps its own background), and
      // resolves system colors in each theme's color scheme: a dark theme's GrayText is light.
      test.skip(browserName === 'webkit', 'WebKit matches forced-colors without painting in the reader’s colors.');
      await openMap(page, `focus=discovery&instant&theme=${theme}`);
      await settle(page);
      const text = await systemColor(page, 'CanvasText');
      // A dark theme's rings are light, for its own background, which forced colors takes away.
      expect(await strokeOf(page, '.orbit-ring')).toEqual({ stroke: await systemColor(page, 'GrayText'), opacity: '1' });
      expect((await strokeOf(page, '.orbit-node__shade'))?.stroke).toBe(text);
      expect((await strokeOf(page, '.orbit-node__halo'))?.stroke).toBe(text);
      await openMap(page, `view=all&instant&theme=${theme}`);
      await settle(page);
      expect(await strokeOf(page, '.orbit-link')).toEqual({ stroke: text, opacity: '1' });
    });
  }

  test('the idea and the button with keyboard focus are marked in the highlight color', async ({ page }) => {
    await openMap(page, 'focus=discovery&instant');
    await settle(page);
    const highlight = await systemColor(page, 'Highlight');
    await page.keyboard.press('Tab');
    const ring = page.locator('[data-orbit-node-id="discovery"] .orbit-node__focus-ring');
    await expect(ring).toBeVisible();
    await expect(ring).toHaveCSS('stroke', highlight);
    await expect(ring).toHaveCSS('opacity', '1');

    // Buttons draw their focus as an outline, which forced colors keeps.
    for (const name of ['Read note', 'Zoom in']) {
      const button = page.getByRole('button', { name });
      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();
      await expect(button).toHaveCSS('outline-style', 'solid');
      expect(parseFloat(await button.evaluate((element) => getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2);
    }

    // The view the map is in shows as pressed, which forced colors would otherwise paint like the other.
    await expect(page.locator(".orbit-button[aria-pressed='true']").first()).toHaveCSS('outline-color', highlight);
  });
});
