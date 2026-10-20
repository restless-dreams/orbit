import type { OrbitNode } from './types.js';
import { clamp } from './utils.js';

/** Where the layout puts the map and how much room it has. */
export interface LayoutConfig {
  cx: number;
  cy: number;
  containerWidth: number;
  containerHeight: number;

  /** Levels below the layout root to render; deeper nodes are omitted. */
  maxDepth?: number;

  /**
   * Focus layouts: ring radii to keep where the orbit has as many rings,
   * instead of making room for the moons again. A drag along the orbit keeps
   * the rings it began with. Rings never come out smaller than the planets need.
   */
  keptRings?: number[];
}

/** A node with its place in the layout. */
export interface PositionedNode extends OrbitNode {
  x: number;
  y: number;
  radius: number;

  /** Degrees: 0 is right, -90 is up. */
  angle: number;

  /** Distance from the parent. */
  orbitRadius: number;
}

interface MeasuredNode {
  node: OrbitNode;
  radius: number;
  subtreeRadius: number;
  childOrbitRadius: number;
  children: MeasuredNode[];
}

const SPACING_FACTOR = 1.32;
const NODE_GAP = 14;
const MIN_SUN_RADIUS = 34;
const MIN_PLANET_RADIUS = 18;
const MAX_SUN_RADIUS = 76;
const MAX_PLANET_RADIUS = 48;
/**
 * An orbit's planets fill rings out from the sun until they all fit. Past
 * this many rings, the last of them may stretch to take the rest instead,
 * when that keeps the orbit smaller than more rings would.
 */
const ROOMY_RING_LIMIT = 7;
const FOCUS_RING_GAP_FACTOR = 2.15;
/**
 * Crowded orbits of planets without moons pack closer: rings start right
 * outside the sun and sit a planet's width apart, with more of them before
 * the last may stretch, so the planets come out as big as the screen allows.
 */
const COMPACT_RING_GAP = 8;
const COMPACT_RING_LIMIT = 12;
/** An orbit of this many rings or more is crowded: its sun grows (see calculateFocusLayout). */
const CROWDED_RING_COUNT = 4;

/** Moons drawn around a planet; more children show as "+N". */
export const MOON_LIMIT = 6;
/**
 * The room kept between a moon and another planet. Moons of different
 * planets keep a moon's radius apart, so that where two fans meet they read
 * as two.
 */
const MOON_CLEARANCE = 2;

/** Where a planet's moons go: `distance` from its center, at `offsets` degrees from the direction away from the sun. */
export interface MoonPlacement {
  distance: number;
  radius: number;
  offsets: number[];
}

/** The moons of a planet fan out on its outer side, 30° apart, 150° at most. */
export const moonPlacement = (planetRadius: number, moonCount: number): MoonPlacement => {
  const count = Math.min(moonCount, MOON_LIMIT);
  const spread = Math.min(150, (count - 1) * 30);
  return {
    distance: planetRadius * 1.45,
    radius: Math.min(7, Math.max(2.5, planetRadius * 0.17)),
    offsets: Array.from({ length: count }, (_, index) => (count === 1 ? 0 : -spread / 2 + (spread * index) / (count - 1))),
  };
};

/**
 * Calculate layout for focus mode (center sun + direct children).
 * The orbit radius is never clamped below the collision-free radius. If the
 * result is wider than the container, the renderer auto-fits the whole group.
 */
