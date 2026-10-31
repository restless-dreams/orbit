import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { createOrbitMap, defineOrbitMapElement, OrbitParseError } from '../src/index';
import type { OrbitMapElement } from '../src/index';
import type { OrbitEventMap } from '../src/core/types';
import { click, mount, node, useMapSize, useReducedMotion } from './helpers/renderer';

useMapSize(600, 400);
useReducedMotion();

beforeAll(() => {
  defineOrbitMapElement();
});

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `# Root

## Alpha
### Alpha One
## Beta
> A note on Beta.
- Beta One`;

describe('renderer events', () => {
  test('on() reports focus changes with the path, and the returned function stops listening', () => {
    const { host, renderer } = mount(MAP);
    const seen: OrbitEventMap['focus-change'][] = [];
    const stop = renderer.on('focus-change', (detail) => seen.push(detail));
    click(node(host, 'alpha'));
    expect(seen).toHaveLength(1);
    expect(seen[0].node.id).toBe('alpha');
    expect(seen[0].path.map((entry) => entry.id)).toEqual(['root', 'alpha']);
    stop();
    click(node(host, 'alpha'));
    expect(seen).toHaveLength(1);
  });

  test('the same events bubble from the container as orbit-* DOM events', () => {
    const { host, renderer } = mount(MAP);
    const names: string[] = [];

    for (const name of ['orbit-node-click', 'orbit-focus-change', 'orbit-view-mode-change']) {
      document.body.addEventListener(name, (event) => names.push(`${event.type}:${JSON.stringify(Object.keys((event as CustomEvent).detail))}`));
    }

    click(node(host, 'beta'));
    renderer.overview();
    expect(names).toEqual([
      'orbit-node-click:["node"]',
      'orbit-focus-change:["node","path"]',
      'orbit-view-mode-change:["mode"]',
    ]);
  });

  test('an action can be cancelled from on() or from the DOM event', () => {
    const { host, renderer } = mount(MAP);
    renderer.focusNode('beta');

    const stop = renderer.on('action', (detail) => {
      expect(detail.action).toBe('note');
      detail.preventDefault();
    });

    click(host.querySelector('.orbit-action--note')!);
    expect(host.querySelector('dialog[open]')).toBeNull();
    stop();
    host.addEventListener('orbit-action', (event) => event.preventDefault(), { once: true });
    click(host.querySelector('.orbit-action--note')!);
    expect(host.querySelector('dialog[open]')).toBeNull();
    click(host.querySelector('.orbit-action--note')!);
    expect(host.querySelector('dialog[open]')).not.toBeNull();
  });

  test('a spin that comes to rest reports the planet on top', () => {
    const { renderer } = mount(MAP);
    const settled = mock<(detail: OrbitEventMap['spin-settle']) => void>(() => undefined);
    renderer.on('spin-settle', settled);
    // Reduced motion: no coast, so the spin settles at once.
    renderer.spin(900);
    expect(settled).toHaveBeenCalledTimes(1);
    const detail = settled.mock.calls[0][0];
    expect(['alpha', 'beta']).toContain(detail.node.id);
    // Its old name, until 1.0.
    expect(detail.planet).toBe(detail.node);
  });

  test('a listener that throws doesn\'t stop the map or the other listeners', () => {
    const reportError = spyOn(globalThis as unknown as { reportError: (error: unknown) => void }, 'reportError').mockImplementation(() => undefined);
    const { host, renderer } = mount(MAP);
    const after = mock<() => void>(() => undefined);

    renderer.on('focus-change', () => {
      throw new Error('listener failed');
    });

    renderer.on('focus-change', after);
    click(node(host, 'alpha'));
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha']);
    expect(after).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledTimes(1);
    reportError.mockRestore();
  });

  test('an on… option that throws is reported as a listener is, and the event still reaches listeners and the DOM', () => {
    const reportError = spyOn(globalThis as unknown as { reportError: (error: unknown) => void }, 'reportError').mockImplementation(() => undefined);

    const fail = () => {
      throw new Error('callback failed');
    };

    const { host, renderer } = mount(MAP, { onFocusChange: fail, onNodeClick: fail });
    const heard = mock<(detail: OrbitEventMap['focus-change']) => void>(() => undefined);
    const dom = mock<(event: Event) => void>(() => undefined);
    renderer.on('focus-change', heard);
    host.addEventListener('orbit-focus-change', dom);

    renderer.flyTo('beta');
    expect(renderer.getFocusPath()).toEqual(['root', 'beta']);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(dom).toHaveBeenCalledTimes(1);

    // A press goes on to fly in, as if the callback had said nothing.
    click(node(host, 'beta-one'));
    expect(renderer.getFocusPath()).toEqual(['root', 'beta', 'beta-one']);
    expect(reportError).toHaveBeenCalledTimes(3);
    reportError.mockRestore();
  });

  test('onFocusChange hears the path from the root, as focus-change has it', () => {
    const onFocusChange = mock<(node: unknown, path: { id: string }[]) => void>(() => undefined);
    const { renderer } = mount(MAP, { onFocusChange });
    renderer.flyTo('alpha-one');
    const [focused, path] = onFocusChange.mock.calls[0];
    expect((focused as { id: string }).id).toBe('alpha-one');
    expect(path.map((entry) => entry.id)).toEqual(['root', 'alpha', 'alpha-one']);
  });

  test('flyTo() switches to focus mode on the node; overview() flies out', () => {
    const { renderer } = mount(MAP, { view: 'all' });
    expect(renderer.flyTo('alpha-one')).toBe(true);
    expect(renderer.getViewMode()).toBe('focus');
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha', 'alpha-one']);
    expect(renderer.flyTo('missing')).toBe(false);
    renderer.overview();
    expect(renderer.getViewMode()).toBe('all');
  });
});

