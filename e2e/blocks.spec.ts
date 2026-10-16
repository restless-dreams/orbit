import { expect, test } from '@playwright/test';

/** Each block's height, its map's, and its drawing's, in CSS pixels. */
const measure = (page: import('@playwright/test').Page) => page.evaluate(() => {
  return Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>('body > pre, body > div')).map((block) => {
    const map = block.querySelector<HTMLElement>('.orbit');
    const drawing = map?.querySelector<SVGSVGElement>('svg');

    return [block.id, {
      block: Math.round(block.getBoundingClientRect().height),
      map: Math.round(map?.getBoundingClientRect().height ?? 0),
      drawing: Math.round(drawing?.getBoundingClientRect().height ?? 0),
    }];
  }));
});

test('maps drawn from markdown blocks fill their blocks on a page with no CSS for them', async ({ page }) => {
  const warnings: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      warnings.push(message.text());
    }
  });

  await page.goto('/blocks.html');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');

  await expect.poll(() => measure(page)).toEqual({
    fenced: { block: 420, map: 420, drawing: 420 },
    placeholder: { block: 420, map: 420, drawing: 420 },
    short: { block: 300, map: 300, drawing: 300 },
    frontmatter: { block: 360, map: 360, drawing: 360 },
    sized: { block: 600, map: 600, drawing: 600 },
  });

  expect(warnings).toEqual([]);
});
