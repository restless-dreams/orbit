/**
 * Which of the palette's colors each top-level node takes, and how edits
 * keep them. The root takes the palette's first color, and top-level nodes
 * take the others in turn, cycling. A node with a `paletteColor` takes that
 * one instead and gives up its turn, so the nodes after it keep theirs.
 * Edits write a `paletteColor` where a node's turn would change, so adding,
 * moving or removing a node never gives the others new colors.
 */

import type { OrbitNode } from './types.js';

/** A node's own color, or its type's: what it shows instead of the palette's. */
export type OwnColor = (node: OrbitNode) => string | undefined;

/** What an edit needs to keep top-level nodes' colors. */
export interface BranchColorRules {
  /** How many colors top-level nodes take turns with: the palette's, after the root's (see `branchPalette`). */
  count: number;

  /** A node's own color or its type's, which it shows instead of the palette's. Default: its `color`. */
  ownColor?: OwnColor;
}

/** Each top-level node's palette number before an edit, from `branchColorsBefore`. */
export type BranchColors = Map<OrbitNode, number>;

/** The node an edit was about, for `keepBranchColors`. */
export interface EditedBranch {
  node: OrbitNode;

  /** Whether the node keeps the color it had (a move), rather than taking one no other top-level node has (a new node). */
  keepsColor: boolean;
}

/** The colors top-level nodes take turns with: every palette color after the root's, or the only one. */
export const branchPalette = (palette: readonly string[]): string[] => {
  return palette.length > 1 ? palette.slice(1) : [...palette];
};

/** Whether a value is a palette number: a whole number from 1. */
export const isPaletteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
};

/** The color a palette number names among `colors` (from `branchPalette`), cycling. */
export const paletteColorOf = (colors: readonly string[], paletteNumber: number): string => {
  return colors[(paletteNumber - 1) % colors.length];
};

/** A palette number brought into 1 to `count`, cycling. */
const wrapped = (paletteNumber: number, count: number): number => {
  return ((paletteNumber - 1) % count) + 1;
};

/**
 * The palette number each of `branches` takes its color from: its
 * `paletteColor`, or else the next number in turn that none of them has as
 * its `paletteColor`. Nodes with a color or type of their own take a turn
 * too, so the nodes after them have the colors they'd have without one.
 */
export const branchNumbers = (branches: readonly OrbitNode[], count: number): Map<OrbitNode, number> => {
  const numbers = new Map<OrbitNode, number>();
  const taken = new Set<number>();

  for (const branch of branches) {
    if (isPaletteNumber(branch.paletteColor)) {
      taken.add(wrapped(branch.paletteColor, count));
    }
  }

  const all = Array.from({ length: count }, (_, index) => index + 1);
  const free = all.filter((paletteNumber) => !taken.has(paletteNumber));
  // With every color taken, turns go round all of them again.
  const turns = free.length > 0 ? free : all;
  let turn = 0;

  for (const branch of branches) {
    if (isPaletteNumber(branch.paletteColor)) {
      numbers.set(branch, wrapped(branch.paletteColor, count));
    } else {
      numbers.set(branch, turns[turn % turns.length]);
      turn += 1;
    }
  }

  return numbers;
};

/** Each top-level node's palette number, to keep through an edit with `keepBranchColors`. */
export const branchColorsBefore = (root: OrbitNode, rules: BranchColorRules): BranchColors => {
  return branchNumbers(root.children, rules.count);
};

/**
 * After an edit, gives every top-level node that was there before the color
 * it had, writing its palette number as its `paletteColor` where its turn
 * changed. The node the edit was about keeps its color when it moved within
 * the top level, takes one no other top-level node has when it's new there
 * (while there is one), and drops its `paletteColor` when it left the top
 * level, to take its new branch's color. Nodes showing a color or type of
 * their own are left as they are, and a `paletteColor` is written only where
 * a color would change otherwise.
 *
 * An edit that would write more numbers than the palette has colors writes
 * none: that happens only where the top level has more nodes than colors,
 * which repeat there anyway, and a big orbit's every node would get one.
 * Returns the nodes it changed.
 */
export const keepBranchColors = (root: OrbitNode, before: BranchColors, rules: BranchColorRules, edited?: EditedBranch): OrbitNode[] => {
  const ownColor = rules.ownColor ?? ((node: OrbitNode) => node.color);
  const branches = root.children;
  const subject = edited?.node;
  const showsPalette = (node: OrbitNode): boolean => ownColor(node) === undefined;
  // The `paletteColor` each pinned node had, to put back.
  const pinned = new Map<OrbitNode, number | undefined>();
  const changed: OrbitNode[] = [];

  const pin = (node: OrbitNode, paletteNumber: number): void => {
    if (!pinned.has(node)) {
      pinned.set(node, node.paletteColor);
    }

    node.paletteColor = paletteNumber;
  };

  // A top-level node whose color would change: one that was there before, isn't the edited one, and shows the palette's color.
  const moving = (numbers: Map<OrbitNode, number>): OrbitNode | undefined => {
    return branches.find((node) => node !== subject && before.has(node) && showsPalette(node) && numbers.get(node) !== before.get(node));
  };

  if (subject && before.has(subject) && !branches.includes(subject) && subject.paletteColor !== undefined) {
    delete subject.paletteColor;
    changed.push(subject);
  }

  if (subject && branches.includes(subject) && showsPalette(subject) && !isPaletteNumber(subject.paletteColor)) {
    const numbers = branchNumbers(branches, rules.count);
    const kept = edited?.keepsColor ? before.get(subject) : undefined;

    if (kept !== undefined) {
      if (numbers.get(subject) !== kept || moving(numbers)) {
        pin(subject, kept);
      }
    } else {
      const others = branches.filter((node) => node !== subject);
      const shared = others.some((node) => showsPalette(node) && numbers.get(node) === numbers.get(subject));

      if (shared || moving(numbers)) {
        // A number none of the others has, alone or in turn, so taking it moves none of them.
        const used = new Set(branchNumbers(others, rules.count).values());
        const unused = Array.from({ length: rules.count }, (_, index) => index + 1).find((paletteNumber) => !used.has(paletteNumber));

        if (unused !== undefined) {
          pin(subject, unused);
        }
      }
    }
  }

  // Each round keeps one more node's color, the first that would change, so the nodes after it often keep theirs without one.
  for (let round = 0; round < branches.length && pinned.size <= rules.count; round += 1) {
    const node = moving(branchNumbers(branches, rules.count));

    if (!node) {
      break;
    }

    pin(node, before.get(node) as number);
  }

  if (pinned.size > rules.count) {
    for (const [node, paletteNumber] of pinned) {
      if (paletteNumber === undefined) {
        delete node.paletteColor;
      } else {
        node.paletteColor = paletteNumber;
      }
    }

    return changed;
  }

  return [...changed, ...pinned.keys()];
};
