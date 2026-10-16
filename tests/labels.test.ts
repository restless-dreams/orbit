import { describe, expect, test } from 'bun:test';
import { labelOrder, labelSides, outsideLabelBox, planLabels, type Box, type Point } from '../src/core/engine/labels';
import { labelPlacement } from '../src/core/engine/views';
import { worldToScreen, type Viewport } from '../src/core/engine/camera';
import { breakUnits } from '../src/core/text-layout';
import type { Display, DisplayNode } from '../src/core/engine/display';
import type { OrbitNode } from '../src/core/types';

const entry = (id: string, role: DisplayNode['role'], x: number, y: number, radius: number, text: string, parentId?: string, children: string[] = []): DisplayNode => {
  const node: OrbitNode = { id, text, level: role === 'sun' ? 0 : 1, children: children.map((child) => ({ id: child, text: child, level: 2, children: [] })) };
  return { id, node, role, x, y, radius, opacity: 1, labelOpacity: 1, color: '#9BC7F5', depth: node.level, hiddenChildren: 0, parentId };
};

const display = (...entries: DisplayNode[]): Display => {
  return { nodes: new Map(entries.map((item) => [item.id, item])), rings: [], links: [], camera: { x: 0, y: 0, scale: 1 } };
};

const viewport = { width: 400, height: 400 };

/** How far a pill is from a point (px): to its box with its corners rounded as drawn, by half a one-line pill's height. */
const pillDistanceFrom = (point: Point, box: Box): number => {
  const corner = Math.min(10.5, (box.right - box.left) / 2);
  const left = box.left + corner;
  const right = box.right - corner;
  const top = box.top + corner;
  const bottom = box.bottom - corner;
  return Math.hypot(point.x - Math.min(right, Math.max(left, point.x)), point.y - Math.min(bottom, Math.max(top, point.y))) - corner;
};

