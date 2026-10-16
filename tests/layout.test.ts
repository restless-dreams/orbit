import { describe, test, expect } from 'bun:test';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { calculateAllLayout, calculateFocusLayout, getOrbitRings, type PositionedNode } from '../src/core/layout';
import type { OrbitNode } from '../src/core/types';

/** Build an OrbitNode tree from markdown header syntax. */
const parse = (md: string): OrbitNode => {
  return parseOrbitMarkdown(md).root;
};

const countOverlaps = (nodes: { x: number; y: number; radius: number }[]): number => {
  let overlaps = 0;

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);

      if (distance + 0.001 < a.radius + b.radius) {
        overlaps += 1;
      }
    }
  }

  return overlaps;
};

describe('calculateFocusLayout', () => {
  test('places sun at center and planets evenly distributed', () => {
    const root = parse('# Root\n\n## A\n## B\n## C\n## D');
    const layout = calculateFocusLayout(root, { cx: 200, cy: 200, containerWidth: 400, containerHeight: 400 });
    expect(layout.sun.x).toBe(200);
    expect(layout.sun.y).toBe(200);
    expect(layout.planets).toHaveLength(4);
    expect(layout.planets[0].angle).toBe(-90);
  });

  test('returns empty planets for a leaf focus', () => {
    const root = parse('# Root');
    const layout = calculateFocusLayout(root, { cx: 100, cy: 100, containerWidth: 200, containerHeight: 200 });
    expect(layout.planets).toHaveLength(0);
    expect(layout.orbitRadius).toBe(0);
  });

  test('80 planets do not overlap', () => {
    const lines = Array.from({ length: 80 }, (_, index) => `## C${index + 1}`).join('\n');
    const root = parse(`# Root\n\n${lines}`);
    const layout = calculateFocusLayout(root, { cx: 180, cy: 300, containerWidth: 360, containerHeight: 600 });
    expect(countOverlaps(layout.planets)).toBe(0);
  });

  test('crowded focus layouts use multiple orbit rings', () => {
    const lines = Array.from({ length: 32 }, (_, index) => `## C${index + 1}`).join('\n');
    const root = parse(`# Root\n\n${lines}`);
    const layout = calculateFocusLayout(root, { cx: 200, cy: 200, containerWidth: 400, containerHeight: 400 });
    const distinctRings = new Set(layout.planets.map((planet) => planet.orbitRadius.toFixed(1)));
    expect(distinctRings.size).toBeGreaterThan(1);
  });

  test('dense focus layouts shrink planets without dropping below the readable floor', () => {
    const sparse = calculateFocusLayout(parse('# Root\n\n## A\n## B\n## C\n## D'), {
      cx: 200, cy: 200, containerWidth: 400, containerHeight: 400,
    });
    const denseLines = Array.from({ length: 48 }, (_, index) => `## C${index + 1}`).join('\n');
    const dense = calculateFocusLayout(parse(`# Root\n\n${denseLines}`), {
      cx: 200, cy: 200, containerWidth: 400, containerHeight: 400,
    });
    expect(dense.planets[0].radius).toBeLessThan(sparse.planets[0].radius);
    expect(dense.planets[0].radius).toBeGreaterThanOrEqual(18);
  });

  test('a crowded orbit of planets without moons packs closer, and none overlap', () => {
    const config = { cx: 300, cy: 300, containerWidth: 600, containerHeight: 600 };
    const leaves = Array.from({ length: 60 }, (_, index) => `## C${index + 1}`).join('\n');
    const withMoons = Array.from({ length: 60 }, (_, index) => `## C${index + 1}\n- Moon`).join('\n');
    const compact = calculateFocusLayout(parse(`# Root\n\n${leaves}`), config);
    const roomy = calculateFocusLayout(parse(`# Root\n\n${withMoons}`), config);
    expect(compact.planets).toHaveLength(60);
    // The same planets in a smaller orbit: bigger on screen once the view is fitted.
    expect(compact.orbitRadius).toBeLessThan(roomy.orbitRadius);
    expect(compact.orbitRings[0]).toBeLessThan(roomy.orbitRings[0]);
    expect(countOverlaps([compact.sun, ...compact.planets])).toBe(0);
  });

  test('rings move out only for moons that need the room', () => {
    const config = { cx: 0, cy: 0, containerWidth: 1280, containerHeight: 800 };

    const orbit = (planets: number, moons: number) => {
      const lines = Array.from({ length: planets }, (_, planet) => [`## P${planet + 1}`, ...Array.from({ length: moons }, (_, moon) => `- P${planet + 1}.${moon + 1}`)]);
      return calculateFocusLayout(parse(`# Root\n\n${lines.flat().join('\n')}`), config);
    };

    // Eight planets leave their moons room; thirteen fans of six would reach into each other.
    expect(orbit(8, 4).orbitRings).toEqual(orbit(8, 1).orbitRings);
    expect(orbit(13, 6).orbitRings[0]).toBeGreaterThan(orbit(13, 1).orbitRings[0]);
  });

  test('an orbit that fits on one ring keeps its roomy layout', () => {
    const config = { cx: 300, cy: 300, containerWidth: 600, containerHeight: 600 };
    const leaves = calculateFocusLayout(parse('# Root\n\n## A\n## B\n## C\n## D\n## E'), config);
    const withMoons = calculateFocusLayout(parse('# Root\n\n## A\n- a\n## B\n## C\n## D\n## E'), config);
    expect(leaves.orbitRings).toEqual(withMoons.orbitRings);
  });
});

