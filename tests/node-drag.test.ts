import { beforeEach, describe, expect, test } from 'bun:test';
import type { OrbitEdit, OrbitNodeDragEvent, RendererOptions } from '../src/core/types';
import { buildFocusScene } from '../src/core/engine/scene';
import { nodeUnder, orbitPlaceAt, unreachableIds } from '../src/core/engine/node-drag';
import type { Display, DisplayNode } from '../src/core/engine/display';
import { parseOrbit } from '../src/core/dispatch';
import { click, internals, mount, node, onScreen, pointer, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `# Trip

## Food
- Tacos
## Museums
## Beaches`;

const VIEWPORT = { width: 600, height: 400 };
const HOLD = 20;

interface Point {
  x: number;
  y: number;
}

/** Where a node is drawn on screen this frame. */
const drawnAt = (renderer: Parameters<typeof internals>[0], id: string): Point => {
  const entry = internals(renderer).display?.nodes.get(id);

  if (!entry) {
    throw new Error(`"${id}" isn't drawn`);
  }

  return onScreen(renderer, entry);
};

/** The place held in the orbit for a planet being dragged, when it shows. */
const heldPlace = (host: HTMLElement): Element | null => {
  const element = host.querySelector<SVGGElement>('.orbit-add--held');
  return element && element.style.display !== 'none' ? element : null;
};

const childIds = (renderer: Parameters<typeof internals>[0], id: string): string[] => {
  const tree = renderer.getDocument()!.root;
  const stack = [tree];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current.id === id) {
      return current.children.map((child) => child.id);
    }

    stack.push(...current.children);
  }

  return [];
};

/** An editable map with a short long press, recording its drag and edit events. */
const editableMap = (options: RendererOptions = {}) => {
  const drags: OrbitNodeDragEvent[] = [];
  const edits: OrbitEdit[] = [];
  const mounted = mount(MAP, {
    editable: true,
    longPressDelay: HOLD,
    onNodeDrag: (event) => drags.push(event),
    onEdit: (edit) => edits.push(edit),
    ...options,
  });
  return { ...mounted, drags, edits };
};

/** Holds a press on node `id` until it lifts. */
const lift = async (host: HTMLElement, renderer: Parameters<typeof internals>[0], id: string, kind: 'touch' | 'mouse' = 'touch'): Promise<Point> => {
  const at = drawnAt(renderer, id);
  node(host, id).dispatchEvent(pointer('pointerdown', { ...at, time: 1, kind }));
  await Bun.sleep(HOLD * 3);
  return at;
};

const move = (host: HTMLElement, to: Point, kind: 'touch' | 'mouse' = 'touch', id = 1): void => {
  host.querySelector('svg')!.dispatchEvent(pointer('pointermove', { ...to, time: 50, kind, id }));
};

const release = (host: HTMLElement, at: Point, kind: 'touch' | 'mouse' = 'touch', type = 'pointerup'): void => {
  host.querySelector('svg')!.dispatchEvent(pointer(type, { ...at, time: 90, kind }));
};