describe('label planning', () => {
  test('important labels win: the sun first, then shallower and bigger nodes', () => {
    const map = display(
      entry('moon', 'moon', 60, 0, 6, 'Moon', 'planet'),
      entry('planet', 'planet', 50, 0, 30, 'Planet', 'sun'),
      entry('sun', 'sun', 0, 0, 60, 'Sun'),
    );
    expect(labelOrder(map.nodes.values()).map((item) => item.id)).toEqual(['sun', 'planet', 'moon']);
  });

  // Pills are for nodes whose picture fills them (and the overview's small nodes).
  const picture = (id: string) => (item: DisplayNode) => item.id === id;

  test('a pill sits on the free side facing the parent, and never covers another node', () => {
    const map = display(
      entry('sun', 'sun', 0, 0, 40, 'Sun'),
      entry('planet', 'planet', 0, -120, 12, 'A planet with a long name', 'sun'),
      entry('blocker', 'planet', 0, -80, 10, 'B', 'sun'),
    );
    const planned = planLabels(map, labelOrder(map.nodes.values()), { viewport, hasImage: picture('planet') });
    const planet = planned.find((plan) => plan.entry.id === 'planet');
    // Toward the sun is blocked by another node, so the pill moves to another side.
    expect(planet?.placement).toBe('outside');
    expect(planet?.direction.y).not.toBe(1);
  });

  test('a pill on a slant keeps the same gap from its node as one beside it', () => {
    const point = { x: 200, y: 200 };
    const name = 'Seafood in Cais do Sodré';
    // Below its node, a pill's top is 5 px past the node's edge…
    const below = outsideLabelBox(name, point, 40, { x: 0, y: 1 }, 160);
    expect(below.top).toBeCloseTo(245, 5);
    expect(pillDistanceFrom(point, below)).toBeCloseTo(45, 5);

    // …and on a slant, its near end keeps those 5 px too, instead of reaching back over the node.
    for (const degrees of [15, 30, 45, 60, 75, 135, 210, 330]) {
      const angle = (degrees * Math.PI) / 180;
      const box = outsideLabelBox(name, point, 40, { x: Math.cos(angle), y: Math.sin(angle) }, 160);
      expect({ degrees, gap: Math.round((pillDistanceFrom(point, box) - 40) * 100) / 100 }).toEqual({ degrees, gap: 5 });
    }
  });

  test('a pill below a node at the edge slides sideways to stay on the map', () => {
    const map = display(
      entry('sun', 'sun', 0, 0, 40, 'Sun'),
      entry('edge', 'planet', 170, 0, 22, 'Seafood in Cais do Sodré, by the river', 'sun'),
    );
    const planned = planLabels(map, labelOrder(map.nodes.values()), { viewport, hasImage: picture('edge') });
    const edge = planned.find((plan) => plan.entry.id === 'edge');
    expect(edge?.direction).toEqual({ x: 0, y: 1 });
    // The 160 px pill would end at 450 px on a 400 px map: it slides 50 px back, still under its node.
    expect(edge?.offset).toBe(-50);
  });

  test('a pill that fits nowhere on one line goes on two', () => {
    // A phone's orbit of five planets and the + (412 × 800 map), as an editable map draws it.
    const phone = { width: 412, height: 800 };
    const map = display(
      entry('trip', 'sun', 0, 0, 62, 'Weekend in Lisbon'),
      entry('food', 'planet', 0, -141, 44, 'Food', 'trip'),
      entry('places', 'planet', 122, -71, 44, 'Places', 'trip'),
      entry('evenings', 'planet', 122, 71, 44, 'Evenings', 'trip'),
      entry('night', 'planet', 0, 141, 44, 'Night markets', 'trip'),
      entry('ferry', 'planet', -122, 71, 44, 'Ferry ride to Cacilhas', 'trip'),
    );
    const withSlot: Display = { ...map, addSlot: { parentId: 'trip', index: 5, x: -122, y: -71, radius: 44, opacity: 1 } };
    const planned = planLabels(withSlot, labelOrder(withSlot.nodes.values()), { viewport: phone, hasImage: picture('ferry') });
    const ferry = planned.find((plan) => plan.entry.id === 'ferry');
    expect(ferry?.lines).toBe(2);
    expect(ferry?.direction).toEqual({ x: 0, y: 1 });
    // It breaks where the lines balance best: "Ferry ride" and "to Cacilhas", 11 characters.
    expect(ferry?.width).toBeCloseTo(11 * 6.4 + 18, 5);
  });

  test('a planet with no free side still gets a pill, over as few nodes as it can', () => {
    // The sun to the right, neighbors above and below, the edge of the map to the left.
    const map = display(
      entry('sun', 'sun', 0, 0, 50, 'Sun'),
      entry('sunset', 'planet', -100, 0, 30, 'Sunset at Miradouro', 'sun'),
      entry('above', 'planet', -100, -50, 20, 'A', 'sun'),
      entry('below', 'planet', -100, 50, 20, 'B', 'sun'),
    );
    const planned = planLabels(map, labelOrder(map.nodes.values()), { viewport: { width: 300, height: 300 }, hasImage: picture('sunset') });
    const sunset = planned.find((plan) => plan.entry.id === 'sunset');
    expect(sunset?.placement).toBe('outside');
    // Not over the sun, whose own label matters most: over a neighbor.
    expect(sunset?.direction.x).toBe(0);
  });

  test('a pill keeps clear of the + in the orbit', () => {
    const map = display(entry('sun', 'sun', 0, 0, 40, 'Sun'), entry('planet', 'planet', 0, 120, 12, 'A planet with a long name', 'sun'));
    const side = (shown: Display) => planLabels(shown, labelOrder(shown.nodes.values()), { viewport, hasImage: picture('planet') })
      .find((plan) => plan.entry.id === 'planet')?.direction;
    // Toward the sun is free…
    expect(side(map)).toEqual({ x: 0, y: -1 });
    // …until the + sits there.
    expect(side({ ...map, addSlot: { parentId: 'sun', index: 1, x: 0, y: 92, radius: 10, opacity: 1 } })).toEqual({ x: 0, y: 1 });
  });

  test('moons put their label away from their planet', () => {
    const map = display(entry('planet', 'planet', 0, 0, 40, 'Planet'), entry('moon', 'moon', 50, 0, 8, 'Moon', 'planet'));
    expect(labelSides(map.nodes.get('moon')!, map)).toEqual([{ x: 1, y: -0 }]);
  });

  test('the focused node always has a label, even when every side is crowded', () => {
    const title = 'A very long title for the focused node that will never fit inside it';

    const neighbors = Array.from({ length: 8 }, (_, index) => {
      const angle = (index / 8) * Math.PI * 2;
      return entry(`planet-${index}`, 'planet', Math.cos(angle) * 46, Math.sin(angle) * 46, 22, `P${index}`, 'sun');
    });

    const map = display(entry('sun', 'sun', 0, 0, 20, title), ...neighbors);
    const planned = planLabels(map, labelOrder(map.nodes.values()), { viewport, hasImage: () => false });
    expect(planned.some((plan) => plan.entry.id === 'sun')).toBe(true);
  });

  test('a node whose picture fills it says its icon on its pill, before its name', () => {
    const map = display(
      entry('sun', 'sun', 0, 0, 40, 'Sun'),
      entry('summit', 'planet', 0, -120, 22, 'Summit', 'sun'),
      entry('trail', 'planet', 0, 120, 22, 'Trail', 'sun'),
    );
    const planned = planLabels(map, labelOrder(map.nodes.values()), {
      viewport,
      hasImage: (item) => item.id !== 'sun',
      pillIcon: (item) => (item.id === 'summit' ? '⛰️' : undefined),
    });
    const summit = planned.find((plan) => plan.entry.id === 'summit')!;
    const trail = planned.find((plan) => plan.entry.id === 'trail')!;
    expect(summit.text).toBe('⛰️ Summit');
    expect(trail.text).toBe('Trail');
    // The pill is planned as wide as what it says.
    const withoutIcon = outsideLabelBox('Summit', { x: 200, y: 80 }, 22, summit.direction, 160);
    expect(summit.width).toBeGreaterThan(withoutIcon.right - withoutIcon.left);
    // A name inside its node says only the name: the icon shows above it there.
    const inside = planLabels(map, labelOrder(map.nodes.values()), { viewport, hasImage: () => false, pillIcon: () => '⛰️' });
    expect(inside.find((plan) => plan.entry.id === 'sun')?.text).toBe('Sun');
  });

  test('pills stay hidden while nodes are in flight', () => {
    const map = display(entry('sun', 'sun', 0, 0, 40, 'Sun'), entry('planet', 'planet', 120, 0, 8, 'Small planet', 'sun'));
    const planned = planLabels(map, labelOrder(map.nodes.values()), { viewport, hasImage: () => false, inFlight: true });
    expect(planned.map((plan) => plan.entry.id)).toEqual(['sun']);
  });
});

