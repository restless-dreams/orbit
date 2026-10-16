import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { OrbitNode, ViewMode } from '../src/core/types';
import { click, internals, manualClock, mount, node, onScreen, useMapSize, type ManualClock } from './helpers/renderer';

useMapSize(600, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `# Root

## Alpha
### Alpha One
- Deep A
- Deep B
### Alpha Two

## Beta
### Beta One
- Deep C

## Gamma`;

describe('navigating', () => {
  test('a click on a planet focuses it', () => {
    const onFocusChange = mock<(argument: OrbitNode) => void>(() => undefined);
    const onNodeClick = mock<(argument: OrbitNode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onFocusChange, onNodeClick });
    click(node(host, 'alpha'));
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha']);
    expect(renderer.getFocusedNode()?.id).toBe('alpha');
    expect(node(host, 'alpha').classList.contains('orbit-node--sun')).toBe(true);
    expect(onFocusChange.mock.calls[0][0].id).toBe('alpha');
    expect(onNodeClick.mock.calls[0][0].id).toBe('alpha');
  });

  test('a click on a moon goes straight to it', () => {
    const { host, renderer } = mount(MAP);
    click(node(host, 'alpha-one'));
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha', 'alpha-one']);
  });

  test('a click on the sun goes back up; at the root it only reports the click', () => {
    const onNodeClick = mock<(argument: OrbitNode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onNodeClick });
    click(node(host, 'beta'));
    click(node(host, 'beta'));
    expect(renderer.getFocusPath()).toEqual(['root']);
    click(node(host, 'root'));
    expect(renderer.getFocusPath()).toEqual(['root']);
    expect(onNodeClick).toHaveBeenCalledTimes(3);
  });

  test('a click on a node in the overview flies into focus mode on it', () => {
    const onViewModeChange = mock<(argument: ViewMode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { viewMode: 'all', onViewModeChange });
    click(node(host, 'beta-one'));
    expect(renderer.getViewMode()).toBe('focus');
    expect(renderer.getFocusPath()).toEqual(['root', 'beta', 'beta-one']);
    expect(onViewModeChange.mock.calls).toEqual([['focus']]);
  });

  test('setViewMode reports the change; setOptions switches quietly', () => {
    const onViewModeChange = mock<(argument: ViewMode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { onViewModeChange });
    renderer.setViewMode('all');
    expect(renderer.getViewMode()).toBe('all');
    expect(host.querySelector('.orbit')?.getAttribute('data-orbit-view')).toBe('all');
    expect(onViewModeChange.mock.calls).toEqual([['all']]);
    renderer.setOptions({ viewMode: 'focus' });
    expect(renderer.getViewMode()).toBe('focus');
    expect(onViewModeChange).toHaveBeenCalledTimes(1);
  });

  test('focusNode reaches any node and rejects unknown ids', () => {
    const { renderer } = mount(MAP);
    expect(renderer.focusNode('deep-c')).toBe(true);
    expect(renderer.getFocusPath()).toEqual(['root', 'beta', 'beta-one', 'deep-c']);
    expect(renderer.focusNode('missing')).toBe(false);
    expect(renderer.getFocusPath()).toEqual(['root', 'beta', 'beta-one', 'deep-c']);
  });

  test('in the overview, focusNode moves the camera to the node and keeps the overview', () => {
    const { renderer } = mount(MAP, { viewMode: 'all' });
    expect(renderer.focusNode('gamma')).toBe(true);
    expect(renderer.getViewMode()).toBe('all');
    const gamma = internals(renderer).scene!.nodes.get('gamma')!;
    const point = onScreen(renderer, gamma);
    expect(point.x).toBeCloseTo(300, 0);
    expect(point.y).toBeCloseTo(200, 0);
  });

  test('the focus option opens the map on a node, and only the first time', () => {
    const onFocusChange = mock<(argument: OrbitNode) => void>(() => undefined);
    const { host, renderer } = mount(MAP, { focus: 'alpha-one', onFocusChange });
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha', 'alpha-one']);
    expect(node(host, 'alpha-one').classList.contains('orbit-node--sun')).toBe(true);
    expect(onFocusChange).not.toHaveBeenCalled();
    renderer.focusNode('beta');
    renderer.render(`${MAP}\n## Delta`);
    expect(renderer.getFocusedNode()?.id).toBe('beta');
  });

  test('a focus id that is not in the map opens it on the root', () => {
    const { renderer } = mount(MAP, { focus: 'nowhere' });
    expect(renderer.getFocusPath()).toEqual(['root']);
  });

  test('breadcrumbs show the path and lead back up', () => {
    const { host, renderer } = mount(MAP);
    renderer.focusNode('deep-a');
    const crumbs = Array.from(host.querySelectorAll<HTMLElement>('.orbit-breadcrumbs__item'));
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual(['Root', 'Alpha', 'Alpha One', 'Deep A']);
    expect(crumbs[3].getAttribute('aria-current')).toBe('location');
    click(crumbs[0]);
    expect(renderer.getFocusPath()).toEqual(['root']);
    expect(host.querySelector<HTMLElement>('.orbit-controls__crumbs')?.hidden).toBe(true);
  });

  test('long breadcrumb trails keep the root, the parent and the current node', () => {
    const { host, renderer } = mount('# Root\n## One\n### Two\n#### Three\n##### Four\n###### Five');
    renderer.focusNode('five');
    const crumbs = Array.from(host.querySelectorAll<HTMLElement>('.orbit-breadcrumbs__item'));
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual(['Root', '…', 'Four', 'Five']);
    expect(crumbs[1].title).toBe('One › Two › Three');
  });

  test('the back chip names the parent and goes to it', () => {
    const { host, renderer } = mount(MAP);
    renderer.focusNode('alpha-one');
    const back = host.querySelector<HTMLButtonElement>('.orbit-back');
    expect(back?.getAttribute('aria-label')).toBe('Back to Alpha');
    click(back!);
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha']);
  });

  test('the outline lists the map and navigates', () => {
    const { host, renderer } = mount(MAP);
    const entry = Array.from(host.querySelectorAll<HTMLButtonElement>('nav.orbit-outline button')).find((button) => button.textContent === 'Beta One');
    click(entry!);
    expect(renderer.getFocusPath()).toEqual(['root', 'beta', 'beta-one']);
    expect(host.querySelector('nav.orbit-outline [aria-current="true"]')?.textContent).toBe('Beta One');
  });

  test('moving between nodes moves the outline’s marker and keeps its entries', () => {
    const { host, renderer } = mount(MAP);
    const entries = () => Array.from(host.querySelectorAll<HTMLButtonElement>('nav.orbit-outline button'));
    const before = entries();
    renderer.focusNode('alpha-one');
    renderer.focusNode('beta');
    renderer.overview();
    renderer.focusNode('beta-one');
    // The same elements: a big map's outline has thousands, too many to build again on every move.
    expect(entries().every((entry, index) => entry === before[index])).toBe(true);
    const current = host.querySelectorAll('nav.orbit-outline [aria-current="true"]');
    expect(Array.from(current, (entry) => entry.textContent)).toEqual(['Beta One']);
  });

  test('the outline follows edits to the map', () => {
    const { host, renderer } = mount(MAP);
    renderer.focusNode('beta');
    renderer.addNode('beta', { text: 'Beta Three' });
    const texts = Array.from(host.querySelectorAll('nav.orbit-outline button'), (entry) => entry.textContent);
    expect(texts).toContain('Beta Three');
    expect(host.querySelector('nav.orbit-outline [aria-current="true"]')?.textContent).toBe('Beta');
  });

  test('announces where navigation landed', async () => {
    const { host, renderer } = mount(MAP);
    renderer.focusNode('alpha');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(host.querySelector('.orbit__live')?.textContent).toBe('Alpha, 2 items');
  });
});

