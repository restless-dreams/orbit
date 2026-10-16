import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { OrbitSVGRenderer } from '../src/core/svg-renderer';
import { parseOrbit } from '../src/core/dispatch';
import { MOON_LIMIT } from '../src/core/engine/scene';
import { normalizeDelta } from '../src/core/engine/spin';
import { internals, manualClock, mount, node, onScreen, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

describe('spinning', () => {
  /** Leaves the orbit turned `angle` degrees, as a spin would. */
  const turnTo = (renderer: OrbitSVGRenderer, angle: number): void => {
    internals(renderer).spinPhysics.angle = angle;
    (renderer as unknown as { paint: () => void }).paint();
  };

  const layer = (renderer: OrbitSVGRenderer, name: string) => renderer.getSVGElement().querySelector(`.orbit__${name}`)!.getAttribute('transform');

  test('the orbit turns as one group, its bodies holding still in it, turned back upright', () => {
    const { host, renderer } = mount(ROADMAP);
    const planet = node(host, 'research');
    const moon = node(host, 'interviews');
    const unturned = { planet: planet.getAttribute('transform')!, moon: moon.getAttribute('transform')! };
    turnTo(renderer, 30);
    expect(layer(renderer, 'nodes')).toBe('rotate(30 0 0)');
    expect(layer(renderer, 'moons')).toBe('rotate(30 0 0)');
    expect(layer(renderer, 'suns')).toBeNull();
    // Each where it is in the unturned orbit, turned back so its shading and badges stay upright.
    expect(planet.getAttribute('transform')).toBe(unturned.planet.replace(' scale', ' rotate(-30) scale'));
    expect(moon.getAttribute('transform')).toBe(unturned.moon.replace(' scale', ' rotate(-30) scale'));
  });

  test('specks are plain circles that turn with the orbit, lit from the top left again once it rests', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(table(600));
      const speck = node(host, 'column_0_with_a_name');
      expect(speck.classList.contains('orbit-node--speck')).toBe(true);
      expect(speck.getAttribute('transform')).toBeNull();
      const disc = speck.querySelector('.orbit-node__disc')!;
      const place = [disc.getAttribute('cx'), disc.getAttribute('cy')];
      expect(place.every((value) => value !== null && Number.isFinite(Number(value)))).toBe(true);
      const lighting = () => host.querySelector('radialGradient[id$="-speck-shade"]')!.getAttribute('gradientTransform');
      renderer.spin(360);
      clock.advance(150);
      // Mid-spin the group turns; each speck holds still in it, shading and all.
      expect(layer(renderer, 'nodes')).toMatch(/^rotate\(/);
      expect([disc.getAttribute('cx'), disc.getAttribute('cy')]).toEqual(place);
      expect(lighting()).toBeNull();
      clock.advance(6000);
      expect(internals(renderer).spinPhysics.mode).toBe('idle');
      const turn = Math.round(normalizeDelta(internals(renderer).spinPhysics.angle) * 1000) / 1000;
      expect(lighting()).toBe(`rotate(${-turn} 0.5 0.5)`);
    } finally {
      clock.restore();
    }
  });

  test('zooming in until specks are big enough to show which way is up redraws them a share at a time', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(table(600));
      const specks = () => host.querySelectorAll('.orbit-node--speck').length;
      expect(specks()).toBe(600);
      internals(renderer).zoomAt(2, { x: 300, y: 200 });
      clock.advance(16);
      expect(specks()).toBe(540);
      clock.advance(16 * 9);
      expect(specks()).toBe(0);
      expect(node(host, 'column_0_with_a_name').getAttribute('transform')).toMatch(/^translate\(/);
    } finally {
      clock.restore();
    }
  });

  test('a speck that travels in a flight is drawn as a body', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(table(600), { transitionDuration: 600 });
      expect(node(host, 'column_0_with_a_name').classList.contains('orbit-node--speck')).toBe(true);
      renderer.focusNode('column_0_with_a_name');
      clock.advance(100);
      const traveller = node(host, 'column_0_with_a_name');
      expect(traveller.classList.contains('orbit-node--speck')).toBe(false);
      expect(traveller.getAttribute('transform')).toMatch(/^translate\(/);
    } finally {
      clock.restore();
    }
  });
});

beforeEach(() => {
  document.body.innerHTML = '';
});

const ROADMAP = `# Roadmap

## Research
- Interviews
- Survey

## Build
- Frontend
- Backend

## Launch`;

