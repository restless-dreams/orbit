import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { assignNodeColors, buildFocusScene, buildOverviewScene, type Scene } from '../src/core/engine/scene';
import { sceneDisplay, transitionDisplay, type Display, type Transition } from '../src/core/engine/display';
import { IDENTITY } from '../src/core/engine/camera';
import { renderToSVGString } from '../src/core/render-to-svg';
import stylesheet from '../src/core/styles/orbit.scss';
import type { OrbitEdit } from '../src/core/types';
import { internals, manualClock, mount, node, onScreen, useMapSize, useReducedMotion, type ManualClock } from './helpers/renderer';

useMapSize(600, 400);

const MAP = `# Spanish verbs

## Ser
- soy
- eres
- es

## Estar
- estoy
- estás

## Tener`;

const viewport = { width: 600, height: 400 };

const scene = (hidden: string[], focus = 'spanish-verbs') => {
  const tree = parseOrbit(MAP).root;
  const colors = assignNodeColors(tree, ['ROOT', 'ONE', 'TWO', 'THREE']);
  return buildFocusScene(tree, focus, { viewport, colors, hidden: new Set(hidden) });
};

const planetsOf = (built: ReturnType<typeof scene>) => [...built.nodes.values()].filter((entry) => entry.role === 'planet');

/** Where a planet or a place is in its orbit, and its color. */
const geometry = (entry: { id: string; x: number; y: number; radius: number; color: string; orbitAngle?: number; orbitRadius?: number }) => {
  const { id, x, y, radius, color, orbitAngle, orbitRadius } = entry;
  return { id, x, y, radius, color, orbitAngle, orbitRadius };
};

/** A flight from `from` to `target` that stays where it is, as a morph on the spot does. */
const morph = (from: Display, target: Scene): Transition => {
  return { from, target, placement: IDENTITY, cameraPath: { at: () => target.frame, length: 0 }, startedAt: 0, duration: 1 };
};

/** The live region's announcement, once its short wait is over. */
const announced = async (host: HTMLElement): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 40));
  return host.querySelector('.orbit__live')?.textContent ?? '';
};

/** The places the map draws now, in the order it draws them: where each is, and how strongly. */
const drawnPlaces = (host: HTMLElement): { transform: string | null; opacity: number }[] => {
  return [...host.querySelectorAll<SVGGElement>('.orbit-hidden-place')].map((place) => ({
    transform: place.getAttribute('transform'),
    opacity: place.style.opacity === '' ? 1 : Number(place.style.opacity),
  }));
};

/** The places on each frame of the next `milliseconds`. */
const placesOnEachFrame = (host: HTMLElement, clock: ManualClock, milliseconds: number): ReturnType<typeof drawnPlaces>[] => {
  const frames: ReturnType<typeof drawnPlaces>[] = [];

  for (let elapsed = 0; elapsed < milliseconds; elapsed += 16) {
    clock.advance(16);
    frames.push(drawnPlaces(host));
  }

  return frames;
};

/** Every place stays where it was and only ever fades: none moves, comes back or arrives. */
const expectHeldAndFading = (frames: ReturnType<typeof drawnPlaces>[], resting: ReturnType<typeof drawnPlaces>): void => {
  const transforms = resting.map((place) => place.transform);

  frames.forEach((frame, index) => {
    for (const place of frame) {
      expect(transforms).toContain(place.transform);
      const before = (index === 0 ? resting : frames[index - 1]).find((earlier) => earlier.transform === place.transform);
      expect(before).toBeDefined();
      expect(place.opacity).toBeLessThanOrEqual(before!.opacity);
    }
  });
};

