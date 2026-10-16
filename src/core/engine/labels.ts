/**
 * Where every label goes, frame by frame: inside its node, on a chip, as a
 * pill beside the node, or nowhere. Pills try the sides of their node in
 * order of preference and take the first one that covers no other label,
 * no other node and doesn't run off the map. The browser renderer and the
 * SVG export both use this, so an export looks like the live map.
 */

import type { Viewport } from './camera.js';
import { worldToScreen } from './camera.js';
import type { Display, DisplayNode } from './display.js';
import { labelPlacement, measureCount, showsCount, type LabelPlacement } from './views.js';
import { breakUnits, joinUnits } from '../text-layout.js';
import { ESTIMATED_LABELS, INSIDE_ESTIMATE, PILL_ESTIMATE, onMeasurementsReset, type LabelMeasures, type TextMeasure } from './text-measure.js';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlannedLabel {
  entry: DisplayNode;

  /** The node's center on screen. */
  x: number;

  y: number;
  screenRadius: number;
  placement: Exclude<LabelPlacement, 'hidden'>;

  /** Which side of the node an outside label sits on (a unit vector). */
  direction: Point;

  /** How far from the node's center a pill sits (px; see `pillDistance`). */
  distance: number;

  /** Pixels a pill above or below its node slid sideways to stay on the map. */
  offset: number;

  /** A pill's lines: two when one line fits nowhere. */
  lines: 1 | 2;

  /** A pill's estimated width. */
  width: number;

  opacity: number;

  /** What a pill says: the node's name, after its icon when `pillIcon` gives one. */
  text: string;

  /** The width (px) of the node's "+N", which a name inside it keeps clear of; 0 when it shows none. */
  countWidth: number;
}

export interface LabelPlanOptions {
  viewport: Viewport;

  /** Whether the node shows a picture, which pushes its label outside. */
  hasImage(entry: DisplayNode): boolean;

  /** Whether the node has an icon to show above its name (the fit is the label's own, cached). */
  hasIcon?(entry: DisplayNode): boolean;

  /**
   * An icon to show on the node's pill, before its name: for a node whose
   * picture or content fills it, so the icon has no place inside.
   */
  pillIcon?(entry: DisplayNode): string | undefined;

  /** The side a label sat on last frame, so labels don't hop around while the map moves. */
  previousSide?(id: string): Point | null;

  /** While nodes fly between views, pills stay hidden; they'd flicker as nodes grow and shrink. */
  inFlight?: boolean;

  /** Measures names in the fonts the map draws them with; by default, widths are estimated. */
  measures?: LabelMeasures;

  /**
   * While the map moves, names that don't fit at their font's width don't
   * try narrower ones, and names not yet showing only start to when they'd
   * fit by the estimate too (`isShown` says which show): measured names fit
   * more often, and hundreds starting to show mid-zoom would make frames
   * late. Once the map is still (and by default), every name that fits shows.
   */
  moving?: boolean;

  /** Whether a node's label shows now. */
  isShown?(id: string): boolean;

  /** Whether nodes show a "+N" for children that aren't drawn, which names inside them keep clear of: the map does, an export doesn't. */
  counts?: boolean;
}

const BELOW: Point = { x: 0, y: 1 };
const ABOVE: Point = { x: 0, y: -1 };
/** Nodes this far outside the map get no label at all. */
const OFF_SCREEN_MARGIN = 120;
/** A pill slid sideways still reaches this far past its node's center, so it reads as the node's. */
const NUDGE_REACH = 10;

const ROLE_PRIORITY = { sun: 0, planet: 1, node: 1, moon: 2 } as const;

/** What covering a body with a pill costs: the sun's own label matters most. */
const COVER_COST = { sun: 4, planet: 1, node: 1, moon: 0.5 } as const;

/** The order labels are placed in, so the important ones win when they would overlap. */
export const labelOrder = (nodes: Iterable<DisplayNode>): DisplayNode[] => {
  return Array.from(nodes).sort((left, right) => (
    ROLE_PRIORITY[left.role] - ROLE_PRIORITY[right.role] || left.depth - right.depth || right.radius - left.radius
  ));
};

interface Disc extends Point {
  id: string;
  radius: number;
  cost: number;
}

interface Spot {
  side: Point;
  offset: number;
  lines: 1 | 2;
  box: Box;
}