describe('mounting', () => {
  test('builds the map inside the container: canvas, label layer, controls and outline', () => {
    const { host } = mount(ROADMAP);
    const root = host.querySelector('.orbit');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-orbit-theme')).toBe('paper');
    expect(root?.getAttribute('data-orbit-view')).toBe('focus');
    expect(host.querySelector('svg.orbit__canvas')?.getAttribute('aria-roledescription')).toBe('mind map');
    expect(host.querySelector('.orbit__labels')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.orbit-controls')).not.toBeNull();
    expect(host.querySelector('nav.orbit-outline')?.textContent).toContain('Interviews');
  });

  test('focus mode draws the sun, its planets and their children as moons', () => {
    const { host } = mount(ROADMAP);
    expect(node(host, 'roadmap').classList.contains('orbit-node--sun')).toBe(true);

    for (const planet of ['research', 'build', 'launch']) {
      expect(node(host, planet).classList.contains('orbit-node--planet')).toBe(true);
    }

    for (const moon of ['interviews', 'survey', 'frontend', 'backend']) {
      expect(node(host, moon).classList.contains('orbit-node--moon')).toBe(true);
    }
  });

  test(`a planet shows at most ${MOON_LIMIT} moons and counts the rest`, () => {
    const children = Array.from({ length: MOON_LIMIT + 3 }, (_, index) => `- Item ${index + 1}`).join('\n');
    const { host } = mount(`# Root\n\n## Busy\n${children}`);
    expect(host.querySelectorAll('.orbit-node--moon')).toHaveLength(MOON_LIMIT);
    expect(host.querySelector('.orbit-count')?.textContent).toBe('+3');
  });

  test('a name inside a planet rises clear of the "+N" its planet shows; other names stay centered', () => {
    const tables = (count: number) => Array.from({ length: count }, (_, index) => `- Table ${index + 1}`).join('\n');
    // Icons above the names make them tall enough to reach the counts.
    const areas = ['💳 Fees & Payments', '🌐 Digital Lending', '🔁 Loans & Returns', '🔐 Staff & Access', '📚 Catalog', '🧾 Reports', '🏛️ Branches', '🗓️ Events'];
    const { host, renderer } = mount(`# Library\n\n${areas.map((area) => `## ${area}\n${tables(MOON_LIMIT + 3)}`).join('\n\n')}\n\n## Help desk\n${tables(2)}`);
    const raised: string[] = [];
    let centered = 0;

    for (const [id, entry] of internals(renderer).scene!.nodes) {
      const label = host.querySelector<HTMLElement>(`.orbit-label[data-orbit-for="${id}"]`);

      if (entry.role !== 'planet' || !label || label.style.display === 'none' || label.classList.contains('orbit-label--outside')) {
        continue;
      }

      const center = onScreen(renderer, entry);
      const y = Number(/translate3d\([^,]+,\s*(-?[\d.]+)px/.exec(label.style.transform)?.[1]);

      if (host.querySelector(`.orbit-count[data-orbit-for="${id}"]`)) {
        expect(y).toBeLessThanOrEqual(center.y + 0.1);

        if (y < center.y - 0.5) {
          raised.push(id);
        }
      } else {
        expect(Math.abs(y - center.y)).toBeLessThanOrEqual(0.1);
        centered += 1;
      }
    }

    expect(raised).toEqual(expect.arrayContaining(['fees-payments', 'digital-lending', 'loans-returns', 'staff-access']));
    expect(centered).toBe(1);
  });

  test('says what to check when there is no element to draw in', () => {
    expect(() => new OrbitSVGRenderer(null as unknown as HTMLElement)).toThrow(/needs an element to draw the map in, but got null/);
  });

  test('nothing is drawn until the container has a size', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const renderer = new OrbitSVGRenderer(host, { transitionDuration: 0 });
    internals(renderer).viewport = { width: 0, height: 0 };
    internals(renderer).handleResize({ width: 0, height: 0 });
    renderer.render(parseOrbit(ROADMAP));
    expect(host.querySelectorAll('.orbit-node')).toHaveLength(0);
    internals(renderer).handleResize({ width: 500, height: 300 });
    expect(host.querySelectorAll('.orbit-node').length).toBeGreaterThan(0);
  });

  test('an empty map says so', () => {
    const { host } = mount('');
    const empty = host.querySelector<HTMLElement>('.orbit-empty');
    expect(empty?.hidden).toBe(false);
    expect(empty?.textContent).toContain('This map is empty');
    expect(host.querySelectorAll('.orbit-node')).toHaveLength(0);
  });

  test('destroy removes the map; unmount reports whether there was one', () => {
    const { host, renderer } = mount(ROADMAP);
    expect(OrbitSVGRenderer.unmount(host)).toBe(true);
    expect(host.querySelector('.orbit')).toBeNull();
    expect(OrbitSVGRenderer.unmount(host)).toBe(false);
    renderer.destroy();
  });

  test('a second renderer in the same container replaces the first', () => {
    const { host } = mount(ROADMAP);
    new OrbitSVGRenderer(host, { transitionDuration: 0 }).render(parseOrbit('# Other'));
    expect(host.querySelectorAll('.orbit')).toHaveLength(1);
    expect(host.textContent).toContain('Other');
  });

  test('two maps on a page never share SVG ids', () => {
    const first = mount('# One\n\n## A').host;
    const second = mount('# Two\n\n## B').host;
    const ids = (host: HTMLElement) => Array.from(host.querySelectorAll('[id]')).map((element) => element.id);
    expect(ids(first).length).toBeGreaterThan(0);
    expect(ids(first).filter((id) => ids(second).includes(id))).toEqual([]);
    const clip = second.querySelector('clipPath')?.id;
    expect(clip && second.querySelector(`[clip-path="url(#${clip})"]`) === null).toBe(true);
  });
});

describe('options', () => {
  test('undefined options keep the defaults', () => {
    const { host, renderer } = mount(ROADMAP, { viewMode: undefined, interactive: undefined, showControls: undefined });
    expect(renderer.getViewMode()).toBe('focus');
    expect(host.querySelector('.orbit--static')).toBeNull();
    expect(host.querySelector<HTMLElement>('.orbit-controls')?.hidden).toBe(false);
  });

  test('the document picks the first view; later renders keep the reader’s', () => {
    const { renderer } = mount(`---\nview: all\n---\n${ROADMAP}`);
    expect(renderer.getViewMode()).toBe('all');
    renderer.setViewMode('focus');
    renderer.render(parseOrbit(`---\nview: all\n---\n${ROADMAP}\n## Grow`));
    expect(renderer.getViewMode()).toBe('focus');
  });

  test('a bare tree after a document leaves the document’s frontmatter behind', () => {
    const { host, renderer } = mount('---\ntheme: night\ntitle: Doc\n---\n# A\n## B');
    expect(host.querySelector('.orbit')?.getAttribute('data-orbit-theme')).toBe('night');
    renderer.render(parseOrbit('# X\n## Y').root);
    expect(host.querySelector('.orbit')?.getAttribute('data-orbit-theme')).toBe('paper');
    expect(renderer.getDocument()!.options).toEqual({});
    const markdown = renderer.toMarkdown();
    expect(markdown).not.toContain('night');
    expect(markdown).not.toContain('Doc');
    expect(markdown).toContain('# X');
  });

  test('a theme name sets the theme attribute; an unknown one falls back to paper', () => {
    for (const preset of ['night', 'cosmos', 'auto']) {
      const { host } = mount('# A', { theme: preset as 'night' });
      expect(host.querySelector('.orbit')?.getAttribute('data-orbit-theme')).toBe(preset);
    }

    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    const { host } = mount('# A', { theme: 'neon' as 'night' });
    expect(host.querySelector('.orbit')?.getAttribute('data-orbit-theme')).toBe('paper');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Unknown theme "neon"');
    warn.mockRestore();
  });

  test('a theme object sets token fallbacks that page CSS can still override', () => {
    const { host, renderer } = mount('# A', { theme: { preset: 'night', tokens: { surface: '#101010', 'control-background': 'rgb(1, 2, 3)' } } });
    const root = host.querySelector<HTMLElement>('.orbit');
    expect(root?.getAttribute('data-orbit-theme')).toBe('night');
    expect(root?.style.getPropertyValue('--_orbit-surface')).toBe('var(--orbit-surface, #101010)');
    expect(root?.style.getPropertyValue('--_orbit-control-background')).toBe('var(--orbit-control-background, rgb(1, 2, 3))');
    renderer.setOptions({ theme: { tokens: { surface: '#202020' } } });
    expect(root?.style.getPropertyValue('--_orbit-control-background')).toBe('');
  });

  test('a theme moves where nodes catch the light, and a change of theme moves it back', () => {
    const { host, renderer } = mount('# A\n## B', { theme: 'liquid' });

    const shade = () => {
      const gradient = host.querySelector('svg radialGradient[id$="-shade"]:not([id$="-speck-shade"])');
      return ['cx', 'cy', 'r'].map((name) => gradient?.getAttribute(name)).join(' ');
    };

    expect(shade()).toBe('0.53 0.55 0.56');
    renderer.setOptions({ theme: { preset: 'paper', tokens: { 'node-shade-circle': '0.5 0.5 0.7' } } });
    expect(shade()).toBe('0.5 0.5 0.7');
    // Values that aren't three numbers with a radius keep the usual light from the top left.
    renderer.setOptions({ theme: { preset: 'paper', tokens: { 'node-shade-circle': 'center' } } });
    expect(shade()).toBe('0.34 0.3 0.78');
  });

  test('a theme object without a preset keeps the document’s theme', () => {
    const { host, renderer } = mount(`---\ntheme: cosmos\n---\n# A`, { theme: { tokens: { 'ring-dash': 'none' } } });
    const root = host.querySelector<HTMLElement>('.orbit');
    expect(root?.getAttribute('data-orbit-theme')).toBe('cosmos');
    expect(root?.style.getPropertyValue('--_orbit-ring-dash')).toBe('var(--orbit-ring-dash, none)');
    renderer.setOptions({ theme: 'ink' });
    expect(root?.getAttribute('data-orbit-theme')).toBe('ink');
  });

  test('interactive: false draws a still picture', () => {
    const { host } = mount(ROADMAP, { interactive: false });
    const svg = host.querySelector('svg.orbit__canvas');
    expect(host.querySelector('.orbit--static')).not.toBeNull();
    expect(svg?.getAttribute('role')).toBe('img');
    expect(host.querySelector('.orbit-node[tabindex]')).toBeNull();
    expect(host.querySelector<HTMLElement>('.orbit-controls')?.hidden).toBe(true);
    expect(host.querySelector('nav.orbit-outline button')).toBeNull();
  });

  test('showControls: false hides the controls', () => {
    const { host } = mount(ROADMAP, { showControls: false });
    expect(host.querySelector<HTMLElement>('.orbit-controls')?.hidden).toBe(true);
  });

  test('maxDepth limits what is drawn', () => {
    const { host, renderer } = mount(ROADMAP, { maxDepth: 1, viewMode: 'all' });
    expect(host.querySelector('[data-orbit-node-id="interviews"]')).toBeNull();
    expect(host.querySelector('[data-orbit-node-id="research"]')).not.toBeNull();
    renderer.setViewMode('focus');
    renderer.focusNode('research');
    expect(host.querySelectorAll('.orbit-node--planet')).toHaveLength(0);
  });

  test('a new palette recolors the same node elements', () => {
    const { host, renderer } = mount(ROADMAP);
    const before = node(host, 'research');
    renderer.setOptions({ palette: ['#111111', '#222222', '#333333'] });
    const after = node(host, 'research');
    expect(after).toBe(before);
    expect(after.querySelector<SVGCircleElement>('.orbit-node__disc')?.style.fill).toBe('#222222');
  });
});

describe('drift', () => {
  const angleAfterOneSecond = (orbitSpeed: number): number => {
    const clock = manualClock();
    const { renderer } = mount(ROADMAP, { orbitAnimation: true, orbitSpeed });
    const spin = (renderer as unknown as { spinPhysics: { angle: number } }).spinPhysics;
    const start = spin.angle;
    clock.advance(1000);
    clock.restore();
    return spin.angle - start;
  };

  test('the orbit turns once every orbitSpeed seconds', () => {
    expect(angleAfterOneSecond(60)).toBeCloseTo(6, 0);
  });

  test('a speed that is not a positive number falls back to the default', () => {
    expect(angleAfterOneSecond(Number.NaN)).toBeCloseTo(4, 0);
    expect(angleAfterOneSecond(0)).toBeCloseTo(4, 0);
  });

  test('a slow drift paints only when the orbit has turned enough to show', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(ROADMAP, { orbitAnimation: true, orbitSpeed: 240 });
      let paints = 0;
      const paint = (renderer as unknown as { paint: () => void }).paint.bind(renderer);

      (renderer as unknown as { paint: () => void }).paint = () => {
        paints += 1;
        paint();
      };

      clock.advance(1000);
      expect(paints).toBeGreaterThan(5);
      expect(paints).toBeLessThan(40);
    } finally {
      clock.restore();
    }
  });

  test('the orbit rests while the camera zooms, and turns again after', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(ROADMAP, { orbitAnimation: true, orbitSpeed: 60, transitionDuration: 400 });
      const spin = (renderer as unknown as { spinPhysics: { angle: number } }).spinPhysics;
      clock.advance(100);
      renderer.zoomBy(1.6);
      clock.advance(32);
      const zooming = spin.angle;
      clock.advance(200);
      expect(spin.angle).toBe(zooming);
      clock.advance(1500);
      expect(spin.angle).toBeGreaterThan(zooming + 5);
    } finally {
      clock.restore();
    }
  });

  test('the drift sleeps while a leaf holds the focus, and resumes when the view spins again', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(ROADMAP, { orbitAnimation: true, orbitSpeed: 60 });
      const running = () => (renderer as unknown as { clock: { isRunning: boolean } }).clock.isRunning;
      // A moon with nothing under it: nothing in the view turns with the orbit.
      renderer.focusNode('interviews');
      clock.advance(500);
      expect(running()).toBe(false);
      renderer.focusNode('roadmap');
      clock.advance(1000);
      expect(internals(renderer).spinPhysics.angle).toBeGreaterThan(0);
    } finally {
      clock.restore();
    }
  });

  test('the orbit rests while the map is out of sight', () => {
    const callbacks: IntersectionObserverCallback[] = [];
    const original = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: class {
        constructor(callback: IntersectionObserverCallback) {
          callbacks.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
    });
    const clock = manualClock();

    try {
      const { renderer } = mount(ROADMAP, { orbitAnimation: true, orbitSpeed: 60 });
      const spin = (renderer as unknown as { spinPhysics: { angle: number } }).spinPhysics;
      const scrolled = (inView: boolean) => callbacks.at(-1)!([{ isIntersecting: inView } as IntersectionObserverEntry], {} as IntersectionObserver);
      scrolled(false);
      clock.advance(50);
      const resting = spin.angle;
      clock.advance(1000);
      expect(spin.angle).toBe(resting);
      scrolled(true);
      clock.advance(1000);
      expect(spin.angle - resting).toBeCloseTo(6, 0);
    } finally {
      clock.restore();

      if (original) {
        Object.defineProperty(globalThis, 'IntersectionObserver', original);
      } else {
        delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
      }
    }
  });
});