/** A seeded generator, so a map that fails can be drawn again. */
const seeded = (seed: number): () => number => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const TEXTS = ['Research', 'Plan', 'Interviews with customers', 'Q3', 'Supercalifragilisticexpialidocious', '研究开发', '東京の夜の市場', '🚀 Launch', 'A', 'Seafood in Cais do Sodré, by the river', 'mail_pieces', 'campaign send dates and times'];

/** A crowded random map: a sun, planets around it and moons around them, through a random camera. */
const crowdedMap = (random: () => number): { map: Display; viewport: Viewport; previous: Map<string, Point>; pictures: Set<string> } => {
  const pick = <Item>(items: Item[]): Item => items[Math.floor(random() * items.length)];
  const viewport = pick([{ width: 412, height: 800 }, { width: 1280, height: 800 }, { width: 320, height: 320 }]);
  const entries: DisplayNode[] = [entry('sun', 'sun', 0, 0, 30 + random() * 60, pick(TEXTS))];
  const planets = 3 + Math.floor(random() * 12);
  const ring = 110 + random() * 120;

  for (let index = 0; index < planets; index += 1) {
    const angle = (index / planets) * Math.PI * 2 + random() * 0.3;
    const planet = entry(`p${index}`, pick(['planet', 'planet', 'node'] as const), Math.cos(angle) * ring, Math.sin(angle) * ring, 8 + random() * 40, pick(TEXTS), 'sun');
    entries.push(planet);

    for (let moon = 0; moon < Math.floor(random() * 7); moon += 1) {
      const around = random() * Math.PI * 2;
      const distance = planet.radius + 8 + random() * 30;
      entries.push(entry(`p${index}m${moon}`, 'moon', planet.x + Math.cos(around) * distance, planet.y + Math.sin(around) * distance, 2 + random() * 12, pick(TEXTS), planet.id));
    }
  }

  for (const item of entries) {
    if (random() < 0.15) {
      item.opacity = random();
      item.labelOpacity = random();
    }
  }

  const map: Display = { ...display(...entries), camera: { x: (random() - 0.5) * 160, y: (random() - 0.5) * 160, scale: 0.6 + random() * 1.8 } };

  if (random() < 0.4) {
    map.addSlot = { parentId: 'sun', index: 0, x: ring * 0.7, y: -ring * 0.7, radius: 14, opacity: 1 };
  }

  const previous = new Map<string, Point>();
  const pictures = new Set<string>();

  for (const item of entries) {
    if (random() < 0.3) {
      previous.set(item.id, pick([{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }]));
    }

    // Nodes showing a picture get pills, so a third of them do.
    if (random() < 0.35) {
      pictures.add(item.id);
    }
  }

  return { map, viewport, previous, pictures };
};