/** The labels to show this frame, in `order`. Nodes missing from the result show no label. */
export const planLabels = (display: Display, order: DisplayNode[], options: LabelPlanOptions): PlannedLabel[] => {
  const { camera } = display;
  const { viewport } = options;
  // Every body a pill keeps clear of, with how much covering it would cost
  // when a planet's pill has nowhere free to go. Bodies 2 px or smaller don't count.
  const discs = new ScreenGrid<Disc>(viewport);

  const addDisc = (id: string, center: Point, radius: number, cost: number) => {
    if (radius > 2) {
      discs.add({ id, x: center.x, y: center.y, radius, cost }, { left: center.x - radius, right: center.x + radius, top: center.y - radius, bottom: center.y + radius });
    }
  };

  for (const entry of display.nodes.values()) {
    if (entry.opacity > 0.3) {
      addDisc(entry.id, worldToScreen(camera, viewport, entry), entry.radius * camera.scale, COVER_COST[entry.role]);
    }
  }

  // Pills keep clear of the + in the orbit too.
  if (display.addSlot && display.addSlot.opacity > 0.3) {
    addDisc('', worldToScreen(camera, viewport, display.addSlot), display.addSlot.radius * camera.scale, 0.75);
  }

  const taken = new ScreenGrid<Box>(viewport);
  const measures = options.measures ?? ESTIMATED_LABELS;
  const countMeasure = options.counts ? measures.count() : null;
  const planned: PlannedLabel[] = [];

  for (const entry of order) {
    const point = worldToScreen(camera, viewport, entry);
    const screenRadius = entry.radius * camera.scale;
    const opacity = entry.opacity * entry.labelOpacity;

    if (opacity <= 0.01 || isOffScreen(point, screenRadius, viewport)) {
      continue;
    }

    const countWidth = countMeasure && showsCount(entry.role, screenRadius, entry.hiddenChildren) ? measureCount(entry.hiddenChildren, countMeasure) : 0;
    const placement = labelPlacement(entry.role, screenRadius, entry.node.text, options.hasImage(entry), options.hasIcon?.(entry), measures.inside(entry.role, entry.node), !options.moving, countWidth);

    if (placement === 'hidden' || (placement === 'outside' && options.inFlight)) {
      continue;
    }

    // While the map moves, a name starts to show only where the estimate would show it too, and during a
    // flight between views, only such names show at all; the rest wait for the map to be still.
    if (placement === 'inside' && options.moving && measures !== ESTIMATED_LABELS && (options.inFlight || !options.isShown?.(entry.id))
      && labelPlacement(entry.role, screenRadius, entry.node.text, false, options.hasIcon?.(entry), INSIDE_ESTIMATE, true, countWidth) !== 'inside') {
      continue;
    }

    let direction = BELOW;
    let fromCenter = 0;
    let offset = 0;
    let lines: 1 | 2 = 1;
    let width = 0;
    const icon = placement === 'outside' ? options.pillIcon?.(entry) : undefined;
    const text = icon ? `${icon} ${entry.node.text}`.trim() : entry.node.text;

    if (placement === 'outside') {
      const sides = labelSides(entry, display);
      const previous = options.previousSide?.(entry.id);

      if (previous) {
        sides.sort((left, right) => distance(left, previous) - distance(right, previous));
      }

      const maximumWidth = entry.role === 'sun' ? 280 : 160;
      const pill = measures.pill(entry.role, entry.node);

      const spotFor = (side: Point, lineCount: 1 | 2): Spot => {
        const box = outsideLabelBox(text, point, screenRadius, side, maximumWidth, 0, lineCount, pill);
        const nudge = side.x === 0 ? horizontalNudge(box, point.x, viewport) : 0;
        return { side, offset: nudge, lines: lineCount, box: nudge === 0 ? box : outsideLabelBox(text, point, screenRadius, side, maximumWidth, nudge, lineCount, pill) };
      };

      const coversNode = (box: Box) => discs.some(box, (disc) => disc.id !== entry.id && discOverlapsBox(disc, box));
      const coverCost = (box: Box) => discs.sum(box, (disc) => (disc.id !== entry.id && discOverlapsBox(disc, box) ? disc.cost : 0));
      const coversLabel = (box: Box) => taken.some(box, (other) => overlaps(box, other));
      const isFree = ({ box }: Spot) => insideViewport(box, viewport) && !coversLabel(box) && !coversNode(box);
      const spots = sides.map((side) => spotFor(side, 1));
      // A pill too wide for every side tries again on two lines, narrower.
      let wrapped: Spot[] | undefined;
      const wrappedSpots = () => (wrapped ??= canWrap(text, pill) ? sides.map((side) => spotFor(side, 2)) : []);
      let spot = spots.find(isFree) ?? wrappedSpots().find(isFree);

      if (!spot && entry.role === 'sun') {
        // The focused node always says what it is, even over its neighbors…
        spot = spots.find(({ box }) => insideViewport(box, viewport)) ?? spots[0];
      } else if (!spot && entry.role === 'planet') {
        // …and so does each planet: over as few nodes as it can, never over another label.
        let cheapest = Infinity;

        for (const candidate of [...spots, ...wrappedSpots()]) {
          if (insideViewport(candidate.box, viewport) && !coversLabel(candidate.box)) {
            const cost = coverCost(candidate.box);

            if (cost < cheapest) {
              spot = candidate;
              cheapest = cost;
            }
          }
        }
      }

      if (!spot) {
        continue;
      }

      direction = spot.side;
      offset = spot.offset;
      lines = spot.lines;
      width = spot.box.right - spot.box.left;
      fromCenter = pillDistance(screenRadius, direction, width, lines);
      taken.add(spot.box, spot.box);
    }

    planned.push({ entry, x: point.x, y: point.y, screenRadius, placement, direction, distance: fromCenter, offset, lines, width, opacity, text, countWidth });
  }

  return planned;
};

