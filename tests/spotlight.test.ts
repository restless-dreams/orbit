import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { SPOTLIGHT_SHARE, circleOnScreen, scrimPath, spotlightCamera, spotlightShare } from '../src/core/renderer/spotlight';
import { NO_INSETS } from '../src/core/engine/camera';
import stylesheet from '../src/core/styles/orbit.scss';
import type { OrbitSpotlightEvent } from '../src/core/types';
import { click, internals, manualClock, mount, node, useMapSize, type ManualClock } from './helpers/renderer';

useMapSize(600, 400);

const MAP = `# Trip

## Flights
- Outbound
- Return

## Hotels

## Food`;

const viewport = { width: 600, height: 400 };

beforeEach(() => {
  document.body.innerHTML = '';
});

/** Every `spotlight` event the map fires, as it fires them. */
const spotlightEvents = (renderer: ReturnType<typeof mount>['renderer']): OrbitSpotlightEvent[] => {
  const events: OrbitSpotlightEvent[] = [];
  renderer.on('spotlight', (event) => events.push(event));
  return events;
};

const circleOf = (event: OrbitSpotlightEvent) => ({ x: event.x, y: event.y, radius: event.radius });

/** Whether node `id`'s name shows on the map. */
const labelShown = (host: HTMLElement, id: string): boolean => {
  const label = host.querySelector<HTMLElement>(`.orbit-label[data-orbit-for="${id}"]`);
  return label !== null && label.style.display !== 'none';
};

describe('the camera on a node up close', () => {
  test('holds it in the middle of the room the insets leave, the share of it across', () => {
    const insets = { top: 20, right: 0, bottom: 100, left: 40 };
    const camera = spotlightCamera({ x: 120, y: -80, radius: 30 }, viewport, insets, 0.8);
    const circle = circleOnScreen(camera, viewport, { x: 120, y: -80, radius: 30 });
    // The room is 560 by 280, from (40, 20): its middle is (320, 160), and 80% of its 280 px across is 224.
    expect(circle).toEqual({ x: 320, y: 160, radius: 112 });
  });

  test('takes a share between nothing and the whole room, and the usual one otherwise', () => {
    expect(spotlightShare(0.5)).toBe(0.5);
    expect(spotlightShare(3)).toBe(1);
    expect(spotlightShare(0)).toBe(SPOTLIGHT_SHARE);
    expect(spotlightShare(-1)).toBe(SPOTLIGHT_SHARE);
    expect(spotlightShare(Number.NaN)).toBe(SPOTLIGHT_SHARE);
    expect(spotlightShare(undefined)).toBe(SPOTLIGHT_SHARE);
  });

  test('cuts the circle out of the scrim, which covers the whole map without one', () => {
    expect(scrimPath(viewport, null)).toBe('M0 0H600V400H0Z');
    expect(scrimPath(viewport, { x: 300, y: 200, radius: 100 })).toBe('M0 0H600V400H0ZM200 200A100 100 0 1 0 400 200A100 100 0 1 0 200 200Z');
    expect(spotlightCamera({ x: 0, y: 0, radius: 10 }, viewport, NO_INSETS, 1).scale).toBe(20);
  });
});

