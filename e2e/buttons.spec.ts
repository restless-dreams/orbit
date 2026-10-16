import { expect, test, type Page } from '@playwright/test';
import { openMap } from './helpers';

// The large map as the website shows it on a phone, 358 by 460 px: the
// library's twelve areas crowd the sun, so its buttons go under the orbit,
// where they never cover a planet, a name or the zoom buttons, whatever the
// orbit's turn.

interface Covered {
  /** Turns of the orbit (degrees) where the buttons show. */
  shown: number[];

  /** Turns where they cover part of a planet. */
  planets: number[];

  /** Turns where they cover part of a name. */
  names: number[];

  /** Turns where they cover part of the zoom buttons. */
  zoom: number[];
}

/** Turns the orbit all the way round, 3° at a time, and checks what the buttons cover at each turn. */
const coveredThroughATurn = (page: Page): Promise<Covered> => {
  return page.evaluate(async () => {
    interface Body {
      id: string;
      role: string;
      x: number;
      y: number;
      radius: number;
    }

    const map = (window as unknown as { map: {
      display: { camera: { x: number; y: number; scale: number }; nodes: Map<string, Body> };
      viewport: { width: number; height: number };
      spinPhysics: { angle: number };
      clock: { requestPaint(): void };
    } }).map;

    const host = document.getElementById('map') as HTMLElement;
    const bar = host.querySelector('.orbit-actions') as HTMLElement;
    const zoom = host.querySelector('.orbit-controls__zoom .orbit-panel') as HTMLElement;
    const covered: Covered = { shown: [], planets: [], names: [], zoom: [] };
    const overlaps = (first: DOMRect, second: DOMRect) => Math.min(first.right, second.right) > Math.max(first.left, second.left)
      && Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top);

    for (let angle = 0; angle < 360; angle += 3) {
      map.spinPhysics.angle = angle;
      map.clock.requestPaint();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      if (!bar.classList.contains('orbit-actions--visible')) {
        continue;
      }

      covered.shown.push(angle);
      const box = bar.getBoundingClientRect();
      const origin = host.getBoundingClientRect();
      const { camera } = map.display;

      for (const body of map.display.nodes.values()) {
        if (body.role !== 'planet') {
          continue;
        }

        const x = origin.left + (body.x - camera.x) * camera.scale + map.viewport.width / 2;
        const y = origin.top + (body.y - camera.y) * camera.scale + map.viewport.height / 2;
        const nearest = Math.hypot(x - Math.min(box.right, Math.max(box.left, x)), y - Math.min(box.bottom, Math.max(box.top, y)));

        if (nearest < body.radius * camera.scale && !covered.planets.includes(angle)) {
          covered.planets.push(angle);
        }

        const label = host.querySelector<HTMLElement>(`.orbit-label[data-orbit-for="${CSS.escape(body.id)}"]`);

        if (label && label.style.display !== 'none' && Number(getComputedStyle(label).opacity) > 0.05 && overlaps(box, label.getBoundingClientRect()) && !covered.names.includes(angle)) {
          covered.names.push(angle);
        }
      }

      if (overlaps(box, zoom.getBoundingClientRect())) {
        covered.zoom.push(angle);
      }
    }

    return covered;
  });
};

/** Turns the orbit to `angle` degrees and waits until it's drawn there. */
const turnTo = (page: Page, angle: number): Promise<void> => {
  return page.evaluate(async (angle) => {
    const map = (window as unknown as { map: { spinPhysics: { angle: number }; clock: { requestPaint(): void } } }).map;
    map.spinPhysics.angle = angle;
    map.clock.requestPaint();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, angle);
};

const ALL_TURNS = Array.from({ length: 120 }, (_, index) => index * 3);

test.describe("the focused node's buttons on the large map, on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, 'the size the website shows it at on a phone');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 358, height: 460 });
    await openMap(page, 'sample=large&instant');
  });

  test('sit under the orbit, clear of every planet and name at every turn', async ({ page }) => {
    expect(await coveredThroughATurn(page)).toEqual({ shown: ALL_TURNS, planets: [], names: [], zoom: [] });
    await turnTo(page, 0);
    await expect(page).toHaveScreenshot('large-map-buttons.png');
  });

  test('wrap beside the zoom buttons where there are more than fit on a line', async ({ page }) => {
    await page.evaluate(() => {
      const map = (window as unknown as { map: { setOptions(options: object): void } }).map;
      map.setOptions({ actions: Array.from({ length: 6 }, (_, index) => ({ id: `action-${index}`, label: `Action ${index + 1}`, icon: 'list', run: () => undefined })) });
    });

    expect(await coveredThroughATurn(page)).toEqual({ shown: ALL_TURNS, planets: [], names: [], zoom: [] });
    // The zoom buttons sit where the map expects them to, so the buttons can keep clear of them.
    const expected = await page.evaluate(() => (window as unknown as { map: { controls: { zoomBox(width: number, height: number): Record<string, number> } } }).map.controls.zoomBox(358, 460));
    const panel = (await page.locator('.orbit-controls__zoom .orbit-panel').boundingBox())!;
    const measured: Record<string, number> = { left: panel.x, top: panel.y, right: panel.x + panel.width, bottom: panel.y + panel.height };

    for (const side of ['left', 'top', 'right', 'bottom']) {
      expect(expected[side]).toBeCloseTo(measured[side], 0);
    }

    await turnTo(page, 0);
    await expect(page).toHaveScreenshot('large-map-many-buttons.png');
  });
});