/**
 * The sides a node's pill may go, best first. Toward the parent is usually
 * free (a planet's moons and a branch's children sit on the far side); a
 * leaf in the overview has its far side free too. Moons look away from
 * their planet. Below and above are the fallbacks.
 */
export const labelSides = (entry: DisplayNode, display: Display): Point[] => {
  const parent = entry.parentId === undefined ? undefined : display.nodes.get(entry.parentId);
  const length = parent ? Math.hypot(parent.x - entry.x, parent.y - entry.y) : 0;

  if (!parent || length < 1e-6) {
    return [BELOW, ABOVE];
  }

  const inward = { x: (parent.x - entry.x) / length, y: (parent.y - entry.y) / length };
  const outward = { x: -inward.x, y: -inward.y };

  if (entry.role === 'moon') {
    return [outward];
  }

  const isLeaf = entry.node.children.length === 0 || entry.hiddenChildren >= entry.node.children.length;
  return isLeaf && entry.role === 'node' ? [outward, inward, BELOW, ABOVE] : [inward, BELOW, ABOVE, outward];
};

/**
 * Where an outside label will be, from its text's width in `measure` (by
 * default, an estimate), slid `offset` pixels sideways, on `lines` lines.
 * The pill is drawn no bigger than this box: its width holds the text, the
 * pill's padding (16 px) and 2 px to spare, and the stylesheet counts the
 * padding in a pill's width, capped at the same 160 px (280 px for the
 * focused node).
 */
export const outsideLabelBox = (text: string, point: Point, screenRadius: number, direction: Point, maximumWidth: number, offset = 0, lines: 1 | 2 = 1, measure: TextMeasure = PILL_ESTIMATE): Box => {
  const width = Math.min(maximumWidth, pillTextWidth(text, lines, measure) + 18);
  const height = PILL_HEIGHT[lines];
  const distance = pillDistance(screenRadius, direction, width, lines);
  const centerX = point.x + direction.x * (distance + width / 2) + offset;
  const centerY = point.y + direction.y * (distance + height / 2);
  return { left: centerX - width / 2, right: centerX + width / 2, top: centerY - height / 2, bottom: centerY + height / 2 };
};

/** The room (px) between a node's edge and its pill. */
const PILL_GAP = 5;

/** A pill's height (px) on one line and on two: the stylesheet's, and a little to spare. */
const PILL_HEIGHT = { 1: 21, 2: 35 } as const;

/** How round a pill's corners are (px): half a one-line pill's height (the stylesheet rounds two-line pills by 11 px). */
const PILL_CORNER = 10.5;

/**
 * How far from its node's center a pill toward `direction` sits. A pill is
 * placed by its point that matches its side: the middle of its top when it's
 * below the node, the middle of its left end when it's to the right, and on a
 * slant a point between them, inside the pill. That point sits past the node's
 * edge by the gap, which keeps a pill on a side clear of its node, but on a
 * slant the pill's nearest end would reach back over it: there the pill sits
 * farther out, as far as that end keeps the same gap.
 */
