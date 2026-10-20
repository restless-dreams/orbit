import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { OrbitNode } from '../src/core/types';
import { wheelZoomFactor } from '../src/core/input-controller';
import { click, internals, manualClock, mount, node, pointer, useMapSize, wheel, type ManualClock, type RendererInternals } from './helpers/renderer';

useMapSize(600, 400);

const MAP = `# Root

## North
- Child one
- Child two
## East
## South
## West`;

let clock: ManualClock;

beforeEach(() => {
  document.body.innerHTML = '';
  clock = manualClock();
});

afterEach(() => {
  clock.restore();
});

/** A point on a circle around the middle of the 600 × 400 map. */
const around = (degrees: number, radius = 150): { x: number; y: number } => {
  const radians = (degrees * Math.PI) / 180;
  return { x: 300 + radius * Math.cos(radians), y: 200 + radius * Math.sin(radians) };
};

/** Drags around the sun from `from` to `to` degrees over `duration` ms; releases unless `hold`. */
const dragAround = (svg: Element, from: number, to: number, duration: number, options: { hold?: number; start?: number } = {}): number => {
  let time = options.start ?? clock.now;
  const steps = 8;
  svg.dispatchEvent(pointer('pointerdown', { ...around(from), time }));

  for (let step = 1; step <= steps; step += 1) {
    time += duration / steps;
    svg.dispatchEvent(pointer('pointermove', { ...around(from + ((to - from) * step) / steps), time }));
  }

  time += options.hold ?? 0;
  svg.dispatchEvent(pointer('pointerup', { ...around(to), time }));
  return time;
};

describe('pointer basics', () => {
  test('pointerdown is never cancelled, so taps still click', () => {
    const { renderer } = mount(MAP);
    const down = pointer('pointerdown', { x: 300, y: 200, time: clock.now });
    renderer.getSVGElement().dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
  });

  test('the canvas takes over touch gestures; a still map leaves them to the page', () => {
    const interactive = mount(MAP).host;
    expect(interactive.querySelector('.orbit--static')).toBeNull();
    const still = mount(MAP, { interactive: false }).host;
    expect(still.querySelector('.orbit--static')).not.toBeNull();
  });

  test('a drag the browser takes over doesn\'t swallow a click that arrives on its own', () => {
    const onFocusChange = mock<(argument: OrbitNode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onFocusChange });
    const svg = renderer.getSVGElement();
    let time = clock.now;
    svg.dispatchEvent(pointer('pointerdown', { ...around(0), time }));

    for (let step = 1; step <= 6; step += 1) {
      time += 10;
      svg.dispatchEvent(pointer('pointermove', { ...around(step * 10), time }));
    }

    svg.dispatchEvent(pointer('pointercancel', { ...around(60), time: time + 10 }));
    // No click follows a pointercancel, so there's nothing to swallow: this one works.
    click(node(host, 'east'));
    expect(onFocusChange).toHaveBeenCalledTimes(1);
  });
});

