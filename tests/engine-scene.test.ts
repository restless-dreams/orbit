import { describe, expect, it } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { alignScene, assignNodeColors, buildFocusScene, buildOverviewScene, MOON_LIMIT, placeNode } from '../src/core/engine/scene';

const viewport = { width: 900, height: 600 };
const palette = ['ROOT', 'ONE', 'TWO', 'THREE'];

const source = `# Root
## Alpha
- A1
- A2
## Beta
- B1
  - B1a
- B2
- B3
- B4
- B5
- B6
- B7
- B8
## Gamma`;

const scenes = () => {
  const tree = parseOrbit(source).root;
  const colors = assignNodeColors(tree, palette);
  return {
    tree,
    colors,
    focus: buildFocusScene(tree, tree.id, { viewport, colors }),
    overview: buildOverviewScene(tree, { viewport, colors }),
  };
};

describe('assignNodeColors', () => {
  it('gives the root and each branch a palette color and shades the descendants', () => {
    const { tree, colors } = scenes();
    expect(colors.get(tree.id)).toBe('ROOT');
    expect(tree.children.map((child) => colors.get(child.id))).toEqual(['ONE', 'TWO', 'THREE']);
    const beta = tree.children[1];
    expect(colors.get(beta.children[0].id)).toBe('TWO');
    expect(colors.get(beta.children[1].id)).toBe('color-mix(in oklab, TWO 78%, var(--_orbit-shade-light))');
  });

  it('lets a node color win and passes it on to its descendants', () => {
    const tree = parseOrbit('# Root\n## A <!-- orbit color: red -->\n- A1\n- A2').root;
    const colors = assignNodeColors(tree, palette);
    expect(colors.get(tree.children[0].id)).toBe('red');
    expect(colors.get(tree.children[0].children[1].id)).toBe('color-mix(in oklab, red 78%, var(--_orbit-shade-light))');
  });
});