export const pillDistance = (screenRadius: number, direction: Point, width: number, lines: 1 | 2): number => {
  const gap = screenRadius + PILL_GAP;
  const corner = Math.min(PILL_CORNER, width / 2);
  const x = Math.abs(direction.x);
  const y = Math.abs(direction.y);
  // Placed `distance` from the node's center, the pill has the center of its nearest corner's rounding
  // `distance * x - backX` across and `distance * y - backY` up or down from the node's center. It keeps
  // the gap while that point keeps the gap and the rounding from the node's center (or, once the pill
  // reaches across the node's middle, while its straight side does).
  const backX = ((1 - x) * width) / 2 - corner;
  const backY = ((1 - y) * PILL_HEIGHT[lines]) / 2 - corner;
  const clearance = gap + corner;

  if (keepsClear(gap, x, y, backX, backY, clearance)) {
    return gap;
  }

  // Otherwise it first keeps the gap where its rounded corner does, where its top or bottom does (a wide
  // pill across the node's middle) or where its end does: the nearest of these that keeps it.
  const along = backX * x + backY * y;
  const cornerDistance = along + Math.sqrt(Math.max(0, along * along + clearance * clearance - backX * backX - backY * backY));
  const sideDistance = y > 0 ? (clearance + backY) / y : Infinity;
  const endDistance = x > 0 ? (clearance + backX) / x : Infinity;
  let distance = Infinity;

  if (keepsClear(cornerDistance, x, y, backX, backY, clearance)) {
    distance = cornerDistance;
  }

  if (sideDistance < distance && keepsClear(sideDistance, x, y, backX, backY, clearance)) {
    distance = sideDistance;
  }

  if (endDistance < distance && keepsClear(endDistance, x, y, backX, backY, clearance)) {
    distance = endDistance;
  }

  // One of them always does, give or take rounding.
  return Number.isFinite(distance) ? distance : gap;
};

/** Whether a pill `distance` from its node's center keeps the gap, give or take a thousandth of a pixel (see `pillDistance`). */
const keepsClear = (distance: number, x: number, y: number, backX: number, backY: number, clearance: number): boolean => {
  return Math.hypot(Math.max(0, distance * x - backX), Math.max(0, distance * y - backY)) >= clearance - 0.001;
};

/** The size (px) of a pill's text, as the stylesheet sets it. */
const PILL_FONT_SIZE = 11.5;

interface PillMeasure {
  /** The text's width on one line (px). */
  oneLine: number;

  /** The longer line's width when the text breaks where its two lines balance best. */
  twoLines: number;

  /** Whether the text can break onto a second line: at a space, or between CJK characters. */
  wraps: boolean;
}

/**
 * Pill measurements by font and text. Labels are planned every frame while
 * the map moves, but their text rarely changes, and measuring it means
 * splitting it into characters.
 */
const pillMeasures = new Map<string, PillMeasure>();
/** More texts than the largest maps have; past it, the measurements start over. */
const PILL_MEASURES_LIMIT = 20000;

// Measurements start over when a font finishes loading.
onMeasurementsReset(() => pillMeasures.clear());

const measurePill = (text: string, measure: TextMeasure): PillMeasure => {
  const key = `${measure.key}\n${text}`;
  const cached = pillMeasures.get(key);

  if (cached) {
    return cached;
  }

  const width = (part: string) => measure.ems(part, PILL_FONT_SIZE) * PILL_FONT_SIZE;
  const oneLine = width(text);
  const units = breakUnits(text);
  let twoLines = oneLine;

  for (let index = 1; index < units.length; index += 1) {
    const first = width(joinUnits(units.slice(0, index)));
    const second = width(joinUnits(units.slice(index)));
    twoLines = Math.min(twoLines, Math.max(first, second));
  }

  if (pillMeasures.size >= PILL_MEASURES_LIMIT) {
    pillMeasures.clear();
  }

  const measured = { oneLine, twoLines, wraps: units.length > 1 };
  pillMeasures.set(key, measured);
  return measured;
};

const canWrap = (text: string, measure: TextMeasure): boolean => {
  return measurePill(text, measure).wraps;
};

/** A pill's text width (px): on two lines, its longer line when it breaks where the two balance best. Estimated, unless `measure` measures it. */
export const pillTextWidth = (text: string, lines: 1 | 2, measure: TextMeasure = PILL_ESTIMATE): number => {
  const measured = measurePill(text, measure);
  return lines === 1 ? measured.oneLine : measured.twoLines;
};

