/**
 * The map as the tools describe it to a model: an outline with each node's
 * id, everything about one node, and search results. Plain text, short on
 * tokens: a line a node, with what an edit needs to know.
 */

import type { OrbitNode } from '../types.js';
import { findIndexedLinkedNode, indexNodes, nodeLinksOf } from '../node-links.js';
import { statusTone } from '../ui/detail-sheet.js';

/** How much of a note an outline shows. */
const NOTE_PREVIEW = 100;
/** How many matches find_nodes lists. */
const MATCH_LIMIT = 50;

/** A node as the tools name it in a sentence: its title and id. */
export const nameOf = (node: OrbitNode): string => {
  return `"${node.text}" #${node.id}`;
};

/** A node's line in an outline: its title, its id, and its attributes. */
export const outlineLine = (node: OrbitNode, depth: number): string => {
  const details = attributesOf(node);
  return `${'  '.repeat(depth)}- ${node.text}  #${node.id}${details.length > 0 ? `  (${details.join('; ')})` : ''}`;
};

const attributesOf = (node: OrbitNode): string[] => {
  const details: string[] = [];

  if (node.icon) {
    details.push(`icon: ${node.icon}`);
  }

  if (node.status) {
    details.push(`status: ${node.status}`);
  }

  if (node.priority !== undefined) {
    details.push(`priority: ${node.priority}`);
  }

  if (node.tags && node.tags.length > 0) {
    details.push(`tags: ${node.tags.join(', ')}`);
  }

  if (node.color) {
    details.push(`color: ${node.color}`);
  }

  if (node.link) {
    details.push(`link: ${node.link}`);
  }

  for (const media of ['image', 'video', 'embed'] as const) {
    if (node[media]) {
      details.push(media);
    }
  }

  if (node.type) {
    details.push(`type: ${node.type}`);
  }

  if (node.collapsed) {
    details.push('collapsed');
  }

  return details;
};

/** The first line of a note, cut short. */
const notePreview = (note: string): string => {
  const text = note.trim().replace(/\s+/g, ' ');
  return text.length > NOTE_PREVIEW ? `${text.slice(0, NOTE_PREVIEW - 1).trimEnd()}…` : text;
};

/** A node's line, and its note's start under it. */
const headOf = (node: OrbitNode, depth: number): string[] => {
  const lines = [outlineLine(node, depth)];

  if (node.note?.trim()) {
    lines.push(`${'  '.repeat(depth + 1)}> ${notePreview(node.note)}`);
  }

  return lines;
};

/** A node and `levels` levels under it as outline lines; what's further down is counted. */
export const outlineOf = (node: OrbitNode, depth = 0, levels = Infinity): string[] => {
  const lines = headOf(node, depth);

  if (levels > 0) {
    for (const child of node.children) {
      lines.push(...outlineOf(child, depth + 1, levels - 1));
    }
  } else if (node.children.length > 0) {
    lines.push(`${'  '.repeat(depth + 1)}- … ${count(node.children.length, 'child', 'children')}, ${count(descendants(node), 'node')} in all under it`);
  }

  return lines;
};

/**
 * The outline read_map gives: `start` and up to `levels` levels under it,
 * as many whole levels as fit in `limit` nodes, so the shape of a big map
 * shows, with what's left out counted. `complete` when nothing asked for
 * was left out.
 */
export const readOutline = (start: OrbitNode, levels: number, limit: number): { lines: string[]; complete: boolean } => {
  let shown = 0;
  let total = 1;
  let level: OrbitNode[] = [start];

  while (shown < levels) {
    const next = level.flatMap((node) => node.children);

    if (next.length === 0 || total + next.length > limit) {
      break;
    }

    total += next.length;
    level = next;
    shown += 1;
  }

  const complete = shown === levels || level.every((node) => node.children.length === 0);

  if (shown === 0 && !complete) {
    // More children than the limit: as many of them as fit.
    const children = start.children.slice(0, Math.max(1, limit - 1));
    return {
      lines: [
        ...headOf(start, 0),
        ...children.flatMap((child) => outlineOf(child, 1, 0)),
        `  - … ${count(start.children.length - children.length, 'more child', 'more children')} of ${nameOf(start)}`,
      ],
      complete,
    };
  }

  return { lines: outlineOf(start, 0, shown), complete };
};

/** How many nodes are under a node, at any depth. */
export const descendants = (node: OrbitNode): number => {
  return node.children.reduce((sum, child) => sum + 1 + descendants(child), 0);
};

/** "1 node", "3 nodes" */
export const count = (amount: number, one: string, many = `${one}s`): string => {
  return `${amount} ${amount === 1 ? one : many}`;
};