describe('framing', () => {
  /** Where each ring's edges land on screen: a ring reaches past the bodies on it. */
  const ringEdges = (renderer: OrbitSVGRenderer): { left: number; right: number; top: number; bottom: number }[] => {
    const { rings } = internals(renderer).scene as unknown as { rings: { cx: number; cy: number; radius: number }[] };
    return rings.map((ring) => ({
      left: onScreen(renderer, { x: ring.cx - ring.radius, y: ring.cy }).x,
      right: onScreen(renderer, { x: ring.cx + ring.radius, y: ring.cy }).x,
      top: onScreen(renderer, { x: ring.cx, y: ring.cy - ring.radius }).y,
      bottom: onScreen(renderer, { x: ring.cx, y: ring.cy + ring.radius }).y,
    }));
  };

  for (const count of [1, 2, 3, 5, 7]) {
    test(`focus mode keeps the sun at the center with ${count} planet(s)`, () => {
      const planets = Array.from({ length: count }, (_, index) => `## Planet ${index + 1}`).join('\n');
      const { renderer } = mount(`# Sun\n\n${planets}`);
      const sun = internals(renderer).scene?.nodes.get('sun');
      expect(sun).toBeDefined();
      const point = onScreen(renderer, sun!);
      expect(point.x).toBeCloseTo(300, 5);
      expect(point.y).toBeCloseTo(200, 5);
    });
  }

  test('the overview keeps the root at the center of a lopsided tree', () => {
    const { renderer } = mount('# Root\n\n## A\n- A1\n- A2\n- A3\n- A4\n## B', { viewMode: 'all' });
    const root = internals(renderer).scene?.nodes.get('root');
    const point = onScreen(renderer, root!);
    expect(point.x).toBeCloseTo(300, 5);
    expect(point.y).toBeCloseTo(200, 5);
  });

  test('everything fits inside the map', () => {
    const { renderer } = mount(ROADMAP);
    const { scene, camera } = internals(renderer);

    for (const entry of scene!.nodes.values()) {
      const point = onScreen(renderer, entry);
      const radius = entry.radius * camera.scale;
      expect(point.x - radius).toBeGreaterThanOrEqual(0);
      expect(point.x + radius).toBeLessThanOrEqual(600);
      expect(point.y - radius).toBeGreaterThanOrEqual(0);
      expect(point.y + radius).toBeLessThanOrEqual(400);
    }

    for (const edge of ringEdges(renderer)) {
      expect(edge.left).toBeGreaterThanOrEqual(0);
      expect(edge.right).toBeLessThanOrEqual(600);
      expect(edge.top).toBeGreaterThanOrEqual(0);
      expect(edge.bottom).toBeLessThanOrEqual(400);
    }
  });

  test('the overview fits the rings, which reach past the nodes on them', () => {
    const { renderer } = mount(ROADMAP, { viewMode: 'all' });
    expect(internals(renderer).scene!.kind).toBe('overview');

    for (const edge of ringEdges(renderer)) {
      expect(edge.left).toBeGreaterThanOrEqual(0);
      expect(edge.right).toBeLessThanOrEqual(600);
      expect(edge.top).toBeGreaterThanOrEqual(0);
      expect(edge.bottom).toBeLessThanOrEqual(400);
    }
  });
});

