/**
 * What is on screen this frame. Pure functions: a scene plus the orbit's
 * rotation gives the resting display; during a flight, the current display
 * morphs into the target scene placed in today's world coordinates.
 */

import type { OrbitNode } from '../types.js';
import { applySimilarity, transformCamera, type Camera, type CameraPath, type Similarity } from './camera.js';
import { interpolate, within } from './animation-clock.js';
import { toRadians, type NodeRole, type Scene, type SceneRing } from './scene.js';

export interface DisplayNode {
  id: string;
  node: OrbitNode;
  role: NodeRole;
  x: number;
  y: number;
  radius: number;
  opacity: number;

  /** Multiplies the label's own visibility rules (level of detail, role). */
  labelOpacity: number;

  color: string;
  depth: number;
  hiddenChildren: number;
  parentId?: string;
  hostId?: string;

  /** A planet of a crowded orbit, drawn flat (see `drawsFlat`). */
  crowded?: boolean;

  /** During a flight, how the node comes or goes with its siblings (see `Cluster`). */
  cluster?: Cluster;

  /** A body that turns with its orbit: where it is in the unturned orbit (see `OrbitTurn`). */
  unturned?: Point;
}

/**
 * A focused orbit at rest, turned `rotation` degrees about its sun at
 * (`cx`, `cy`). Each body that turns with it (those with `unturned`) is drawn
 * where it is in the unturned orbit, in a group that turns, so spinning the
 * orbit moves the group instead of every body in it.
 */
export interface OrbitTurn {
  cx: number;
  cy: number;
  rotation: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * During a flight, nodes that come or go together: the children of one
 * parent growing out of it, shrinking into it, or fading where they are.
 * Each is drawn at its own `x`, `y`, `radius` and `nodeOpacity`, which hold
 * still, scaled by `scale` about the pivot with `opacity` on top, which are
 * the same for all of them, so a family can be moved as one.
 */
export interface Cluster {
  pivotX: number;
  pivotY: number;
  scale: number;
  opacity: number;
  x: number;
  y: number;
  radius: number;
  nodeOpacity: number;
}

export interface DisplayRing {
  id: string;
  centerId: string;
  cx: number;
  cy: number;
  radius: number;
  color: string;
  gaps: SceneRing['gaps'];

  /** Degrees added to every gap angle (the orbit's spin). */
  rotation: number;

  opacity: number;
}

export interface DisplayLink {
  id: string;
  fromId: string;
  toId: string;
  color: string;
  opacity: number;
}

/** The free place in the orbit for a new idea (see `SceneSlot`), where it is this frame. */
export interface DisplaySlot {
  parentId: string;
  index: number;
  x: number;
  y: number;
  radius: number;
  opacity: number;

  /** Where the slot is in the unturned orbit (see `OrbitTurn`). */
  unturned?: Point;
}

export interface Display {
  nodes: Map<string, DisplayNode>;
  rings: DisplayRing[];
  links: DisplayLink[];
  camera: Camera;
  addSlot?: DisplaySlot;

  /** A focused orbit at rest. */
  turn?: OrbitTurn;
}

/** A scene at rest, with its orbit turned by `rotation` degrees. */
export const sceneDisplay = (scene: Scene, rotation: number, camera: Camera): Display => {
  const nodes = new Map<string, DisplayNode>();
  const sun = scene.nodes.get(scene.focusId);
  const centerX = sun?.x ?? 0;
  const centerY = sun?.y ?? 0;

  for (const node of scene.nodes.values()) {
    let x = node.x;
    let y = node.y;
    let unturned: Point | undefined;

    if (node.spins && node.role === 'planet' && node.orbitAngle !== undefined && node.orbitRadius !== undefined) {
      const angle = toRadians(node.orbitAngle + rotation);
      x = centerX + node.orbitRadius * Math.cos(angle);
      y = centerY + node.orbitRadius * Math.sin(angle);
      unturned = node;
    }

    nodes.set(node.id, {
      id: node.id,
      node: node.node,
      role: node.role,
      x,
      y,
      radius: node.radius,
      opacity: 1,
      labelOpacity: 1,
      color: node.color,
      depth: node.depth,
      hiddenChildren: node.hiddenChildren,
      parentId: node.parentId,
      hostId: node.hostId,
      crowded: node.crowded,
      unturned,
    });
  }

  // Moons follow their planet around the sun.
  for (const node of scene.nodes.values()) {
    if (node.role !== 'moon' || !node.hostId) {
      continue;
    }

    const host = scene.nodes.get(node.hostId);
    const hostDisplay = nodes.get(node.hostId);
    const moon = nodes.get(node.id);

    if (!host || !hostDisplay || !moon || host.orbitAngle === undefined) {
      continue;
    }

    const angle = toRadians(host.orbitAngle + rotation + (node.hostOffset ?? 0));
    moon.x = hostDisplay.x + (node.hostDistance ?? 0) * Math.cos(angle);
    moon.y = hostDisplay.y + (node.hostDistance ?? 0) * Math.sin(angle);
    moon.unturned = hostDisplay.unturned && node;
  }

  let addSlot: DisplaySlot | undefined;

  if (scene.addSlot) {
    const { parentId, index, orbitAngle, orbitRadius, radius } = scene.addSlot;
    const angle = toRadians(orbitAngle + rotation);
    addSlot = { parentId, index, x: centerX + orbitRadius * Math.cos(angle), y: centerY + orbitRadius * Math.sin(angle), radius, opacity: 1, unturned: scene.addSlot };
  }

  return {
    nodes,
    rings: scene.rings.map((ring) => ({ ...ring, rotation: ring.spins ? rotation : 0, opacity: 1 })),
    links: scene.links.map((link) => ({ ...link, opacity: 1 })),
    camera,
    addSlot,
    turn: scene.kind === 'focus' ? { cx: centerX, cy: centerY, rotation } : undefined,
  };
};

export interface Transition {
  /** The display when the flight started, in the current world. */
  from: Display;

