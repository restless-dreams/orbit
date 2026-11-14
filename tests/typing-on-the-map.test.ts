import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { OrbitEdit, OrbitEditorEvent } from '../src/core/types';
import { buildFocusScene } from '../src/core/engine/scene';
import { parseOrbit } from '../src/core/dispatch';
import { findNodeById } from '../src/core/utils';
import { click, internals, manualClock, mount, node, onScreen, pointer, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `# Trip

## Food
- Tacos
## Museums
## Beaches`;

interface EditorInternals {
  scene: { addSlot?: { index: number; parentId: string } };
  display: { addSlot?: { x: number; y: number; radius: number } ; nodes: Map<string, { x: number; y: number }> };
}

const slotOf = (renderer: Parameters<typeof internals>[0]): { index: number; parentId: string } | undefined => {
  return (internals(renderer) as unknown as EditorInternals).scene.addSlot;
};

const field = (host: HTMLElement): HTMLTextAreaElement => {
  const element = host.querySelector<HTMLTextAreaElement>('.orbit-editor');

  if (!element) {
    throw new Error('No field on the map');
  }

  return element;
};

/** Types `text` into the field, as a keyboard would. */
const type = (host: HTMLElement, text: string): void => {
  const element = field(host);
  element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const press = (host: HTMLElement, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  field(host).dispatchEvent(event);
  return event;
};

const plus = (host: HTMLElement): Element => {
  const element = host.querySelector('[data-orbit-add]');

  if (!element) {
    throw new Error('No + on the map');
  }

  return element;
};

describe('the + in the orbit', () => {
  test('a focus scene keeps a place after the children, laid out like a planet', () => {
    const tree = parseOrbit(MAP).root;
    const scene = buildFocusScene(tree, 'trip', { viewport: { width: 600, height: 400 }, colors: new Map(), addSlot: {} });
    expect(scene.addSlot).toMatchObject({ parentId: 'trip', index: 3 });
    expect(scene.nodes.has('\u0000orbit-add')).toBe(false);
    // The orbit opens around it, as around each planet.
    expect(scene.rings[0].gaps).toHaveLength(4);
    const between = buildFocusScene(tree, 'trip', { viewport: { width: 600, height: 400 }, colors: new Map(), addSlot: { index: 1 } });
    expect(between.addSlot?.index).toBe(1);
    expect(buildFocusScene(tree, 'trip', { viewport: { width: 600, height: 400 }, colors: new Map(), maxDepth: 0, addSlot: {} }).addSlot).toBeUndefined();
  });

  test('editable maps show it in focus mode; it comes and goes with the option', () => {
    const { host, renderer } = mount(MAP, { editable: true });
    expect(slotOf(renderer)).toMatchObject({ parentId: 'trip', index: 3 });
    expect(plus(host).getAttribute('aria-label')).toBe('Add an idea to Trip');
    renderer.setOptions({ editable: false });
    expect(slotOf(renderer)).toBeUndefined();
    renderer.setOptions({ editable: true });
    renderer.setViewMode('all');
    expect(slotOf(renderer)).toBeUndefined();
  });

  test("where it isn't drawn, it isn't a button for assistive technology either", () => {
    const { host, renderer } = mount(MAP, { editable: true });
    expect(plus(host).hasAttribute('aria-hidden')).toBe(false);
    // The overview has no +, and neither does a map that can't be edited, as a quiz's card isn't:
    // Chromium's WebView would still tell TalkBack of a button there, in the middle of the planet.
    renderer.setViewMode('all');
    expect(plus(host).getAttribute('aria-hidden')).toBe('true');
    renderer.setViewMode('focus');
    expect(plus(host).hasAttribute('aria-hidden')).toBe(false);
    renderer.setOptions({ editable: false });
    expect(plus(host).getAttribute('aria-hidden')).toBe('true');
  });

  test('pressing it opens a field there; Enter adds the idea and moves on to the next', () => {
    const opened: OrbitEditorEvent[] = [];
    const edits: OrbitEdit[] = [];
    const { host, renderer } = mount(MAP, { editable: true, onEditorOpen: (event) => opened.push(event), onEdit: (edit) => edits.push(edit) });
    click(plus(host));
    expect(opened).toHaveLength(1);
    expect(opened[0].node).toBeNull();
    expect(opened[0].parent?.id).toBe('trip');
    expect(document.activeElement).toBe(field(host));
    expect(field(host).placeholder).toBe('New idea');
    expect(field(host).getAttribute('enterkeyhint')).toBe('next');
    type(host, 'Night markets');
    expect(press(host, 'Enter').defaultPrevented).toBe(true);
    expect(edits.map((edit) => `${edit.kind} ${edit.node.text}`)).toEqual(['add Night markets']);
    expect(renderer.getDocument()!.root.children.map((child) => child.id)).toEqual(['food', 'museums', 'beaches', 'night-markets']);
    // The field stays, empty, in the next place.
    expect(field(host).hidden).toBe(false);
    expect(field(host).value).toBe('');
    expect(document.activeElement).toBe(field(host));
    expect(slotOf(renderer)?.index).toBe(4);
    type(host, 'Ferry ride');
    press(host, 'Enter');
    expect(renderer.getDocument()!.root.children.map((child) => child.text)).toEqual(['Food', 'Museums', 'Beaches', 'Night markets', 'Ferry ride']);
  });

  test('a touch held on it adds an idea however long it lasts, though browsers send no click after a long press', async () => {
    const opened: OrbitEditorEvent[] = [];
    const { host, renderer } = mount(MAP, { editable: true, longPressDelay: 60, onEditorOpen: (event) => opened.push(event) });
    const at = onScreen(renderer, (internals(renderer) as unknown as EditorInternals).display.addSlot!);
    const touch = (type: string, time: number, offset = 0) => plus(host).dispatchEvent(pointer(type, { x: at.x + offset, y: at.y, time, kind: 'touch' }));

    // A short tap adds through its click, as before.
    touch('pointerdown', 1);
    touch('pointerup', 80);
    expect(opened).toHaveLength(0);
    click(plus(host));
    expect(opened).toHaveLength(1);
    renderer.stopEditing(false);

    // Held past Orbit's long press, it adds as it's let go, a little off where it began; a click that comes anyway adds nothing more.
    touch('pointerdown', 1000);
    await Bun.sleep(120);
    touch('pointerup', 2000, 5);
    expect(opened).toHaveLength(2);
    expect(opened[1].parent?.id).toBe('trip');
    expect(field(host).hidden).toBe(false);
    expect(click(plus(host)).defaultPrevented).toBe(true);
    expect(opened).toHaveLength(2);
    renderer.stopEditing(false);

    // The browser's own long press, which it says with a context menu, can come before Orbit's.
    touch('pointerdown', 3000);
    plus(host).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
    touch('pointerup', 3030);
    expect(opened).toHaveLength(3);
    renderer.stopEditing(false);

    // Moved off it, it's no tap.
    touch('pointerdown', 4000);
    await Bun.sleep(120);
    touch('pointermove', 4600, 30);
    touch('pointerup', 4700, 30);
    expect(opened).toHaveLength(3);
  });

  test('Escape, or Enter with nothing typed, stops adding', () => {
    const closed = mock<(event: OrbitEditorEvent) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { editable: true, onEditorClose: closed });
    click(plus(host));
    type(host, 'Half an idea');
    press(host, 'Escape');
    expect(field(host).hidden).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(renderer.getDocument()!.root.children).toHaveLength(3);
    click(plus(host));
    press(host, 'Enter');
    expect(field(host).hidden).toBe(true);
    expect(renderer.getDocument()!.root.children).toHaveLength(3);
  });

  test('leaving the field keeps what was typed', () => {
    const { host, renderer } = mount(MAP, { editable: true });
    click(plus(host));
    type(host, 'Picnic');
    field(host).blur();
    expect(field(host).hidden).toBe(true);
    expect(renderer.getDocument()!.root.children.map((child) => child.text)).toContain('Picnic');
    expect(slotOf(renderer)?.index).toBe(4);
  });

  test('a phone keyboard\'s Enter, sent as a line break, adds the idea', () => {
    const { host, renderer } = mount(MAP, { editable: true });
    click(plus(host));
    type(host, 'Sunset');
    const lineBreak = new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true });
    field(host).dispatchEvent(lineBreak);
    expect(lineBreak.defaultPrevented).toBe(true);
    expect(renderer.getDocument()!.root.children.map((child) => child.text)).toContain('Sunset');
  });

  test('a pasted line break becomes a space', () => {
    const { host } = mount(MAP, { editable: true });
    click(plus(host));
    type(host, 'Two\nlines');
    expect(field(host).value).toBe('Two lines');
  });

  test('an idea for another node, or at a place among its children, flies there first', () => {
    const { renderer } = mount(MAP, { editable: true });
    expect(renderer.editNewNode('food', 0)).toBe(true);
    expect(renderer.getFocusPath()).toEqual(['trip', 'food']);
    expect(slotOf(renderer)).toMatchObject({ parentId: 'food', index: 0 });
    expect(renderer.editNewNode('nowhere')).toBe(false);
  });

  test('a new idea starts where it was typed', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(MAP, { editable: true, transitionDuration: 'auto' });
      clock.advance(1000);
      click(plus(host));
      clock.advance(32);
      const typedAt = { ...(internals(renderer) as unknown as EditorInternals).display.addSlot! };
      type(host, 'Picnic');
      press(host, 'Enter');
      const first = (internals(renderer) as unknown as EditorInternals).display.nodes.get('picnic')!;
      expect(Math.abs(first.x - typedAt.x)).toBeLessThan(0.5);
      expect(Math.abs(first.y - typedAt.y)).toBeLessThan(0.5);
    } finally {
      clock.restore();
    }
  });

  test('the + is not part of exports', () => {
    const { renderer } = mount(MAP, { editable: true });
    const svg = renderer.toSVGString();
    expect(svg).not.toContain('orbit-add');
    expect(svg).toContain('Beaches');
  });
});