describe('resizing', () => {
  type Flight = { target: unknown };

  test('a container a pixel shorter keeps the flight going, and the view as it was laid out', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(ROADMAP, { transitionDuration: 600 });
      const state = internals(renderer);
      renderer.focusNode('research');
      clock.advance(48);
      const flight = state.transition as unknown as Flight;
      expect(flight).not.toBeNull();
      state.handleResize({ width: 600, height: 399 });
      expect(state.transition as unknown).toBe(flight);
      clock.advance(1000);
      expect(state.scene as unknown).toBe(flight.target);
      expect(onScreen(renderer, state.scene!.nodes.get('research')!).y).toBeCloseTo(199.5, 5);
    } finally {
      clock.restore();
    }
  });

  test('a much smaller container lets the flight land, then lays the view out for its size', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(ROADMAP, { transitionDuration: 600 });
      const state = internals(renderer);
      renderer.focusNode('research');
      clock.advance(48);
      const flight = state.transition as unknown as Flight;
      state.handleResize({ width: 300, height: 200 });
      expect(state.transition as unknown).toBe(flight);
      clock.advance(1000);
      expect(state.transition).toBeNull();
      expect(state.scene?.focusId).toBe('research');
      expect(state.scene as unknown).not.toBe(flight.target);
      const sun = onScreen(renderer, state.scene!.nodes.get('research')!);
      expect(sun.x).toBeCloseTo(150, 5);
      expect(sun.y).toBeCloseTo(100, 5);
    } finally {
      clock.restore();
    }
  });

  test('a narrow map trades its breadcrumbs for a back chip', () => {
    const { host, renderer } = mount(ROADMAP);
    const root = host.querySelector('.orbit')!;
    expect(root.classList.contains('orbit--narrow')).toBe(false);
    internals(renderer).handleResize({ width: 400, height: 400 });
    expect(root.classList.contains('orbit--narrow')).toBe(true);
    internals(renderer).handleResize({ width: 800, height: 400 });
    expect(root.classList.contains('orbit--narrow')).toBe(false);
  });

  test('at rest, a pixel more or less keeps the view, zoomed as it was', () => {
    const { renderer } = mount(ROADMAP);
    const state = internals(renderer);
    const scene = state.scene;
    state.zoomAt(1.5, { x: 300, y: 200 });
    const camera = { ...state.camera };
    state.handleResize({ width: 601, height: 399 });
    expect(state.scene).toBe(scene);
    expect(state.camera).toEqual(camera);
  });
});

