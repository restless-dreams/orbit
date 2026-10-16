import { afterAll, beforeAll, spyOn } from 'bun:test';
import { OrbitSVGRenderer } from '../../src/core/svg-renderer';
import { parseOrbit } from '../../src/core/dispatch';
import type { RendererOptions } from '../../src/core/types';

interface Size {
  width: number;
  height: number;
}

const prototype = OrbitSVGRenderer.prototype as unknown as { readContainerSize: () => Size };

/** happy-dom does no layout: give every map in the file a fixed size. */
export const useMapSize = (width = 600, height = 400): void => {
  const original = prototype.readContainerSize;

  beforeAll(() => {
    prototype.readContainerSize = () => ({ width, height });
  });

  afterAll(() => {
    prototype.readContainerSize = original;
  });
};

/**
 * Renders `source` into a fresh container. Flights are off unless the
 * options turn them on, so each navigation lands at once.
 */
export const mount = (source: string, options: RendererOptions = {}): { host: HTMLElement; renderer: OrbitSVGRenderer } => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const renderer = new OrbitSVGRenderer(host, { transitionDuration: 0, ...options });
  renderer.render(parseOrbit(source));
  return { host, renderer };
};

export interface SceneNodeView {
  x: number;
  y: number;
  radius: number;
  role: string;
  orbitAngle?: number;
}

/** The renderer's private state, for assertions about motion and geometry. */
export interface RendererInternals {
  camera: { x: number; y: number; scale: number };
  scene: { kind: string; focusId: string; frame: { x: number; y: number; scale: number }; nodes: Map<string, SceneNodeView> } | null;
  transition: { startedAt: number; duration: number } | null;
  nextScene: { focusId: string } | null;
  display: { camera: { x: number; y: number; scale: number }; nodes: Map<string, SceneNodeView & { opacity: number }> } | null;
  spinPhysics: { angle: number; velocity: number; mode: string };
  viewport: Size;
  zoomLevel(): number;
  zoomAt(factor: number, anchor: { x: number; y: number }): boolean;
  handleResize(size: Size): void;
}

export const internals = (renderer: OrbitSVGRenderer): RendererInternals => {
  return renderer as unknown as RendererInternals;
};

/** Where a world point lands on screen with the current camera. */
export const onScreen = (renderer: OrbitSVGRenderer, point: { x: number; y: number }): { x: number; y: number } => {
  const { camera, viewport } = internals(renderer);
  return {
    x: (point.x - camera.x) * camera.scale + viewport.width / 2,
    y: (point.y - camera.y) * camera.scale + viewport.height / 2,
  };
};

/** Animation frames and `performance.now` under the test's control. */
export interface ManualClock {
  readonly now: number;

  /** Runs frames every `frame` ms until `milliseconds` have passed. */
  advance(milliseconds: number, frame?: number): void;

  restore(): void;
}

export const manualClock = (): ManualClock => {
  let now = 10_000;
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const originalRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  const nowSpy = spyOn(performance, 'now').mockImplementation(() => now);
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (handle: number) => {
      callbacks.delete(handle);
    },
  });
  return {
    get now() {
      return now;
    },
    advance(milliseconds: number, frame = 16) {
      const end = now + milliseconds;

      while (now < end) {
        now = Math.min(end, now + frame);
        const due = Array.from(callbacks.values());
        callbacks.clear();

        for (const callback of due) {
          callback(now);
        }
      }
    },
    restore() {
      nowSpy.mockRestore();

      if (originalRequest) {
        Object.defineProperty(globalThis, 'requestAnimationFrame', originalRequest);
      }

      if (originalCancel) {
        Object.defineProperty(globalThis, 'cancelAnimationFrame', originalCancel);
      }
    },
  };
};

/** A pointer event happy-dom can dispatch, with the fields the gesture code reads. */
export const pointer = (
  type: string,
  init: { x: number; y: number; time: number; id?: number; kind?: 'mouse' | 'touch' | 'pen'; ctrlKey?: boolean },
): Event => {
  const event = new MouseEvent(type, { clientX: init.x, clientY: init.y, bubbles: true, cancelable: true, button: 0, ctrlKey: init.ctrlKey });
  Object.defineProperty(event, 'pointerId', { value: init.id ?? 1 });
  Object.defineProperty(event, 'pointerType', { value: init.kind ?? 'mouse' });
  Object.defineProperty(event, 'timeStamp', { value: init.time });
  return event;
};

export const node = (host: ParentNode, id: string): SVGGElement => {
  const element = host.querySelector<SVGGElement>(`[data-orbit-node-id="${id}"]`);

  if (!element) {
    throw new Error(`No node "${id}" on the map`);
  }

  return element;
};

export const click = (target: Element, init: MouseEventInit = {}): MouseEvent => {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ...init });
  target.dispatchEvent(event);
  return event;
};

/** A wheel event with the pointer fields happy-dom's WheelEvent leaves out. */
export const wheel = (init: { deltaY: number; x?: number; y?: number; ctrlKey?: boolean; deltaMode?: number }): WheelEvent => {
  const event = new WheelEvent('wheel', { deltaY: init.deltaY, deltaMode: init.deltaMode ?? 0, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: init.x ?? 300 });
  Object.defineProperty(event, 'clientY', { value: init.y ?? 200 });
  Object.defineProperty(event, 'ctrlKey', { value: init.ctrlKey ?? false });
  Object.defineProperty(event, 'metaKey', { value: false });
  return event;
};

/** Reports `prefers-reduced-motion: reduce` for the file's tests, so maps draw without animating in. */
export const useReducedMotion = (): void => {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }),
    });
  });

  afterAll(() => {
    if (original) {
      Object.defineProperty(window, 'matchMedia', original);
    }
  });
};