describe('typing a node\'s text where it is', () => {
  test('editNode() opens a field over the node with its text; Enter saves it', () => {
    const { host, renderer } = mount(MAP);
    expect(renderer.editNode('museums')).toBe(true);
    expect(field(host).value).toBe('Museums');
    expect(field(host).getAttribute('enterkeyhint')).toBe('done');
    expect(node(host, 'museums').classList.contains('orbit-node--editing')).toBe(true);
    // The field stands in for the label.
    expect(host.querySelector<HTMLElement>('.orbit-label[data-orbit-for="museums"]')?.style.display).toBe('none');
    type(host, 'Galleries');
    press(host, 'Enter');
    expect(field(host).hidden).toBe(true);
    expect(renderer.getDocument()!.root.children[1]).toMatchObject({ id: 'galleries', text: 'Galleries' });
    expect(host.querySelector('.orbit-label[data-orbit-for="galleries"]')?.textContent).toContain('Galleries');
  });

  test('Escape leaves the text as it was, and keyboard focus returns to the node', () => {
    const { host, renderer } = mount(MAP);
    node(host, 'beaches').focus();
    renderer.editNode('beaches');
    type(host, 'Coast');
    press(host, 'Escape');
    expect(renderer.getDocument()!.root.children[2].text).toBe('Beaches');
    expect(document.activeElement).toBe(node(host, 'beaches'));
    expect(renderer.editNode('nowhere')).toBe(false);
  });

  test('a moon flies into its planet\'s orbit to be edited', () => {
    const { host, renderer } = mount(MAP);
    expect(renderer.editNode('tacos')).toBe(true);
    expect(renderer.getFocusPath()).toEqual(['trip', 'food']);
    type(host, 'Street tacos');
    press(host, 'Enter');
    expect(renderer.getDocument()!.root.children[0].children[0].text).toBe('Street tacos');
  });

  test('while the node flies into view, the field stays out of sight', () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(MAP, { transitionDuration: 'auto' });
      clock.advance(1000);
      renderer.focusNode('museums');
      clock.advance(1500);
      expect(renderer.editNode('tacos')).toBe(true);
      expect(field(host).hidden).toBe(false);
      expect(document.activeElement).toBe(field(host));
      // Not placed yet: it must not sit at the top left corner for the flight.
      expect(field(host).style.opacity).toBe('0');
      clock.advance(200);
      expect(field(host).style.opacity).toBe('0');
      clock.advance(1500);
      expect(field(host).style.opacity).toBe('');
    } finally {
      clock.restore();
    }
  });

  test('over a node with a "+N", the field rises as it grows, to keep clear of the count', () => {
    const clock = manualClock();

    try {
      const tables = Array.from({ length: 9 }, (_, index) => `- Table ${index + 1}`).join('\n');
      const { host, renderer } = mount(`# Trip\n\n## Food\n${tables}\n## Museums\n## Beaches`);
      clock.advance(100);
      const fieldY = () => Number(/translate3d\([^,]+,\s*(-?[\d.]+)px/.exec(field(host).style.transform)?.[1]);
      const centerY = (id: string) => onScreen(renderer, internals(renderer).scene!.nodes.get(id)!).y;
      expect(host.querySelector('.orbit-count[data-orbit-for="food"]')).not.toBeNull();
      // Nothing is laid out here: the field says how tall its text makes it (px, before it's scaled to the label's size).
      let height = 20;
      renderer.editNode('food');
      Object.defineProperty(field(host), 'scrollHeight', { configurable: true, get: () => height });
      type(host, 'Food');
      clock.advance(50);
      expect(Math.abs(fieldY() - centerY('food'))).toBeLessThanOrEqual(0.5);
      // Lines of text reach down to the count: the field rises, without waiting for the map to draw.
      height = 100;
      type(host, 'Street food, markets and the restaurants we want to try');
      expect(fieldY()).toBeLessThan(centerY('food') - 2);
      renderer.stopEditing(false);
      // A node without a count keeps the field centered.
      renderer.editNode('museums');
      clock.advance(50);
      type(host, 'Museums, galleries and the old town on foot');
      expect(Math.abs(fieldY() - centerY('museums'))).toBeLessThanOrEqual(0.5);
    } finally {
      clock.restore();
    }
  });

  test('on an editable map, a long press with no menu of the page\'s own edits the text', async () => {
    const { host, renderer } = mount(MAP, { editable: true });
    const at = onScreen(renderer, internals(renderer).scene!.nodes.get('museums')!);
    node(host, 'museums').dispatchEvent(pointer('pointerdown', { ...at, time: 1, kind: 'touch' }));
    await Bun.sleep(560);
    node(host, 'museums').dispatchEvent(pointer('pointerup', { ...at, time: 600, kind: 'touch' }));
    expect(field(host).hidden).toBe(false);
    expect(field(host).value).toBe('Museums');
  });

  test('F2 edits the node with keyboard focus; Enter on the + adds an idea; the arrows reach the +', () => {
    const { host } = mount(MAP, { editable: true });
    const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    key(node(host, 'food'), 'F2');
    expect(field(host).value).toBe('Food');
    press(host, 'Escape');
    // Food, Museums and Beaches go clockwise from the top; the + comes after Beaches.
    key(node(host, 'beaches'), 'ArrowRight');
    expect(document.activeElement).toBe(plus(host));
    key(plus(host), 'Enter');
    expect(field(host).hidden).toBe(false);
    expect(field(host).value).toBe('');
  });

  test('F2 does nothing on a map that isn\'t editable, where editNode() still works', () => {
    const { host, renderer } = mount(MAP);
    node(host, 'food').dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    const editor = host.querySelector<HTMLTextAreaElement>('.orbit-editor');
    expect(editor === null || editor.hidden).toBe(true);
    expect(renderer.editNode('food')).toBe(true);
    expect(field(host).value).toBe('Food');
  });

  test('stopEditing() saves by default, or drops what was typed', () => {
    const { host, renderer } = mount(MAP);
    renderer.editNode('food');
    type(host, 'Meals');
    renderer.stopEditing(false);
    expect(renderer.getDocument()!.root.children[0].text).toBe('Food');
    renderer.editNode('food');
    type(host, 'Meals');
    renderer.stopEditing();
    expect(renderer.getDocument()!.root.children[0].text).toBe('Meals');
  });
});