describe('labels while the camera moves', () => {
  test('labels ride along as one layer while the camera zooms, and are placed again when it rests', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(ROADMAP, { transitionDuration: 400 });
      clock.advance(1000);
      const layer = host.querySelector<HTMLElement>('.orbit__labels')!;
      const label = host.querySelector<HTMLElement>('.orbit-label[data-orbit-for="research"]')!;
      const placed = label.style.transform;
      renderer.zoomBy(1.2);
      clock.advance(64);
      expect(label.style.transform).toBe(placed);
      expect(layer.style.transform).toMatch(/^translate\(.+\) scale\(1\.\d+\)$/);
      clock.advance(1000);
      expect(layer.style.transform).toBe('');
      expect(label.style.transform).not.toBe(placed);
    } finally {
      clock.restore();
    }
  });

  test('a long zoom places the labels again on the way, so they never grow or shrink much', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(ROADMAP, { transitionDuration: 400 });
      clock.advance(1000);
      const layer = host.querySelector<HTMLElement>('.orbit__labels')!;
      renderer.zoomBy(3);

      for (let frame = 0; frame < 40; frame += 1) {
        clock.advance(16);
        const scale = Number(/scale\(([\d.]+)\)/.exec(layer.style.transform)?.[1] ?? 1);
        expect(scale).toBeLessThanOrEqual(1.25);
        expect(scale).toBeGreaterThanOrEqual(0.8);
      }
    } finally {
      clock.restore();
    }
  });
});

