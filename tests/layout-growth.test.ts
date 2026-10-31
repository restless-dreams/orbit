import { describe, test, expect } from 'bun:test';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { calculateAllLayout, getOrbitRings, type PositionedNode } from '../src/core/layout';
import type { OrbitNode } from '../src/core/types';

// The overview's layout grows with the map in proportion to it: in the work it
// takes, and in the room a long run of ideas, one under another, takes up.

const config = { cx: 0, cy: 0, containerWidth: 1280, containerHeight: 800 };

/** A run of `depth` ideas, each the only one under the one before it. */
const chain = (depth: number): OrbitNode => {
  const lines = Array.from({ length: depth }, (_, index) => `${'  '.repeat(index)}- Step ${index + 1}`);
  return parseOrbitMarkdown(`# Root\n\n${lines.join('\n')}`).root;
};

/** `fan` ideas under each idea, `depth` levels down. */
const bushy = (fan: number, depth: number): OrbitNode => {
  const lines: string[] = [];

  const add = (level: number, name: string) => {
    if (level > depth) {
      return;
    }

    for (let index = 1; index <= fan; index += 1) {
      lines.push(`${'  '.repeat(level - 1)}- ${name}${index}`);
      add(level + 1, `${name}${index}.`);
    }
  };

  add(1, 'Idea ');
  return parseOrbitMarkdown(`# Root\n\n${lines.join('\n')}`).root;
};

/** How many of the list's entries `getOrbitRings` reads, counted on the way. */
const readsByRings = (positioned: PositionedNode[]): number => {
  let reads = 0;

  const counted = new Proxy(positioned, {
    get: (target, key, receiver) => {
      if (typeof key === 'string' && /^\d+$/.test(key)) {
        reads += 1;
      }

      return Reflect.get(target, key, receiver);
    },
  });

  getOrbitRings(counted);
  return reads;
};

const farthestFromRoot = (positioned: PositionedNode[]): number => {
  const [root] = positioned;
  return Math.max(...positioned.map((node) => Math.hypot(node.x - root.x, node.y - root.y)));
};

const countOverlaps = (nodes: { x: number; y: number; radius: number }[]): number => {
  let overlaps = 0;

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];

      if (Math.hypot(a.x - b.x, a.y - b.y) + 0.001 < a.radius + b.radius) {
        overlaps += 1;
      }
    }
  }

  return overlaps;
};

describe('the overview rings', () => {
  test('are found reading each node a few times over, however big the map', () => {
    // A chain is the worst case for looking up each node's first child from the top of the list.
    for (const depth of [100, 200, 400]) {
      const positioned = calculateAllLayout(chain(depth), config);
      expect(readsByRings(positioned)).toBeLessThanOrEqual(3 * positioned.length);
    }

    for (const depth of [3, 4, 5]) {
      const positioned = calculateAllLayout(bushy(3, depth), config);
      expect(readsByRings(positioned)).toBeLessThanOrEqual(3 * positioned.length);
    }
  });

  test('are the same rings as before: one around each node with children, through its first child', () => {
    const root = parseOrbitMarkdown('# Root\n\n## A\n\n### A1\n\n#### A1a\n\n## B\n\n### B1\n\n### B2\n\n## C').root;
    const positioned = calculateAllLayout(root, config);
    const rings = getOrbitRings(positioned);

    expect(rings.map((ring) => positioned.find((node) => node.id === ring.centerId)?.text)).toEqual(['Root', 'A', 'A1', 'B']);

    for (const ring of rings) {
      const center = positioned.find((node) => node.id === ring.centerId)!;
      const firstChild = positioned.find((node) => node.parent?.id === center.id)!;
      expect(ring.r).toBeCloseTo(Math.hypot(firstChild.x - center.x, firstChild.y - center.y), 6);
    }
  });
});

describe('a run of ideas, one under another', () => {
  test('takes room in step with its length, not twice as much with each idea', () => {
    const farthest = [10, 20, 40, 80].map((depth) => farthestFromRoot(calculateAllLayout(chain(depth), config)));

    for (let index = 1; index < farthest.length; index += 1) {
      // Twice the ideas, about twice the room: never anywhere near the square.
      expect(farthest[index] / farthest[index - 1]).toBeLessThan(2.2);
    }

    // Eighty ideas fit within a few thousand pixels of the root: each step is one idea's width and a gap.
    expect(farthest.at(-1)!).toBeLessThan(80 * 100);
    expect(Number.isFinite(farthestFromRoot(calculateAllLayout(chain(2000), config)))).toBe(true);
  });

  test('keeps clear of itself and of the ideas around it', () => {
    expect(countOverlaps(calculateAllLayout(chain(30), config))).toBe(0);

    // Chains hanging off a fan of siblings, and off the ends of other chains.
    const root = parseOrbitMarkdown(`# Root

- One
  - One.1
    - One.1.1
      - One.1.1.1
- Two
  - Two.1
  - Two.2
    - Two.2.1
      - Two.2.1.1
  - Two.3
- Three
  - Three.1
    - Three.1.1
    - Three.1.2
    - Three.1.3
    - Three.1.4
- Four`).root;
    expect(countOverlaps(calculateAllLayout(root, config))).toBe(0);
    expect(countOverlaps(calculateAllLayout(bushy(3, 4), config))).toBe(0);
  });
});