describe('typing while the map is drawn again', () => {
  test('another version of the same map keeps the field open, and what is typed goes into it', () => {
    const { host, renderer } = mount('# Trip\n## Food\n## Museums');
    renderer.editNode('food');
    type(host, 'Street food');
    // The map's text changed elsewhere, while typing: another device added an idea.
    renderer.render(parseOrbit('# Trip\n## Food\n## Museums\n## Beaches'));
    expect(field(host).value).toBe('Street food');
    renderer.stopEditing(true);
    expect(renderer.toMarkdown()).toBe('# Trip\n## Street food\n## Museums\n## Beaches');
  });

  test('another map never receives what was typed in this one, even where it has a node with the same id', () => {
    const edits: OrbitEdit[] = [];
    const { host, renderer } = mount('# Trip\n## Food\n## Museums', { onEdit: (edit) => edits.push(edit) });
    renderer.editNode('food');
    type(host, 'Street food');
    renderer.render(parseOrbit('# Groceries\n## Food\n## Drinks'));
    // The field closed with its map, and nothing was saved anywhere.
    expect(host.querySelector('.orbit-editor:not([hidden])')).toBeNull();
    renderer.stopEditing(true);
    expect(renderer.toMarkdown()).toBe('# Groceries\n## Food\n## Drinks');
    expect(edits).toEqual([]);
  });
});