/** Some frame draws every place partly faded: they fade over several frames rather than vanish at once. */
const fadesOverFrames = (frames: ReturnType<typeof drawnPlaces>[], count: number): boolean => {
  return frames.some((frame) => frame.length === count && frame.every((place) => place.opacity > 0.05 && place.opacity < 0.95));
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a scene whose sun hides its children', () => {
  test('keeps a place for each child where it will land, in its color, and draws none of them', () => {
    const shown = scene([]);
    const hidden = scene(['spanish-verbs']);
    expect([...hidden.nodes.keys()]).toEqual(['spanish-verbs']);
    expect(hidden.hiddenPlaces?.map(geometry)).toEqual(planetsOf(shown).map(geometry));
    expect(hidden.hiddenPlaces?.every((place) => place.parentId === 'spanish-verbs')).toBe(true);
  });

  test('keeps the rings and the camera, so showing the children moves nothing else', () => {
    const shown = scene([]);
    const hidden = scene(['spanish-verbs']);
    expect(hidden.rings).toEqual(shown.rings);
    expect(hidden.frame).toEqual(shown.frame);
    expect(hidden.extent).toEqual(shown.extent);
  });

  test('has no + to add to it until they are shown', () => {
    const tree = parseOrbit(MAP).root;
    const colors = assignNodeColors(tree, ['ROOT']);
    const hidden = buildFocusScene(tree, tree.id, { viewport, colors, addSlot: {}, hidden: new Set([tree.id]) });
    expect(hidden.addSlot).toBeUndefined();
    expect(buildFocusScene(tree, tree.id, { viewport, colors, addSlot: {} }).addSlot).toBeDefined();
  });

  test('draws a planet whose children are hidden as if folded: a count and no moons', () => {
    const hidden = scene(['ser']);
    const ser = hidden.nodes.get('ser');
    expect(ser?.hiddenChildren).toBe(3);
    expect(hidden.nodes.has('soy')).toBe(false);
    expect(hidden.nodes.has('estoy')).toBe(true);
    expect(hidden.hiddenPlaces).toBeUndefined();
  });

  test('leaves the hidden ideas out of the overview', () => {
    const tree = parseOrbit(MAP).root;
    const colors = assignNodeColors(tree, ['ROOT']);
    const overview = buildOverviewScene(tree, { viewport, colors, hidden: new Set(['ser']) });
    expect(overview.nodes.has('soy')).toBe(false);
    expect(overview.nodes.get('ser')?.hiddenChildren).toBe(3);
    expect(overview.nodes.has('estoy')).toBe(true);
  });
});

describe('the places of hidden children on screen', () => {
  test('turn with the orbit', () => {
    const hidden = scene(['spanish-verbs']);
    const place = hidden.hiddenPlaces![0];
    const turned = sceneDisplay(hidden, 90, hidden.frame).hiddenPlaces![0];
    const angle = ((place.orbitAngle + 90) * Math.PI) / 180;
    expect(turned.x).toBeCloseTo(place.orbitRadius * Math.cos(angle), 6);
    expect(turned.y).toBeCloseTo(place.orbitRadius * Math.sin(angle), 6);
    expect(turned.unturned).toMatchObject({ x: place.x, y: place.y });
  });

  test('stay as the children grow out of the sun toward them, fade as they land, and come back as they shrink into it', () => {
    const hidden = scene(['spanish-verbs']);
    const shown = scene([]);
    const reveal = morph(sceneDisplay(hidden, 0, hidden.frame), shown);
    const flying = transitionDisplay(reveal, 0.4);
    const landing = transitionDisplay(reveal, 0.8);
    expect(flying.hiddenPlaces?.every((place) => place.opacity === 1)).toBe(true);
    expect(landing.hiddenPlaces?.every((place) => place.opacity > 0 && place.opacity < 1)).toBe(true);
    expect(transitionDisplay(reveal, 1).hiddenPlaces?.every((place) => place.opacity === 0)).toBe(true);
    const ser = flying.nodes.get('ser')!;
    const end = shown.nodes.get('ser')!;
    expect(Math.hypot(ser.x, ser.y)).toBeGreaterThan(0);
    expect(Math.hypot(ser.x, ser.y)).toBeLessThan(Math.hypot(end.x, end.y));

    const hide = morph(sceneDisplay(shown, 0, shown.frame), hidden);
    expect(transitionDisplay(hide, 0.3).hiddenPlaces?.every((place) => place.opacity === 0)).toBe(true);
    expect(transitionDisplay(hide, 1).hiddenPlaces?.every((place) => place.opacity === 1)).toBe(true);
  });
});