describe('spotlight', () => {
  test('brings a planet up close in the middle of the map, and says where its circle is', () => {
    const { renderer } = mount(MAP);
    const events = spotlightEvents(renderer);

    expect(renderer.spotlight('hotels')).toBe(true);

    expect(events.map((event) => event.phase)).toEqual(['rest']);
    expect(events[0].node.id).toBe('hotels');
    expect(circleOf(events[0])).toEqual({ x: 300, y: 200, radius: 400 * SPOTLIGHT_SHARE / 2 });
    expect(renderer.getNodeCircle('hotels')).toEqual(circleOf(events[0]));
  });

  test('holds it in the middle of the room its insets leave, the share it asks for', () => {
    const { renderer } = mount(MAP);
    const events = spotlightEvents(renderer);

    renderer.spotlight('food', { share: 0.5, insets: { bottom: 120 } });

    expect(circleOf(events[0])).toEqual({ x: 300, y: 140, radius: 70 });
  });

  test('says false for a node the view doesn’t draw, and changes nothing', () => {
    const { host, renderer } = mount(`${MAP}\n## Deep\n- Deeper\n  - Deepest`);
    const events = spotlightEvents(renderer);

    expect(renderer.spotlight('deepest')).toBe(false);
    expect(renderer.spotlight('nowhere')).toBe(false);
    expect(events).toEqual([]);
    expect(host.querySelector('.orbit--spotlight')).toBeNull();
    expect(host.querySelector('.orbit__spotlight')).toBeNull();
  });

  test('dims the rest of the map, the node’s circle cut out of the scrim, and steps its name and badges aside', () => {
    const { host, renderer } = mount(MAP);
    expect(labelShown(host, 'hotels')).toBe(true);

    renderer.spotlight('hotels');

    const scrim = host.querySelector<SVGSVGElement>('.orbit__spotlight');
    expect(scrim).not.toBeNull();
    expect(scrim!.style.opacity).toBe('1');
    expect(scrim!.querySelector('path')!.getAttribute('d')).toBe(scrimPath(viewport, { x: 300, y: 200, radius: 172 }));
    expect(host.querySelector('.orbit')!.classList.contains('orbit--spotlight')).toBe(true);
    expect(node(host, 'hotels').classList.contains('orbit-node--spotlit')).toBe(true);
    expect(node(host, 'food').classList.contains('orbit-node--spotlit')).toBe(false);
    expect(labelShown(host, 'hotels')).toBe(false);
    // The scrim is the sheet's backdrop, and takes every press over the map.
    expect(stylesheet).toContain('.orbit__spotlight-scrim{fill:var(--_orbit-sheet-backdrop)}');
    expect(stylesheet).toMatch(/\.orbit__spotlight\{[^}]*pointer-events:auto/);
  });

  test('keeps the size the map says while a pointer, or a touch, rests on it', () => {
    // A planet grows under the pointer and shrinks as it's pressed, and on phones a touch leaves it hovered:
    // up close it does neither, or what the page lays over its circle would miss its edge.
    const resized = [...stylesheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , declarations]) => declarations.includes('transform:'))
      .flatMap(([, selectors]) => selectors.split(','))
      .filter((selector) => /:(?:hover|active) \.orbit-node__body$/.test(selector));

    expect(resized).toHaveLength(2);

    for (const selector of resized) {
      expect(selector).toContain(':not(.orbit-node--spotlit)');
    }
  });

  test('takes no presses or keys meanwhile', () => {
    const { host, renderer } = mount(MAP, { editable: true });
    const changes: string[] = [];
    renderer.on('focus-change', ({ node: focused }) => changes.push(focused.id));
    renderer.on('node-context', ({ node: pressed }) => changes.push(`menu ${pressed.id}`));
    renderer.spotlight('hotels');

    click(node(host, 'food'));
    node(host, 'flights').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
    host.querySelector('svg')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(changes).toEqual([]);
    expect(renderer.getFocusPath()).toEqual(['trip']);
  });

  test('holds the node where it is while it changes, a new picture included', () => {
    const { renderer } = mount(MAP, { editable: true });
    const events = spotlightEvents(renderer);
    renderer.spotlight('hotels');
    const before = renderer.getNodeCircle('hotels');

    renderer.updateNode('hotels', { image: { src: 'media/sketch.svg' } });

    expect(renderer.getNodeCircle('hotels')).toEqual(before);
    expect(events.map((event) => event.phase)).toEqual(['rest']);
  });

  test('says where the node rests again when the map changes size', () => {
    const { renderer } = mount(MAP);
    const events = spotlightEvents(renderer);
    renderer.spotlight('hotels');

    internals(renderer).handleResize({ width: 400, height: 600 });

    expect(events.map((event) => event.phase)).toEqual(['rest', 'rest']);
    expect(circleOf(events[1])).toEqual({ x: 200, y: 300, radius: 400 * SPOTLIGHT_SHARE / 2 });
    expect(renderer.getNodeCircle('hotels')).toEqual(circleOf(events[1]));
  });

  test('follows a node an edit renames', () => {
    const { renderer } = mount(MAP, { editable: true });
    const said: string[][] = [];
    renderer.on('spotlight', ({ phase, node: shown }) => said.push([phase, shown.id]));
    renderer.spotlight('hotels');

    renderer.updateNode('hotels', { text: 'Where to stay' });
    renderer.endSpotlight();

    expect(said).toEqual([['rest', 'hotels'], ['end', 'where-to-stay']]);
  });
});

describe('the orbit’s drift', () => {
  let clock: ManualClock;

  beforeEach(() => {
    clock = manualClock();
  });

  afterEach(() => {
    clock.restore();
  });

  test('rests while a node is up close, and goes on after', () => {
    const { renderer } = mount(MAP, { animation: true });
    const state = renderer as unknown as { ambientRunning: boolean };
    clock.advance(100);
    expect(state.ambientRunning).toBe(true);

    renderer.spotlight('hotels');
    clock.advance(100);
    expect(state.ambientRunning).toBe(false);

    renderer.endSpotlight();
    clock.advance(100);
    expect(state.ambientRunning).toBe(true);
  });
});