export const calculateFocusLayout = (
  focusedNode: OrbitNode,
  config: LayoutConfig,
): { sun: PositionedNode; planets: PositionedNode[]; orbitRadius: number; orbitRings: number[] } => {
  const { cx, cy, containerWidth, containerHeight } = config;
  const depthCapped = config.maxDepth !== undefined && focusedNode.level >= config.maxDepth;
  const children = depthCapped ? [] : visibleChildren(focusedNode);
  const childCount = children.length;
  const baseDim = layoutBasis(containerWidth, containerHeight);

  let sunRadius = clamp(baseDim * 0.115, MIN_SUN_RADIUS, MAX_SUN_RADIUS);
  const planetDensityScale = childCount === 0
    ? 1
    : clamp(Math.pow(10 / childCount, 0.32), 0.58, 1.1);
  const planetRadius = clamp(
    baseDim * 0.074 * planetDensityScale,
    MIN_PLANET_RADIUS,
    MAX_PLANET_RADIUS,
  );
  const compact = children.every((child) => visibleChildren(child).length === 0);
  let orbitPlan = calculateFocusRingPlan(childCount, sunRadius, planetRadius, baseDim, compact);

  // A crowded orbit shrinks its sun on screen with everything else: the sun grows with its rings,
  // so the focused node stays the focus and its name stays legible.
  if (orbitPlan.rings.length >= CROWDED_RING_COUNT) {
    const grown = Math.min(MAX_SUN_RADIUS, sunRadius * (1 + 0.06 * (orbitPlan.rings.length - 1)));

    if (grown > sunRadius) {
      sunRadius = grown;
      orbitPlan = calculateFocusRingPlan(childCount, sunRadius, planetRadius, baseDim, compact);
    }
  }

  const keptRings = config.keptRings;

  if (keptRings && keptRings.length === orbitPlan.rings.length) {
    orbitPlan.rings = orbitPlan.rings.map((radius, index) => Math.max(radius, keptRings[index]));
  } else {
    const moonsHidden = config.maxDepth !== undefined && focusedNode.level + 1 >= config.maxDepth;
    const moonCounts = children.map((child) => (moonsHidden ? 0 : Math.min(visibleChildren(child).length, MOON_LIMIT)));
    makeRoomForMoons(orbitPlan, planetRadius, moonCounts);
  }

  const orbitRadius = orbitPlan.rings[orbitPlan.rings.length - 1] ?? 0;

  const sun: PositionedNode = {
    ...focusedNode,
    parent: focusedNode.parent,
    x: cx,
    y: cy,
    radius: sunRadius,
    angle: -90,
    orbitRadius: 0,
  };

  const planets: PositionedNode[] = [];
  let childIndex = 0;

  orbitPlan.rings.forEach((ringRadius, ringIndex) => {
    const ringCount = orbitPlan.counts[ringIndex] ?? 0;
    const angleStep = 360 / ringCount;
    const startAngle = ringStartAngle(ringIndex, ringCount);

    for (let localIndex = 0; localIndex < ringCount; localIndex += 1) {
      const child = children[childIndex];

      if (!child) {
        break;
      }

      const angleDeg = startAngle + angleStep * localIndex;
      const angleRad = toRadians(angleDeg);

      planets.push({
        ...child,
        parent: child.parent,
        x: cx + ringRadius * Math.cos(angleRad),
        y: cy + ringRadius * Math.sin(angleRad),
        radius: planetRadius,
        angle: angleDeg,
        orbitRadius: ringRadius,
      });
      childIndex += 1;
    }
  });

  return { sun, planets, orbitRadius, orbitRings: orbitPlan.rings };
};

/**
 * Calculate layout for all mode. Each node owns a measured subtree circle; a
 * parent's child orbit is sized so sibling subtree circles cannot overlap.
 */
export const calculateAllLayout = (
  node: OrbitNode,
  config: LayoutConfig,
  parentAngle: number = -90,
): PositionedNode[] => {
  const baseDim = layoutBasis(config.containerWidth, config.containerHeight);
  const complexityScale = clamp(Math.pow(18 / countVisibleNodes(node), 0.18), 0.74, 1.08);
  const measured = measureSubtree(node, baseDim, complexityScale, config.maxDepth ?? Infinity);
  const positionedNodes: PositionedNode[] = [];

  placeSubtree(measured, config.cx, config.cy, parentAngle, 0, positionedNodes);
  return positionedNodes;
};

