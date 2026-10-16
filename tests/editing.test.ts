import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { OrbitEdit, OrbitNode, OrbitNodeContextEvent } from '../src/core/types';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { click, internals, manualClock, mount, node, onScreen, pointer, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `---
theme: night
---
# Trip

## Food
- Tacos
## Museums
## Beaches`;

/** Ids and texts of a tree, as an outline. */
const outline = (tree: OrbitNode, depth = 0): string[] => {
  return [`${'  '.repeat(depth)}${tree.id}: ${tree.text}`, ...tree.children.flatMap((child) => outline(child, depth + 1))];
};

/** Lets a long press run its course. */
const holdStill = (): Promise<void> => {
  return Bun.sleep(560);
};

describe('editing the map', () => {
  test('addNode() adds a node with an id from its text, where asked, and draws it', () => {
    const { host, renderer } = mount(MAP);
    const added = renderer.addNode('trip', { text: 'Night markets', icon: '🏮' }, 1);
    expect(added?.id).toBe('night-markets');
    expect(added?.level).toBe(1);
    expect(added?.parent?.id).toBe('trip');
    expect(renderer.getDocument()?.root.children.map((child) => child.id)).toEqual(['food', 'night-markets', 'museums', 'beaches']);
    expect(node(host, 'night-markets')).toBeDefined();
  });

  test('addNode() adds the children it lists too, as one edit, with ids numbered in reading order', () => {
    const edits: OrbitEdit[] = [];
    const { renderer } = mount(MAP, { onEdit: (edit) => edits.push(edit) });
    const added = renderer.addNode('trip', { text: 'Food', children: [{ text: 'Markets', status: 'todo', children: [{ text: 'Food' }] }, { text: 'Bakeries' }] });
    expect(outline(added!)).toEqual(['food-2: Food', '  markets: Markets', '    food-3: Food', '  bakeries: Bakeries']);
    expect(added!.children[0]).toMatchObject({ level: 2, status: 'todo' });
    expect(added!.children[0].children[0].parent?.id).toBe('markets');
    expect(edits.map((edit) => `${edit.kind} ${edit.node.id}`)).toEqual(['add food-2']);
  });

  test('a repeated title gets the id the parsers would give it, and a title stays on one line', () => {
    const { renderer } = mount(MAP);
    expect(renderer.addNode('trip', { text: 'Museums' })?.id).toBe('museums-2');
    expect(renderer.addNode('food', { text: '  Street\nfood ' })?.text).toBe('Street food');
    expect(renderer.addNode('nowhere', { text: 'Lost' })).toBeNull();
  });

  test('a call with text instead of an object says how to make it', () => {
    const { renderer } = mount(MAP);
    expect(() => renderer.addNode('trip', 'Hikes' as never)).toThrow("addNode('trip', { text: 'New idea' })");
    expect(() => renderer.updateNode('food', null as never)).toThrow('but got null');
  });

  test('updateNode() sets and removes attributes', () => {
    const { renderer } = mount(MAP);
    renderer.updateNode('food', { status: 'done', color: '#E8A33D', tags: ['local'] });
    const food = renderer.updateNode('food', { color: undefined });
    expect(food?.status).toBe('done');
    expect(food?.tags).toEqual(['local']);
    expect('color' in (food as OrbitNode)).toBe(false);
    expect(renderer.updateNode('nowhere', { status: 'done' })).toBeNull();
  });

  test('an edited node is drawn again: its status, its text, and its parent\'s count', () => {
    const { host, renderer } = mount(`# Trip
## Food
## Museums
## Plan <!-- orbit link: "#museums" -->`);
    expect(node(host, 'trip').getAttribute('aria-label')).toContain('3 items');
    renderer.updateNode('food', { status: 'done' });
    expect(node(host, 'food').querySelector('.orbit-node__status--done')).not.toBeNull();
    renderer.updateNode('museums', { text: 'Galleries' });
    expect(host.querySelector('.orbit-label[data-orbit-for="museums"]')?.textContent).toContain('Galleries');
    renderer.addNode('trip', { text: 'Hikes' });
    expect(node(host, 'trip').getAttribute('aria-label')).toContain('4 items');
  });

  test('new text gives a node a new id, and the focus stays on it', () => {
    const { renderer } = mount(MAP);
    renderer.flyTo('food');
    const renamed = renderer.updateNode('food', { text: 'Street food' });
    expect(renamed?.id).toBe('street-food');
    expect(renderer.getFocusPath()).toEqual(['trip', 'street-food']);
    expect(renderer.getFocusedNode()).toBe(renamed);
    expect(renderer.toMarkdown()).not.toContain('id:');
  });

  test('a node keeps its id when a link points at it, or when the id was set by hand', () => {
    const { renderer } = mount(`# Trip
## Food <!-- orbit id: eat -->
## Museums
## Plan <!-- orbit link: "#museums" -->`);
    expect(renderer.updateNode('museums', { text: 'Galleries' })?.id).toBe('museums');
    expect(renderer.updateNode('eat', { text: 'Restaurants' })?.id).toBe('eat');
    const markdown = renderer.toMarkdown();
    expect(parseOrbit(markdown).root.children.map((child) => child.id)).toEqual(['eat', 'museums', 'plan']);
  });

  test('removeNode() removes a branch; the focus moves to what is left', () => {
    const focusChanges: string[] = [];
    const { renderer } = mount(MAP, { onFocusChange: (focused) => focusChanges.push(focused.id) });
    renderer.flyTo('tacos');
    focusChanges.length = 0;
    const removed = renderer.removeNode('food');
    expect(removed?.id).toBe('food');
    expect(removed?.children[0].id).toBe('tacos');
    expect(renderer.getFocusPath()).toEqual(['trip']);
    expect(focusChanges).toEqual(['trip']);
    expect(renderer.removeNode('trip')).toBeNull();
    expect(renderer.removeNode('nowhere')).toBeNull();
  });

  test('moveNode() moves a branch under another node, or to another place among its siblings', () => {
    const { renderer } = mount(MAP);
    const moved = renderer.moveNode('food', 'museums');
    expect(moved?.level).toBe(2);
    expect(moved?.children[0].level).toBe(3);
    expect(renderer.moveNode('beaches', 'trip', 0)?.parent?.id).toBe('trip');
    expect(outline(renderer.getDocument()!.root)).toEqual([
      'trip: Trip',
      '  beaches: Beaches',
      '  museums: Museums',
      '    food: Food',
      '      tacos: Tacos',
    ]);
    // The root stays the root, and a branch can't move inside itself.
    expect(renderer.moveNode('trip', 'food')).toBeNull();
    expect(renderer.moveNode('museums', 'tacos')).toBeNull();
  });

  test('each edit is reported through onEdit, on() and the DOM', () => {
    const fromOption: OrbitEdit[] = [];
    const { host, renderer } = mount(MAP, { onEdit: (edit) => fromOption.push(edit) });
    const fromListener = mock<(edit: OrbitEdit) => void>(() => undefined);
    const fromDom = mock<(event: Event) => void>(() => undefined);
    renderer.on('edit', fromListener);
    host.addEventListener('orbit-edit', fromDom);
    renderer.addNode('trip', { text: 'Hikes' });
    renderer.updateNode('hikes', { status: 'todo' });
    renderer.moveNode('hikes', 'beaches');
    renderer.removeNode('hikes');
    expect(fromOption.map((edit) => `${edit.kind} ${edit.node.id}`)).toEqual(['add hikes', 'update hikes', 'move hikes', 'remove hikes']);
    expect(fromOption[0].tree).toBe(renderer.getDocument()!.root);
    expect(fromListener).toHaveBeenCalledTimes(4);
    expect(fromDom).toHaveBeenCalledTimes(4);
  });

  test('toMarkdown() writes the edited map with its frontmatter, and reads back the same', () => {
    const { renderer } = mount(MAP);
    renderer.addNode('trip', { text: 'Museums', status: 'todo' });
    renderer.updateNode('tacos', { text: 'Street tacos' });
    const markdown = renderer.toMarkdown();
    expect(markdown.startsWith('---\ntheme: night\n---\n')).toBe(true);
    const reread = parseOrbit(markdown);
    expect(outline(reread.root)).toEqual(outline(renderer.getDocument()!.root));
    expect(reread.options.theme).toBe('night');
  });
});

describe('saving edited maps', () => {
  test('a repeated title is saved without an id attribute', () => {
    const document = parseOrbit('# Root\n## Ideas\n## Ideas\n### Ideas');
    expect(document.root.children.map((child) => child.id)).toEqual(['ideas', 'ideas-2']);

    for (const saved of [serializeOrbitMarkdown(document), serializeOrbitYAML(document)]) {
      expect(saved).not.toContain('ideas-');
      expect(outline(parseOrbit(saved).root)).toEqual(outline(document.root));
    }
  });

  test('an id the text wouldn\'t give is still saved', () => {
    const document = parseOrbit('# Root\n## Ideas <!-- orbit id: ideas-7 -->\n## Ideas');
    const saved = serializeOrbitMarkdown(document);
    expect(saved).toContain('ideas-7');
    expect(outline(parseOrbit(saved).root)).toEqual(outline(document.root));
  });

  test('a hand-set id ending in -1 is explicit, and kept through a rename', () => {
    const document = parseOrbit('# Root\n## Ideas <!-- orbit id: ideas-1 -->');
    const saved = serializeOrbitMarkdown(document);
    expect(saved).toContain('ideas-1');
    const { renderer } = mount('# Root\n## Ideas <!-- orbit id: ideas-1 -->');
    expect(renderer.updateNode('ideas-1', { text: 'Plans' })?.id).toBe('ideas-1');
  });
});

describe('animating edits', () => {
  test('a renamed node moves to its new place instead of leaving and arriving', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(MAP, { transitionDuration: 'auto' });
      clock.advance(1000);
      renderer.updateNode('beaches', { text: 'Coast' });
      clock.advance(32);
      const nodes = internals(renderer).display!.nodes;
      expect(nodes.has('beaches')).toBe(false);
      expect(nodes.get('coast')?.opacity).toBeGreaterThan(0.95);
    } finally {
      clock.restore();
    }
  });

  test('drawing the saved map again doesn\'t cut the edit\'s animation short', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(MAP, { transitionDuration: 'auto' });
      clock.advance(1000);
      renderer.addNode('trip', { text: 'Hikes' });
      const started = internals(renderer).transition?.startedAt;
      expect(started).toBeDefined();
      clock.advance(48);
      renderer.render(renderer.toMarkdown());
      expect(internals(renderer).transition?.startedAt).toBe(started);
      expect(renderer.getFocusedNode()).toBe(renderer.getDocument()!.root);
      expect(renderer.getDocument()!.root.children.map((child) => child.id)).toContain('hikes');
      // A different map still redraws.
      renderer.render('# Trip\n## Food');
      expect(internals(renderer).transition?.startedAt).not.toBe(started);
    } finally {
      clock.restore();
    }
  });

  test('drawing the same map again keeps every view, label and outline entry', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(MAP, { transitionDuration: 'auto' });
      clock.advance(1000);
      const view = node(host, 'food');
      const label = host.querySelector('.orbit-label[data-orbit-for="food"]');
      const outline = host.querySelector('nav.orbit-outline ul');
      expect(label).not.toBeNull();
      renderer.render(renderer.toMarkdown());
      clock.advance(100);
      expect(node(host, 'food')).toBe(view);
      expect(host.querySelector('.orbit-label[data-orbit-for="food"]')).toBe(label);
      expect(host.querySelector('nav.orbit-outline ul')).toBe(outline);
    } finally {
      clock.restore();
    }
  });

  test('a save after a same-map render writes against the latest text', () => {
    const { renderer } = mount('# Trip\n## Food\n- Tacos\n');
    // An editor's blank line changes nothing on the map, but it's the text a save keeps.
    renderer.render(parseOrbit('# Trip\n\n## Food\n- Tacos\n'));
    renderer.updateNode('tacos', { text: 'Tacos!' });
    expect(renderer.toMarkdown()).toBe('# Trip\n\n## Food\n- Tacos!\n');
  });
});

