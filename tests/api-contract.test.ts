import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { OrbitMindMap, type OrbitMindMapRef } from '../src/react';
import { MediaViewer } from '../src/core/ui/media-viewer';
import { OrbitSVGRenderer } from '../src/core/svg-renderer';
import type { OrbitEventName } from '../src/core/types';
import { destructuredPropsOf, fieldsOf, valueFieldsOf } from './helpers/declarations';
import { click, internals, mount, node, onScreen, pointer, useMapSize, useReducedMotion } from './helpers/renderer';

// What the public API promises, checked through the API itself: every event
// reaches the page three ways with the detail its type says, the React
// wrapper hands every option to the renderer, and the ref's methods do
// what the renderer's do.

useMapSize(600, 400);
// No coasting, so a spun orbit settles at once.
useReducedMotion();

const STAGE = { left: 0, top: 0, width: 1000, height: 600 };
const viewerPrototype = MediaViewer.prototype as unknown as { readStageBox: () => typeof STAGE };
const readStageBox = viewerPrototype.readStageBox;

beforeAll(() => {
  viewerPrototype.readStageBox = () => STAGE;
});

afterAll(() => {
  viewerPrototype.readStageBox = readStageBox;
});

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `# Root

## Alpha
### Alpha One
## Beta
> A note on Beta.
- Beta One
## Gamma
![A picture](https://example.com/gamma.jpg)
## Delta
<!-- orbit video: "https://example.com/clip.mp4" -->`;

const HOLD = 20;

type Mounted = ReturnType<typeof mount>;

/** Where node `id` is drawn on screen this frame. */
const drawnAt = (renderer: OrbitSVGRenderer, id: string): { x: number; y: number } => {
  const entry = internals(renderer).display?.nodes.get(id);

  if (!entry) {
    throw new Error(`"${id}" isn't drawn`);
  }

  return onScreen(renderer, entry);
};

/** How to make each event happen, on MAP. */
const TRIGGERS: Record<OrbitEventName, (map: Mounted) => void | Promise<void>> = {
  'focus-change': ({ host }) => {
    click(node(host, 'alpha'));
  },
  'view-mode-change': ({ renderer }) => {
    renderer.overview();
  },
  'node-click': ({ host }) => {
    click(node(host, 'alpha'));
  },
  action: ({ host, renderer }) => {
    renderer.focusNode('beta');
    click(host.querySelector('.orbit-action--note')!);
  },
  'spin-settle': ({ renderer }) => {
    renderer.spin(900);
  },
  'node-context': ({ host }) => {
    node(host, 'alpha').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
  },
  edit: ({ renderer }) => {
    renderer.updateNode('alpha', { status: 'done' });
  },
  'editor-open': ({ renderer }) => {
    renderer.editNode('alpha');
  },
  'editor-close': ({ renderer }) => {
    renderer.editNode('alpha');
    renderer.stopEditing();
  },
  'node-drag': async ({ host, renderer }) => {
    const at = drawnAt(renderer, 'beta');
    node(host, 'beta').dispatchEvent(pointer('pointerdown', { ...at, time: 1, kind: 'touch' }));
    await Bun.sleep(HOLD * 3);
    const svg = host.querySelector('svg')!;
    svg.dispatchEvent(pointer('pointermove', { x: at.x + 30, y: at.y, time: 50, kind: 'touch' }));
    svg.dispatchEvent(pointer('pointerup', { x: at.x + 30, y: at.y, time: 90, kind: 'touch' }));
  },
  'media-open': ({ renderer }) => {
    renderer.openMedia('gamma');
  },
  'media-close': ({ renderer }) => {
    renderer.openMedia('gamma');
    renderer.closeMedia();
  },
  'media-state': ({ renderer }) => {
    renderer.openMedia('delta', { kind: 'video', autoplay: false });
    const video = document.querySelector<HTMLVideoElement>('dialog.orbit-viewer[open] video')!;
    Object.defineProperty(video, 'duration', { value: 30, configurable: true });
    video.dispatchEvent(new Event('loadedmetadata'));
  },
};