describe('flights', () => {
  const HUB = `# Root\n\n## Hub\n${Array.from({ length: 12 }, (_, index) => `- Leaf ${index + 1}`).join('\n')}\n\n## Other`;

  test('the ideas a flight brings in grow out of their parent as one group', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(HUB, { transitionDuration: 600 });
      clock.advance(1000);
      renderer.focusNode('hub');
      clock.advance(300);
      // Leaf 12 wasn't one of the hub's moons: it grows out of the hub with the other newcomers.
      const leaf = node(host, 'leaf-12');
      const family = leaf.parentElement!;
      expect(family.classList.contains('orbit-family')).toBe(true);
      expect(node(host, 'leaf-11').parentElement).toBe(family);
      // Leaf 1 was a moon: it travels on its own, outside the newcomers' group.
      expect(node(host, 'leaf-1').parentElement).not.toBe(family);
      const placed = leaf.getAttribute('transform');
      const moved = family.getAttribute('transform');
      expect(moved).toMatch(/^matrix\(/);
      // Each newcomer holds still where it will rest, not where its siblings do.
      expect(node(host, 'leaf-11').getAttribute('transform')).not.toBe(placed);
      clock.advance(100);
      expect(leaf.getAttribute('transform')).toBe(placed);
      expect(family.getAttribute('transform')).not.toBe(moved);
      // Landed: the group rests, and its leaves stay in it.
      clock.advance(1000);
      expect(family.getAttribute('transform')).toBeNull();
      expect(node(host, 'leaf-12').parentElement).toBe(family);
    } finally {
      clock.restore();
    }
  });

  test('a flight into hundreds of new ideas creates them over its first frames, before they show', () => {
    const clock = manualClock();

    try {
      const leaves = Array.from({ length: 300 }, (_, index) => `- Leaf ${index + 1}`).join('\n');
      const { host, renderer } = mount(`# Root\n\n## Hub\n${leaves}\n\n## Other`, { transitionDuration: 800 });
      clock.advance(1000);
      renderer.focusNode('hub');
      const created = () => host.querySelectorAll('[data-orbit-node-id^="leaf-"]').length;
      expect(created()).toBeLessThan(150);
      clock.advance(400);
      expect(created()).toBe(300);
    } finally {
      clock.restore();
    }
  });

  test('ideas that leave shrink into their parent as one group', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(HUB, { transitionDuration: 600, focus: 'hub' });
      clock.advance(1000);
      renderer.focusNode('root');
      clock.advance(150);
      const family = node(host, 'leaf-12').parentElement!;
      expect(family.getAttribute('transform')).toMatch(/^matrix\(0\.\d+ 0 0 0\.\d+ /);
      expect(node(host, 'leaf-11').parentElement).toBe(family);
      // Each one holds still where it was as the flight began.
      expect(node(host, 'leaf-11').getAttribute('transform')).not.toBe(node(host, 'leaf-12').getAttribute('transform'));
    } finally {
      clock.restore();
    }
  });
});