/**
 * The rings of the overview: one around each node with children, through them.
 */
export const getOrbitRings = (
  positionedNodes: PositionedNode[],
): { centerId: string; cx: number; cy: number; r: number }[] => {
  const rings: { centerId: string; cx: number; cy: number; r: number }[] = [];
  const seen = new Set<string>();

  for (const node of positionedNodes) {
    if (visibleChildren(node).length === 0) {
      continue;
    }

    const childNode = positionedNodes.find(
      (n) => n.parent?.id === node.id && n.id !== node.id,
    );

    if (!childNode) {
      continue;
    }

    const dx = childNode.x - node.x;
    const dy = childNode.y - node.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    const key = `${node.x.toFixed(1)},${node.y.toFixed(1)},${r.toFixed(1)}`;

    if (!seen.has(key) && r > 10) {
      seen.add(key);
      rings.push({ centerId: node.id, cx: node.x, cy: node.y, r });
    }
  }

  return rings;
};

const measureSubtree = (
  node: OrbitNode,
  baseDim: number,
  complexityScale: number,
  depthRemaining: number,
): MeasuredNode => {
  const radius = radiusForLevel(baseDim, node.level, complexityScale);
  const children = depthRemaining > 0 ? visibleChildren(node) : [];
  const childMeasures = children.map((child) => measureSubtree(child, baseDim, complexityScale, depthRemaining - 1));

  const childBounds = childMeasures.map((child) => child.subtreeRadius);
  const childOrbitRadius = requiredOrbitRadius(radius, childBounds);
  const maxChildBound = childBounds.length > 0 ? Math.max(...childBounds) : 0;

  return {
    node,
    radius,
    subtreeRadius: Math.max(radius, childOrbitRadius + maxChildBound),
    childOrbitRadius,
    children: childMeasures,
  };
};

const MAX_FAN_DEGREES = 270;

const placeSubtree = (
  measured: MeasuredNode,
  x: number,
  y: number,
  angle: number,
  orbitRadius: number,
  positionedNodes: PositionedNode[],
): void => {
  const positioned: PositionedNode = {
    ...measured.node,
    parent: measured.node.parent,
    x,
    y,
    radius: measured.radius,
    angle,
    orbitRadius,
  };

  positionedNodes.push(positioned);

  const childCount = measured.children.length;

  if (childCount === 0) {
    return;
  }

  const isRoot = measured.node.level === 0;
  const fullCircle = isRoot || childCount === 1;
  const naturalFan = (childCount - 1) * (360 / childCount);
  const fanDegrees = fullCircle ? 360 : Math.min(naturalFan, MAX_FAN_DEGREES);
  const angleStep = childCount === 1
    ? 0
    : fullCircle
      ? 360 / childCount
      : fanDegrees / (childCount - 1);

  const startAngle = childCount === 1
    ? angle
    : isRoot
      ? -90
      : angle - fanDegrees / 2;

  measured.children.forEach((child, index) => {
    const childAngle = startAngle + angleStep * index;
    const angleRad = toRadians(childAngle);
    const childX = x + measured.childOrbitRadius * Math.cos(angleRad);
    const childY = y + measured.childOrbitRadius * Math.sin(angleRad);
    placeSubtree(child, childX, childY, childAngle, measured.childOrbitRadius, positionedNodes);
  });
};

const requiredOrbitRadius = (centerRadius: number, childRadii: number[]): number => {
  if (childRadii.length === 0) {
    return 0;
  }

  const parentClearance = Math.max(
    ...childRadii.map((childRadius) => centerRadius + childRadius + NODE_GAP),
  );

  if (childRadii.length === 1) {
    return parentClearance;
  }

  const angleStep = (2 * Math.PI) / childRadii.length;
  const chordFactor = 2 * Math.sin(angleStep / 2);

  const siblingClearance = childRadii.reduce((max, childRadius, index) => {
    const nextRadius = childRadii[(index + 1) % childRadii.length];
    const required = ((childRadius + nextRadius) * SPACING_FACTOR + NODE_GAP) / chordFactor;
    return Math.max(max, required);
  }, 0);

  return Math.max(parentClearance, siblingClearance);
};