  /** Fade out and in without moving anything, for readers who prefer reduced motion. */
  fade?: boolean;

  /** The destination scene in its own coordinates. */
  target: Scene;

  /** Places `target` in the current world. */
  placement: Similarity;

  cameraPath: CameraPath;
  startedAt: number;
  duration: number;
}

/** The camera that frames `scene` once it is placed by `placement`. */
export const placedFrame = (scene: Scene, placement: Similarity): Camera => {
  return transformCamera(placement, scene.frame);
};

/**
 * The display `progress` (0–1, already eased) of the way through a flight.
 * Nodes in both views travel; new nodes grow out of their parent (or fade
 * in where they will be); nodes that leave shrink into their parent in the
 * new view (or fade where they are, as the camera passes them).
 */
/** A flight's destination at rest, placed in today's world: the same on every frame of the flight. */
interface PlacedTarget {
  resting: Display;
  nodes: Map<string, DisplayNode>;
}

const placedTargets = new WeakMap<Transition, PlacedTarget>();

const placedTarget = (transition: Transition): PlacedTarget => {
  const cached = placedTargets.get(transition);

  if (cached) {
    return cached;
  }

  const { target, placement } = transition;
  const resting = sceneDisplay(target, 0, target.frame);
  const nodes = new Map<string, DisplayNode>();

  for (const node of resting.nodes.values()) {
    const point = applySimilarity(placement, node);
    nodes.set(node.id, { ...node, x: point.x, y: point.y, radius: node.radius * placement.scale });
  }

  const placed = { resting, nodes };
  placedTargets.set(transition, placed);
  return placed;
};

export const transitionDisplay = (transition: Transition, progress: number): Display => {
  const { from, target, placement } = transition;
  const { resting: restingTarget, nodes: destination } = placedTarget(transition);

  const nodes = new Map<string, DisplayNode>();
  const enterProgress = within(progress, 0.25, 1);
  const exitProgress = within(progress, 0, 0.6);

  for (const [id, end] of destination) {
    const start = from.nodes.get(id);

    if (start) {
      nodes.set(id, {
        ...end,
        role: progress < 0.5 ? start.role : end.role,
        x: interpolate(start.x, end.x, progress),
        y: interpolate(start.y, end.y, progress),
        radius: interpolate(start.radius, end.radius, progress),
        opacity: interpolate(start.opacity, 1, progress),
        labelOpacity: interpolate(start.labelOpacity, 1, progress),
      });
      continue;
    }

    const origin = (end.parentId && from.nodes.get(end.parentId)) || undefined;

    if (origin) {
      const opacity = within(progress, 0.25, 0.6);
      nodes.set(id, {
        ...end,
        x: interpolate(origin.x, end.x, enterProgress),
        y: interpolate(origin.y, end.y, enterProgress),
        radius: end.radius * enterProgress,
        opacity,
        labelOpacity: within(progress, 0.6, 1),
        cluster: { pivotX: origin.x, pivotY: origin.y, scale: enterProgress, opacity, x: end.x, y: end.y, radius: end.radius, nodeOpacity: 1 },
      });
    } else {
      nodes.set(id, {
        ...end,
        opacity: enterProgress,
        labelOpacity: within(progress, 0.6, 1),
        cluster: { pivotX: 0, pivotY: 0, scale: 1, opacity: enterProgress, x: end.x, y: end.y, radius: end.radius, nodeOpacity: 1 },
      });
    }
  }

  for (const [id, start] of from.nodes) {
    if (destination.has(id)) {
      continue;
    }

    const into = (start.parentId && destination.get(start.parentId)) || undefined;
    const remaining = 1 - exitProgress;

    if (into) {
      nodes.set(id, {
        ...start,
        x: interpolate(start.x, into.x, exitProgress),
        y: interpolate(start.y, into.y, exitProgress),
        radius: start.radius * remaining,
        opacity: start.opacity * remaining,
        labelOpacity: start.labelOpacity * (1 - within(progress, 0, 0.35)),
        cluster: { pivotX: into.x, pivotY: into.y, scale: remaining, opacity: remaining, x: start.x, y: start.y, radius: start.radius, nodeOpacity: start.opacity },
      });
    } else {
      nodes.set(id, {
        ...start,
        opacity: start.opacity * remaining,
        labelOpacity: start.labelOpacity * (1 - within(progress, 0, 0.35)),
        cluster: { pivotX: 0, pivotY: 0, scale: 1, opacity: remaining, x: start.x, y: start.y, radius: start.radius, nodeOpacity: start.opacity },
      });
    }
  }

  const rings: DisplayRing[] = [];

  for (const ring of from.rings) {
    rings.push({ ...ring, opacity: ring.opacity * (1 - within(progress, 0, 0.5)) });
  }

  for (const ring of restingTarget.rings) {
    const center = applySimilarity(placement, { x: ring.cx, y: ring.cy });
    const finalRadius = ring.radius * placement.scale;
    const startCenter = from.nodes.get(ring.centerId);
    const startRadius = startCenter ? Math.min(finalRadius, startCenter.radius * 1.6) : finalRadius * 0.6;
    const ringProgress = within(progress, 0.2, 1);
    rings.push({
      ...ring,
      id: `${ring.id}@target`,
      cx: center.x,
      cy: center.y,
      radius: interpolate(startRadius, finalRadius, ringProgress),
      opacity: within(progress, 0.3, 1),
    });
  }

  const targetLinks = new Set(target.links.map((link) => link.id));
  const links: DisplayLink[] = from.links
    .filter((link) => !targetLinks.has(link.id))
    .map((link) => ({ ...link, opacity: link.opacity * (1 - within(progress, 0, 0.5)) }));
  const sharedLinks = new Set(from.links.map((link) => link.id));

  for (const link of target.links) {
    links.push({ ...link, opacity: sharedLinks.has(link.id) ? 1 : within(progress, 0.4, 1) });
  }

  return {
    nodes,
    rings,
    links,
    camera: transition.cameraPath.at(progress),
    addSlot: transitionSlot(from.addSlot, restingTarget.addSlot && placeSlot(restingTarget.addSlot, placement), progress),
  };
};

const placeSlot = (slot: DisplaySlot, placement: Similarity): DisplaySlot => {
  const point = applySimilarity(placement, slot);
  return { ...slot, x: point.x, y: point.y, radius: slot.radius * placement.scale };
};

/**
 * The slot for a new idea during a flight: it slides to its next place in
 * the same orbit (after an idea joins it, say); otherwise the old one fades
 * as the flight starts and the new one appears as it lands.
 */
const transitionSlot = (start: DisplaySlot | undefined, end: DisplaySlot | undefined, progress: number): DisplaySlot | undefined => {
  if (start && end && start.parentId === end.parentId) {
    return {
      ...end,
      x: interpolate(start.x, end.x, progress),
      y: interpolate(start.y, end.y, progress),
      radius: interpolate(start.radius, end.radius, progress),
      opacity: interpolate(start.opacity, 1, progress),
    };
  }

  if (end && progress >= 0.5) {
    return { ...end, opacity: within(progress, 0.7, 1) };
  }

  return start && { ...start, opacity: start.opacity * (1 - within(progress, 0, 0.3)) };
};

/**
 * A view change without movement: the old view fades out, then the new one
 * fades in already in place (in its own coordinates, with its own camera).
 */
export const fadeDisplay = (transition: Transition, progress: number): Display => {
  if (progress < 0.5) {
    const visible = 1 - progress * 2;
    const nodes = new Map<string, DisplayNode>();

    for (const [id, node] of transition.from.nodes) {
      nodes.set(id, { ...node, opacity: node.opacity * visible, labelOpacity: node.labelOpacity * visible });
    }

    const slot = transition.from.addSlot;
    return {
      nodes,
      rings: transition.from.rings.map((ring) => ({ ...ring, opacity: ring.opacity * visible })),
      links: transition.from.links.map((link) => ({ ...link, opacity: link.opacity * visible })),
      camera: transition.from.camera,
      addSlot: slot && { ...slot, opacity: slot.opacity * visible },
    };
  }

  const visible = (progress - 0.5) * 2;
  const resting = sceneDisplay(transition.target, 0, transition.target.frame);

  for (const node of resting.nodes.values()) {
    node.opacity = visible;
    node.labelOpacity = visible;
  }

  return {
    ...resting,
    rings: resting.rings.map((ring) => ({ ...ring, opacity: visible })),
    links: resting.links.map((link) => ({ ...link, opacity: visible })),
    addSlot: resting.addSlot && { ...resting.addSlot, opacity: visible },
  };
};
