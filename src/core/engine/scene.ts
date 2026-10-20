/**
 * Scenes: what each view of a map contains, in world coordinates.
 *
 * A focus scene puts the focused node (the sun) at the origin with its
 * children (planets) on rings and its grandchildren as small moons around
 * them. An overview scene lays out the whole tree around the root. Every
 * node keeps one color in every scene, and nodes are keyed by id so a
 * transition can morph the same node from one scene into the next: the
 * moons of a planet grow into the planets of the next view.
 */

import type { OrbitNode } from '../types.js';
import { branchNumbers, branchPalette, isPaletteNumber, paletteColorOf } from '../branch-colors.js';
import { calculateAllLayout, calculateFocusLayout, getOrbitRings, MOON_LIMIT, moonPlacement } from '../layout.js';
import { findNodeById } from '../utils.js';
import { browser } from '../browser.js';
import { fitAround, type Camera, type Insets, type Similarity, type Viewport, applySimilarity } from './camera.js';

export type NodeRole = 'sun' | 'planet' | 'moon' | 'node';

export interface SceneNode {
  id: string;
  node: OrbitNode;
  role: NodeRole;

  /** World position of the center, before any orbit spin. */
  x: number;

  y: number;
  radius: number;
  color: string;
  depth: number;
  parentId?: string;

  /** Planets: angle around the sun (degrees, −90 = top) and distance from it. */
  orbitAngle?: number;

  orbitRadius?: number;

  /** Moons: the planet they circle, their angle relative to the direction from the sun to the planet, and their distance. */
  hostId?: string;

  hostOffset?: number;
  hostDistance?: number;

  /** Children that exist but aren't drawn: beyond the moon limit, or under a collapsed node. */
  hiddenChildren: number;

  /** Turns with the orbit when it spins. */
  spins: boolean;

  /** A planet of an orbit too crowded for each planet's shadow to read: drawn flat. */
  crowded?: boolean;
}

export interface SceneRing {
  id: string;
  centerId: string;
  cx: number;
  cy: number;
  radius: number;
  color: string;

  /** Openings around each body on the ring, so the line never runs through a node. */
  gaps: { angle: number; halfWidth: number }[];

  spins: boolean;
}

export interface SceneLink {
  id: string;
  fromId: string;
  toId: string;
  color: string;
}

export interface Scene {
  kind: 'focus' | 'overview';
  focusId: string;
  nodes: Map<string, SceneNode>;
  rings: SceneRing[];
  links: SceneLink[];

  /** The camera that fits the scene into the viewport. */
  frame: Camera;

  /**
   * How far the scene reaches from its focus node on each axis, in world
   * units: what `frame` fits. A focus scene reaches as far on both, the edge
   * of its orbit at every turn.
   */
  extent: { x: number; y: number };

  /** Focus scenes of editable maps: the free place in the orbit where a new idea goes. */
  addSlot?: SceneSlot;
}

/** A free place in the sun's orbit, laid out like a planet, for the next child. */
export interface SceneSlot {
  /** The node a new idea there becomes a child of: the sun. */
  parentId: string;

  /** Its position among the sun's children. */
  index: number;

  x: number;
  y: number;
  radius: number;
  orbitAngle: number;
  orbitRadius: number;
}

export interface SceneOptions {
  viewport: Viewport;

  /** The parts of the viewport the page's own controls cover: views are fitted into the rest. */
  insets?: Insets;

  colors: Map<string, string>;
  maxDepth?: number;

  /** Keep a place in the orbit for a new idea, after the sun's children (or at `index`). Focus scenes only. */
  addSlot?: { index?: number };

  /**
   * One of the sun's children being dragged to another place among them: it's
   * laid out at `index` among the others, so they make room for it there.
   * Focus scenes only.
   */
  reorder?: { id: string; index: number };