describe('drawing new versions of a map', () => {
  test('render() takes markdown directly', () => {
    const { host, renderer } = mount('# One');
    renderer.render('# Two\n\n## Child');
    expect(host.querySelector('[data-orbit-node-id="child"]')).not.toBeNull();
  });

  test('a new version keeps the focused node, or its closest ancestor that still exists', () => {
    const { renderer } = mount(MAP);
    renderer.focusNode('alpha-one');
    renderer.render(`${MAP}\n## Gamma`);
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha', 'alpha-one']);
    renderer.render(MAP.replace('### Alpha One', '### Renamed'));
    expect(renderer.getFocusPath()).toEqual(['root', 'alpha']);
  });
});

describe('createOrbitMap', () => {
  test('draws markdown into an element in one call', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const renderer = createOrbitMap(host, MAP, { view: 'all' });
    expect(renderer.getViewMode()).toBe('all');
    expect(host.querySelector('[data-orbit-node-id="beta-one"]')).not.toBeNull();
    renderer.destroy();
    expect(host.querySelector('.orbit')).toBeNull();
  });

  test('strict mode throws on the first problem', () => {
    const host = document.createElement('div');
    expect(() => createOrbitMap(host, '---\nmystery: 1\n---\n# Root', { strict: true })).toThrow(OrbitParseError);
  });

  test('strict mode that throws leaves the element as it was, with the map already in it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const first = createOrbitMap(host, MAP);
    const drawn = host.innerHTML;
    expect(() => createOrbitMap(host, '---\nmystery: 1\n---\n# Root', { strict: true })).toThrow(OrbitParseError);
    // Nothing was drawn over it, and the map there still works.
    expect(host.innerHTML).toBe(drawn);
    expect(host.querySelectorAll('.orbit')).toHaveLength(1);
    expect(first.flyTo('beta')).toBe(true);
    first.destroy();
  });

  test('reports parse problems to the console instead of rendering silently', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const errors: string[] = [];
    const warnings: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
    let renderer: ReturnType<typeof createOrbitMap> | undefined;

    try {
      renderer = createOrbitMap(host, '---\ntheme: [unclosed\n---\n# Root\n## A <!-- orbit stauts: done -->');
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }

    // Each problem once, at its own level: the error as an error, the warning in the warnings.
    expect(errors.filter((line) => line.includes('Invalid frontmatter'))).toEqual([expect.stringContaining('[orbit] Line 2: Invalid frontmatter')]);
    expect(warnings).toEqual([expect.stringContaining('[orbit] parse warnings:')]);
    expect(warnings[0]).toContain('Did you mean "status"?');
    expect(warnings[0]).not.toContain('Invalid frontmatter');
    renderer?.destroy();
  });
});

describe('<orbit-map> API', () => {
  const createElement = (content: string): OrbitMapElement => {
    const element = document.createElement('orbit-map') as OrbitMapElement;
    element.textContent = content;
    document.body.appendChild(element);
    return element;
  };

  test('map events bubble out of the element', () => {
    const element = createElement(MAP);
    const focused: string[] = [];
    document.body.addEventListener('orbit-focus-change', (event) => focused.push((event as CustomEvent<OrbitEventMap['focus-change']>).detail.node.id));
    expect(element.flyTo('beta')).toBe(true);
    expect(focused).toEqual(['beta']);
  });

  test('flyTo() and overview() drive the map', () => {
    const element = createElement(MAP);
    element.overview();
    expect(element.renderer?.getViewMode()).toBe('all');
    expect(element.flyTo('alpha-one')).toBe(true);
    expect(element.renderer?.getFocusPath()).toEqual(['root', 'alpha', 'alpha-one']);
  });

  test('editing the content redraws the same map and keeps the reader\'s place', async () => {
    const element = createElement(MAP);
    const renderer = element.renderer;
    element.flyTo('beta');
    element.textContent = `${MAP}\n- Beta Two`;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(element.renderer).toBe(renderer);
    expect(element.renderer?.getFocusPath()).toEqual(['root', 'beta']);
    expect(element.shadowRoot?.querySelector('[data-orbit-node-id="beta-two"]')).not.toBeNull();
  });

  // The same with content edits, which arrive through a MutationObserver, is
  // in the browser tests (e2e/element.spec.ts): happy-dom's observer can miss them.
  test('a broken source shows the error; fixing it draws the map again', () => {
    const element = createElement(MAP);
    const errors: string[] = [];
    element.addEventListener('orbit-error', (event) => errors.push((event as CustomEvent<{ message: string }>).detail.message));
    element.source = 'nodes: [unclosed';
    expect(errors).toHaveLength(1);
    expect(element.renderer).toBeNull();
    element.source = MAP;
    expect(element.renderer).not.toBeNull();
  });
});

afterAll(() => {
  document.body.innerHTML = '';
});