const COVER_COST = { sun: 4, planet: 1, node: 1, moon: 0.5 } as const;

type PlacedLabel =
  | { id: string; placement: 'inside' }
  | { id: string; placement: 'outside'; direction: Point; offset: number; lines: 1 | 2; width: number };

/** Every rule of label planning, checked plainly against every body and every placed label. */
const plainPlan = (map: Display, viewport: Viewport, previous: Map<string, Point>, pictures: Set<string>): PlacedLabel[] => {
  const { camera } = map;
  const discs: (Point & { id: string; radius: number; cost: number })[] = [];

  for (const item of map.nodes.values()) {
    if (item.opacity > 0.3) {
      discs.push({ id: item.id, ...worldToScreen(camera, viewport, item), radius: item.radius * camera.scale, cost: COVER_COST[item.role] });
    }
  }

  if (map.addSlot && map.addSlot.opacity > 0.3) {
    discs.push({ id: '', ...worldToScreen(camera, viewport, map.addSlot), radius: map.addSlot.radius * camera.scale, cost: 0.75 });
  }

  const onMap = (box: Box) => box.left >= -0.5 && box.top >= -0.5 && box.right <= viewport.width + 0.5 && box.bottom <= viewport.height + 0.5;
  const overlap = (first: Box, second: Box) => first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
  const touches = (disc: Point & { radius: number }, box: Box) =>
    Math.hypot(disc.x - Math.min(box.right, Math.max(box.left, disc.x)), disc.y - Math.min(box.bottom, Math.max(box.top, disc.y))) < disc.radius;
  const taken: Box[] = [];
  const planned: PlacedLabel[] = [];

  for (const item of labelOrder(map.nodes.values())) {
    const point = worldToScreen(camera, viewport, item);
    const screenRadius = item.radius * camera.scale;
    const offMap = point.x + screenRadius < -120 || point.x - screenRadius > viewport.width + 120 || point.y + screenRadius < -120 || point.y - screenRadius > viewport.height + 120;

    if (item.opacity * item.labelOpacity <= 0.01 || offMap) {
      continue;
    }

    const placement = labelPlacement(item.role, screenRadius, item.node.text, pictures.has(item.id));

    if (placement === 'hidden') {
      continue;
    }

    if (placement === 'inside') {
      planned.push({ id: item.id, placement });
      continue;
    }

    const sides = labelSides(item, map);
    const before = previous.get(item.id);

    if (before) {
      sides.sort((first, second) => Math.hypot(first.x - before.x, first.y - before.y) - Math.hypot(second.x - before.x, second.y - before.y));
    }

    const widest = item.role === 'sun' ? 280 : 160;

    const spotFor = (side: Point, lines: 1 | 2) => {
      const box = outsideLabelBox(item.node.text, point, screenRadius, side, widest, 0, lines);
      const shift = box.left < 0 ? -box.left : box.right > viewport.width ? viewport.width - box.right : 0;
      const nudge = side.x === 0 && point.x >= box.left + shift + 10 && point.x <= box.right + shift - 10 ? shift : 0;
      return { side, offset: nudge, lines, box: nudge === 0 ? box : outsideLabelBox(item.node.text, point, screenRadius, side, widest, nudge, lines) };
    };

    const covered = (box: Box) => discs.filter((disc) => disc.id !== item.id && disc.radius > 2 && touches(disc, box)).reduce((total, disc) => total + disc.cost, 0);
    const free = (box: Box) => onMap(box) && !taken.some((other) => overlap(box, other)) && covered(box) === 0;
    const spots = sides.map((side) => spotFor(side, 1));
    const wrapped = breakUnits(item.node.text).length > 1 ? sides.map((side) => spotFor(side, 2)) : [];
    const spot = [...spots, ...wrapped].find((candidate) => free(candidate.box))
      ?? (item.role === 'sun' ? spots.find((candidate) => onMap(candidate.box)) ?? spots[0] : undefined)
      ?? (item.role === 'planet'
        ? [...spots, ...wrapped]
          .filter((candidate) => onMap(candidate.box) && !taken.some((other) => overlap(candidate.box, other)))
          .sort((first, second) => covered(first.box) - covered(second.box))[0]
        : undefined);

    if (!spot) {
      continue;
    }

    taken.push(spot.box);
    planned.push({ id: item.id, placement, direction: spot.side, offset: spot.offset, lines: spot.lines, width: spot.box.right - spot.box.left });
  }

  return planned;
};