  /**
   * While a node is carried along the orbit of `focusId`: the radii its rings
   * had when the drag began. They keep them until the drop, so the orbit
   * doesn't grow or shrink as the places in it move. Focus scenes only.
   */
  keptRings?: { focusId: string; radii: number[] };
}

/** The id the slot uses while it is laid out with the planets; no node can have it. */
const SLOT_ID = '\u0000orbit-add';

export { MOON_LIMIT };
/** More planets than this in one view, and their shadows overlap into a haze: they're drawn flat. */
export const CROWDED_ORBIT = 48;
/** The largest zoom a fitted view uses, so small maps don't balloon. */
const MAXIMUM_FIT_SCALE = 1.35;
const FOCUS_PADDING = 40;
const OVERVIEW_PADDING = 48;

/** Room kept around a fitted view: less on small screens, where every pixel counts. */
const fitPadding = (viewport: Viewport, padding: number): number => {
  return Math.min(padding, Math.max(16, Math.min(viewport.width, viewport.height) * 0.05));
};

/**
 * The camera that fits a view reaching `extent` from its focus node into
 * `viewport`, inside what `insets` leave of it, with at least `below` px
 * between the view and the lower edge of that.
 */
const fitExtent = (kind: Scene['kind'], extent: Scene['extent'], viewport: Viewport, insets: Insets | undefined, below = 0): Camera => {
  const padding = fitPadding(viewport, kind === 'focus' ? FOCUS_PADDING : OVERVIEW_PADDING);
  const room = Math.max(0, below - padding);
  const sides = insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return fitAround({ x: 0, y: 0 }, extent, viewport, padding, MAXIMUM_FIT_SCALE, room > 0 ? { ...sides, bottom: sides.bottom + room } : sides);
};

/**
 * The camera that fits `scene` into `viewport` as its `frame` does, inside
 * what `insets` leave of it, and with at least `below` px under it: room for
 * something drawn there, such as the focused node's buttons.
 */
export const fitScene = (scene: Scene, viewport: Viewport, insets?: Insets, below = 0): Camera => {
  return fitExtent(scene.kind, scene.extent, viewport, insets, below);
};

const RING_GAP_PADDING = 7;

/**
 * One color per node, the same in every view. The root uses the first
 * palette entry; top-level branches take the others in turn (see
 * `branchNumbers`); deeper nodes use their branch's color, mixed toward the
 * theme's `shade-light` or `shade-dark` by position so siblings stay
 * distinguishable. A node's own color always wins: its `color`, or its
 * type's (see `ownColor`); then its `paletteColor`.
 */
export const assignNodeColors = (
  tree: OrbitNode,
  palette: string[],
  ownColor: (node: OrbitNode) => string | undefined = (node) => node.color,
): Map<string, string> => {
  const colors = new Map<string, string>();
  const branchColors = branchPalette(palette);
  const numbers = branchNumbers(tree.children, branchColors.length);
  const chosen = (node: OrbitNode): string | undefined => ownColor(node) ?? (isPaletteNumber(node.paletteColor) ? paletteColorOf(branchColors, node.paletteColor) : undefined);
  colors.set(tree.id, chosen(tree) ?? palette[0]);

  for (const branch of tree.children) {
    const branchColor = ownColor(branch) ?? paletteColorOf(branchColors, numbers.get(branch) as number);
    colors.set(branch.id, branchColor);

    const visit = (node: OrbitNode, inherited: string) => {
      node.children.forEach((child, siblingIndex) => {
        const own = chosen(child);
        colors.set(child.id, own ?? shade(inherited, siblingIndex));
        visit(child, own ?? inherited);
      });
    };

    visit(branch, branchColor);
  }

  return colors;
};

/** How much of the branch color each sibling keeps, and what the rest is mixed with. */
export const SHADES: [number, 'light' | 'dark'][] = [
  [100, 'light'],
  [78, 'light'],
  [86, 'dark'],
  [62, 'light'],
  [76, 'dark'],
];

