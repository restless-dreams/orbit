import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mapState, openMap, settle } from './helpers';

interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** Brings `id` up close, and waits for the map to say where it rests. */
const spotlight = (page: Page, id: string, options: Record<string, unknown> = {}): Promise<Circle> => {
  return page.evaluate(({ node, settings }) => new Promise<Circle>((resolve) => {
    const map = (window as unknown as { map: {
      on(name: 'spotlight', listener: (event: Circle & { phase: string }) => void): () => void;
      spotlight(id: string, options: Record<string, unknown>): boolean;
    } }).map;

    const stop = map.on('spotlight', ({ phase, x, y, radius }) => {
      if (phase === 'rest') {
        stop();
        resolve({ x, y, radius });
      }
    });

    map.spotlight(node, settings);
  }), { node: id, settings: options });
};

/** Where the browser draws node `id`'s disc, as a circle. */
const drawnDisc = (page: Page, id: string): Promise<Circle> => {
  return page.locator(`[data-orbit-node-id="${id}"] .orbit-node__disc`).evaluate((disc) => {
    const box = disc.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, radius: box.width / 2 };
  });
};

test.describe('a node up close', () => {
  test('rests where the map says, filling the room above the page’s toolbar, the rest of the map dimmed', async ({ page }) => {
    await openMap(page);
    await settle(page);
    const viewport = page.viewportSize()!;

    const said = await spotlight(page, 'design', { share: 0.8, insets: { bottom: 96 } });

    const disc = await drawnDisc(page, 'design');
    expect(Math.abs(disc.x - said.x)).toBeLessThan(1);
    expect(Math.abs(disc.y - said.y)).toBeLessThan(1);
    expect(Math.abs(disc.radius - said.radius)).toBeLessThan(1);
    expect(said.x).toBeCloseTo(viewport.width / 2, 0);
    expect(said.y).toBeCloseTo((viewport.height - 96) / 2, 0);
    expect(said.radius).toBeCloseTo((Math.min(viewport.width, viewport.height - 96) * 0.8) / 2, 0);
    await expect(page.locator('.orbit__spotlight')).toHaveCSS('opacity', '1');
    await expect(page.locator('.orbit-label[data-orbit-for="design"]')).toBeHidden();
  });

  test('stays the size the map says while it’s hovered, as a touch leaves it on a phone', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium’s DevTools protocol holds the planet hovered.');
    await openMap(page);
    await settle(page);
    const client = await page.context().newCDPSession(page);
    await client.send('DOM.enable');
    await client.send('CSS.enable');
    const { root } = await client.send('DOM.getDocument');
    const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-orbit-node-id="design"]' });
    await client.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });

    const said = await spotlight(page, 'design');

    // Hovered, a planet grows; up close, what lies over it covers the circle the map says, so it doesn't.
    await expect.poll(async () => Math.abs((await drawnDisc(page, 'design')).radius - said.radius)).toBeLessThan(1);
  });

  test('takes no taps, and gives the map back once the camera is back', async ({ page }) => {
    await openMap(page);
    await settle(page);
    const before = await drawnDisc(page, 'build');
    await spotlight(page, 'design');

    // A tap where Build was lands on the scrim.
    await page.mouse.click(before.x, before.y);
    expect((await mapState(page)).focus).toBe('product-roadmap-2027');

    await page.evaluate(() => new Promise<void>((resolve) => {
      const map = (window as unknown as { map: { on(name: 'spotlight', listener: (event: { phase: string }) => void): () => void; endSpotlight(): void } }).map;

      const stop = map.on('spotlight', ({ phase }) => {
        if (phase === 'end') {
          stop();
          resolve();
        }
      });

      map.endSpotlight();
    }));

    await expect(page.locator('.orbit__spotlight')).toHaveCount(0);
    const back = await drawnDisc(page, 'build');
    expect(Math.abs(back.x - before.x)).toBeLessThan(1);
    expect(Math.abs(back.y - before.y)).toBeLessThan(1);
    await page.mouse.click(back.x, back.y);
    await settle(page);
    expect((await mapState(page)).focus).toBe('build');
  });
});