describe('label planning on crowded maps', () => {
  test('places every label exactly as checking each rule against every body and label does', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const { map, viewport: size, previous, pictures } = crowdedMap(seeded(seed));
      const planned = planLabels(map, labelOrder(map.nodes.values()), { viewport: size, hasImage: (item) => pictures.has(item.id), previousSide: (id) => previous.get(id) ?? null })
        .map((plan): PlacedLabel => plan.placement === 'inside'
          ? { id: plan.entry.id, placement: plan.placement }
          : { id: plan.entry.id, placement: plan.placement, direction: plan.direction, offset: plan.offset, lines: plan.lines, width: plan.width });
      expect({ seed, planned }).toEqual({ seed, planned: plainPlan(map, size, previous, pictures) });
    }
  });

  test('keeps every pill on the map, all of it', () => {
    let pills = 0;

    for (let seed = 1; seed <= 300; seed += 1) {
      const { map, viewport: size, previous, pictures } = crowdedMap(seeded(seed));

      for (const plan of planLabels(map, labelOrder(map.nodes.values()), { viewport: size, hasImage: (item) => pictures.has(item.id), previousSide: (id) => previous.get(id) ?? null })) {
        // The focused node says what it is even where no side fits; every other pill fits on the map.
        if (plan.placement !== 'outside' || plan.entry.role === 'sun') {
          continue;
        }

        pills += 1;
        const box = outsideLabelBox(plan.entry.node.text, plan, plan.screenRadius, plan.direction, 160, plan.offset, plan.lines);
        const past = Math.max(-box.left, -box.top, box.right - size.width, box.bottom - size.height);
        expect({ seed, id: plan.entry.id, past: past > 0.5 }).toEqual({ seed, id: plan.entry.id, past: false });
      }
    }

    expect(pills).toBeGreaterThan(300);
  });

  test('keeps every pill off its own node, as far from it on a slant as beside it', () => {
    let slanted = 0;

    for (let seed = 1; seed <= 300; seed += 1) {
      const { map, viewport: size, previous, pictures } = crowdedMap(seeded(seed));

      for (const plan of planLabels(map, labelOrder(map.nodes.values()), { viewport: size, hasImage: (item) => pictures.has(item.id), previousSide: (id) => previous.get(id) ?? null })) {
        if (plan.placement !== 'outside') {
          continue;
        }

        if (plan.direction.x !== 0 && plan.direction.y !== 0) {
          slanted += 1;
        }

        const box = outsideLabelBox(plan.text, plan, plan.screenRadius, plan.direction, plan.entry.role === 'sun' ? 280 : 160, plan.offset, plan.lines);
        const gap = pillDistanceFrom(plan, box) - plan.screenRadius;
        // The live map places the pill by its point that matches its side, `distance` from the node's center: where its box has it.
        const placedBy = {
          x: (box.left + box.right) / 2 - (plan.direction.x * (box.right - box.left)) / 2 - plan.offset,
          y: (box.top + box.bottom) / 2 - (plan.direction.y * (box.bottom - box.top)) / 2,
        };
        const drawnAsPlanned = Math.abs(Math.hypot(placedBy.x - plan.x, placedBy.y - plan.y) - plan.distance) < 1e-6;
        expect({ seed, id: plan.entry.id, keepsTheGap: gap >= 4.99, drawnAsPlanned }).toEqual({ seed, id: plan.entry.id, keepsTheGap: true, drawnAsPlanned: true });
      }
    }

    expect(slanted).toBeGreaterThan(300);
  });
});