describe('colors', () => {
  const fill = (host: HTMLElement, id: string) => node(host, id).querySelector<SVGCircleElement>('.orbit-node__disc')?.style.fill;

  test('a branch keeps its color when it becomes the sun, and its children share it', () => {
    const { host, renderer } = mount(ROADMAP);
    const planetColor = fill(host, 'build');
    renderer.focusNode('build');
    expect(fill(host, 'build')).toBe(planetColor);
    expect(fill(host, 'frontend')).toBe(planetColor);
    expect(fill(host, 'backend')).toContain(planetColor!);
  });

  test('a node’s own color wins', () => {
    const { host } = mount('# Root\n\n## Plain\n## Red <!-- orbit color: #ff0000 -->');
    expect(fill(host, 'red')).toBe('#ff0000');
  });

  test('nodes, rings and links carry their own color for the theme to mix with', () => {
    const { host, renderer } = mount(ROADMAP);
    const sunColor = fill(host, 'roadmap');
    expect(node(host, 'research').style.getPropertyValue('--orbit-node-color')).toBe(fill(host, 'research')!);
    const ring = host.querySelector<SVGPathElement>('.orbit-ring');
    expect(ring?.style.getPropertyValue('--orbit-ring-color')).toBe(sunColor!);
    expect(ring?.style.stroke).toBe('');
    renderer.setViewMode('all');
    const link = host.querySelector<SVGLineElement>('.orbit-link');
    expect(link?.style.getPropertyValue('--orbit-link-color')).not.toBe('');
  });

  test('the sun gets a halo and a wider shadow; planets get their own shadow, and small moons none', () => {
    const { host, renderer } = mount(ROADMAP);
    const shadowFilter = (id: string) => node(host, id).querySelector('.orbit-node__shadow')?.getAttribute('filter');
    expect(node(host, 'roadmap').querySelector('.orbit-node__halo')).not.toBeNull();
    expect(node(host, 'research').querySelector('.orbit-node__halo')).toBeNull();
    expect(shadowFilter('roadmap')).toMatch(/^url\(#orbit-[\w-]+-sun-shadow\)$/);
    expect(shadowFilter('research')).toMatch(/^url\(#orbit-[\w-]+(?<!-sun)-shadow\)$/);
    // Under a body this small, a shadow would be a smudge.
    expect(node(host, 'interviews').querySelector('.orbit-node__shadow')).toBeNull();
    // A planet that becomes the sun gets its halo then.
    renderer.focusNode('research');
    expect(node(host, 'research').querySelector('.orbit-node__halo')).not.toBeNull();
    expect(shadowFilter('research')).toMatch(/-sun-shadow\)$/);
  });

  test('a node gets its focus ring once it has focus', () => {
    const { host } = mount(ROADMAP);
    const research = node(host, 'research');
    expect(research.querySelector('.orbit-node__focus-ring')).toBeNull();
    research.focus();
    expect(research.querySelector('.orbit-node__focus-ring')).not.toBeNull();
  });

  test('overview nodes, often hundreds, get no shadow or halo', () => {
    const { host } = mount(ROADMAP, { viewMode: 'all' });
    expect(host.querySelectorAll('.orbit-node__shadow, .orbit-node__halo')).toHaveLength(0);
  });

  test('getNodeColor() reports the color a node is drawn with', () => {
    const { renderer } = mount('# Root\n\n## One\n- First\n- Second\n## Two\n## Red <!-- orbit color: "#FF0000" -->\n## Named <!-- orbit color: tomato -->');
    expect(renderer.getNodeColor('root')).toBe('#fad86f');
    expect(renderer.getNodeColor('one')).toBe('#febab6');
    expect(renderer.getNodeColor('first')).toBe('#febab6');
    expect(renderer.getNodeColor('second')).toMatch(/^#[0-9a-f]{6}$/);
    expect(renderer.getNodeColor('second')).not.toBe('#febab6');
    expect(renderer.getNodeColor('two')).toBe('#99e0ba');
    expect(renderer.getNodeColor('red')).toBe('#ff0000');
    expect(renderer.getNodeColor('named')).toBe('tomato');
    expect(renderer.getNodeColor('nowhere')).toBeNull();
  });

  test('getNodeColor() keeps up with edits and new options', () => {
    const { renderer } = mount('# Root\n\n## One\n- First\n## Two');
    expect(renderer.getNodeColor('one')).toBe('#febab6');
    renderer.updateNode('one', { color: '#123456' });
    expect(renderer.getNodeColor('one')).toBe('#123456');
    expect(renderer.getNodeColor('first')).toBe('#123456');
    const added = renderer.addNode('root', { text: 'Three' });
    expect(renderer.getNodeColor(added!.id)).toMatch(/^#[0-9a-f]{6}$/);
    renderer.setOptions({ palette: ['#111111', '#aa0000', '#00aa00'] });
    expect(renderer.getNodeColor('root')).toBe('#111111');
    expect(renderer.getNodeColor('two')).toBe('#00aa00');
    renderer.render('# Root\n\n## Other');
    expect(renderer.getNodeColor('one')).toBeNull();
    expect(renderer.getNodeColor('other')).toBe('#aa0000');
  });

  test('getNodeColor() follows the palette and the theme', () => {
    const { renderer } = mount(ROADMAP, { palette: ['#111111', '#aa0000', '#00aa00'] });
    expect(renderer.getNodeColor('roadmap')).toBe('#111111');
    expect(renderer.getNodeColor('research')).toBe('#aa0000');
    expect(renderer.getNodeColor('build')).toBe('#00aa00');
    expect(renderer.getNodeColor('launch')).toBe('#aa0000');
    renderer.setOptions({ palette: undefined, theme: 'night' });
    expect(renderer.getNodeColor('roadmap')).toBe('#fedb6d');
  });

  test('labels on dark nodes switch to the theme’s light text', () => {
    const { host } = mount('# Root\n\n## Deep <!-- orbit color: #0b3d2e -->\n## Pale <!-- orbit color: #f4f1de -->');
    const label = (text: string) => Array.from(host.querySelectorAll('.orbit-label')).find((element) => element.textContent?.includes(text));
    expect(label('Deep')?.classList.contains('orbit-label--light')).toBe(true);
    expect(label('Pale')?.classList.contains('orbit-label--light')).toBe(false);
  });
});

describe('toSVGString', () => {
  test('exports a standalone SVG: plain colors, text labels, no stylesheet needed', () => {
    const { renderer } = mount(ROADMAP, { ariaLabel: 'Team roadmap' });
    const svg = renderer.toSVGString();
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('<title>Team roadmap</title>');
    expect(svg).not.toContain('var(');
    expect(svg).not.toContain('color-mix');
    expect(svg).toMatch(/fill="#[0-9a-f]{6}"/);
    expect(svg).toContain('>Roadmap</tspan>');
    expect(svg).toContain('Research');
    const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(parsed.querySelector('parsererror')).toBeNull();
  });

  test('escapes text from the map', () => {
    const { renderer } = mount('# Fish & <Chips>');
    expect(renderer.toSVGString()).toContain('Fish &amp; &lt;Chips&gt;');
  });
});

/** A table with `count` columns, the way a database map writes them. */
const table = (count: number): string => {
  return `# accounts\n\n${Array.from({ length: count }, (_, index) => `- column_${index}_with_a_name`).join('\n')}`;
};

describe('crowded orbits', () => {
  test('names go inside their planets, wrapping long identifiers where they read', () => {
    const { host } = mount(table(12));
    const label = host.querySelector<HTMLElement>('.orbit-label[data-orbit-for="column_3_with_a_name"]')!;
    expect(label.classList.contains('orbit-label--outside')).toBe(false);
    const lines = label.textContent!.split('\n');
    expect(lines.join('')).toBe('column_3_with_a_name');
    expect(lines.length).toBeGreaterThan(1);
    // Lines break after underscores, never inside a word piece.
    expect(lines.slice(0, -1).every((line) => line.endsWith('_'))).toBe(true);
  });

  test('planets of a crowded orbit are drawn flat; those of an ordinary one keep their shadows', () => {
    const crowded = mount(table(60));
    expect(node(crowded.host, 'column_0_with_a_name').classList.contains('orbit-node--flat')).toBe(true);
    // The sun keeps its shadow and halo.
    expect(node(crowded.host, 'accounts').classList.contains('orbit-node--flat')).toBe(false);
    const ordinary = mount(ROADMAP);
    expect(node(ordinary.host, 'research').classList.contains('orbit-node--flat')).toBe(false);
  });

  test('a crowded orbit\'s rims grow with their planets, in the export too', () => {
    const crowded = mount(table(60));
    expect(node(crowded.host, 'column_0_with_a_name').classList.contains('orbit-node--crowded')).toBe(true);
    expect(node(crowded.host, 'accounts').classList.contains('orbit-node--crowded')).toBe(false);
    expect(node(mount(ROADMAP).host, 'research').classList.contains('orbit-node--crowded')).toBe(false);
    // The export draws each planet's rim 4% of its radius wide per pixel of the theme's rim (1 px in paper).
    const svg = crowded.renderer.toSVGString();
    const rims = Array.from(svg.matchAll(/<circle cx="[^"]+" cy="[^"]+" r="([\d.]+)" fill="url\(#[^)]+-shade\)"[^>]* stroke-width="([\d.]+)"/g))
      .map((match) => ({ radius: Number(match[1]), width: Number(match[2]) }));
    const planets = rims.filter((rim) => rim.radius < 30);
    expect(planets.length).toBeGreaterThan(50);

    for (const rim of planets) {
      expect(rim.width).toBeCloseTo(0.04 * rim.radius, 1);
    }
  });

  test('zooming into a crowded orbit doesn’t enter a planet until it’s big enough to read', () => {
    const { renderer } = mount(table(60));
    const state = internals(renderer);
    const column = state.display!.nodes.get('column_0_with_a_name')!;
    const anchor = {
      x: (column.x - state.camera.x) * state.camera.scale + 300,
      y: (column.y - state.camera.y) * state.camera.scale + 200,
    };
    state.zoomAt(2, anchor);
    expect(renderer.getFocusPath()).toEqual(['accounts']);

    for (let step = 0; step < 6 && renderer.getFocusPath().length === 1; step += 1) {
      state.zoomAt(1.25, anchor);
    }

    expect(renderer.getFocusPath()).toEqual(['accounts', 'column_0_with_a_name']);
  });
});