describe('hideChildren and revealChildren', () => {
  let clock: ManualClock | null = null;

  afterEach(() => {
    clock?.restore();
    clock = null;
  });

  test('hide the ideas under the idea in focus, leaving their places, and show them again', () => {
    const { host, renderer } = mount(MAP);
    expect(renderer.hideChildren('spanish-verbs')).toBe(true);
    expect(() => node(host, 'ser')).toThrow();
    expect(host.querySelectorAll('.orbit-hidden-place')).toHaveLength(3);
    expect(host.querySelector('.orbit-hidden-places')?.getAttribute('aria-hidden')).toBe('true');

    expect(renderer.revealChildren('spanish-verbs')).toBe(true);
    expect(node(host, 'ser')).toBeTruthy();
    expect(host.querySelectorAll('.orbit-hidden-place')).toHaveLength(0);
  });

  test('never change the map: its text and its edits stay as they were', () => {
    const onEdit = mock<(edit: OrbitEdit) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onEdit });
    const edits = mock(() => undefined);
    host.querySelector('.orbit')?.addEventListener('orbit-edit', edits);
    const before = renderer.toMarkdown();
    renderer.hideChildren(['spanish-verbs', 'ser', 'estar']);
    renderer.revealChildren('ser');
    expect(renderer.toMarkdown()).toBe(before);
    expect(renderer.getDocument()?.root.children.map((child) => child.collapsed)).toEqual([undefined, undefined, undefined]);
    expect(onEdit).not.toHaveBeenCalled();
    expect(edits).not.toHaveBeenCalled();
  });

  test('say whether anything changed, and skip ids the map doesn\'t have', () => {
    const { renderer } = mount(MAP);
    expect(renderer.hideChildren(['nothing'])).toBe(false);
    expect(renderer.hideChildren('ser')).toBe(true);
    expect(renderer.hideChildren('ser')).toBe(false);
    expect(renderer.revealChildren('estar')).toBe(false);
    expect(renderer.revealChildren()).toBe(true);
    expect(renderer.revealChildren()).toBe(false);
  });

  test('keep a hidden idea\'s children hidden when the map flies into it', () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren(['ser', 'estar']);
    expect(() => node(host, 'soy')).toThrow();
    renderer.flyTo('ser');
    expect(renderer.getFocusedNode()?.id).toBe('ser');
    expect(() => node(host, 'soy')).toThrow();
    expect(host.querySelectorAll('.orbit-hidden-place')).toHaveLength(3);
  });

  test('show every hidden idea again with no ids', () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren(['spanish-verbs', 'ser']);
    renderer.revealChildren();
    expect(node(host, 'ser')).toBeTruthy();
    expect(node(host, 'soy')).toBeTruthy();
  });

  test('keep the outline from listing hidden ideas, and say how many there are', () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren('ser');
    const outline = host.querySelector('.orbit-outline')?.textContent ?? '';
    expect(outline).toContain('Ser, 3 hidden ideas');
    expect(outline).not.toContain('soy');
    expect(outline).toContain('estoy');
    renderer.revealChildren('ser');
    expect(host.querySelector('.orbit-outline')?.textContent).toContain('soy');
  });

  test('name a node by how many of its ideas are hidden, as the outline does, in the map\'s language', () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren(['spanish-verbs', 'ser']);
    expect(node(host, 'spanish-verbs').getAttribute('aria-label')).toBe('Spanish verbs, 3 hidden ideas');
    renderer.revealChildren('spanish-verbs');
    expect(node(host, 'spanish-verbs').getAttribute('aria-label')).toBe('Spanish verbs, 3 items');
    expect(node(host, 'ser').getAttribute('aria-label')).toBe('Ser, 3 hidden ideas');
    expect(node(host, 'estar').getAttribute('aria-label')).toBe('Estar, 2 items');
    renderer.setOptions({ language: 'es' });
    expect(node(host, 'ser').getAttribute('aria-label')).toBe('Ser, 3 ideas ocultas');
    expect(node(host, 'estar').getAttribute('aria-label')).toBe('Estar, 2 ideas');
    renderer.revealChildren('ser');
    expect(node(host, 'ser').getAttribute('aria-label')).toBe('Ser, 3 ideas');
  });

  test('leave hidden ideas out of the media viewer\'s gallery, as the outline does', () => {
    const PICTURES = '# Trip\n## Lisbon\n![Tram](https://example.com/tram.jpg)\n### Belém\n![Tower](https://example.com/tower.jpg)\n## Porto\n![Bridge](https://example.com/bridge.jpg)';
    const { renderer } = mount(PICTURES);
    const opened: string[] = [];
    renderer.on('media-open', (event) => opened.push(`${event.node.id} ${event.index + 1} of ${event.total}`));
    renderer.hideChildren('lisbon');
    // Lisbon's own picture shows; Belém's, under it, waits with it.
    renderer.openMedia('lisbon');
    renderer.closeMedia();
    renderer.revealChildren('lisbon');
    renderer.openMedia('lisbon');
    expect(opened).toEqual(['lisbon 1 of 2', 'lisbon 1 of 3']);
  });

  test('announce the hidden ideas of the idea in focus, and name them when they show', async () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren('spanish-verbs');
    expect(await announced(host)).toBe('Spanish verbs, 3 hidden ideas');
    renderer.revealChildren('spanish-verbs');
    expect(await announced(host)).toBe('Spanish verbs: Ser, Estar, and Tener');
  });

  test('speak the map\'s language', async () => {
    const { host, renderer } = mount(MAP, { language: 'es' });
    renderer.hideChildren('spanish-verbs');
    expect(await announced(host)).toBe('Spanish verbs, 3 ideas ocultas');
    expect(host.querySelector('.orbit-outline')?.textContent).toContain('Spanish verbs, 3 ideas ocultas');
    renderer.revealChildren('spanish-verbs');
    expect(await announced(host)).toBe('Spanish verbs: Ser, Estar y Tener');
  });

  test('outlast new text for the map, for the ideas it still has', () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren(['ser', 'estar']);
    renderer.render(parseOrbit(MAP.replace('## Estar\n- estoy\n- estás\n\n', '')));
    expect(() => node(host, 'soy')).toThrow();
    expect(renderer.revealChildren()).toBe(true);
    expect(node(host, 'soy')).toBeTruthy();
  });

  test('keep nothing for a node with no ideas under it', () => {
    const { renderer } = mount(MAP);
    expect(renderer.hideChildren('tener')).toBe(false);
    expect(renderer.revealChildren()).toBe(false);
    expect(renderer.hideChildren(['tener', 'ser'])).toBe(true);
    expect(renderer.revealChildren('tener')).toBe(false);
    expect(renderer.revealChildren()).toBe(true);
  });

  test('let go of a node once it has no ideas left, so ideas added later show', () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren('estar');
    renderer.removeNode('estoy');
    renderer.removeNode('estas');
    expect(renderer.revealChildren()).toBe(false);
    renderer.addNode('estar', { text: 'está' });
    expect(node(host, 'esta')).toBeTruthy();
    expect(host.querySelector('.orbit-outline')?.textContent).toContain('está');
  });

  test('keep a renamed node\'s ideas hidden, under its new id', () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren('ser');
    const renamed = renderer.updateNode('ser', { text: 'To be' });
    expect(renamed?.id).toBe('to-be');
    expect(() => node(host, 'soy')).toThrow();
    expect(host.querySelector('.orbit-outline')?.textContent).toContain('To be, 3 hidden ideas');
    expect(renderer.revealChildren('ser')).toBe(false);
    expect(renderer.revealChildren('to-be')).toBe(true);
    expect(node(host, 'soy')).toBeTruthy();
  });

  test('stay on their node when a rename gives another node a near id', () => {
    const { host, renderer } = mount(MAP);
    renderer.hideChildren('ser');
    // Estar takes "ser-2", beside the hidden "ser".
    expect(renderer.updateNode('estar', { text: 'Ser' })?.id).toBe('ser-2');
    expect(() => node(host, 'soy')).toThrow();
    expect(node(host, 'estoy')).toBeTruthy();
    // The hidden one takes a taken name's next id, and keeps its ideas hidden there.
    expect(renderer.updateNode('ser', { text: 'Tener' })?.id).toBe('tener-2');
    expect(() => node(host, 'soy')).toThrow();
    expect(host.querySelector('.orbit-outline')?.textContent).toContain('Tener, 3 hidden ideas');
    expect(renderer.revealChildren()).toBe(true);
    expect(node(host, 'soy')).toBeTruthy();
  });

  test('keep a hidden sun\'s ideas hidden while its name is typed on the map', () => {
    const { host, renderer } = mount(MAP, { editable: true });
    renderer.hideChildren('spanish-verbs');
    renderer.editNode('spanish-verbs');
    const field = host.querySelector<HTMLTextAreaElement>('.orbit-editor')!;
    field.value = 'Verbos';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(renderer.getFocusedNode()?.id).toBe('verbos');
    expect(() => node(host, 'ser')).toThrow();
    expect(host.querySelectorAll('.orbit-hidden-place')).toHaveLength(3);
  });

  test('grow the children out of the sun, with Orbit\'s own motion', () => {
    clock = manualClock();
    const { host, renderer } = mount(MAP, { transitionDuration: 'auto' });
    clock.advance(1_000);
    renderer.hideChildren('spanish-verbs');
    clock.advance(1_000);
    expect(host.querySelectorAll('.orbit-hidden-place')).toHaveLength(3);
    const place = internals(renderer).scene;
    expect(place?.nodes.size).toBe(1);

    renderer.revealChildren('spanish-verbs');
    clock.advance(120);
    const growing = internals(renderer).display?.nodes.get('ser');
    expect(growing).toBeDefined();
    clock.advance(1_000);
    expect(internals(renderer).transition).toBeNull();
    const landed = internals(renderer).display?.nodes.get('ser');
    expect(growing!.radius).toBeLessThan(landed!.radius);
    expect(Math.hypot(growing!.x, growing!.y)).toBeLessThan(Math.hypot(landed!.x, landed!.y));
    expect(host.querySelectorAll('.orbit-hidden-place')).toHaveLength(0);
  });
});