const shade = (color: string, siblingIndex: number): string => {
  const [amount, toward] = SHADES[siblingIndex % SHADES.length];
  return amount === 100 || !browser.mixesColors ? color : `color-mix(in oklab, ${color} ${amount}%, var(--_orbit-shade-${toward}))`;
};

/** `children` with the one `reorder` names moved to its index among the others (unchanged without it). */
const reordered = (children: OrbitNode[], reorder: SceneOptions['reorder']): OrbitNode[] => {
  const moving = reorder ? children.find((child) => child.id === reorder.id) : undefined;

  if (!reorder || !moving) {
    return children;
  }

  const others = children.filter((child) => child !== moving);
  const index = Math.min(others.length, Math.max(0, Math.trunc(reorder.index)));
  return [...others.slice(0, index), moving, ...others.slice(index)];
};

const visibleChildren = (node: OrbitNode, maxDepth: number | undefined): OrbitNode[] => {
  if (node.collapsed) {
    return [];
  }

  if (maxDepth !== undefined && node.level >= maxDepth) {
    return [];
  }

  return node.children;
};

export const buildFocusScene = (tree: OrbitNode, focusId: string, options: SceneOptions): Scene => {
  const focused = findNodeById(tree, focusId) ?? tree;
  const { viewport, colors, maxDepth, reorder } = options;
  const children = reordered(focused.children, reorder);
  const canGrow = maxDepth === undefined || focused.level < maxDepth;
  const slotIndex = options.addSlot && canGrow
    ? Math.min(children.length, Math.max(0, Math.trunc(options.addSlot.index ?? children.length)))
    : null;
  // Entering a collapsed node opens it: `collapsed` folds a node away
  // elsewhere (no moons, a "+N" count), never in its own focus view. The
  // slot for a new idea is laid out as one more child.
  const laidOut: OrbitNode = focused.collapsed || slotIndex !== null || children !== focused.children
    ? { ...focused, collapsed: false, children }
    : focused;

  if (slotIndex !== null) {
    const slot: OrbitNode = { id: SLOT_ID, text: '', level: focused.level + 1, children: [] };
    laidOut.children = [...children.slice(0, slotIndex), slot, ...children.slice(slotIndex)];
  }

  const layout = calculateFocusLayout(laidOut, {
    cx: 0,
    cy: 0,
    containerWidth: viewport.width,
    containerHeight: viewport.height,
    maxDepth,
    keptRings: options.keptRings?.focusId === focused.id ? options.keptRings.radii : undefined,
  });
  const slotCount = slotIndex === null ? 0 : 1;
  const nodes = new Map<string, SceneNode>();
  const colorOf = (node: OrbitNode) => colors.get(node.id) ?? node.color ?? '#999999';

  nodes.set(focused.id, {
    id: focused.id,
    node: focused,
    role: 'sun',
    x: 0,
    y: 0,
    radius: layout.sun.radius,
    color: colorOf(focused),
    depth: focused.level,
    parentId: focused.parent?.id,
    hiddenChildren: Math.max(0, children.length - (layout.planets.length - slotCount)),
    spins: false,
  });

  let extentX = layout.sun.radius;
  let extentY = layout.sun.radius;
  const planetRadius = roomyPlanetRadius(layout);
  const crowded = layout.planets.length - slotCount > CROWDED_ORBIT;
  let addSlot: SceneSlot | undefined;

  for (const planet of layout.planets) {
    if (planet.id === SLOT_ID) {
      addSlot = {
        parentId: focused.id,
        index: slotIndex ?? focused.children.length,
        x: planet.x,
        y: planet.y,
        radius: planetRadius ?? planet.radius,
        orbitAngle: planet.angle,
        orbitRadius: planet.orbitRadius,
      };
      extentX = Math.max(extentX, planet.orbitRadius + addSlot.radius);
      extentY = Math.max(extentY, planet.orbitRadius + addSlot.radius);
      continue;
    }

    const node = findNodeById(focused, planet.id) ?? planet;
    const moons = visibleChildren(node, maxDepth).slice(0, MOON_LIMIT);
    const radius = planetRadius ?? planet.radius;
    nodes.set(planet.id, {
      id: planet.id,
      node,
      role: 'planet',
      x: planet.x,
      y: planet.y,
      radius,
      color: colorOf(node),
      depth: node.level,
      parentId: focused.id,
      orbitAngle: planet.angle,
      orbitRadius: planet.orbitRadius,
      hiddenChildren: node.children.length - moons.length,
      spins: true,
      crowded,
    });
    const { distance: moonDistance, radius: moonRadius, offsets } = moonPlacement(radius, moons.length);

    moons.forEach((moon, index) => {
      const offset = offsets[index];
      const angle = toRadians(planet.angle + offset);
      nodes.set(moon.id, {
        id: moon.id,
        node: moon,
        role: 'moon',
        x: planet.x + moonDistance * Math.cos(angle),
        y: planet.y + moonDistance * Math.sin(angle),
        radius: moonRadius,
        color: colorOf(moon),
        depth: moon.level,
        parentId: planet.id,
        hostId: planet.id,
        hostOffset: offset,
        hostDistance: moonDistance,
        hiddenChildren: moon.children.length,
        spins: true,
      });
    });

    const reach = planet.orbitRadius + (moons.length > 0 ? moonDistance + moonRadius : radius);
    extentX = Math.max(extentX, reach);
    extentY = Math.max(extentY, reach);
  }

  const rings: SceneRing[] = layout.planets.length === 0
    ? []
    : layout.orbitRings.map((radius, index) => ({
      id: `${focused.id}#${index}`,
      centerId: focused.id,
      cx: 0,
      cy: 0,
      radius,
      color: colorOf(focused),
      gaps: layout.planets
        .filter((planet) => Math.abs(planet.orbitRadius - radius) < 0.5)
        .map((planet) => ({ angle: planet.angle, halfWidth: gapHalfWidth(planetRadius ?? planet.radius, radius) })),
      spins: true,
    }));

  const extent = { x: extentX, y: extentY };
  return {
    kind: 'focus',
    focusId: focused.id,
    nodes,
    rings,
    links: [],
    frame: fitExtent('focus', extent, viewport, options.insets),
    extent,
    addSlot,
  };
};