describe('keys for editing', () => {
  const key = (target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

  const texts = (renderer: ReturnType<typeof mount>['renderer'], id: string): string[] => {
    const found = findNodeById(renderer.getDocument()!.root, id);
    return found ? found.children.map((child) => child.text) : [];
  };

  test('without them, Tab, Shift+Enter and Delete do what they always did', () => {
    const { host, renderer } = mount(MAP, { editable: true });
    expect(key(node(host, 'museums'), 'Tab').defaultPrevented).toBe(false);
    expect(key(node(host, 'museums'), 'Delete').defaultPrevented).toBe(false);
    key(node(host, 'museums'), 'Enter', { shiftKey: true });
    // Shift+Enter flies in, as Enter does.
    expect(renderer.getFocusedNode()?.id).toBe('museums');
    expect(texts(renderer, 'trip')).toEqual(['Food', 'Museums', 'Beaches']);
    renderer.editNewNode();
    type(host, 'Guides');
    expect(press(host, 'Tab').defaultPrevented).toBe(false);
  });

  test('Tab or Insert on a node opens a field under it, flying there', () => {
    const opened: OrbitEditorEvent[] = [];
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true, onEditorOpen: (event) => opened.push(event) });
    expect(key(node(host, 'museums'), 'Tab').defaultPrevented).toBe(true);
    expect(opened.at(-1)?.parent?.id).toBe('museums');
    expect(renderer.getFocusedNode()?.id).toBe('museums');
    expect(document.activeElement).toBe(field(host));
    press(host, 'Escape');
    renderer.focusNode('trip');
    expect(key(node(host, 'beaches'), 'Insert').defaultPrevented).toBe(true);
    expect(opened.at(-1)?.parent?.id).toBe('beaches');
  });

  test('Shift+Tab on a node still leaves the map', () => {
    const { host } = mount(MAP, { editable: true, editingKeys: true });
    expect(key(node(host, 'museums'), 'Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(field(host).hidden).toBe(true);
  });

  test('Shift+Enter on a node opens a field beside it, right after it', () => {
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true });
    expect(key(node(host, 'food'), 'Enter', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(slotOf(renderer)).toMatchObject({ parentId: 'trip', index: 1 });
    type(host, 'Night markets');
    press(host, 'Enter');
    expect(texts(renderer, 'trip')).toEqual(['Food', 'Night markets', 'Museums', 'Beaches']);
  });

  test('typing a new idea, Tab keeps it and goes on under it; Shift+Tab goes back up beside its parent', () => {
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true });
    renderer.editNewNode();
    type(host, 'Evenings');
    expect(press(host, 'Tab').defaultPrevented).toBe(true);
    expect(renderer.getFocusedNode()?.text).toBe('Evenings');
    expect(slotOf(renderer)?.parentId).toBe(renderer.getFocusedNode()?.id);
    type(host, 'Fado');
    press(host, 'Enter');
    type(host, 'Sunset at the river');
    expect(press(host, 'Tab', ).defaultPrevented).toBe(true);
    // Shift+Tab from under Sunset at the river: back up, beside it.
    field(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    type(host, 'Late dinner');
    press(host, 'Enter');
    const evenings = renderer.getDocument()!.root.children[3];
    expect(evenings.text).toBe('Evenings');
    expect(evenings.children.map((child) => child.text)).toEqual(['Fado', 'Sunset at the river', 'Late dinner']);
    expect(texts(renderer, 'trip')).toEqual(['Food', 'Museums', 'Beaches', 'Evenings']);
  });

  test('with nothing typed, Tab moves the field under the idea before it, and Shift+Tab back out', () => {
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true });
    renderer.editNewNode('trip', 2);
    expect(press(host, 'Tab').defaultPrevented).toBe(true);
    // Museums comes before the place the field was in.
    expect(renderer.getFocusedNode()?.id).toBe('museums');
    expect(slotOf(renderer)).toMatchObject({ parentId: 'museums', index: 0 });
    field(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(renderer.getFocusedNode()?.id).toBe('trip');
    expect(slotOf(renderer)).toMatchObject({ parentId: 'trip', index: 2 });
    expect(texts(renderer, 'trip')).toEqual(['Food', 'Museums', 'Beaches']);
  });

  test('with nothing before it or above it, the field stays and the key is still used', () => {
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true });
    renderer.editNewNode('trip', 0);
    expect(press(host, 'Tab').defaultPrevented).toBe(true);
    expect(field(host).hidden).toBe(false);
    expect(field(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))).toBe(false);
    expect(slotOf(renderer)).toMatchObject({ parentId: 'trip', index: 0 });
  });

  test('renaming a node, Tab keeps the new text and goes on under it', () => {
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true });
    renderer.editNode('beaches');
    type(host, 'Beaches and coves');
    expect(press(host, 'Tab').defaultPrevented).toBe(true);
    const renamed = renderer.getDocument()!.root.children[2];
    expect(renamed.text).toBe('Beaches and coves');
    expect(renderer.getFocusedNode()?.id).toBe(renamed.id);
    expect(slotOf(renderer)?.parentId).toBe(renamed.id);
  });

  test('Delete removes the node with keyboard focus; focus moves on to the next', () => {
    const edits: OrbitEdit[] = [];
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true, onEdit: (edit) => edits.push(edit) });
    expect(key(node(host, 'museums'), 'Delete').defaultPrevented).toBe(true);
    expect(edits.map((edit) => `${edit.kind} ${edit.node.text}`)).toEqual(['remove Museums']);
    expect(texts(renderer, 'trip')).toEqual(['Food', 'Beaches']);
    expect(document.activeElement).toBe(node(host, 'beaches'));
    key(node(host, 'beaches'), 'Delete');
    expect(document.activeElement).toBe(node(host, 'food'));
    // The root stays.
    expect(key(node(host, 'trip'), 'Delete').defaultPrevented).toBe(false);
    expect(renderer.getDocument()!.root.text).toBe('Trip');
  });
});


