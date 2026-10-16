import { afterAll, beforeAll, describe, expect, it, mock, test } from 'bun:test';
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { OrbitMindMap, type OrbitMindMapRef } from '../src/react';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { parseOrbit } from '../src/core/dispatch';
import { OrbitSVGRenderer } from '../src/core/svg-renderer';

describe('OrbitMindMap React wrapper', () => {
  test('wrapper fills its parent (no fixed pixel sizing)', () => {
    const tree = parseOrbitMarkdown('# Root').root;
    const html = renderToString(createElement(OrbitMindMap, { data: tree }));
    // Width and height are 100%, so the wrapper fills whatever sized parent
    // the consumer puts it in, with no pixel sizes inline.
    expect(html).toContain('width:100%');
    expect(html).toContain('height:100%');
    expect(html).not.toMatch(/width:\s*\d+px/);
    expect(html).not.toMatch(/height:\s*\d+px/);
  });

  test('user className is preserved on the wrapper', () => {
    const tree = parseOrbitMarkdown('# Root').root;
    const html = renderToString(
      createElement(OrbitMindMap, { data: tree, className: 'my-map' }),
    );
    expect(html).toContain('class="my-map"');
  });

  test('accepts the action, detail sheet, media viewer and note props, and keeps them off the element', () => {
    const html = renderToString(
      createElement(OrbitMindMap, {
        data: { id: 'r', text: 'A', level: 0, children: [] },
        onAction: () => { return false as const; },
        onFocusChange: () => undefined,
        showActionButtons: true,
        showDetailSheet: false,
        mediaViewer: false,
        noteRenderer: (note) => `<p>${note}</p>`,
        baseUrl: 'https://example.com/',
      }),
    );
    expect(html).toContain('<div');
    expect(html).not.toMatch(/mediaviewer/i);
  });
});

describe('OrbitMindMap with node types and actions', () => {
  test('node types and status words reach the static picture, and stay off the element', () => {
    const html = renderToString(createElement(OrbitMindMap, {
      source: '# Root\n## Ship <!-- orbit type: milestone, status: on hold -->',
      nodeTypes: { milestone: { icon: '🏁' } },
      statuses: { 'on hold': '#A855F7' },
      actions: [{ id: 'assign', label: 'Assign', run: () => undefined }],
    }));
    expect(html).toContain('🏁');
    expect(html).toContain('fill="#a855f7"');
    expect(html).not.toMatch(/nodetypes|statuses=|actions=/i);
  });

  test('reports parse problems from source to the console', () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };

    try {
      renderToString(createElement(OrbitMindMap, { source: '---\ntheme: [unclosed\n---\n# Root\n## A <!-- orbit stauts: done -->' }));
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }

    // Each problem once, at its own level: the error as an error, the warning in the warnings.
    expect(errors.filter((line) => line.includes('Invalid frontmatter'))).toEqual([expect.stringContaining('[orbit] Line 2: Invalid frontmatter')]);
    expect(warnings).toEqual([expect.stringContaining('[orbit] parse warnings:')]);
    expect(warnings[0]).toContain('Did you mean "status"?');
    expect(warnings[0]).not.toContain('Invalid frontmatter');
  });
});