/** The `on…` option for an event: `onFocusChange` for `focus-change`. */
const optionFor = (name: string): string => `on${name.replace(/(^|-)([a-z])/g, (_, __, letter: string) => letter.toUpperCase())}`;

/** What the `on…` option is called with, from the event's detail: the guide's "Called with" table. */
const CALLED_WITH: Partial<Record<OrbitEventName, (detail: Record<string, unknown>) => unknown[]>> = {
  'focus-change': (detail) => [detail.node, detail.path],
  'view-mode-change': (detail) => [detail.mode],
  'node-click': (detail) => [detail.node],
  action: (detail) => [{ node: detail.node, action: detail.action, sourceEvent: detail.sourceEvent }],
  'spin-settle': (detail) => [detail.node],
};

describe('every event', () => {
  test('has a way to make it happen here, and an on… option of its name', () => {
    const events = fieldsOf('src/core/types.ts', 'OrbitEventMap');
    expect(Object.keys(TRIGGERS).sort()).toEqual(events);
    const options = fieldsOf('src/core/types.ts', 'OrbitRendererOptions');
    expect(events.map(optionFor).filter((option) => !options.includes(option))).toEqual([]);
  });

  for (const name of Object.keys(TRIGGERS) as OrbitEventName[]) {
    test(`${name} reaches on(), the orbit-${name} DOM event and ${optionFor(name)}, with the detail its type says`, async () => {
      const called: unknown[][] = [];
      const map = mount(MAP, { editable: true, longPressDelay: HOLD, [optionFor(name)]: (...args: unknown[]) => { called.push(args); } });
      const heard: Record<string, unknown>[] = [];
      const dispatched: Record<string, unknown>[] = [];
      map.renderer.on(name, (detail) => heard.push(detail as unknown as Record<string, unknown>));
      map.host.addEventListener(`orbit-${name}`, (event) => dispatched.push((event as CustomEvent).detail));
      // Only what the trigger does: drawing the map may have called some options already.
      called.length = 0;
      await TRIGGERS[name](map);

      expect(heard.length).toBeGreaterThan(0);
      expect(dispatched[0]).toBe(heard[0]);
      const detail = heard[0];
      const fields = valueFieldsOf('src/core/types.ts', 'OrbitEventMap', name);
      const keys = Object.keys(detail).sort();
      // Every field the type requires, and none it doesn't name.
      expect(fields.required.filter((field) => !keys.includes(field))).toEqual([]);
      expect(keys.filter((key) => !fields.all.includes(key))).toEqual([]);
      expect(called.length).toBeGreaterThan(0);
      expect(called[0]).toEqual((CALLED_WITH[name] ?? ((same) => [same]))(detail));
    });
  }
});

describe('the React wrapper', () => {
  test('takes every renderer option as a prop, so none ends up on its <div> instead', () => {
    const props = destructuredPropsOf('src/react/index.ts', 'OrbitMindMap');
    const options = fieldsOf('src/core/types.ts', 'OrbitRendererOptions', { deprecated: true });
    expect(options.filter((option) => !props.includes(option))).toEqual([]);
  });

  test('its ref fits the view, as the renderer does', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const fit = spyOn(OrbitSVGRenderer.prototype, 'fit');
    const ref = createRef<OrbitMindMapRef>();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(createElement(OrbitMindMap, { ref, source: MAP, transitionDuration: 0 }));
      });

      ref.current?.fit();
      expect(fit).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        root.unmount();
      });

      fit.mockRestore();
    }
  });
});

describe('fit()', () => {
  test('brings a zoomed view back to the whole orbit, in focus mode and in the overview', () => {
    const { renderer } = mount(MAP);
    const zoom = (): number => internals(renderer).zoomLevel();
    renderer.zoomBy(2);
    expect(zoom()).toBeCloseTo(2, 1);
    renderer.fit();
    expect(zoom()).toBeCloseTo(1, 2);
    renderer.overview();
    renderer.zoomBy(0.5);
    expect(zoom()).toBeCloseTo(0.5, 1);
    renderer.fit();
    expect(zoom()).toBeCloseTo(1, 2);
  });
});