describe('where a dragged node would go', () => {
  test('never into itself, anything under it, or the parent it is already in', () => {
    const tree = parseOrbit(MAP).root;
    const food = tree.children[0];
    expect(Array.from(unreachableIds(food, 'trip')).sort()).toEqual(['food', 'tacos', 'trip']);
  });

  test('the node under the point: the most central catch, and the target so far holds on further', () => {
    const body = (id: string, x: number, radius: number): DisplayNode => ({
      id, node: { id, text: id, level: 1, children: [] }, role: 'planet', x, y: 0, radius, opacity: 1, labelOpacity: 1, color: '#888', depth: 1, hiddenChildren: 0,
    });
    const display: Display = { nodes: new Map([['left', body('left', 0, 20)], ['right', body('right', 30, 20)]]), rings: [], links: [], camera: { x: 0, y: 0, scale: 1 } };
    const whole = (entry: DisplayNode, current: boolean) => entry.radius * (current ? 1.3 : 1);
    expect(nodeUnder(display, { x: 12, y: 0 }, new Set(), whole, null)?.id).toBe('left');
    expect(nodeUnder(display, { x: 18, y: 0 }, new Set(), whole, null)?.id).toBe('right');
    expect(nodeUnder(display, { x: 12, y: 0 }, new Set(['left']), whole, null)?.id).toBe('right');
    expect(nodeUnder(display, { x: 0, y: 24 }, new Set(), whole, null)).toBeNull();
    expect(nodeUnder(display, { x: 0, y: 24 }, new Set(), whole, 'left')?.id).toBe('left');
    // Catching only nearer the middle, the rims between them catch nothing.
    const middles = (entry: DisplayNode) => entry.radius * 0.6;
    expect(nodeUnder(display, { x: 15, y: 0 }, new Set(), middles, null)).toBeNull();
  });

  test('a place in the orbit: the gap under the point, among the planets as drawn, without the dragged one', () => {
    const tree = parseOrbit(MAP).root;
    // Beaches is being dragged, held at its own place: Food at the top, Museums on the right, Beaches' place at the bottom, the + on the left.
    const layout = buildFocusScene(tree, 'trip', { viewport: VIEWPORT, colors: new Map(), reorder: { id: 'beaches', index: 2 }, addSlot: {} });
    expect(layout.nodes.get('beaches')?.orbitAngle).toBe(90);
    const radius = layout.rings[0].radius;
    const at = (degrees: number, distance = radius) => ({ x: distance * Math.cos((degrees * Math.PI) / 180), y: distance * Math.sin((degrees * Math.PI) / 180) });
    const placeAt = (degrees: number, current: number, rotation = 0) => orbitPlaceAt(layout, at(degrees), rotation, 0, 20, 'beaches', current);
    // Near the place held, it stays.
    expect(placeAt(90, 2)).toBe(2);
    expect(placeAt(70, 2)).toBe(2);
    // Between Food and Museums.
    expect(placeAt(-45, 2)).toBe(1);
    // Between the + and Food, the first place and the last are one gap: the one held stays.
    expect(placeAt(-120, 2)).toBe(2);
    expect(placeAt(-120, 1)).toBe(0);
    // A spun orbit is drawn turned.
    expect(placeAt(0, 2, 45)).toBe(1);
    expect(orbitPlaceAt(layout, at(-45, radius * 0.3), 0, 0, 20, 'beaches', 2)).toBeNull();
  });

  test('a planet laid out at another place among its siblings', () => {
    const tree = parseOrbit(MAP).root;
    const layout = buildFocusScene(tree, 'trip', { viewport: VIEWPORT, colors: new Map(), reorder: { id: 'food', index: 2 } });
    const angles = ['museums', 'beaches', 'food'].map((id) => layout.nodes.get(id)?.orbitAngle);
    expect(angles).toEqual([-90, 30, 150]);
    // Its moons go with it.
    expect(layout.nodes.get('tacos')?.hostId).toBe('food');
  });

  test('an orbit with nothing else on it takes it anywhere on its ring', () => {
    const tree = parseOrbit('# Solo\n\n## Only').root;
    const layout = buildFocusScene(tree, 'solo', { viewport: VIEWPORT, colors: new Map(), reorder: { id: 'only', index: 0 }, addSlot: {} });
    const radius = layout.rings[0].radius;
    expect(orbitPlaceAt(layout, { x: radius, y: 0 }, 0, 0, 20, 'only')).toBe(0);
    expect(orbitPlaceAt(layout, { x: radius * 0.2, y: 0 }, 0, 0, 20, 'only')).toBeNull();
  });
});