/** Side of a cell of the grid that finds what a label spot covers (px). */
const GRID_CELL = 64;
/** The grid reaches a little past the map's edges, so boxes along them fall in its cells. */
const GRID_MARGIN = 8;

/**
 * Items bucketed by where their boxes sit on the map, so a label spot only
 * checks the bodies and labels near it. Only the map (and its margin) is
 * covered: spots are checked against it only when they fit on the map.
 */
class ScreenGrid<Item> {
  private readonly cells = new Map<number, Item[]>();
  private readonly columns: number;
  private readonly rows: number;
  private readonly seen = new Set<Item>();

  constructor(viewport: Viewport) {
    this.columns = Math.max(1, Math.ceil((viewport.width + 2 * GRID_MARGIN) / GRID_CELL));
    this.rows = Math.max(1, Math.ceil((viewport.height + 2 * GRID_MARGIN) / GRID_CELL));
  }

  add(item: Item, box: Box): void {
    this.visitCells(box, (key) => {
      const cell = this.cells.get(key);

      if (cell) {
        cell.push(item);
      } else {
        this.cells.set(key, [item]);
      }

      return false;
    });
  }

  /** Whether `test` holds for any item near `box`. */
  some(box: Box, test: (item: Item) => boolean): boolean {
    return this.visitCells(box, (key) => this.cells.get(key)?.some(test) ?? false);
  }

  /** The sum of `value` over the items near `box`, each counted once. */
  sum(box: Box, value: (item: Item) => number): number {
    let total = 0;
    this.seen.clear();

    this.visitCells(box, (key) => {
      for (const item of this.cells.get(key) ?? []) {
        if (!this.seen.has(item)) {
          this.seen.add(item);
          total += value(item);
        }
      }

      return false;
    });

    return total;
  }

  /** Calls `visit` with each cell `box` touches, until it returns true. */
  private visitCells(box: Box, visit: (key: number) => boolean): boolean {
    const firstColumn = Math.max(0, Math.floor((box.left + GRID_MARGIN) / GRID_CELL));
    const lastColumn = Math.min(this.columns - 1, Math.floor((box.right + GRID_MARGIN) / GRID_CELL));
    const firstRow = Math.max(0, Math.floor((box.top + GRID_MARGIN) / GRID_CELL));
    const lastRow = Math.min(this.rows - 1, Math.floor((box.bottom + GRID_MARGIN) / GRID_CELL));

    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        if (visit(row * this.columns + column)) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * How far a pill above or below a node near the edge slides sideways to
 * stay on the map, as long as it still reaches past the node's center.
 */
const horizontalNudge = (box: Box, nodeX: number, viewport: Viewport): number => {
  const shift = box.left < 0 ? -box.left : box.right > viewport.width ? viewport.width - box.right : 0;
  const left = box.left + shift;
  const right = box.right + shift;
  return nodeX >= left + NUDGE_REACH && nodeX <= right - NUDGE_REACH ? shift : 0;
};

const isOffScreen = (point: Point, radius: number, viewport: Viewport): boolean => {
  return point.x + radius < -OFF_SCREEN_MARGIN || point.x - radius > viewport.width + OFF_SCREEN_MARGIN
    || point.y + radius < -OFF_SCREEN_MARGIN || point.y - radius > viewport.height + OFF_SCREEN_MARGIN;
};

/** How far (px) a label box may reach past the map's edges: boxes are worked out in fractions of a pixel. */
const ROUNDING = 0.5;

/** Whether a label box fits on the map, all of it: a pill is drawn as wide as its box, or narrower. */
const insideViewport = (box: Box, viewport: Viewport): boolean => {
  return box.left >= -ROUNDING && box.top >= -ROUNDING && box.right <= viewport.width + ROUNDING && box.bottom <= viewport.height + ROUNDING;
};

const overlaps = (first: Box, second: Box): boolean => {
  return first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom;
};

const discOverlapsBox = (disc: Point & { radius: number }, box: Box): boolean => {
  const nearestX = Math.min(box.right, Math.max(box.left, disc.x));
  const nearestY = Math.min(box.bottom, Math.max(box.top, disc.y));
  const dx = disc.x - nearestX;
  const dy = disc.y - nearestY;
  return dx * dx + dy * dy < disc.radius * disc.radius;
};

const distance = (first: Point, second: Point): number => {
  return Math.hypot(first.x - second.x, first.y - second.y);
};
