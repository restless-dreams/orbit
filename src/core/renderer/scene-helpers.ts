/**
 * Views of a scene the renderer works out: where its orbit starts, its planets
 * in order, what of a display shows, where a view lands inside another, and a
 * flight's display with a new or renamed node in it.
 */

import type { Camera, Similarity, Viewport } from '../engine/camera.js';
import { sceneDisplay, type Display, type DisplayNode } from '../engine/display.js';
import type { Scene, SceneNode } from '../engine/scene.js';

/** Resizes within this share of the size a view was laid out for keep its layout: no one sees 2% in a node's size. */
export const RELAYOUT_THRESHOLD = 0.02;

/** A node an edit just added, and where it was typed: its first frame is there. */
export interface Arrival {
  id: string;
  x: number;
  y: number;
  radius: number;
}

/** Whether `size` is within `RELAYOUT_THRESHOLD` of `laidOut` in both directions. */
export const closeInSize = (size: Viewport, laidOut: Viewport): boolean => {
  return Math.abs(size.width - laidOut.width) <= laidOut.width * RELAYOUT_THRESHOLD
    && Math.abs(size.height - laidOut.height) <= laidOut.height * RELAYOUT_THRESHOLD;
};

/** How far the nearest planet's edge (or the +'s) is from the sun, in world units: the room around the sun. */
export const innerEdges = new WeakMap<Scene, number>();

export const innerOrbitEdge = (scene: Scene): number => {
  let edge = innerEdges.get(scene);

  if (edge === undefined) {
    edge = Infinity;

    for (const node of scene.nodes.values()) {
      if (node.role === 'planet' && node.orbitRadius !== undefined) {
        edge = Math.min(edge, node.orbitRadius - node.radius);
      }
    }

    if (scene.addSlot) {
      edge = Math.min(edge, scene.addSlot.orbitRadius - scene.addSlot.radius);
    }

    innerEdges.set(scene, edge);
  }

  return edge;
};

/** Planets clockwise from the top. */
export const orderedPlanets = (scene: Scene): SceneNode[] => {
  return Array.from(scene.nodes.values())
    .filter((node) => node.role === 'planet')
    .sort((left, right) => clockwiseFromTop(left.orbitAngle ?? 0) - clockwiseFromTop(right.orbitAngle ?? 0));
};

export const clockwiseFromTop = (angle: number): number => {
  return (((angle + 90) % 360) + 360) % 360;
};

/** Places `target` so its fitted view matches `camera`: the views cross-fade without the camera moving. */
export const overlayPlacement = (target: Scene, camera: Camera): Similarity => {
  const scale = target.frame.scale / camera.scale;
  return { scale, x: camera.x - target.frame.x * scale, y: camera.y - target.frame.y * scale };
};

/** Drops what has already faded out, so it isn't carried into the next flight. */
export const visiblePart = (display: Display): Display => {
  const nodes = new Map<string, DisplayNode>();

  for (const [id, node] of display.nodes) {
    if (node.opacity > 0.01 && node.radius > 0.01) {
      nodes.set(id, node);
    }
  }

  return {
    nodes,
    rings: display.rings.filter((ring) => ring.opacity > 0.01),
    links: display.links.filter((link) => link.opacity > 0.01),
    camera: display.camera,
    addSlot: display.addSlot && display.addSlot.opacity > 0.01 ? display.addSlot : undefined,
  };
};

/** `display` with a node an edit just added already where it was typed, so it stays there as the others make room. */
export const withArrival = (display: Display, arrival: Arrival | null, target: Scene): Display => {
  if (!arrival || display.nodes.has(arrival.id)) {
    return display;
  }

  const end = sceneDisplay(target, 0, target.frame).nodes.get(arrival.id);

  if (!end) {
    return display;
  }

  const nodes = new Map(display.nodes);
  nodes.set(arrival.id, { ...end, x: arrival.x, y: arrival.y, radius: arrival.radius });
  return { ...display, nodes };
};

/** `display` with the nodes an edit gave new ids under the new ones, so they move rather than leave and arrive. */
export const renameNodes = (display: Display, renamed: ReadonlyMap<string, string>): Display => {
  if (renamed.size === 0) {
    return display;
  }

  const rename = (id: string): string => renamed.get(id) ?? id;
  const nodes = new Map<string, DisplayNode>();

  for (const node of display.nodes.values()) {
    const id = rename(node.id);
    nodes.set(id, {
      ...node,
      id,
      parentId: node.parentId === undefined ? undefined : rename(node.parentId),
      hostId: node.hostId === undefined ? undefined : rename(node.hostId),
    });
  }

  return {
    ...display,
    nodes,
    rings: display.rings.map((ring) => ({ ...ring, centerId: rename(ring.centerId) })),
    links: display.links.map((link) => {
      const fromId = rename(link.fromId);
      const toId = rename(link.toId);
      return { ...link, id: `${fromId}->${toId}`, fromId, toId };
    }),
  };
};