describe('dragging a node somewhere else', () => {
  test('a long press lifts a planet; dragged onto another, it moves into it', async () => {
    const { host, renderer, drags, edits } = editableMap();
    const start = await lift(host, renderer, 'museums');
    expect(node(host, 'museums').classList.contains('orbit-node--lifted')).toBe(true);

    move(host, { x: start.x + 20, y: start.y });
    // It follows the press, above everything, and its place is held where it was: nothing moves, nothing slides under the press.
    expect(internals(renderer).scene!.nodes.get('museums')?.orbitAngle).toBe(0);
    expect(heldPlace(host)).not.toBeNull();
    expect((internals(renderer).scene as unknown as { addSlot?: { index: number } }).addSlot?.index).toBe(3);
    expect(node(host, 'museums').parentElement?.classList.contains('orbit__carried')).toBe(true);
    expect(drags[0]).toMatchObject({ phase: 'start', parent: { id: 'trip' }, index: 1 });

    const food = drawnAt(renderer, 'food');
    move(host, food);
    expect(node(host, 'food').classList.contains('orbit-node--drop-target')).toBe(true);
    // The place held waits while a node is the target.
    expect(heldPlace(host)?.classList.contains('orbit-add--waiting')).toBe(true);
    expect(drags.at(-1)).toMatchObject({ phase: 'over', parent: { id: 'food' }, index: null });
    const carried = drawnAt(renderer, 'museums');
    expect(carried.x).toBeCloseTo(food.x, 0);
    expect(carried.y).toBeCloseTo(food.y, 0);

    release(host, food);
    expect(childIds(renderer, 'food')).toEqual(['tacos', 'museums']);
    expect(childIds(renderer, 'trip')).toEqual(['food', 'beaches']);
    expect(edits.map((edit) => edit.kind)).toEqual(['move']);
    expect(drags.at(-1)).toMatchObject({ phase: 'end', node: { id: 'museums' }, parent: { id: 'food' }, index: 1 });
    expect(node(host, 'museums').parentElement?.classList.contains('orbit__carried')).toBe(false);
    expect(heldPlace(host)).toBeNull();
  });

  test('dragged along the orbit, a planet takes a new place there, which opens up as it passes', async () => {
    const { host, renderer, drags } = editableMap();
    const start = await lift(host, renderer, 'food');
    move(host, { x: start.x - 20, y: start.y });
    // Food's place is held at the top, Museums on the right, Beaches at the bottom, the + on the left:
    // lower right is past Museums.
    const sun = internals(renderer).display!.nodes.get('trip')!;
    const ring = (internals(renderer).scene as unknown as { rings: Array<{ radius: number }> }).rings[0].radius;
    const between = onScreen(renderer, { x: sun.x + ring * Math.SQRT1_2, y: sun.y + ring * Math.SQRT1_2 });
    move(host, between);
    // Museums makes room: Food is laid out after it.
    expect(internals(renderer).scene!.nodes.get('museums')?.orbitAngle).toBe(-90);
    expect(internals(renderer).scene!.nodes.get('food')?.orbitAngle).toBe(0);
    expect(drags.at(-1)).toMatchObject({ phase: 'over', parent: { id: 'trip' }, index: 1 });
    release(host, between);
    expect(childIds(renderer, 'trip')).toEqual(['museums', 'food', 'beaches']);
    expect(heldPlace(host)).toBeNull();
  });

  test('carried along a crowded orbit, a planet leaves the ring as it was until the drop', async () => {
    // A and C have six moons each: side by side, their moons need a wider ring.
    const lines = ['# Sky'];

    for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      lines.push(`## ${name}`, ...(name === 'A' || name === 'C' ? Array.from({ length: 6 }, (_, index) => `- ${name}${index + 1}`) : []));
    }

    const { host, renderer } = mount(lines.join('\n'), { editable: true, longPressDelay: HOLD });
    const ringRadius = () => (internals(renderer).scene as unknown as { rings: Array<{ radius: number }> }).rings[0].radius;
    const before = ringRadius();
    const start = await lift(host, renderer, 'a');
    move(host, { x: start.x + 20, y: start.y });
    // Below C, which is on the right: between C and D.
    const sun = internals(renderer).display!.nodes.get('sky')!;
    const between = onScreen(renderer, { x: sun.x + before * Math.cos(Math.PI / 8), y: sun.y + before * Math.sin(Math.PI / 8) });
    move(host, between);
    expect(internals(renderer).scene!.nodes.get('a')?.orbitAngle).toBe(0);
    expect(ringRadius()).toBe(before);
    release(host, between);
    expect(childIds(renderer, 'sky')).toEqual(['b', 'c', 'a', 'd', 'e', 'f', 'g']);
    expect(ringRadius()).toBeGreaterThan(before);
  });

  test('let go over nothing, or with Escape, it goes back where it was', async () => {
    const { host, renderer, drags, edits } = editableMap();
    const start = await lift(host, renderer, 'museums');
    move(host, { x: start.x + 20, y: start.y });
    move(host, { x: 4, y: 4 });
    release(host, { x: 4, y: 4 });
    expect(childIds(renderer, 'trip')).toEqual(['food', 'museums', 'beaches']);
    expect(internals(renderer).scene!.nodes.has('museums')).toBe(true);
    expect(drags.at(-1)).toMatchObject({ phase: 'end', parent: null, index: null });

    const again = await lift(host, renderer, 'beaches');
    move(host, { x: again.x + 20, y: again.y });
    host.querySelector('svg')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(internals(renderer).scene!.nodes.has('beaches')).toBe(true);
    release(host, drawnAt(renderer, 'food'));
    expect(childIds(renderer, 'trip')).toEqual(['food', 'museums', 'beaches']);
    expect(edits).toHaveLength(0);
  });

  test('a second finger puts it back, to pinch', async () => {
    const { host, renderer, drags } = editableMap();
    const start = await lift(host, renderer, 'museums');
    move(host, { x: start.x + 20, y: start.y });
    host.querySelector('svg')!.dispatchEvent(pointer('pointerdown', { x: 10, y: 10, time: 60, kind: 'touch', id: 2 }));
    expect(drags.at(-1)?.phase).toBe('end');
    expect(internals(renderer).scene!.nodes.has('museums')).toBe(true);
  });

  test('a moon goes with its planet, and a moon dropped on the sun joins its orbit', async () => {
    const { host, renderer } = editableMap();
    const start = await lift(host, renderer, 'food');
    move(host, { x: start.x + 30, y: start.y + 30 });
    const food = drawnAt(renderer, 'food');
    const tacos = drawnAt(renderer, 'tacos');
    // Tacos stays where it was around Food.
    expect(Math.hypot(tacos.x - food.x, tacos.y - food.y)).toBeGreaterThan(0);
    expect(Math.hypot(tacos.x - food.x, tacos.y - food.y)).toBeLessThan(80);
    // Back where it started, it lands in its own place.
    move(host, start);
    release(host, start);
    expect(childIds(renderer, 'trip')).toEqual(['food', 'museums', 'beaches']);

    const at = await lift(host, renderer, 'tacos');
    // Over Food, the planet it's leaving, the orbit stays as it is: no place opens there.
    move(host, drawnAt(renderer, 'food'));
    expect((internals(renderer).scene as unknown as { addSlot?: { index: number } }).addSlot?.index).toBe(3);
    move(host, { x: at.x, y: at.y + 5 });
    const sun = drawnAt(renderer, 'trip');
    move(host, sun);
    expect(node(host, 'trip').classList.contains('orbit-node--drop-target')).toBe(true);
    release(host, sun);
    expect(childIds(renderer, 'trip')).toEqual(['food', 'museums', 'beaches', 'tacos']);
    expect(childIds(renderer, 'food')).toEqual([]);
  });

  test('let go without moving, a long press with no menu of the page\'s own types into the node', async () => {
    const { host, renderer, drags } = editableMap();
    const at = await lift(host, renderer, 'museums');
    release(host, at);
    expect(host.querySelector<HTMLTextAreaElement>('.orbit-editor')?.hidden).toBe(false);
    expect(node(host, 'museums').classList.contains('orbit-node--lifted')).toBe(false);
    expect(drags).toHaveLength(0);
  });

  test('a page\'s own menu opens on the long press; moving closes it with the drag\'s start', async () => {
    const contexts: string[] = [];
    const { host, renderer, drags } = editableMap({ onNodeContext: (event) => contexts.push(event.node.id) });
    const start = await lift(host, renderer, 'museums');
    expect(contexts).toEqual(['museums']);
    move(host, { x: start.x + 20, y: start.y });
    expect(drags[0].phase).toBe('start');
    release(host, { x: 4, y: 4 });
  });

  test('a mouse held still lifts too; a slow click that doesn\'t move still opens the node', async () => {
    const { host, renderer } = editableMap();
    const start = await lift(host, renderer, 'museums', 'mouse');
    expect(node(host, 'museums').classList.contains('orbit-node--lifted')).toBe(true);
    move(host, { x: start.x + 10, y: start.y }, 'mouse');
    const beaches = drawnAt(renderer, 'beaches');
    move(host, beaches, 'mouse');
    release(host, beaches, 'mouse');
    expect(childIds(renderer, 'beaches')).toEqual(['museums']);

    const at = await lift(host, renderer, 'food', 'mouse');
    release(host, at, 'mouse');
    click(node(host, 'food'));
    expect(renderer.getFocusPath()).toEqual(['trip', 'food']);
  });

  test('maps that aren\'t editable don\'t lift nodes', async () => {
    const { host, renderer, drags } = editableMap({ editable: false });
    const start = await lift(host, renderer, 'museums');
    expect(node(host, 'museums').classList.contains('orbit-node--lifted')).toBe(false);
    move(host, { x: start.x + 40, y: start.y });
    release(host, { x: start.x + 40, y: start.y });
    expect(drags).toHaveLength(0);
    expect(childIds(renderer, 'trip')).toEqual(['food', 'museums', 'beaches']);
  });

  test('in the overview, a node dragged onto another moves into it', async () => {
    const { host, renderer } = editableMap();
    renderer.setViewMode('all');
    const start = await lift(host, renderer, 'beaches');
    move(host, { x: start.x + 20, y: start.y });
    // The overview keeps its layout: the node itself follows the press.
    expect(internals(renderer).scene!.nodes.has('beaches')).toBe(true);
    const museums = drawnAt(renderer, 'museums');
    move(host, museums);
    release(host, museums);
    expect(childIds(renderer, 'museums')).toEqual(['beaches']);
  });
});