/** Everything about a node, for read_node. */
export const nodeDetails = (root: OrbitNode, node: OrbitNode, path: OrbitNode[]): string => {
  const lines = [nameOf(node)];
  lines.push(path.length > 1 ? `Where: ${path.map((step) => step.text).join(' › ')}` : 'Where: the root of the map');
  const fields: [string, unknown][] = [
    ['Icon', node.icon],
    ['Status', node.status],
    ['Priority', node.priority],
    ['Tags', node.tags && node.tags.length > 0 ? node.tags.join(', ') : undefined],
    ['Color', node.color],
    ['Link', node.link],
    ['Picture', node.image && mediaLine(node.image.src, { alt: node.image.alt, caption: node.image.caption })],
    ['Video', node.video && mediaLine(node.video.src, { caption: node.video.caption })],
    ['Embedded page', node.embed && mediaLine(node.embed.src, { caption: node.embed.caption })],
    ['Type', node.type],
    ['Collapsed', node.collapsed ? 'yes: its children are hidden until the reader opens it' : undefined],
  ];

  for (const [label, value] of fields) {
    if (value !== undefined && value !== '') {
      lines.push(`${label}: ${String(value)}`);
    }
  }

  const custom = Object.entries(node.attrs ?? {});

  if (custom.length > 0) {
    lines.push(`Other attributes: ${custom.map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join('; ')}`);
  }

  lines.push(node.note?.trim() ? `Note${node.noteFormat === 'plain' ? ' (plain text)' : ''}:\n${node.note.trim()}` : 'Note: none');
  lines.push(node.children.length > 0 ? `Children (${node.children.length}): ${node.children.map(nameOf).join(', ')}` : 'Children: none');
  const linking = nodesLinkingTo(root, node);

  if (linking.length > 0) {
    lines.push(`Linked from: ${linking.map(nameOf).join(', ')}`);
  }

  return lines.join('\n');
};

const mediaLine = (src: string, extras: Record<string, string | undefined>): string => {
  const described = Object.entries(extras).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`);
  return described.length > 0 ? `${src} (${described.join('; ')})` : src;
};

/** The nodes whose link, or a link in whose note, points at `target`. */
export const nodesLinkingTo = (root: OrbitNode, target: OrbitNode): OrbitNode[] => {
  const nodes = indexNodes(root);
  const linking: OrbitNode[] = [];

  const visit = (node: OrbitNode): void => {
    if (nodeLinksOf(node).some((href) => findIndexedLinkedNode(nodes, href) === target)) {
      linking.push(node);
    }

    node.children.forEach(visit);
  };

  visit(root);
  return linking;
};

/** Text as search compares it: lowercase, without accents. */
export const searchable = (text: string): string => {
  return text.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
};

/** What find_nodes looks for. */
export interface Search {
  query?: string;
  status?: string;
  tag?: string;
}

/** The nodes that match, titles matching first, as find_nodes lists them. */
export const findNodes = (root: OrbitNode, search: Search): string => {
  const words = searchable(search.query ?? '').split(/\s+/).filter((word) => word !== '');
  const status = search.status === undefined ? undefined : searchable(search.status.trim());
  const tag = search.tag === undefined ? undefined : searchable(search.tag.trim().replace(/^#/, ''));

  const statusMatches = (node: OrbitNode): boolean => {
    if (status === undefined) {
      return true;
    }

    if (!node.status) {
      return false;
    }

    const own = searchable(node.status.trim());
    const tone = statusTone(status);
    return own === status || (tone !== 'neutral' && statusTone(own) === tone);
  };

  const matches: { node: OrbitNode; path: OrbitNode[]; inTitle: boolean }[] = [];

  const visit = (node: OrbitNode, path: OrbitNode[]): void => {
    const title = searchable([node.text, ...(node.tags ?? [])].join(' '));
    const everything = `${title} ${searchable(node.note ?? '')}`;

    if (words.every((word) => everything.includes(word))
      && statusMatches(node)
      && (tag === undefined || (node.tags ?? []).some((own) => searchable(own) === tag))) {
      matches.push({ node, path, inTitle: words.every((word) => title.includes(word)) });
    }

    node.children.forEach((child) => visit(child, [...path, node]));
  };

  visit(root, []);

  if (matches.length === 0) {
    return 'No node matches. Try fewer or other words, or read the map with read_map.';
  }

  matches.sort((first, second) => Number(second.inTitle) - Number(first.inTitle));
  const shown = matches.slice(0, MATCH_LIMIT);
  const lines = [`${count(matches.length, 'node matches', 'nodes match')}${matches.length > shown.length ? `; the first ${shown.length}` : ''}:`];

  for (const { node, path } of shown) {
    lines.push(`${outlineLine(node, 0)}${path.length > 0 ? `  in ${path.map((step) => step.text).join(' › ')}` : '  (the root)'}`);
  }

  if (matches.length > shown.length) {
    lines.push('Narrow the search to see the others.');
  }

  return lines.join('\n');
};