describe('spinning the orbit', () => {
  test('dragging around the sun turns the orbit and swallows the click that ends the drag', () => {
    const onFocusChange = mock<(argument: OrbitNode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onFocusChange });
    const svg = renderer.getSVGElement();
    dragAround(svg, 0, 60, 400, { hold: 120 });
    const angle = internals(renderer).spinPhysics.angle;
    expect(angle).toBeGreaterThan(50);
    expect(angle).toBeLessThan(61);
    const event = click(node(host, 'east'));
    expect(event.defaultPrevented).toBe(true);
    expect(onFocusChange).not.toHaveBeenCalled();
    // The next, ordinary click works.
    click(node(host, 'east'));
    expect(onFocusChange).toHaveBeenCalledTimes(1);
  });

  test('a flick keeps spinning and slows down; a slow drag stops where it is let go', () => {
    const { renderer } = mount(MAP);
    const svg = renderer.getSVGElement();
    const state = internals(renderer);
    dragAround(svg, 0, 90, 80);
    expect(state.spinPhysics.mode).toBe('coasting');
    const released = state.spinPhysics.angle;
    clock.advance(500);
    const coasted = state.spinPhysics.angle - released;
    expect(coasted).toBeGreaterThan(200);
    clock.advance(500);
    expect(state.spinPhysics.angle - released - coasted).toBeLessThan(coasted);
    clock.advance(8000);
    expect(state.spinPhysics.mode).toBe('idle');

    const settled = state.spinPhysics.angle;
    dragAround(svg, 0, 90, 900, { start: clock.now, hold: 120 });
    expect(state.spinPhysics.mode).toBe('idle');
    clock.advance(500);
    expect(state.spinPhysics.angle - settled).toBeLessThan(91);
  });

  test('a touch on a spinning orbit catches it and opens nothing', () => {
    const onFocusChange = mock<(argument: OrbitNode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onFocusChange });
    const svg = renderer.getSVGElement();
    const state = internals(renderer);
    dragAround(svg, 0, 90, 80);
    clock.advance(100);
    const north = node(host, 'north');
    north.dispatchEvent(pointer('pointerdown', { x: 300, y: 60, time: clock.now }));
    expect(state.spinPhysics.mode).toBe('idle');
    north.dispatchEvent(pointer('pointerup', { x: 300, y: 60, time: clock.now + 50 }));
    click(north);
    expect(onFocusChange).not.toHaveBeenCalled();
    const caught = state.spinPhysics.angle;
    clock.advance(500);
    expect(state.spinPhysics.angle).toBe(caught);
  });

  test('onSpinSettle reports the planet that comes to rest on top', () => {
    const onSpinSettle = mock<(argument: OrbitNode) => void>(() => undefined);
    const { renderer } = mount(MAP, { onSpinSettle, spin: { snap: 'planet' } });
    renderer.spin(720);
    clock.advance(10000);
    expect(onSpinSettle).toHaveBeenCalledTimes(1);
    const state = internals(renderer);
    const top = onSpinSettle.mock.calls[0][0];
    const planet = state.scene!.nodes.get(top.id)!;
    const resting = (((planet.orbitAngle! + state.spinPhysics.angle + 90) % 360) + 360) % 360;
    // Snapped: the planet sits exactly at the top.
    expect(Math.min(resting, 360 - resting)).toBeLessThan(0.1);
  });

  test('spin settings shape the coast', () => {
    const quick = mount(MAP, { spin: { decay: 0.3 } }).renderer;
    const slow = mount(MAP, { spin: { decay: 3 } }).renderer;
    quick.spin(600);
    slow.spin(600);
    clock.advance(6000);
    const quickAngle = internals(quick).spinPhysics.angle;
    // speed × decay, less the last stretch below the 30°/s settle speed.
    expect(quickAngle).toBeCloseTo(600 * 0.3 - 30 * 0.3, 0);
    expect(internals(slow).spinPhysics.angle).toBeGreaterThan(quickAngle * 4);
  });
});

