/**
 * Where a node being dragged would go if it were let go now: into another
 * node, at a place in the focused orbit, or nowhere. Pure functions over what
 * is on screen, so the renderer only tracks the finger.
 */

import type { OrbitNode } from '../types.js';
import type { Display, DisplayNode } from './display.js';
import { toDegrees, type Scene } from './scene.js';

/** Where a dragged node would go: under `parentId`, at `index` among its children (null: after the last). */
export interface DropPlace {
  parentId: string;
  index: number | null;

  /** Dropped on a node rather than on a place in the orbit. */
  into: boolean;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The ids a node can't be dropped into: itself and everything under it
 * (a node can't go inside itself), and its parent, which it is already in.
 */
export const unreachableIds = (node: OrbitNode, parentId: string | undefined): Set<string> => {
  const ids = new Set<string>();
  const stack = [node];

  while (stack.length > 0) {
    const current = stack.pop() as OrbitNode;
    ids.add(current.id);
    stack.push(...current.children);
  }

  if (parentId !== undefined) {
    ids.add(parentId);
  }

  return ids;
};

/**
 * The node under `point` (world coordinates) to drop into, or null. Each
 * node catches the point within `catchRadius` of its center (world units),
 * given whether it's the target so far, so a target can hold on a little
 * further than it caught; the most central catch wins.
 */
export const nodeUnder = (
  display: Display,
  point: Point,
  unreachable: ReadonlySet<string>,
  catchRadius: (node: DisplayNode, current: boolean) => number,
  current: string | null,
): DisplayNode | null => {
  let best: DisplayNode | null = null;
  let bestShare = Infinity;

  for (const entry of display.nodes.values()) {
    if (unreachable.has(entry.id) || entry.opacity < 0.6 || entry.radius <= 0) {
      continue;
    }

    const limit = catchRadius(entry, entry.id === current);
    const distance = Math.hypot(point.x - entry.x, point.y - entry.y);

    if (distance > limit) {
      continue;
    }

    // How far out from its center, as a share of what it catches: the most central catch wins.
    const share = distance / limit;

    if (share < bestShare) {
      best = entry;
      bestShare = share;
    }
  }

  return best;
};

/**
 * The place in a focused orbit for node `draggedId` dropped at `point`
 * (relative to the sun, in an orbit turned `rotation` degrees), counted among
 * the sun's children without it, or null when the point is off the orbit.
 * `layout` is the orbit as it's drawn, with the place it's held at (it, laid
 * out there, or the slot), so the place under the press is the one on
 * screen: it stays put while the press stays near it, and moves past a
 * planet the press crosses. `ringRadius` is used when the orbit is empty.
 * Orbits of more than one ring take drops on their planets only.
 *
 * The first place and the last are the same gap, between the last planet
 * and the first: there, the place held now (`current`) stays, rather than
 * turning the whole orbit a step.
 */
export const orbitPlaceAt = (
  layout: Scene,
  point: Point,
  rotation: number,
  ringRadius: number,
  band: number,
  draggedId: string,
  current: number | null = null,
): number | null => {
  if (layout.kind !== 'focus' || layout.rings.length > 1) {
    return null;
  }

  const radius = layout.rings[0]?.radius ?? ringRadius;

  if (Math.abs(Math.hypot(point.x, point.y) - radius) > band) {
    return null;
  }

  const clockwise = (angle: number): number => ((angle % 360) + 360) % 360;
  const planets = Array.from(layout.nodes.values()).filter((node) => node.role === 'planet' && node.orbitAngle !== undefined);
  const siblings = planets.filter((node) => node.id !== draggedId).map((node) => node.orbitAngle as number);

  if (siblings.length === 0) {
    return 0;
  }

  // Everything on the ring, going round from where the orbit starts (the top): count from halfway before the first.
  const around = planets.map((node) => node.orbitAngle as number);

  if (layout.addSlot) {
    around.push(layout.addSlot.orbitAngle);
  }

  around.sort((first, second) => clockwise(first + 90) - clockwise(second + 90));
  const half = around.length > 1 ? clockwise(around[1] - around[0]) / 2 : 180;
  const from = around[0] - half;
  const pointer = clockwise(toDegrees(Math.atan2(point.y, point.x)) - rotation - from);
  const place = siblings.filter((angle) => clockwise(angle - from) < pointer).length;
  const ends = (index: number | null) => index === 0 || index === siblings.length;
  return ends(place) && ends(current) ? (current as number) : place;
};

/** Whether two places are the same. */
export const samePlace = (first: DropPlace | null, second: DropPlace | null): boolean => {
  if (first === null || second === null) {
    return first === second;
  }

  return first.parentId === second.parentId && first.index === second.index && first.into === second.into;
};