describe('long presses and context menus', () => {
  test('a long touch on a node reports it, and lifting the finger doesn\'t open the node', async () => {
    const seen: OrbitNodeContextEvent[] = [];
    const onFocusChange = mock<(focused: OrbitNode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onNodeContext: (event) => seen.push(event), onFocusChange });
    const museums = node(host, 'museums');
    const at = onScreen(renderer, internals(renderer).scene!.nodes.get('museums')!);
    museums.dispatchEvent(pointer('pointerdown', { ...at, time: 1, kind: 'touch' }));
    await holdStill();
    expect(seen.map((event) => event.node.id)).toEqual(['museums']);
    expect(seen[0].x).toBe(Math.round(at.x));
    expect(seen[0].y).toBe(Math.round(at.y));
    museums.dispatchEvent(pointer('pointerup', { ...at, time: 600, kind: 'touch' }));
    expect(click(museums).defaultPrevented).toBe(true);
    expect(onFocusChange).not.toHaveBeenCalled();
    // The next tap opens it as usual.
    click(museums);
    expect(renderer.getFocusPath()).toEqual(['trip', 'museums']);
  });

  test('longPressDelay sets how long the touch holds still', async () => {
    const onNodeContext = mock<(event: OrbitNodeContextEvent) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onNodeContext, longPressDelay: 120 });
    const at = onScreen(renderer, internals(renderer).scene!.nodes.get('museums')!);
    node(host, 'museums').dispatchEvent(pointer('pointerdown', { ...at, time: 1, kind: 'touch' }));
    await Bun.sleep(180);
    expect(onNodeContext).toHaveBeenCalledTimes(1);
    node(host, 'museums').dispatchEvent(pointer('pointerup', { ...at, time: 200, kind: 'touch' }));
  });

  test('a touch that moves is a spin, not a long press', async () => {
    const onNodeContext = mock<(event: OrbitNodeContextEvent) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onNodeContext });
    const museums = node(host, 'museums');
    const at = onScreen(renderer, internals(renderer).scene!.nodes.get('museums')!);
    museums.dispatchEvent(pointer('pointerdown', { ...at, time: 1, kind: 'touch' }));
    museums.dispatchEvent(pointer('pointermove', { x: at.x + 30, y: at.y + 10, time: 40, kind: 'touch' }));
    await holdStill();
    expect(onNodeContext).not.toHaveBeenCalled();
    museums.dispatchEvent(pointer('pointerup', { x: at.x + 30, y: at.y + 10, time: 600, kind: 'touch' }));
  });

  test('without anyone listening, a long press is an ordinary tap', async () => {
    const { host, renderer } = mount(MAP);
    const museums = node(host, 'museums');
    const at = onScreen(renderer, internals(renderer).scene!.nodes.get('museums')!);
    museums.dispatchEvent(pointer('pointerdown', { ...at, time: 1, kind: 'touch' }));
    await holdStill();
    museums.dispatchEvent(pointer('pointerup', { ...at, time: 600, kind: 'touch' }));
    expect(click(museums).defaultPrevented).toBe(false);
    expect(renderer.getFocusPath()).toEqual(['trip', 'museums']);
  });

  test('a right click reports the node and keeps the browser\'s menu closed; unheard, it opens', () => {
    const seen: string[] = [];
    const { host, renderer } = mount(MAP);

    const rightClick = () => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 });
      node(host, 'trip').dispatchEvent(event);
      return event;
    };

    expect(rightClick().defaultPrevented).toBe(false);
    renderer.on('node-context', (event) => seen.push(event.node.id));
    (internals(renderer) as unknown as { lastContext: null }).lastContext = null;
    expect(rightClick().defaultPrevented).toBe(true);
    expect(seen).toEqual(['trip']);
  });

  test('a DOM listener takes the press by calling preventDefault()', () => {
    const { host } = mount(MAP);
    host.addEventListener('orbit-node-context', (event) => event.preventDefault());
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 });
    node(host, 'food').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  test('the browser\'s long press and Orbit\'s report one press once', async () => {
    const onNodeContext = mock<(event: OrbitNodeContextEvent) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onNodeContext });
    const food = node(host, 'food');
    const at = onScreen(renderer, internals(renderer).scene!.nodes.get('food')!);
    food.dispatchEvent(pointer('pointerdown', { ...at, time: 1, kind: 'touch' }));
    const browserMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y });
    food.dispatchEvent(browserMenu);
    await holdStill();
    food.dispatchEvent(pointer('pointerup', { ...at, time: 600, kind: 'touch' }));
    expect(browserMenu.defaultPrevented).toBe(true);
    expect(onNodeContext).toHaveBeenCalledTimes(1);
    expect(click(food).defaultPrevented).toBe(true);
  });

  test('the context menu key and Shift+F10 report the node with keyboard focus, at its center', () => {
    const seen: OrbitNodeContextEvent[] = [];
    const { host, renderer } = mount(MAP, { onNodeContext: (event) => seen.push(event) });
    const beaches = node(host, 'beaches');
    const key = new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true });
    beaches.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    const center = onScreen(renderer, internals(renderer).scene!.nodes.get('beaches')!);
    expect(seen[0].node.id).toBe('beaches');
    expect(Math.abs(seen[0].x - center.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(seen[0].y - center.y)).toBeLessThanOrEqual(1);
    node(host, 'food').dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    expect(seen.map((event) => event.node.id)).toEqual(['beaches', 'food']);
  });
});