describe('calculateAllLayout', () => {
  test('24 children at the root level do not overlap', () => {
    const lines = Array.from({ length: 24 }, (_, index) => `## C${index + 1}`).join('\n');
    const root = parse(`# Root\n\n${lines}`);
    const positioned = calculateAllLayout(root, { cx: 200, cy: 200, containerWidth: 400, containerHeight: 400 });
    expect(countOverlaps(positioned)).toBe(0);
  });

  test('nested subtrees do not overlap', () => {
    const lines = Array.from({ length: 8 }, (_, index) => {
      const branch = index + 1;
      return `## A${branch}\n### A${branch}.1\n### A${branch}.2\n### A${branch}.3\n### A${branch}.4`;
    }).join('\n');

    const root = parse(`# Root\n\n${lines}`);
    const positioned = calculateAllLayout(root, { cx: 250, cy: 250, containerWidth: 500, containerHeight: 500 });
    expect(countOverlaps(positioned)).toBe(0);
  });

  test('skips collapsed children', () => {
    const root = parse('# Root\n\n## Open\n\n### Hidden\n\n## Closed <!-- orbit collapsed: true -->\n\n### NeverPlaced');
    const positioned = calculateAllLayout(root, { cx: 200, cy: 200, containerWidth: 400, containerHeight: 400 });
    const placedTexts = positioned.map((n: PositionedNode) => n.text);
    expect(placedTexts).toContain('Hidden');
    expect(placedTexts).not.toContain('NeverPlaced');
  });
});

describe('getOrbitRings', () => {
  test('produces one ring per parent that has visible children', () => {
    const root = parse('# Root\n\n## A\n\n### A1\n\n## B');
    const positioned = calculateAllLayout(root, { cx: 200, cy: 200, containerWidth: 400, containerHeight: 400 });
    const rings = getOrbitRings(positioned);
    expect(rings.length).toBe(2); // Root's orbit + A's orbit
  });
});

describe('fan-angle constraint', () => {
  test('grandchildren under a single non-root parent fan no more than 270°', () => {
    const root = parse('# Root\n\n## Branch\n\n### A\n### B\n### C\n### D\n### E\n### F\n### G\n### H');
    const positioned = calculateAllLayout(root, { cx: 250, cy: 250, containerWidth: 500, containerHeight: 500 });
    const branch = positioned.find((n) => n.text === 'Branch')!;
    const grandchildren = positioned.filter((n) => n.parent?.id === branch.id);
    expect(grandchildren).toHaveLength(8);
    const angles = grandchildren.map((g) => Math.atan2(g.y - branch.y, g.x - branch.x) * 180 / Math.PI);
    // The visual fan is the LARGER arc swept by the children.
    // Sort angles, find the largest gap between consecutive angles (including wrap-around),
    // and the fan span is 360 minus that gap.
    const sorted = [...angles].sort((a, b) => a - b);
    let maxGap = sorted[0] + 360 - sorted[sorted.length - 1];

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];

      if (gap > maxGap) {
        maxGap = gap;
      }
    }

    const span = 360 - maxGap;
    expect(span).toBeLessThanOrEqual(270.5);
  });
});