describe('the places through the map\'s own flights', () => {
  let clock: ManualClock | null = null;

  afterEach(() => {
    clock?.restore();
    clock = null;
  });

  test('hold still while the ideas grow out toward them, then fade as they land', () => {
    clock = manualClock();
    const { host, renderer } = mount(MAP, { transitionDuration: 'auto' });
    clock.advance(1_000);
    renderer.hideChildren('spanish-verbs');
    clock.advance(1_000);
    const resting = drawnPlaces(host);
    expect(resting).toHaveLength(3);

    renderer.revealChildren('spanish-verbs');
    // The flight's first frame is drawn at once.
    const frames = [drawnPlaces(host), ...placesOnEachFrame(host, clock, 600)];
    expect(frames.slice(0, 4)).toEqual([resting, resting, resting, resting]);
    expectHeldAndFading(frames, resting);
    expect(fadesOverFrames(frames, 3)).toBe(true);
    expect(frames.at(-1)).toEqual([]);
    expect(internals(renderer).transition).toBeNull();
  });

  test('fade with their orbit as the map flies away from the idea hiding them', () => {
    clock = manualClock();
    const { host, renderer } = mount(MAP, { transitionDuration: 'auto' });
    clock.advance(1_000);
    renderer.flyTo('ser');
    clock.advance(2_000);
    renderer.hideChildren('ser');
    clock.advance(1_000);
    const resting = drawnPlaces(host);
    expect(resting).toHaveLength(3);

    renderer.flyTo('spanish-verbs');
    const frames = [drawnPlaces(host), ...placesOnEachFrame(host, clock, 2_000)];
    expect(frames[0]).toEqual(resting);
    expectHeldAndFading(frames, resting);
    expect(fadesOverFrames(frames, 3)).toBe(true);
    expect(frames.at(-1)).toEqual([]);
    expect(renderer.getFocusedNode()?.id).toBe('spanish-verbs');
  });

  test('come back as the map flies into the idea hiding them, after its ideas have shrunk away', () => {
    clock = manualClock();
    const { host, renderer } = mount(MAP, { transitionDuration: 'auto' });
    clock.advance(1_000);
    renderer.hideChildren('ser');
    clock.advance(1_000);
    expect(drawnPlaces(host)).toEqual([]);

    renderer.flyTo('ser');
    const frames = placesOnEachFrame(host, clock, 2_000);
    expect(fadesOverFrames(frames, 3)).toBe(true);
    expect(frames.at(-1)?.map((place) => place.opacity)).toEqual([1, 1, 1]);
  });
});