const calculateFocusRingPlan = (
  childCount: number,
  sunRadius: number,
  planetRadius: number,
  baseDim: number,
  compact = false,
): RingPlan => {
  if (childCount === 0) {
    return { rings: [], counts: [], ringGap: 0 };
  }

  const roomy = ringPlan(
    childCount,
    planetRadius,
    Math.max(baseDim * 0.26, sunRadius + planetRadius + NODE_GAP * 1.3),
    planetRadius * FOCUS_RING_GAP_FACTOR + NODE_GAP,
    ROOMY_RING_LIMIT,
  );

  // One ring keeps its roomy layout. Planets without moons that need several
  // rings pack closer, when that makes the orbit smaller.
  if (!compact || roomy.rings.length <= 1) {
    return roomy;
  }

  const close = ringPlan(childCount, planetRadius, sunRadius + planetRadius + NODE_GAP, planetRadius * 2 + COMPACT_RING_GAP, COMPACT_RING_LIMIT);
  return (close.rings.at(-1) ?? 0) < (roomy.rings.at(-1) ?? 0) ? close : roomy;
};

/** The rings of a focus view, the number of planets on each, and the distance between rings. */
interface RingPlan {
  rings: number[];
  counts: number[];
  ringGap: number;
}

/**
 * Rings from `innerRingRadius` out, `ringGap` apart, until they hold every
 * child. Past `ringLimit` rings, the last of the first `ringLimit` may
 * stretch to take the rest instead, when that keeps the orbit smaller: for a
 * few more planets it does, but a big orbit's last ring would stretch so far
 * out that every planet came out a speck.
 */
const ringPlan = (
  childCount: number,
  planetRadius: number,
  innerRingRadius: number,
  ringGap: number,
  ringLimit: number,
): RingPlan => {
  const rings: number[] = [];
  let totalCapacity = 0;

  while (totalCapacity < childCount) {
    const radius = innerRingRadius + ringGap * rings.length;
    rings.push(radius);
    totalCapacity += focusRingCapacity(radius, planetRadius);
  }

  const fewer = rings.slice(0, ringLimit);
  const stretched: RingPlan = { rings: fewer, counts: distributeAcrossRings(childCount, fewer, planetRadius), ringGap };

  if (rings.length <= ringLimit) {
    return stretched;
  }

  const all: RingPlan = { rings, counts: distributeAcrossRings(childCount, rings, planetRadius), ringGap };
  return (all.rings.at(-1) ?? 0) < (stretched.rings.at(-1) ?? 0) ? all : stretched;
};

/** The first planet on each ring is at the top; every other ring is turned half a step. */
const ringStartAngle = (ringIndex: number, count: number): number => {
  return ringIndex % 2 === 0 ? -90 : -90 + 360 / count / 2;
};

interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** A planet on a ring and its moons. */
interface PlanetBodies {
  planet: Circle;
  moons: Circle[];
}

const planetBodies = (ringRadius: number, angle: number, planetRadius: number, moonCount: number): PlanetBodies => {
  const x = ringRadius * Math.cos(toRadians(angle));
  const y = ringRadius * Math.sin(toRadians(angle));
  const { distance, radius, offsets } = moonPlacement(planetRadius, moonCount);
  return {
    planet: { x, y, radius: planetRadius },
    moons: offsets.map((offset) => ({
      x: x + distance * Math.cos(toRadians(angle + offset)),
      y: y + distance * Math.sin(toRadians(angle + offset)),
      radius,
    })),
  };
};

const apart = (first: Circle, second: Circle, gap: number): boolean => {
  return Math.hypot(first.x - second.x, first.y - second.y) >= first.radius + second.radius + gap;
};