describe('OrbitMindMap in the DOM', () => {
  const prototype = OrbitSVGRenderer.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;

  const mount = async (element: ReturnType<typeof createElement>) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(element);
    });

    return {
      host,
      update: async (next: ReturnType<typeof createElement>) => {
        await act(async () => {
          root.render(next);
        });
      },
      unmount: async () => {
        await act(async () => {
          root.unmount();
        });

        host.remove();
      },
    };
  };

  const countDraws = () => {
    const original = prototype.rebuild;
    const counter = { draws: 0, restore: () => { prototype.rebuild = original; } };

    prototype.rebuild = function (this: unknown, ...args: unknown[]) {
      counter.draws += 1;
      return original.apply(this, args);
    };

    return counter;
  };

  const originalReadSize = prototype.readContainerSize;

  beforeAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    prototype.readContainerSize = () => ({ width: 600, height: 400 });
  });

  afterAll(() => {
    prototype.readContainerSize = originalReadSize;
  });

  it('renders markdown source and applies its frontmatter', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const view = await mount(createElement(OrbitMindMap, { ref, source: '---\nview: all\ntitle: Plan\n---\n# Root\n## A' }));
    expect(ref.current?.renderer?.getViewMode()).toBe('all');
    expect(view.host.querySelector('svg')?.getAttribute('aria-label')).toBe('Plan');
    await view.unmount();
  });

  it('lets props override the document', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const doc = parseOrbit('---\nview: all\n---\n# Root\n## A');
    const view = await mount(createElement(OrbitMindMap, { ref, document: doc, viewMode: 'focus' }));
    expect(ref.current?.renderer?.getViewMode()).toBe('focus');
    await view.unmount();
  });

  it('draws once on mount and not again for inline callbacks or equal theme objects', async () => {
    const counter = countDraws();
    const tree = parseOrbit('# Root\n## A\n## B').root;
    const app = (tick: number) => createElement('div', { 'data-tick': tick },
      createElement(OrbitMindMap, { data: tree, onNodeClick: () => {}, theme: { tokens: { 'font-family': 'Inter' } }, palette: ['#111', '#222'] }));
    const view = await mount(app(0));
    expect(counter.draws).toBe(1);

    for (let tick = 1; tick <= 5; tick += 1) {
      await view.update(app(tick));
    }

    expect(counter.draws).toBe(1);
    await view.unmount();
    counter.restore();
  });

  it('inline node types and actions draw once; their latest functions run', async () => {
    const counter = countDraws();
    const ref = createRef<OrbitMindMapRef>();
    const tree = parseOrbit('# Root\n## A <!-- orbit type: milestone -->').root;
    const runs: number[] = [];
    const app = (tick: number) => createElement(OrbitMindMap, {
      ref,
      data: tree,
      transitionDuration: 0,
      nodeTypes: { milestone: { icon: '🏁', render: (node, element) => { element.textContent = `${node.text}${tick}`; } } },
      actions: [{ id: 'mark', label: 'Mark', run: () => runs.push(tick) }],
    });
    const view = await mount(app(0));

    for (let tick = 1; tick <= 3; tick += 1) {
      await view.update(app(tick));
    }

    expect(counter.draws).toBe(1);
    (view.host.querySelector('.orbit-action--custom') as HTMLButtonElement).click();
    expect(runs).toEqual([3]);
    expect(view.host.querySelector('.orbit-node-content')?.textContent).toBe('A0');
    await view.unmount();
    counter.restore();
  });

  it('calls the latest callback', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const tree = parseOrbit('# Root\n## A').root;
    const calls: string[] = [];
    const view = await mount(createElement(OrbitMindMap, { ref, data: tree, onNodeClick: () => calls.push('first') }));
    await view.update(createElement(OrbitMindMap, { ref, data: tree, onNodeClick: () => calls.push('second') }));
    const options = (ref.current?.renderer as unknown as { options: { onNodeClick: (node: unknown) => void } }).options;
    options.onNodeClick(tree.children[0]);
    expect(calls).toEqual(['second']);
    await view.unmount();
  });

  it('takes long presses only with an onNodeContext prop, and reports edits', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const tree = parseOrbit('# Root\n## A').root;
    const edits: string[] = [];
    const view = await mount(createElement(OrbitMindMap, { ref, data: tree, onEdit: (edit) => edits.push(`${edit.kind} ${edit.node.id}`) }));
    const options = () => (ref.current?.renderer as unknown as { options: { onNodeContext?: unknown } }).options;
    expect(options().onNodeContext).toBeUndefined();
    ref.current?.renderer?.addNode('root', { text: 'B' });
    expect(edits).toEqual(['add b']);
    await view.update(createElement(OrbitMindMap, { ref, data: tree, onNodeContext: () => undefined }));
    expect(options().onNodeContext).toBeDefined();
    await view.unmount();
  });

  it('reports the media viewer opening and closing to the latest callbacks, and turns it off', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const tree = parseOrbit('# Root\n![A picture](https://example.com/a.jpg)\n## A').root;
    const calls: string[] = [];
    const app = (name: string, mediaViewer?: boolean) => createElement(OrbitMindMap, {
      ref,
      data: tree,
      transitionDuration: 0,
      mediaViewer,
      onMediaOpen: (event) => calls.push(`${name} opened ${event.node.id} ${event.kind}`),
      onMediaClose: (event) => calls.push(`${name} closed ${event.node.id}`),
    });
    const view = await mount(app('first'));
    await view.update(app('second'));
    ref.current?.renderer?.openMedia('root');
    ref.current?.renderer?.closeMedia();
    expect(calls).toEqual(['second opened root image', 'second closed root']);
    await view.update(app('second', false));
    (view.host.querySelector('.orbit-action--image') as HTMLButtonElement).click();
    expect(view.host.querySelector('dialog.orbit-viewer[open]')).toBeNull();
    expect(view.host.querySelector('dialog.orbit-sheet[open]')).not.toBeNull();
    await view.unmount();
  });

  it('server rendering draws a static picture of the map; the live map replaces it', async () => {
    const source = '# Root\n## Alpha\n## Beta';
    const html = renderToString(createElement(OrbitMindMap, { source }));
    expect(html).toContain('data-orbit-static');
    expect(html).toContain('<svg');
    expect(html).toContain('Alpha');
    expect(renderToString(createElement(OrbitMindMap, { source, staticFallback: false }))).not.toContain('<svg');
    const view = await mount(createElement(OrbitMindMap, { source }));
    expect(view.host.querySelector('[data-orbit-static]')).toBeNull();
    expect(view.host.querySelector('.orbit [data-orbit-node-id="alpha"]')).not.toBeNull();
    await view.unmount();
  });

  it('the ref flies the map and switches views', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const view = await mount(createElement(OrbitMindMap, { ref, source: '# Root\n## Alpha\n### Deep\n## Beta', transitionDuration: 0 }));
    expect(ref.current?.flyTo('deep')).toBe(true);
    expect(ref.current?.renderer?.getFocusPath()).toEqual(['root', 'alpha', 'deep']);
    ref.current?.overview();
    expect(ref.current?.getViewMode()).toBe('all');
    ref.current?.setViewMode('focus');
    expect(ref.current?.getViewMode()).toBe('focus');
    await view.unmount();
  });

  it('focusedId controls the focus', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const source = '# Root\n## Alpha\n## Beta';
    const view = await mount(createElement(OrbitMindMap, { ref, source, focusedId: 'beta', transitionDuration: 0 }));
    expect(ref.current?.renderer?.getFocusPath()).toEqual(['root', 'beta']);
    await view.update(createElement(OrbitMindMap, { ref, source, focusedId: 'alpha', transitionDuration: 0 }));
    expect(ref.current?.renderer?.getFocusPath()).toEqual(['root', 'alpha']);
    await view.unmount();
  });

  it('focus opens the map on a node, without a flight or a stray attribute', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const onFocusChange = mock(() => undefined);
    const view = await mount(createElement(OrbitMindMap, { ref, source: '# Root\n## Alpha\n### Deep\n## Beta', focus: 'deep', onFocusChange }));
    expect(ref.current?.renderer?.getFocusPath()).toEqual(['root', 'alpha', 'deep']);
    expect(onFocusChange).not.toHaveBeenCalled();
    expect(view.host.querySelector('[focus]')).toBeNull();
    await view.unmount();
  });

  it('node types bring nodes written for an older version up to date', async () => {
    const ref = createRef<OrbitMindMapRef>();
    const view = await mount(createElement(OrbitMindMap, {
      ref,
      source: '# Map\n## Write <!-- orbit type: task, assignee: Ana -->\n',
      transitionDuration: 0,
      nodeTypes: {
        task: {
          version: 2,
          upgrade: (node, from) => {
            if (from < 2 && node.attrs?.assignee !== undefined) {
              const { assignee, ...rest } = node.attrs;
              node.attrs = { ...rest, owner: assignee };
            }
          },
        },
      },
    }));
    expect(ref.current!.renderer!.getDocument()!.root.children[0]).toMatchObject({ typeVersion: 2, attrs: { owner: 'Ana' } });
    await view.unmount();
  });

  it('fits the map around the page\'s own controls with insets, and keeps them off the element', async () => {
    expect(renderToString(createElement(OrbitMindMap, { source: '# Map', insets: { bottom: 72 } }))).not.toContain('insets');
    const counter = countDraws();
    const ref = createRef<OrbitMindMapRef>();
    const app = () => createElement(OrbitMindMap, { ref, source: '# Map\n## A', transitionDuration: 0, insets: { bottom: 72 } });
    const view = await mount(app());
    await view.update(app());
    const options = (ref.current!.renderer as unknown as { options: { insets?: unknown } }).options;
    expect(options.insets).toEqual({ bottom: 72 });
    expect(view.host.innerHTML).not.toContain('insets');
    // An equal object on every render doesn't draw the map again.
    expect(counter.draws).toBe(1);
    await view.unmount();
    counter.restore();
  });

  it('passes style, id and aria attributes to the wrapper', () => {
    const html = renderToString(createElement(OrbitMindMap, {
      data: { id: 'r', text: 'A', level: 0, children: [] },
      id: 'roadmap',
      'aria-describedby': 'roadmap-help',
      style: { height: 480 },
    }));
    expect(html).toContain('id="roadmap"');
    expect(html).toContain('aria-describedby="roadmap-help"');
    expect(html).toContain('height:480px');
    expect(html).toContain('width:100%');
  });
});