describe('endSpotlight', () => {
  test('takes the camera back where it was, and the map back to the reader', () => {
    const { host, renderer } = mount(MAP);
    const events = spotlightEvents(renderer);
    const camera = { ...internals(renderer).camera };
    const circle = renderer.getNodeCircle('hotels');
    renderer.spotlight('hotels');

    renderer.endSpotlight();

    expect(events.map((event) => event.phase)).toEqual(['rest', 'end']);
    expect(circleOf(events[1])).toEqual(circle!);
    expect(internals(renderer).camera).toEqual(camera);
    expect(host.querySelector('.orbit__spotlight')).toBeNull();
    expect(host.querySelector('.orbit')!.classList.contains('orbit--spotlight')).toBe(false);
    expect(node(host, 'hotels').classList.contains('orbit-node--spotlit')).toBe(false);
  });

  test('gives the node its name back, and the map its presses', () => {
    const { host, renderer } = mount(MAP);
    const changes: string[] = [];
    renderer.on('focus-change', ({ node: focused }) => changes.push(focused.id));
    renderer.spotlight('hotels');
    renderer.endSpotlight();
    internals(renderer).handleResize({ width: 601, height: 400 });

    expect(labelShown(host, 'hotels')).toBe(true);
    click(node(host, 'food'));
    expect(changes).toEqual(['food']);
  });

  test('goes back where the camera was before the first node, whichever nodes came up close after it', () => {
    const { renderer } = mount(MAP);
    const camera = { ...internals(renderer).camera };
    renderer.spotlight('hotels');
    renderer.spotlight('food');

    renderer.endSpotlight();

    expect(internals(renderer).camera).toEqual(camera);
  });

  test('does nothing with no node up close', () => {
    const { renderer } = mount(MAP);
    const events = spotlightEvents(renderer);
    renderer.endSpotlight();
    expect(events).toEqual([]);
  });
});

describe('a node up close that leaves', () => {
  test('lets go of it when an edit removes it', () => {
    const { host, renderer } = mount(MAP, { editable: true });
    const events = spotlightEvents(renderer);
    renderer.spotlight('hotels');

    renderer.removeNode('hotels');

    expect(events.map((event) => [event.phase, event.node.id])).toEqual([['rest', 'hotels'], ['end', 'hotels']]);
    expect(host.querySelector('.orbit__spotlight')).toBeNull();
  });

  test('lets go of it at once when the page takes the map somewhere else', () => {
    const { renderer } = mount(MAP);
    const events = spotlightEvents(renderer);
    renderer.spotlight('hotels');

    renderer.flyTo('flights');

    expect(events.map((event) => event.phase)).toEqual(['rest', 'end']);
    expect(renderer.getFocusPath()).toEqual(['trip', 'flights']);
  });
});

describe('the flight to a node up close and back', () => {
  let clock: ManualClock;

  beforeEach(() => {
    clock = manualClock();
  });

  afterEach(() => {
    clock.restore();
  });

  test('grows the node’s circle on every frame to where it rests, as the scrim darkens, and back', () => {
    const { host, renderer } = mount(MAP, { transitionDuration: 'auto' });
    clock.advance(1000);
    const events = spotlightEvents(renderer);
    const start = renderer.getNodeCircle('hotels')!;
    const camera = { ...internals(renderer).camera };
    renderer.spotlight('hotels');
    const opacities: number[] = [];

    for (let frame = 0; frame < 80 && events.at(-1)?.phase !== 'rest'; frame += 1) {
      clock.advance(16);
      opacities.push(Number(host.querySelector<SVGSVGElement>('.orbit__spotlight')!.style.opacity));
    }

    const moves = events.filter((event) => event.phase === 'move');
    expect(moves.length).toBeGreaterThan(10);
    expect(events.at(-1)!.phase).toBe('rest');
    expect(circleOf(events.at(-1)!)).toEqual({ x: 300, y: 200, radius: 172 });
    // From where the node was, growing on every frame.
    expect(circleOf(moves[0])).toEqual(start);
    expect(moves[1].radius).toBeGreaterThan(start.radius);
    expect(moves.every((event, index) => index === 0 || event.radius >= moves[index - 1].radius)).toBe(true);
    expect(opacities.every((opacity, index) => index === 0 || opacity >= opacities[index - 1])).toBe(true);
    expect(opacities.at(-1)).toBe(1);

    renderer.endSpotlight();
    clock.advance(1200);

    const back = events.slice(events.map((event) => event.phase).lastIndexOf('rest') + 1);
    expect(back.at(-1)!.phase).toBe('end');
    expect(back.filter((event) => event.phase === 'move').length).toBeGreaterThan(10);
    expect(circleOf(back.at(-1)!)).toEqual(start);
    expect(internals(renderer).camera).toEqual(camera);
    expect(host.querySelector('.orbit__spotlight')).toBeNull();
  });

  test('turns back from wherever it is when it’s let go on its way', () => {
    const { renderer } = mount(MAP, { transitionDuration: 'auto' });
    clock.advance(1000);
    const events = spotlightEvents(renderer);
    const start = renderer.getNodeCircle('hotels')!;
    renderer.spotlight('hotels');
    clock.advance(160);
    const halfway = events.at(-1)!;

    renderer.endSpotlight();
    clock.advance(1200);

    expect(events.some((event) => event.phase === 'rest')).toBe(false);
    expect(events.at(-1)!.phase).toBe('end');
    expect(circleOf(events.at(-1)!)).toEqual(start);
    expect(halfway.radius).toBeGreaterThan(start.radius);
  });
});