describe('panning and zooming', () => {
  test('dragging the overview pans it without rebuilding nodes, then glides', () => {
    const { host, renderer } = mount(MAP, { viewMode: 'all' });
    const svg = renderer.getSVGElement();
    const state = internals(renderer);
    const before = Array.from(host.querySelectorAll('.orbit-node'));
    let time = clock.now;
    svg.dispatchEvent(pointer('pointerdown', { x: 100, y: 100, time }));

    for (let step = 1; step <= 6; step += 1) {
      time += 10;
      svg.dispatchEvent(pointer('pointermove', { x: 100 + step * 10, y: 100, time }));
    }

    const movedX = state.camera.x;
    expect(movedX).toBeLessThan(0);
    svg.dispatchEvent(pointer('pointerup', { x: 160, y: 100, time }));
    clock.advance(600);
    expect(state.camera.x).toBeLessThan(movedX);
    const after = Array.from(host.querySelectorAll('.orbit-node'));
    expect(after.every((element, index) => element === before[index])).toBe(true);
  });

  test('a drag asks where the map is on the page once, not on every move', () => {
    const { host, renderer } = mount(MAP, { viewMode: 'all' });
    const svg = renderer.getSVGElement();
    const asked = spyOn(host.querySelector<HTMLElement>('.orbit')!, 'getBoundingClientRect');
    let time = clock.now;
    svg.dispatchEvent(pointer('pointerdown', { x: 100, y: 100, time }));

    for (let step = 1; step <= 6; step += 1) {
      time += 10;
      svg.dispatchEvent(pointer('pointermove', { x: 100 + step * 10, y: 100, time }));
    }

    svg.dispatchEvent(pointer('pointerup', { x: 160, y: 100, time }));
    expect(asked).toHaveBeenCalledTimes(1);
  });

  test('the wheel zooms around the pointer, keeping the point under it in place', () => {
    const { renderer } = mount(MAP, { viewMode: 'all' });
    const state = internals(renderer);
    const anchor = { x: 450, y: 120 };
    const worldBefore = {
      x: (anchor.x - 300) / state.camera.scale + state.camera.x,
      y: (anchor.y - 200) / state.camera.scale + state.camera.y,
    };
    renderer.getSVGElement().dispatchEvent(wheel({ deltaY: -200, x: anchor.x, y: anchor.y }));
    clock.advance(600);
    expect(state.zoomLevel()).toBeCloseTo(Math.exp(0.4), 2);
    const worldAfter = {
      x: (anchor.x - 300) / state.camera.scale + state.camera.x,
      y: (anchor.y - 200) / state.camera.scale + state.camera.y,
    };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 3);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 3);
  });

  test('with zoom.wheel set to modifier, a plain wheel leaves the page alone and shows a hint', () => {
    const { host, renderer } = mount(MAP, { viewMode: 'all', zoom: { wheel: 'modifier' } });
    const plain = wheel({ deltaY: -200 });
    renderer.getSVGElement().dispatchEvent(plain);
    clock.advance(400);
    expect(plain.defaultPrevented).toBe(false);
    expect(internals(renderer).zoomLevel()).toBe(1);
    expect(host.querySelector('.orbit-hint--visible')?.textContent).toMatch(/scroll to zoom/);
    const withControl = wheel({ deltaY: -200, ctrlKey: true });
    renderer.getSVGElement().dispatchEvent(withControl);
    clock.advance(400);
    expect(withControl.defaultPrevented).toBe(true);
    expect(internals(renderer).zoomLevel()).toBeGreaterThan(1);
  });

  test('zooming stays within the zoom range', () => {
    const { renderer } = mount(MAP, { viewMode: 'all', zoom: { minimum: 0.5, maximum: 2 } });
    const state = internals(renderer);
    state.zoomAt(50, { x: 300, y: 200 });
    expect(state.zoomLevel()).toBeCloseTo(2, 5);
    state.zoomAt(0.001, { x: 300, y: 200 });
    expect(state.zoomLevel()).toBeCloseTo(0.5, 5);
  });

  test('zooming far into a planet enters it', () => {
    const { renderer } = mount(MAP);
    const state = internals(renderer);
    const east = state.display!.nodes.get('east')!;
    const anchor = {
      x: (east.x - state.camera.x) * state.camera.scale + 300,
      y: (east.y - state.camera.y) * state.camera.scale + 200,
    };
    state.zoomAt(1.5, anchor);
    expect(renderer.getFocusPath()).toEqual(['root']);
    state.zoomAt(1.3, anchor);
    expect(renderer.getFocusPath()).toEqual(['root', 'east']);
  });

  test('zooming toward empty space never enters anything', () => {
    const { renderer } = mount(MAP);
    internals(renderer).zoomAt(4, { x: 300, y: 200 });
    expect(renderer.getFocusPath()).toEqual(['root']);
  });

  test('zooming out leaves: up a level, and from the root to the overview', () => {
    const { renderer } = mount(MAP);
    renderer.focusNode('north');
    const state = internals(renderer);
    state.zoomAt(0.65, { x: 300, y: 200 });
    expect(renderer.getFocusPath()).toEqual(['root']);
    state.zoomAt(0.65, { x: 300, y: 200 });
    expect(renderer.getViewMode()).toBe('all');
  });

  test('a small zoom out springs back', () => {
    const { renderer } = mount(MAP, { transitionDuration: 'auto' });
    clock.advance(1000);
    const state = internals(renderer);
    state.zoomAt(0.85, { x: 300, y: 200 });
    renderer.getSVGElement().dispatchEvent(wheel({ deltaY: 1 }));
    clock.advance(1500);
    expect(state.zoomLevel()).toBeCloseTo(1, 3);
    expect(renderer.getFocusPath()).toEqual(['root']);
  });

  test('zoom buttons and fit move the camera', () => {
    const { host, renderer } = mount(MAP, { viewMode: 'all' });
    const state = internals(renderer);
    click(host.querySelector('[aria-label="Zoom in"]')!);
    expect(state.zoomLevel()).toBeCloseTo(1.6, 5);
    click(host.querySelector('[aria-label="Fit the map"]')!);
    expect(state.zoomLevel()).toBeCloseTo(1, 5);
  });

  test('a pinch takes the camera over from a flight', () => {
    const { renderer } = mount(MAP, { viewMode: 'all', transitionDuration: 400 });
    const state = internals(renderer) as RendererInternals & { cameraFlight: unknown };
    clock.advance(1000);
    renderer.zoomBy(1.6);
    expect(state.cameraFlight).not.toBeNull();
    const svg = renderer.getSVGElement();
    let time = clock.now;
    svg.dispatchEvent(pointer('pointerdown', { x: 250, y: 200, time, id: 1, kind: 'touch' }));
    svg.dispatchEvent(pointer('pointerdown', { x: 350, y: 200, time: (time += 10), id: 2, kind: 'touch' }));
    svg.dispatchEvent(pointer('pointermove', { x: 360, y: 200, time: (time += 10), id: 2, kind: 'touch' }));
    expect(state.cameraFlight).toBeNull();
  });

  test('a frame with no elapsed time keeps a banked wheel zoom', () => {
    const { renderer } = mount(MAP, { viewMode: 'all' });
    const state = internals(renderer);
    renderer.getSVGElement().dispatchEvent(wheel({ deltaY: -200 }));
    const zoom = renderer as unknown as { wheelZoom: { remaining: number } | null; wheelTask: (now: number, elapsed: number) => boolean | 'hold' };
    expect(zoom.wheelZoom).not.toBeNull();
    // A duplicate rAF timestamp: nothing about the zoom is spent yet.
    expect(zoom.wheelTask(1000, 0)).toBe('hold');
    expect(zoom.wheelZoom!.remaining).not.toBe(0);
    clock.advance(600);
    expect(state.zoomLevel()).toBeCloseTo(Math.exp(0.4), 2);
  });

  test('a frame with no elapsed time doesn\'t end a glide', () => {
    const { renderer } = mount(MAP, { viewMode: 'all' });
    const svg = renderer.getSVGElement();
    let time = clock.now;
    svg.dispatchEvent(pointer('pointerdown', { x: 100, y: 100, time }));

    for (let step = 1; step <= 6; step += 1) {
      time += 10;
      svg.dispatchEvent(pointer('pointermove', { x: 100 + step * 10, y: 100, time }));
    }

    svg.dispatchEvent(pointer('pointerup', { x: 160, y: 100, time: time + 10 }));
    const glide = renderer as unknown as { glide: { isMoving: boolean }; glideTask: (now: number, elapsed: number) => boolean | 'hold' };
    expect(glide.glide.isMoving).toBe(true);
    expect(glide.glideTask(time + 10, 0)).toBe('hold');
    expect(glide.glide.isMoving).toBe(true);
    const movedX = internals(renderer).camera.x;
    clock.advance(600);
    expect(internals(renderer).camera.x).toBeLessThan(movedX);
  });

  test('lifting one finger of a three-finger pinch re-baselines the pair that remains', () => {
    const { renderer } = mount(MAP, { viewMode: 'all' });
    const svg = renderer.getSVGElement();
    const state = internals(renderer);
    let time = clock.now;

    const send = (type: string, id: number, x: number, y: number) => {
      time += 10;
      svg.dispatchEvent(pointer(type, { x, y, time, id, kind: 'touch' }));
    };

    send('pointerdown', 1, 200, 200);
    send('pointerdown', 2, 300, 200);
    send('pointermove', 2, 320, 200);
    expect(state.zoomLevel()).toBeCloseTo(1.2, 5);
    // A third finger lands far off, then the first lifts: the pinch goes on with fingers 2 and 3.
    send('pointerdown', 3, 590, 200);
    send('pointerup', 1, 200, 200);
    send('pointermove', 2, 310, 200);
    // The remaining pair went from 270 to 280 px apart: a small zoom, not 2.3x against the lifted pair's baseline.
    expect(state.zoomLevel()).toBeCloseTo(1.2 * (280 / 270), 2);
  });
});