describe('flights', () => {
  let clock: ManualClock;

  beforeEach(() => {
    clock = manualClock();
  });

  afterEach(() => {
    clock.restore();
  });

  const flightMap = () => {
    const result = mount(MAP, { transitionDuration: 'auto' });
    clock.advance(1000);
    return result;
  };

  test('a flight into a planet starts from where the planet is and lands on its fitted view', () => {
    const { host, renderer } = flightMap();
    const state = internals(renderer);
    const before = state.display!.nodes.get('alpha')!;
    const startPoint = onScreen(renderer, before);
    click(node(host, 'alpha'));
    clock.advance(16);
    const early = state.display!.nodes.get('alpha')!;
    const earlyPoint = {
      x: (early.x - state.display!.camera.x) * state.display!.camera.scale + 300,
      y: (early.y - state.display!.camera.y) * state.display!.camera.scale + 200,
    };
    expect(earlyPoint.x).toBeCloseTo(startPoint.x, 0);
    expect(earlyPoint.y).toBeCloseTo(startPoint.y, 0);
    expect(state.transition).not.toBeNull();
    clock.advance(2000);
    expect(state.transition).toBeNull();
    expect(state.scene?.focusId).toBe('alpha');
    expect(state.camera).toEqual(state.scene!.frame);
    const sun = onScreen(renderer, state.scene!.nodes.get('alpha')!);
    expect(sun.x).toBeCloseTo(300, 5);
    expect(sun.y).toBeCloseTo(200, 5);
  });

  test('the second click of a double click does not undo the first', () => {
    const { host, renderer } = flightMap();
    click(node(host, 'alpha'));
    clock.advance(48);
    click(node(host, 'alpha'));
    clock.advance(2000);
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha']);
  });

  test('a jump between branches passes through their common ancestor', () => {
    const { renderer } = flightMap();
    renderer.focusNode('deep-a');
    clock.advance(3000);
    renderer.focusNode('deep-c');
    const state = internals(renderer);
    expect(state.nextScene?.focusId).toBe('deep-c');
    clock.advance(4000);
    expect(state.scene?.focusId).toBe('deep-c');
    expect(state.transition).toBeNull();
  });

  test('a new destination mid-flight takes over from where things are', () => {
    const { renderer } = flightMap();
    renderer.focusNode('alpha');
    clock.advance(200);
    renderer.focusNode('beta');
    clock.advance(4000);
    expect(internals(renderer).scene?.focusId).toBe('beta');
    expect(renderer.getFocusPath()).toEqual(['root', 'beta']);
  });

  test('with reduced motion, views cross-fade in place instead of flying', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }),
    });

    try {
      const { renderer } = flightMap();
      const state = internals(renderer);
      renderer.focusNode('alpha');
      clock.advance(48);
      const halfway = state.display!;
      // The old view only fades: its camera hasn't moved.
      expect(halfway.camera).toEqual(state.scene!.frame);
      expect(halfway.nodes.get('beta')!.opacity).toBeLessThan(1);
      clock.advance(400);
      expect(state.transition).toBeNull();
      expect(state.scene?.focusId).toBe('alpha');
    } finally {
      if (original) {
        Object.defineProperty(window, 'matchMedia', original);
      }
    }
  });

  test('a fixed transitionDuration sets the flight length', () => {
    const { renderer } = mount(MAP, { transitionDuration: 300 });
    clock.advance(1000);
    renderer.focusNode('beta');
    expect(internals(renderer).transition?.duration).toBe(300);
    clock.advance(320);
    expect(internals(renderer).transition).toBeNull();
  });
});

