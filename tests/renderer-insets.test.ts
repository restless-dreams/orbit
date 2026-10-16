import { beforeEach, describe, expect, test } from 'bun:test';
import { internals, manualClock, mount, onScreen, useMapSize } from './helpers/renderer';

useMapSize(1400, 1000);

beforeEach(() => {
  document.body.innerHTML = '';
});

const ROADMAP = `# Roadmap
> Where the product goes this year.

## Research
- Interviews
- Survey

## Build
- Frontend
- Backend

## Launch`;

/** A table with `count` columns, and a note on the table. */
const table = (count: number): string => {
  return `# accounts\n> One row per account.\n\n${Array.from({ length: count }, (_, index) => `- column_${index}`).join('\n')}`;
};

const sunOnScreen = (renderer: Parameters<typeof internals>[0]): { x: number; y: number; radius: number } => {
  const state = internals(renderer);
  const sun = state.display!.nodes.get(state.scene!.focusId)!;
  return { ...onScreen(renderer, sun), radius: sun.radius * state.camera.scale };
};

describe('insets', () => {
  test("a view is fitted into what the page's controls leave, and glides there when they change", () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(ROADMAP, { transitionDuration: 400 });
      clock.advance(1000);
      expect(sunOnScreen(renderer).y).toBeCloseTo(500, 0);
      renderer.setOptions({ insets: { bottom: 120 } });
      clock.advance(1000);
      // The sun sits in the middle of the 880 px above the controls.
      expect(sunOnScreen(renderer).y).toBeCloseTo(440, 0);
      expect(sunOnScreen(renderer).x).toBeCloseTo(700, 0);
    } finally {
      clock.restore();
    }
  });
});

describe("the focused node's buttons", () => {
  const barTop = (host: HTMLElement) => Number(/translate3d\([-\d.]+px, ([-\d.]+)px/.exec(host.querySelector<HTMLElement>('.orbit-actions')!.style.transform)![1]);

  test('sit under the sun when its planets leave room there', () => {
    const { host, renderer } = mount(ROADMAP);
    const sun = sunOnScreen(renderer);
    expect(barTop(host)).toBeGreaterThan(sun.y + sun.radius);
  });

  test("sit on the sun's lower rim when its planets crowd it", () => {
    const { host, renderer } = mount(table(60));
    const sun = sunOnScreen(renderer);
    expect(barTop(host) + 36).toBeLessThan(sun.y + sun.radius);
    expect(barTop(host)).toBeGreaterThan(sun.y);
  });
});
