import { beforeEach, describe, expect, test } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { assignNodeColors, buildFocusScene, buildOverviewScene, fitScene } from '../src/core/engine/scene';
import { actionRows } from '../src/core/ui/actions';
import { internals, manualClock, mount, onScreen, useMapSize } from './helpers/renderer';

// The size the website gives its large map on a phone. Tests here use a
// mouse's 36 px buttons and zoom buttons 40 by 108 px, 12 px from the corner.
useMapSize(358, 460);

beforeEach(() => {
  document.body.innerHTML = '';
});

/** A library's twelve areas and their tables: two rings of planets that come close to the sun on a phone. */
const LIBRARY = `# City library
> Every table of the library's database.

${Array.from({ length: 12 }, (_, area) => `## Area ${area + 1}\n${Array.from({ length: 5 }, (_, table) => `- table_${area}_${table}`).join('\n')}`).join('\n\n')}`;

/** Six buttons of your own: with the note's, seven, more than fit on one line beside the zoom buttons. */
const SIX_ACTIONS = Array.from({ length: 6 }, (_, index) => ({ id: `action-${index}`, label: `Action ${index}`, icon: 'list', run: () => undefined }));

/** The buttons on screen: the middle of their top edge (px), from their transform, and the width they wrap at. */
const buttons = (host: HTMLElement): { x: number; top: number; wrap: string; shown: boolean } => {
  const element = host.querySelector<HTMLElement>('.orbit-actions')!;
  const [, x, top] = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(element.style.transform)!;
  return { x: Number(x), top: Number(top), wrap: element.style.maxWidth, shown: element.classList.contains('orbit-actions--visible') };
};

/** The sun on screen, and the lowest any body comes below it (px) as the orbit turns. */
const orbit = (renderer: Parameters<typeof internals>[0]): { sun: { x: number; y: number }; bottom: number } => {
  const state = internals(renderer);
  const sun = state.display!.nodes.get(state.scene!.focusId)!;
  const reach = Math.max(...Array.from(state.display!.nodes.values()).map((node) => Math.hypot(node.x - sun.x, node.y - sun.y) + node.radius));
  const center = onScreen(renderer, sun);
  return { sun: center, bottom: center.y + reach * state.camera.scale };
};

