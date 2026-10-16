/**
 * Links between nodes. A node's link, or a link in its note, written as
 * `#id` points at another node of the same map, the way `#heading` links
 * point at a heading in a markdown page.
 */

import type { OrbitNode } from './types.js';
import type { DiagnosticCollector } from './diagnostics.js';
import { findNodeById, nodeSlug } from './utils.js';
import { suggest } from './suggest.js';

/** Whether a link points at a node of the same map: `#research`. */
export const isNodeLink = (href: string | undefined): href is string => {
  return typeof href === 'string' && /^#\S/.test(href);
};

/**
 * The node a `#id` link points at: the node with that id, or the one whose
 * id the fragment's text would get, so `#Research` and GitHub-style
 * `#-research` anchors find `research` too.
 */
export const findLinkedNode = (root: OrbitNode, href: string): OrbitNode | null => {
  return resolveNodeLink(href, (id) => findNodeById(root, id));
};

/** `findLinkedNode` with the map's nodes indexed by `indexNodes`, for checking many links at once. */
export const findIndexedLinkedNode = (nodes: Map<string, OrbitNode>, href: string): OrbitNode | null => {
  return resolveNodeLink(href, (id) => nodes.get(id) ?? null);
};

/** The map's nodes by id; when ids repeat, the first in the tree, as `findNodeById` finds it. */
export const indexNodes = (root: OrbitNode): Map<string, OrbitNode> => {
  const nodes = new Map<string, OrbitNode>();

  const visit = (node: OrbitNode): void => {
    if (!nodes.has(node.id)) {
      nodes.set(node.id, node);
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
  return nodes;
};

const resolveNodeLink = (href: string, lookup: (id: string) => OrbitNode | null): OrbitNode | null => {
  if (!isNodeLink(href)) {
    return null;
  }

  let fragment = href.slice(1);

  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    // A malformed escape: look the fragment up as written.
  }

  return lookup(fragment) ?? lookup(nodeSlug(fragment).replace(/^-+|-+$/g, ''));
};

const NOTE_NODE_LINK = /\]\((#[^)\s]+)\)/g;

/** The `#id` links a node has: its link, then the ones in its note. */
export const nodeLinksOf = (node: OrbitNode): string[] => {
  // A plain note never renders its `[x](#y)` as a link, so it isn't one.
  const links = node.noteFormat === 'plain' ? [] : [...(node.note ?? '').matchAll(NOTE_NODE_LINK)].map((match) => match[1]);

  if (isNodeLink(node.link)) {
    links.unshift(node.link);
  }

  return links;
};

/** Where a parser saw a node's link (`inNote` false) or a link in its note: the line it's on, when it knows. */
export type LinkLine = (node: OrbitNode, href: string, inNote: boolean) => number | undefined;

/** Reports each `#id` link, in a node's link or note, that points at no node of the map, on its own line where `lineOf` knows it. */
export const checkNodeLinks = (root: OrbitNode, diagnostics: DiagnosticCollector, lineOf?: LinkLine): void => {
  const ids: string[] = [];
  collectIds(root, ids);
  // Large maps link between their nodes hundreds of times: look ids up, don't search the tree.
  const nodes = indexNodes(root);

  const visit = (node: OrbitNode): void => {
    nodeLinksOf(node).forEach((href, index) => {
      if (!findIndexedLinkedNode(nodes, href)) {
        const suggestion = suggest(href.slice(1), ids);
        const hint = suggestion === undefined ? ' Ids come from the nodes\' text: "Q3 plan" is #q3-plan.' : ` Did you mean #${suggestion}?`;
        const inNote = !(index === 0 && isNodeLink(node.link));
        diagnostics.recover(
          'unknown-link-target',
          `"${node.text}" links to ${href}, but no node has that id.${hint}`,
          lineOf?.(node, href, inNote) ?? node.source?.line,
        );
      }
    });

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
};

const collectIds = (node: OrbitNode, ids: string[]): void => {
  ids.push(node.id);

  for (const child of node.children) {
    collectIds(child, ids);
  }
};
