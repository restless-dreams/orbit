import { describe, expect, it } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { smoothZoomPath } from '../src/core/engine/camera';
import { placedFrame, sceneDisplay, transitionDisplay, type Transition } from '../src/core/engine/display';
import { alignScene, assignNodeColors, buildFocusScene, buildOverviewScene } from '../src/core/engine/scene';

const viewport = { width: 900, height: 600 };

const setup = () => {
  const tree = parseOrbit('# Root\n## Alpha\n- A1\n  - A1a\n- A2\n## Beta\n- B1').root;
  const colors = assignNodeColors(tree, ['R', 'A', 'B']);
  const rootScene = buildFocusScene(tree, tree.id, { viewport, colors });
  return { tree, colors, rootScene };
};

describe('sceneDisplay', () => {
  it('turns planets and their moons with the orbit', () => {
    const { tree, rootScene } = setup();
    const alpha = tree.children[0];
    const resting = sceneDisplay(rootScene, 0, rootScene.frame);
    const turned = sceneDisplay(rootScene, 90, rootScene.frame);
    const before = resting.nodes.get(alpha.id)!;
    const after = turned.nodes.get(alpha.id)!;
    expect(Math.hypot(after.x, after.y)).toBeCloseTo(Math.hypot(before.x, before.y), 6);
    expect(Math.atan2(after.y, after.x) - Math.atan2(before.y, before.x)).toBeCloseTo(Math.PI / 2, 6);
    const moon = alpha.children[0].id;
    const moonBefore = resting.nodes.get(moon)!;
    const moonAfter = turned.nodes.get(moon)!;
    expect(Math.hypot(moonAfter.x - after.x, moonAfter.y - after.y)).toBeCloseTo(Math.hypot(moonBefore.x - before.x, moonBefore.y - before.y), 6);
    expect(turned.nodes.get(tree.id)).toMatchObject({ x: 0, y: 0 });
    expect(turned.rings[0].rotation).toBe(90);
  });

  it('gives a focused orbit its turn, and each body that turns with it where it is unturned', () => {
    const { tree, colors, rootScene } = setup();
    const turned = sceneDisplay(rootScene, 90, rootScene.frame);
    expect(turned.turn).toEqual({ cx: 0, cy: 0, rotation: 90 });
    const alpha = tree.children[0];
    const moon = alpha.children[0];

    for (const id of [alpha.id, moon.id]) {
      const { x, y } = rootScene.nodes.get(id)!;
      expect(turned.nodes.get(id)!.unturned).toMatchObject({ x, y });
    }

    expect(turned.nodes.get(tree.id)!.unturned).toBeUndefined();
    const overview = buildOverviewScene(tree, { viewport, colors });
    expect(sceneDisplay(overview, 0, overview.frame).turn).toBeUndefined();
  });
});

describe('transitionDisplay', () => {
  const flyInto = (rotation: number) => {
    const { tree, colors, rootScene } = setup();
    const alpha = tree.children[0];
    const from = sceneDisplay(rootScene, rotation, rootScene.frame);
    const target = buildFocusScene(tree, alpha.id, { viewport, colors });
    const current = from.nodes.get(alpha.id)!;
    const placement = alignScene(target, alpha.id, current);
    const transition: Transition = {
      from,
      target,
      placement,
      cameraPath: smoothZoomPath(from.camera, placedFrame(target, placement), viewport),
      startedAt: 0,
      duration: 700,
    };
    return { tree, alpha, from, target, placement, transition };
  };

  it('starts exactly where the current view is and ends exactly at the target', () => {
    const { tree, alpha, from, transition } = flyInto(35);
    const start = transitionDisplay(transition, 0);

    for (const [id, node] of from.nodes) {
      expect(start.nodes.get(id)!.x).toBeCloseTo(node.x, 6);
      expect(start.nodes.get(id)!.y).toBeCloseTo(node.y, 6);
    }

    expect(start.camera.scale).toBeCloseTo(from.camera.scale, 6);

    const end = transitionDisplay(transition, 1);
    const finalSun = end.nodes.get(alpha.id)!;
    expect(finalSun.role).toBe('sun');
    expect(end.nodes.get(tree.id)!.opacity).toBe(0);
    expect(end.camera.x).toBeCloseTo(finalSun.x, 6);
    expect(end.camera.y).toBeCloseTo(finalSun.y, 6);
  });

  it('keeps the tapped planet in place and grows its moons into planets', () => {
    const { alpha, from, transition } = flyInto(0);
    const moonId = alpha.children[0].id;
    const startMoon = from.nodes.get(moonId)!;
    const end = transitionDisplay(transition, 1);
    expect(startMoon.role).toBe('moon');
    expect(end.nodes.get(moonId)!.role).toBe('planet');
    expect(end.nodes.get(moonId)!.radius).toBeGreaterThan(startMoon.radius);
    const middle = transitionDisplay(transition, 0.5);
    expect(middle.nodes.get(alpha.id)!.x).toBeCloseTo(from.nodes.get(alpha.id)!.x, 6);
  });

  it('unfolds new nodes out of their parent', () => {
    const { alpha, transition } = flyInto(0);
    const grandchild = alpha.children[0].children[0].id;
    const early = transitionDisplay(transition, 0.2);
    expect(early.nodes.get(grandchild)!.radius).toBe(0);
    const late = transitionDisplay(transition, 1);
    expect(late.nodes.get(grandchild)!.radius).toBeGreaterThan(0);
    expect(late.nodes.get(grandchild)!.opacity).toBe(1);
  });

  it('never leaves the screen empty mid-flight', () => {
    const { transition } = flyInto(0);

    for (const progress of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const visible = [...transitionDisplay(transition, progress).nodes.values()].filter((node) => node.opacity > 0.2);
      expect(visible.length).toBeGreaterThan(0);
    }
  });
});