/** Whether the moons of either planet keep clear of the other planet and its moons (see `MOON_CLEARANCE`). */
const moonsClear = (first: PlanetBodies, second: PlanetBodies): boolean => {
  return first.moons.every((moon) => apart(moon, second.planet, MOON_CLEARANCE) && second.moons.every((other) => apart(moon, other, moon.radius)))
    && second.moons.every((moon) => apart(moon, first.planet, MOON_CLEARANCE));
};

/** Whether every moon of `planet` is nearer it than `neighbor`: a moon past the middle reads as the neighbor's. */
const moonsOnOwnSide = (planet: PlanetBodies, neighbor: PlanetBodies): boolean => {
  return planet.moons.every((moon) => {
    return Math.hypot(moon.x - planet.planet.x, moon.y - planet.planet.y) < Math.hypot(moon.x - neighbor.planet.x, moon.y - neighbor.planet.y);
  });
};

/**
 * Rings are planned for the planets' bodies, but moons fan out on the outer
 * side of their planets, toward the neighbors on the ring and the next ring
 * out. Each ring with moons on it or inside it moves out (and the rings
 * beyond it with it) just as far as its moons need; orbits whose moons
 * already have room keep their rings.
 */
const makeRoomForMoons = (plan: RingPlan, planetRadius: number, moonCounts: number[]): void => {
  if (moonCounts.every((count) => count === 0)) {
    return;
  }

  const moonReach = moonPlacement(planetRadius, 1);
  // Planets farther apart than this can't touch each other's moons.
  const reach = 2 * (moonReach.distance + moonReach.radius) + Math.max(MOON_CLEARANCE, moonReach.radius);
  let first = 0;
  let inner: { radius: number; start: number; step: number; planets: PlanetBodies[] } | undefined;

  plan.rings.forEach((planned, ringIndex) => {
    const count = plan.counts[ringIndex] ?? 0;
    const moons = moonCounts.slice(first, first + count);
    const start = ringStartAngle(ringIndex, count);
    const step = 360 / Math.max(1, count);
    const innerPlanets = inner?.planets.some((planet) => planet.moons.length > 0) ? inner : undefined;
    // Neighbors on a ring are all `step` apart, so one pair of each kind tells for all of them.
    const neighborPairs = count < 2
      ? []
      : [...new Set(moons.map((moonCount, index) => `${moonCount},${moons[(index + 1) % count]}`))].map((pair) => pair.split(',').map(Number));

    const besideNeighbors = (radius: number): boolean => {
      return neighborPairs.every(([before, after]) => {
        const planet = planetBodies(radius, 0, planetRadius, before);
        const next = planetBodies(radius, step, planetRadius, after);
        return moonsClear(planet, next) && moonsOnOwnSide(planet, next) && moonsOnOwnSide(next, planet);
      });
    };

    // Moons on the ring inside reach out toward the planets on this one: check those within reach.
    const besideInnerRing = (radius: number): boolean => {
      if (!innerPlanets) {
        return true;
      }

      const total = innerPlanets.planets.length;
      const window = innerPlanets.radius <= reach ? 180 : toDegrees(Math.asin(reach / innerPlanets.radius));

      return moons.every((moonCount, index) => {
        const angle = start + step * index;
        const planet = planetBodies(radius, angle, planetRadius, moonCount);
        const lowest = Math.floor((angle - window - innerPlanets.start) / innerPlanets.step);
        const highest = Math.min(lowest + total - 1, Math.ceil((angle + window - innerPlanets.start) / innerPlanets.step));

        for (let candidate = lowest; candidate <= highest; candidate += 1) {
          const other = innerPlanets.planets[((candidate % total) + total) % total];

          if (Math.hypot(other.planet.x - planet.planet.x, other.planet.y - planet.planet.y) < reach && !moonsClear(other, planet)) {
            return false;
          }
        }

        return true;
      });
    };

    const lowest = ringIndex === 0 ? planned : Math.max(planned, plan.rings[ringIndex - 1] + plan.ringGap);
    const radius = smallestFitting(lowest, planetRadius, (candidate) => besideNeighbors(candidate) && besideInnerRing(candidate));
    plan.rings[ringIndex] = radius;
    inner = { radius, start, step, planets: moons.map((moonCount, index) => planetBodies(radius, start + step * index, planetRadius, moonCount)) };
    first += count;
  });
};