describe('keyboard', () => {
  const key = (target: Element, name: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  test('the map is one tab stop: the focused node', () => {
    const { host } = mount(MAP);
    const stops = Array.from(host.querySelectorAll('.orbit-node[tabindex="0"]')).map((element) => element.getAttribute('data-orbit-node-id'));
    expect(stops).toEqual(['root']);
  });

  test('moving the tab stop rewrites only the two nodes it moves between', () => {
    const { host } = mount(MAP);
    const writes = spyOn(Element.prototype, 'setAttribute');

    try {
      node(host, 'root').focus();
      writes.mockClear();
      key(node(host, 'root'), 'ArrowDown');
      expect(writes.mock.calls.filter(([name]) => name === 'tabindex')).toHaveLength(2);
    } finally {
      writes.mockRestore();
    }
  });

  test('arrows walk around the orbit; Enter goes in; Escape comes back', () => {
    const { host, renderer } = mount(MAP);
    node(host, 'root').focus();
    key(node(host, 'root'), 'ArrowDown');
    expect(document.activeElement?.getAttribute('data-orbit-node-id')).toBe('alpha');
    key(node(host, 'alpha'), 'ArrowRight');
    expect(document.activeElement?.getAttribute('data-orbit-node-id')).toBe('beta');
    key(node(host, 'beta'), 'ArrowLeft');
    expect(document.activeElement?.getAttribute('data-orbit-node-id')).toBe('alpha');
    expect(node(host, 'alpha').getAttribute('tabindex')).toBe('0');
    key(node(host, 'alpha'), 'Enter');
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha']);
    const escape = key(node(host, 'alpha'), 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(renderer.getFocusPath()).toEqual(['root']);
  });

  test('in the overview, arrows follow the tree', () => {
    const { host } = mount(MAP, { viewMode: 'all' });
    node(host, 'root').focus();
    key(node(host, 'root'), 'ArrowDown');
    expect(document.activeElement?.getAttribute('data-orbit-node-id')).toBe('alpha');
    key(node(host, 'alpha'), 'ArrowRight');
    expect(document.activeElement?.getAttribute('data-orbit-node-id')).toBe('beta');
    key(node(host, 'beta'), 'ArrowDown');
    expect(document.activeElement?.getAttribute('data-orbit-node-id')).toBe('beta-one');
    key(node(host, 'beta-one'), 'ArrowUp');
    expect(document.activeElement?.getAttribute('data-orbit-node-id')).toBe('beta');
  });

  test('keys do nothing on a still map', () => {
    const { host, renderer } = mount(MAP, { interactive: false });
    const event = key(node(host, 'alpha'), 'Enter');
    expect(event.defaultPrevented).toBe(false);
    expect(renderer.getFocusPath()).toEqual(['root']);
  });
});