describe('wheelZoomFactor', () => {
  test('zooms the same per pixel whatever the device reports', () => {
    const pixels = wheelZoomFactor({ deltaY: 32, deltaMode: 0, ctrlKey: false }, 800);
    const lines = wheelZoomFactor({ deltaY: 2, deltaMode: 1, ctrlKey: false }, 800);
    expect(lines).toBeCloseTo(pixels, 10);
    expect(wheelZoomFactor({ deltaY: -32, deltaMode: 0, ctrlKey: false }, 800)).toBeCloseTo(1 / pixels, 10);
  });

  test('boosts trackpad pinches but not a mouse wheel turned with Ctrl held', () => {
    const pinch = wheelZoomFactor({ deltaY: -4, deltaMode: 0, ctrlKey: true }, 800);
    const scroll = wheelZoomFactor({ deltaY: -4, deltaMode: 0, ctrlKey: false }, 800);
    expect(Math.log(pinch)).toBeCloseTo(Math.log(scroll) * 5, 10);
    expect(wheelZoomFactor({ deltaY: -100, deltaMode: 0, ctrlKey: true }, 800)).toBeCloseTo(wheelZoomFactor({ deltaY: -100, deltaMode: 0, ctrlKey: false }, 800), 10);
  });

  test('is clamped for huge deltas', () => {
    expect(wheelZoomFactor({ deltaY: 5000, deltaMode: 0, ctrlKey: false }, 800)).toBe(0.5);
    expect(wheelZoomFactor({ deltaY: -5000, deltaMode: 0, ctrlKey: false }, 800)).toBe(2);
  });
});