describe('the places with reduced motion', () => {
  useReducedMotion();
  let clock: ManualClock | null = null;

  afterEach(() => {
    clock?.restore();
    clock = null;
  });

  test('fade out with the view they\'re in', () => {
    clock = manualClock();
    const { host, renderer } = mount(MAP);
    renderer.flyTo('ser');
    renderer.hideChildren('ser');
    clock.advance(1_000);
    const resting = drawnPlaces(host);
    expect(resting).toHaveLength(3);

    renderer.setOptions({ transitionDuration: 'auto' });
    renderer.flyTo('spanish-verbs');
    const frames = [drawnPlaces(host), ...placesOnEachFrame(host, clock, 600)];
    expect(frames[0]).toEqual(resting);
    expectHeldAndFading(frames, resting);
    expect(fadesOverFrames(frames, 3)).toBe(true);
    expect(frames.at(-1)).toEqual([]);
  });
});

describe('exporting a map with hidden ideas', () => {
  const PALETTE = ['#203040', '#c03020', '#2080c0', '#30a050'];
  /** The places in an SVG export: dotted circles. */
  const exportedPlaces = (svg: string) => [...svg.matchAll(/<circle [^>]*stroke-dasharray="0\.1 6"[^>]*\/>/g)].map((match) => match[0]);
  const attribute = (element: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(element)?.[1];

  test('draws the places as the screen does: where they are, in their ideas\' colors, and none of the hidden ideas', () => {
    const { renderer } = mount(MAP, { palette: PALETTE });
    renderer.hideChildren('spanish-verbs');
    const svg = renderer.toSVGString();
    const places = exportedPlaces(svg);
    const scene = internals(renderer).scene as unknown as Scene;
    expect(places).toHaveLength(3);

    scene.hiddenPlaces!.forEach((place, index) => {
      const center = onScreen(renderer, place);
      expect(Number(attribute(places[index], 'cx'))).toBeCloseTo(center.x, 1);
      expect(Number(attribute(places[index], 'cy'))).toBeCloseTo(center.y, 1);
      expect(Number(attribute(places[index], 'r'))).toBeCloseTo(place.radius * internals(renderer).camera.scale, 1);
    });

    expect(places.map((place) => attribute(place, 'fill'))).toEqual(['#c03020', '#2080c0', '#30a050']);
    expect(svg).not.toContain('>Ser<');
    expect(svg).not.toContain('>soy<');
  });

  test('follows the stylesheet\'s rule for the places', () => {
    const { renderer } = mount(MAP, { palette: PALETTE });
    renderer.hideChildren('spanish-verbs');
    const place = exportedPlaces(renderer.toSVGString())[0];
    const rule = /\.orbit-hidden-place__disc\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
    const declared = (name: string) => new RegExp(`(?:^|;|\\s)${name}:\\s*([^;]+)`).exec(rule)?.[1].trim();
    // The compiled stylesheet writes .24 for 0.24: compare the numbers.
    const numbers = (value: string | undefined) => value?.split(/\s+/).map(Number);

    for (const name of ['fill-opacity', 'stroke-opacity', 'stroke-width', 'stroke-dasharray']) {
      expect(numbers(declared(name))).toEqual(numbers(attribute(place, name)));
    }

    expect(declared('stroke-linecap')).toBe(attribute(place, 'stroke-linecap'));
  });

  test('exports where a reveal is going', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(MAP, { palette: PALETTE, transitionDuration: 'auto' });
      clock.advance(1_000);
      renderer.hideChildren('spanish-verbs');
      clock.advance(1_000);
      renderer.revealChildren('spanish-verbs');
      clock.advance(100);
      expect(internals(renderer).transition).not.toBeNull();
      const svg = renderer.toSVGString();
      expect(exportedPlaces(svg)).toEqual([]);
      expect(svg).toContain('>Ser<');
    } finally {
      clock.restore();
    }
  });

  test('leaves them to the view: renderToSVGString draws the map, every idea in it', () => {
    const { renderer } = mount(MAP, { palette: PALETTE });
    renderer.hideChildren('spanish-verbs');
    const drawn = renderToSVGString(renderer.toMarkdown(), { width: 600, height: 400, palette: PALETTE });
    expect(exportedPlaces(drawn)).toEqual([]);
    expect(drawn).toContain('>Ser<');
  });
});

describe('the map element', () => {
  test('hides and shows ideas through its renderer', async () => {
    const { defineOrbitMapElement } = await import('../src/core/auto-render');
    defineOrbitMapElement();
    const element = document.createElement('orbit-map') as HTMLElement & { hideChildren(ids: string): boolean; revealChildren(ids?: string): boolean };
    element.textContent = MAP;
    document.body.appendChild(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.hideChildren('ser')).toBe(true);
    expect(element.revealChildren()).toBe(true);
  });
});