/**
 * A single ring of planets usually has room to spare: grow the planets
 * (and with them their moons) toward the sun's size, as far as the
 * neighbors and the sun allow. Null keeps the layout's size.
 */
const roomyPlanetRadius = (layout: ReturnType<typeof calculateFocusLayout>): number | null => {
  if (layout.orbitRings.length !== 1 || layout.planets.length === 0) {
    return null;
  }

  const ring = layout.orbitRings[0];
  const count = layout.planets.length;
  // Half the distance to a neighbor, less the moons that reach sideways.
  const besideNeighbors = count > 1 ? (ring * Math.sin(Math.PI / count) - 14) / 1.45 : Infinity;
  const besideSun = ring - layout.sun.radius - 24;
  const current = layout.planets[0].radius;
  return Math.max(current, Math.min(layout.sun.radius * 0.72, besideNeighbors, besideSun));
};

export const buildOverviewScene = (tree: OrbitNode, options: SceneOptions): Scene => {
  const { viewport, colors, maxDepth } = options;
  const positioned = calculateAllLayout(tree, {
    cx: 0,
    cy: 0,
    containerWidth: viewport.width,
    containerHeight: viewport.height,
    maxDepth,
  });
  const nodes = new Map<string, SceneNode>();
  const links: SceneLink[] = [];
  const byId = indexTree(tree);
  let extentX = 0;
  let extentY = 0;

  for (const entry of positioned) {
    const node = byId.get(entry.id) ?? entry;
    const color = colors.get(node.id) ?? '#999999';
    const shown = visibleChildren(node, maxDepth).length;
    nodes.set(entry.id, {
      id: entry.id,
      node,
      role: 'node',
      x: entry.x,
      y: entry.y,
      radius: entry.radius,
      color,
      depth: node.level,
      parentId: entry.parent?.id,
      hiddenChildren: node.children.length - shown,
      spins: false,
    });

    if (entry.parent && node.level > 0) {
      links.push({ id: `${entry.parent.id}->${entry.id}`, fromId: entry.parent.id, toId: entry.id, color: colors.get(entry.parent.id) ?? color });
    }

    extentX = Math.max(extentX, Math.abs(entry.x) + entry.radius);
    extentY = Math.max(extentY, Math.abs(entry.y) + entry.radius);
  }

  const bodiesByCenter = new Map<string, typeof positioned>();

  for (const entry of positioned) {
    const parentId = entry.parent?.id;

    if (parentId !== undefined) {
      const bodies = bodiesByCenter.get(parentId) ?? [];
      bodies.push(entry);
      bodiesByCenter.set(parentId, bodies);
    }
  }

  const rings: SceneRing[] = getOrbitRings(positioned).map((ring) => {
    const { centerId } = ring;
    const bodies = bodiesByCenter.get(centerId) ?? [];
    return {
      id: `${centerId}#overview`,
      centerId,
      cx: ring.cx,
      cy: ring.cy,
      radius: ring.r,
      color: colors.get(centerId) ?? '#999999',
      gaps: bodies.map((body) => ({
        angle: toDegrees(Math.atan2(body.y - ring.cy, body.x - ring.cx)),
        halfWidth: gapHalfWidth(body.radius, ring.r),
      })),
      spins: false,
    };
  });

  // A ring reaches past the bodies on it where none of them sit near its extremes.
  for (const ring of rings) {
    extentX = Math.max(extentX, Math.abs(ring.cx) + ring.radius);
    extentY = Math.max(extentY, Math.abs(ring.cy) + ring.radius);
  }

  const extent = { x: extentX, y: extentY };
  return {
    kind: 'overview',
    focusId: tree.id,
    nodes,
    rings,
    links,
    frame: fitExtent('overview', extent, viewport, options.insets),
    extent,
  };
};