/** The smallest radius from `lowest` up that `fits`, to within a quarter; `fits` holds for every radius past one where it holds. */
const smallestFitting = (lowest: number, stride: number, fits: (radius: number) => boolean): number => {
  if (fits(lowest)) {
    return lowest;
  }

  let low = lowest;
  let high = lowest + stride;

  while (!fits(high)) {
    low = high;
    high += stride;
  }

  while (high - low > 0.25) {
    const middle = (low + high) / 2;

    if (fits(middle)) {
      high = middle;
    } else {
      low = middle;
    }
  }

  return high;
};

const distributeAcrossRings = (childCount: number, rings: number[], planetRadius: number): number[] => {
  const capacities = rings.map((radius) => focusRingCapacity(radius, planetRadius));
  const counts: number[] = [];
  let remaining = childCount;

  for (let index = 0; index < rings.length; index += 1) {
    const ringsLeft = rings.length - index;
    const capacity = capacities[index] ?? remaining;
    const count = index === rings.length - 1
      ? remaining
      : Math.min(capacity, Math.ceil(remaining / ringsLeft));
    counts.push(count);
    remaining -= count;
  }

  const lastIndex = rings.length - 1;

  if (lastIndex >= 0) {
    rings[lastIndex] = Math.max(
      rings[lastIndex],
      requiredRingRadiusForCount(planetRadius, counts[lastIndex] ?? 0),
    );
  }

  return counts;
};

const focusRingCapacity = (radius: number, planetRadius: number): number => {
  const minimumChord = planetRadius * 2 + NODE_GAP * 0.85;

  if (minimumChord >= radius * 2) {
    return 1;
  }

  const minAngle = 2 * Math.asin(minimumChord / (radius * 2));
  return Math.max(1, Math.floor((2 * Math.PI) / minAngle));
};

const requiredRingRadiusForCount = (planetRadius: number, count: number): number => {
  if (count <= 1) {
    return 0;
  }

  const chordFactor = 2 * Math.sin(Math.PI / count);
  return (planetRadius * 2 + NODE_GAP * 0.85) / chordFactor;
};

const radiusForLevel = (baseDim: number, level: number, scale: number): number => {
  if (level === 0) {
    return clamp(baseDim * 0.115 * scale, MIN_SUN_RADIUS, MAX_SUN_RADIUS);
  }

  if (level === 1) {
    return clamp(baseDim * 0.074 * scale, MIN_PLANET_RADIUS, MAX_PLANET_RADIUS);
  }

  if (level === 2) {
    return clamp(baseDim * 0.056 * scale, 15, 36);
  }

  return clamp(baseDim * 0.044 * scale, 12, 28);
};

const layoutBasis = (containerWidth: number, containerHeight: number): number => {
  const shortSide = Math.min(containerWidth, containerHeight);
  const areaDim = Math.sqrt(containerWidth * containerHeight);
  return Math.min(areaDim, shortSide * 1.25);
};

const countVisibleNodes = (node: OrbitNode): number => {
  return 1 + visibleChildren(node).reduce((sum, child) => sum + countVisibleNodes(child), 0);
};

const visibleChildren = (node: OrbitNode): OrbitNode[] => {
  return node.collapsed ? [] : node.children;
};

const toRadians = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

const toDegrees = (radians: number): number => {
  return (radians * 180) / Math.PI;
};
