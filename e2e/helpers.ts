import type { Page } from '@playwright/test';

/** Every built-in theme, for tests that go through them all. */
export const THEMES = [
  'paper', 'night', 'glass', 'glass-night', 'cosmos', 'blueprint', 'ink', 'contrast',
  'flat', 'flat-night', 'material', 'material-night', 'liquid', 'liquid-night',
];

/** Opens the test fixture (e2e/pages/fixture.html) and waits until the map is drawn. */
export const openMap = async (page: Page, query = ''): Promise<void> => {
  await page.goto(`/fixture.html?${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
};

export interface MapState {
  focus: string;
  mode: string;
  zoom: number;
  angle: number;
  spin: string;
  flying: boolean;
}

/** The map's state, read from the renderer (including private fields, which is fine in tests). */
export const mapState = (page: Page): Promise<MapState> => {
  return page.evaluate(() => {
    const map = (window as unknown as { map: Record<string, unknown> & {
      getFocusPath(): string[];
      getViewMode(): string;
      zoomLevel(): number;
      spinPhysics: { angle: number; mode: string };
      transition: unknown;
    } }).map;

    return {
      focus: map.getFocusPath().at(-1) ?? '',
      mode: map.getViewMode(),
      zoom: map.zoomLevel(),
      angle: map.spinPhysics.angle,
      spin: map.spinPhysics.mode,
      flying: Boolean(map.transition),
    };
  });
};

/** Waits until no flight is in progress. */
export const settle = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => !(window as unknown as { map: { transition: unknown } }).map.transition);
  // The frame after the flight's last draws where it landed.
  await frames(page, 2);
};

/**
 * Lets the page run `count` animation frames. A wait that watches each frame,
 * not a timer: headless WebKit here runs no animation frames while a test only
 * waits, so a map moving by itself would stand still.
 */
export const frames = async (page: Page, count: number): Promise<void> => {
  await page.evaluate(() => {
    (window as unknown as { framesLeft: number }).framesLeft = 0;
  });

  // Playwright runs the check on every frame, and counts them here.
  await page.waitForFunction((target) => {
    const counted = window as unknown as { framesLeft: number };
    counted.framesLeft += 1;
    return counted.framesLeft >= target;
  }, count);
};

/** The middle of a node on screen. */
export const nodeCenter = async (page: Page, id: string): Promise<{ x: number; y: number }> => {
  // The page's own measure: Playwright's box for an SVG group comes out 14 px lower in WebKit.
  const box = await page.locator(`[data-orbit-node-id="${id}"]`).evaluate((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return width > 0 && height > 0 ? { x, y, width, height } : null;
  });

  if (!box) {
    throw new Error(`Node ${id} is not on screen`);
  }

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** A point `radius` px from the map's center, at `degrees` (0 = right, 90 = down). */
export const around = (page: Page, degrees: number, radius: number): { x: number; y: number } => {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  const radians = (degrees * Math.PI) / 180;
  return { x: viewport.width / 2 + radius * Math.cos(radians), y: viewport.height / 2 + radius * Math.sin(radians) };
};

/**
 * A drag through `points`, one move every `interval` ms, released `rest` ms
 * after the last move. Real input carries the time the hardware saw it, so
 * the events here are stamped with exact times too, and dispatched at once:
 * page timers drift under load, which would read as a pause before release.
 */
export const drag = async (
  page: Page,
  points: { x: number; y: number }[],
  interval: number,
  rest = 0,
  pointerType: 'mouse' | 'touch' = 'mouse',
): Promise<void> => {
  await page.evaluate(({ points, interval, rest, pointerType }) => {
    const start = performance.now();

    const fire = (type: string, point: { x: number; y: number }, time: number) => {
      const target = document.elementFromPoint(point.x, point.y) ?? document.body;
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType,
        isPrimary: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: point.x,
        clientY: point.y,
      });
      Object.defineProperty(event, 'timeStamp', { value: time });
      target.dispatchEvent(event);
    };

    fire('pointerdown', points[0], start);
    points.slice(1).forEach((point, index) => fire('pointermove', point, start + (index + 1) * interval));
    fire('pointerup', points[points.length - 1], start + (points.length - 1) * interval + rest);
  }, { points, interval, rest, pointerType });
};