describe("the focused node's buttons, where its planets crowd it", () => {
  test('sit under the orbit, clear of every planet at every turn', () => {
    const { host, renderer } = mount(LIBRARY);
    const { sun, bottom } = orbit(renderer);
    expect(buttons(host).shown).toBe(true);
    expect(buttons(host).x).toBeCloseTo(sun.x, 0);
    expect(buttons(host).top).toBeGreaterThanOrEqual(bottom);
    expect(buttons(host).top + 36).toBeLessThanOrEqual(460 - 12);
  });

  test('keep the planets their size where the map has height to spare', () => {
    const shown = mount(LIBRARY);
    const hidden = mount(LIBRARY, { showActionButtons: false });
    expect(internals(shown.renderer).scene!.frame.scale).toBeCloseTo(internals(hidden.renderer).scene!.frame.scale, 6);
  });

  test("take their room from the orbit where the map's height is all used", () => {
    const shown = mount(LIBRARY);
    const hidden = mount(LIBRARY, { showActionButtons: false });
    internals(shown.renderer).handleResize({ width: 900, height: 400 });
    internals(hidden.renderer).handleResize({ width: 900, height: 400 });
    const { bottom } = orbit(shown.renderer);
    expect(internals(shown.renderer).scene!.frame.scale).toBeLessThan(internals(hidden.renderer).scene!.frame.scale);
    expect(buttons(shown.host).top).toBeGreaterThanOrEqual(bottom);
    expect(buttons(shown.host).top + 36).toBeLessThanOrEqual(400 - 12);
  });

  test('stop short of the zoom buttons, on more lines where one is too long', () => {
    const { host, renderer } = mount(LIBRARY, { actions: SIX_ACTIONS });
    const placed = buttons(host);
    // Between the map's left side and the zoom buttons (left at 306 px) there's room for 6 of the 7 a line: 256 px, on 2 lines.
    expect(placed.wrap).toBe('256px');
    expect(placed.x + 128).toBeLessThanOrEqual(306 - 12);
    expect(placed.top).toBeGreaterThanOrEqual(orbit(renderer).bottom);
    expect(placed.top + 80).toBeLessThanOrEqual(460 - 12);
  });

  test('take the whole width under the sun when the map shows no zoom buttons', () => {
    const { host, renderer } = mount(LIBRARY, { actions: SIX_ACTIONS, showControls: false });
    expect(buttons(host).wrap).toBe('');
    expect(buttons(host).x).toBeCloseTo(orbit(renderer).sun.x, 0);
  });

  test("stay above the page's own controls, after flights and when the controls change", () => {
    const clock = manualClock();

    try {
      const { host, renderer } = mount(LIBRARY, { transitionDuration: 400, insets: { bottom: 100 } });
      clock.advance(1000);
      expect(buttons(host).top + 36).toBeLessThanOrEqual(460 - 100 - 12);
      const fitted = { ...internals(renderer).scene!.frame };
      renderer.flyTo('area-1');
      clock.advance(1500);
      renderer.flyTo('city-library');
      clock.advance(1500);
      // Back where the view was fitted, room for the buttons and all.
      expect(internals(renderer).camera.scale).toBeCloseTo(fitted.scale, 6);
      expect(internals(renderer).camera.y).toBeCloseTo(fitted.y, 3);
      expect(buttons(host).shown).toBe(true);
      expect(buttons(host).top).toBeGreaterThanOrEqual(orbit(renderer).bottom);
      expect(buttons(host).top + 36).toBeLessThanOrEqual(460 - 100 - 12);
      renderer.setOptions({ insets: { bottom: 160 } });
      clock.advance(1000);
      expect(buttons(host).top).toBeGreaterThanOrEqual(orbit(renderer).bottom);
      expect(buttons(host).top + 36).toBeLessThanOrEqual(460 - 160 - 12);
    } finally {
      clock.restore();
    }
  });

  test('give their room back when the page turns them off', () => {
    const { renderer } = mount(LIBRARY);
    internals(renderer).handleResize({ width: 900, height: 400 });
    const withButtons = internals(renderer).scene!.frame.scale;
    renderer.setOptions({ showActionButtons: false });
    const without = internals(renderer).scene!.frame.scale;
    expect(without).toBeGreaterThan(withButtons);
    expect(internals(renderer).camera.scale).toBeCloseTo(without, 6);
    renderer.setOptions({ showActionButtons: true });
    expect(internals(renderer).scene!.frame.scale).toBeCloseTo(withButtons, 6);
  });
});

describe('actionRows', () => {
  test('keeps the buttons on one line where they fit, and wraps them where they don’t', () => {
    expect(actionRows(3, 36)).toEqual({ perLine: 3, width: 124, height: 36 });
    expect(actionRows(7, 36, 282)).toEqual({ perLine: 6, width: 256, height: 80 });
    expect(actionRows(7, 42, 282)).toEqual({ perLine: 5, width: 242, height: 92 });
    expect(actionRows(2, 42, 20)).toEqual({ perLine: 1, width: 42, height: 92 });
  });
});

describe('fitScene', () => {
  test("fits a scene as its frame does, and leaves room under it when asked", () => {
    const tree = parseOrbit(LIBRARY).root;
    const colors = assignNodeColors(tree, ['#888888']);
    const viewport = { width: 900, height: 400 };
    const insets = { top: 0, right: 0, bottom: 30, left: 0 };

    for (const scene of [buildFocusScene(tree, tree.id, { viewport, colors, insets }), buildOverviewScene(tree, { viewport, colors, insets })]) {
      expect(fitScene(scene, viewport, insets)).toEqual(scene.frame);
      const roomy = fitScene(scene, viewport, insets, 100);
      // The scene's lowest point sits at least 100 px above the page's controls, 30 px off the bottom.
      const lowest = (scene.extent.y - roomy.y) * roomy.scale + viewport.height / 2;
      expect(lowest).toBeLessThanOrEqual(viewport.height - 30 - 100 + 0.001);
      expect(roomy.scale).toBeLessThan(scene.frame.scale);
    }
  });
});