describe('buildFocusScene', () => {
  it('puts the sun at the origin, planets on rings and grandchildren as moons', () => {
    const { tree, focus } = scenes();
    const sun = focus.nodes.get(tree.id)!;
    expect(sun).toMatchObject({ role: 'sun', x: 0, y: 0 });
    const planets = [...focus.nodes.values()].filter((node) => node.role === 'planet');
    expect(planets.map((planet) => planet.node.text)).toEqual(['Alpha', 'Beta', 'Gamma']);

    for (const planet of planets) {
      expect(planet.orbitRadius).toBeCloseTo(Math.hypot(planet.x, planet.y), 6);
    }

    const moons = [...focus.nodes.values()].filter((node) => node.role === 'moon');
    expect(moons.filter((moon) => moon.hostId === tree.children[0].id)).toHaveLength(2);
  });

  it('caps moons and counts the rest as hidden', () => {
    const { tree, focus } = scenes();
    const beta = focus.nodes.get(tree.children[1].id)!;
    const moons = [...focus.nodes.values()].filter((node) => node.hostId === beta.id);
    expect(moons).toHaveLength(MOON_LIMIT);
    expect(beta.hiddenChildren).toBe(8 - MOON_LIMIT);
  });

  it('places moons farther from the sun than their planet', () => {
    const { focus } = scenes();

    for (const moon of [...focus.nodes.values()].filter((node) => node.role === 'moon')) {
      const host = focus.nodes.get(moon.hostId!)!;
      expect(Math.hypot(moon.x, moon.y)).toBeGreaterThan(Math.hypot(host.x, host.y) - host.radius);
    }
  });

  it('leaves a gap in the ring around every planet', () => {
    const { focus } = scenes();
    const gaps = focus.rings.flatMap((ring) => ring.gaps);
    expect(gaps).toHaveLength(3);

    for (const gap of gaps) {
      expect(gap.halfWidth).toBeGreaterThan(0);
      expect(gap.halfWidth).toBeLessThan(90);
    }
  });

  it('centers the frame on the sun', () => {
    const { focus } = scenes();
    expect(focus.frame.x).toBe(0);
    expect(focus.frame.y).toBe(0);
    expect(focus.frame.scale).toBeGreaterThan(0);
  });

  it('respects maxDepth and collapsed nodes', () => {
    const tree = parseOrbit('# Root\n## A\n- A1\n## B <!-- orbit collapsed: true -->\n- B1\n- B2').root;
    const colors = assignNodeColors(tree, palette);
    const shallow = buildFocusScene(tree, tree.id, { viewport, colors, maxDepth: 1 });
    expect([...shallow.nodes.values()].some((node) => node.role === 'moon')).toBe(false);
    const full = buildFocusScene(tree, tree.id, { viewport, colors });
    const collapsed = full.nodes.get(tree.children[1].id)!;
    expect(collapsed.hiddenChildren).toBe(2);
    expect([...full.nodes.values()].some((node) => node.hostId === collapsed.id)).toBe(false);
  });

  it('keeps every moon clear of the other planets and their moons, and nearer its planet than its neighbors', () => {
    const problems: string[] = [];

    for (const size of [{ width: 1280, height: 800 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      for (let planetCount = 3; planetCount <= 30; planetCount += 1) {
        for (const moonCount of [1, 2, 4, 5, 6]) {
          const lines = ['# Root'];

          for (let planet = 1; planet <= planetCount; planet += 1) {
            lines.push(`## P${planet}`, ...Array.from({ length: moonCount }, (_, moon) => `- P${planet} m${moon + 1}`));
          }

          const tree = parseOrbit(lines.join('\n')).root;
          const scene = buildFocusScene(tree, tree.id, { viewport: size, colors: assignNodeColors(tree, palette) });
          const bodies = [...scene.nodes.values()];

          for (const moon of bodies.filter((node) => node.role === 'moon')) {
            const host = scene.nodes.get(moon.hostId!)!;

            for (const other of bodies) {
              if (other.role === 'sun' || other.id === host.id || other.hostId === host.id) {
                continue;
              }

              const distance = Math.hypot(moon.x - other.x, moon.y - other.y);

              if (distance < moon.radius + other.radius) {
                problems.push(`${planetCount}x${moonCount} at ${size.width}x${size.height}: ${moon.id} overlaps ${other.id}`);
              }

              if (other.role === 'planet' && other.orbitRadius === host.orbitRadius && distance < Math.hypot(moon.x - host.x, moon.y - host.y)) {
                problems.push(`${planetCount}x${moonCount} at ${size.width}x${size.height}: ${moon.id} is nearer ${other.id} than its planet`);
              }
            }
          }
        }
      }
    }

    expect(problems.slice(0, 10)).toEqual([]);
  });
});

describe('buildOverviewScene', () => {
  it('lays out every node with links and keeps colors from the focus scene', () => {
    const { tree, focus, overview } = scenes();
    expect(overview.nodes.size).toBe(1 + 3 + 2 + 8 + 1);
    expect(overview.links).toHaveLength(overview.nodes.size - 1);

    for (const [id, node] of focus.nodes) {
      expect(overview.nodes.get(id)?.color).toBe(node.color);
    }

    expect(overview.nodes.get(tree.id)).toMatchObject({ x: 0, y: 0 });
  });

  it('opens the rings around every child', () => {
    const { overview } = scenes();

    for (const ring of overview.rings) {
      const children = [...overview.nodes.values()].filter((node) => node.parentId === ring.centerId);
      expect(ring.gaps).toHaveLength(children.length);
    }
  });
});

describe('alignScene', () => {
  it('places a scene so the anchor lands where it is displayed now', () => {
    const { tree, colors } = scenes();
    const beta = tree.children[1];
    const child = buildFocusScene(tree, beta.id, { viewport, colors });
    const current = { x: 120, y: -80, radius: 30 };
    const placement = alignScene(child, beta.id, current);
    const placed = placeNode(child.nodes.get(beta.id)!, placement);
    expect(placed.x).toBeCloseTo(120, 9);
    expect(placed.y).toBeCloseTo(-80, 9);
    expect(placed.radius).toBeCloseTo(30, 9);
  });
});