describe('typing where ideas are hidden', () => {
  test('a node whose ideas are hidden takes no new one until they show: editNewNode() refuses', () => {
    const opened = mock<(event: OrbitEditorEvent) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { editable: true, onEditorOpen: opened });
    renderer.hideChildren('trip');
    expect(slotOf(renderer)).toBeUndefined();
    expect(renderer.editNewNode()).toBe(false);
    expect(renderer.editNewNode('trip', 1)).toBe(false);
    expect(host.querySelector<HTMLTextAreaElement>('.orbit-editor')?.hidden ?? true).toBe(true);
    expect(opened).not.toHaveBeenCalled();

    renderer.revealChildren('trip');
    expect(renderer.editNewNode()).toBe(true);
    expect(field(host).hidden).toBe(false);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  test('one elsewhere takes none either, and the map stays where it is', () => {
    const { renderer } = mount(MAP, { editable: true });
    renderer.hideChildren('food');
    expect(renderer.editNewNode('food')).toBe(false);
    expect(renderer.getFocusedNode()?.id).toBe('trip');
  });

  test('Tab on it opens no field', () => {
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true });
    renderer.hideChildren('food');
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    node(host, 'food').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(host.querySelector<HTMLTextAreaElement>('.orbit-editor')?.hidden ?? true).toBe(true);
    expect(renderer.getFocusedNode()?.id).toBe('trip');
  });

  test('with nothing typed, Tab after an idea whose ideas are hidden keeps the field where it is', () => {
    const { host, renderer } = mount(MAP, { editable: true, editingKeys: true });
    renderer.hideChildren('food');
    renderer.editNewNode('trip', 1);
    expect(press(host, 'Tab').defaultPrevented).toBe(true);
    expect(field(host).hidden).toBe(false);
    expect(renderer.getFocusedNode()?.id).toBe('trip');
    expect(slotOf(renderer)).toMatchObject({ parentId: 'trip', index: 1 });
  });

  test('its own text can still be typed, and finishing leaves a spin going, with no + to redraw', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(MAP, { editable: true });
      renderer.hideChildren('trip');
      expect(renderer.editNode('trip')).toBe(true);
      renderer.spin(400);
      const { velocity } = internals(renderer).spinPhysics;
      expect(velocity).not.toBe(0);
      renderer.stopEditing(false);
      expect(internals(renderer).spinPhysics.velocity).toBe(velocity);
    } finally {
      clock.restore();
    }
  });

  test('past maxDepth, where no + can be either, finishing leaves a spin going too', () => {
    const clock = manualClock();

    try {
      const { renderer } = mount(MAP, { editable: true, maxDepth: 1 });
      renderer.flyTo('food');
      expect(renderer.getFocusedNode()?.id).toBe('food');
      expect(slotOf(renderer)).toBeUndefined();
      renderer.editNode('food');
      renderer.spin(400);
      const { velocity } = internals(renderer).spinPhysics;
      renderer.stopEditing(false);
      expect(internals(renderer).spinPhysics.velocity).toBe(velocity);
    } finally {
      clock.restore();
    }
  });
});