/** Every node of a tree by id. */
const indexTree = (tree: OrbitNode): Map<string, OrbitNode> => {
  const byId = new Map<string, OrbitNode>();

  const visit = (node: OrbitNode) => {
    byId.set(node.id, node);
    node.children.forEach(visit);
  };

  visit(tree);
  return byId;
};

/**
 * The transform that places `target` so the node `anchorId` lands exactly
 * where it is displayed now (`current`): used to fly from one view to the
 * next without any jump.
 */
export const alignScene = (target: Scene, anchorId: string, current: { x: number; y: number; radius: number }): Similarity => {
  const anchor = target.nodes.get(anchorId);

  if (!anchor || anchor.radius <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }

  const scale = current.radius / anchor.radius;
  return { scale, x: current.x - anchor.x * scale, y: current.y - anchor.y * scale };
};

/** Applies a placement to a scene node's position and size. */
export const placeNode = (node: SceneNode, transform: Similarity): { x: number; y: number; radius: number } => {
  const point = applySimilarity(transform, node);
  return { x: point.x, y: point.y, radius: node.radius * transform.scale };
};

/** Gap half-width (degrees) that keeps a ring line clear of a body of `bodyRadius` sitting on it. */
const gapHalfWidth = (bodyRadius: number, ringRadius: number): number => {
  const ratio = Math.min(1, (bodyRadius + RING_GAP_PADDING) / Math.max(ringRadius, 1));
  return toDegrees(Math.asin(ratio));
};

export const toRadians = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

export const toDegrees = (radians: number): number => {
  return (radians * 180) / Math.PI;
};
