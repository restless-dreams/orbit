/** Maps as the renderer takes them: documents or trees, compared, checked and carried over between renders. */

import { documentSource, setDocumentSource, type NodeRecord } from '../document-source.js';
import { OrbitWords } from '../languages.js';
import { hasMediaSource } from '../media.js';
import type { OrbitDocument, OrbitNode } from '../types.js';
import type { EditorText } from '../ui/inline-editor.js';

/** The field's text for a new idea under `parent`. */
export const newIdeaText = (parent: OrbitNode, words: OrbitWords): EditorText => {
  return { label: words.text('newIdeaFor', { name: parent.text || words.text('thisIdea') }), placeholder: words.text('newIdea'), enterKey: 'next' };
};

export const sameValues = (first: unknown, second: unknown): boolean => {
  if (first === second) {
    return true;
  }

  if (!first || !second || typeof first !== 'object' || typeof second !== 'object') {
    return false;
  }

  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  return firstKeys.length === secondKeys.length
    && firstKeys.every((key) => sameValues((first as Record<string, unknown>)[key], (second as Record<string, unknown>)[key]));
};

/** Says how to call an editing method that got something other than an object. */
export const expectObject = (method: string, value: unknown, example: string): void => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${method}() takes the node's text and attributes as an object, like ${example}, but got ${value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value}.`);
  }
};

/** Whether two trees hold the same map: the same nodes, ids and attributes, wherever their source wrote them. */
export const sameTree = (first: OrbitNode, second: OrbitNode): boolean => {
  const attributes = (node: OrbitNode): Record<string, unknown> =>
    Object.fromEntries(Object.entries(node).filter(([key, value]) => key !== 'source' && key !== 'children' && value !== undefined));
  return sameValues(attributes(first), attributes(second))
    && first.children.length === second.children.length
    && first.children.every((child, index) => sameTree(child, second.children[index]));
};

/**
 * Moves where a fresh parse of the same map came from onto the tree as drawn:
 * each node's own place, and the source itself (keyed by node, see
 * `documentSource`), so saving writes the new text against the nodes the map
 * already shows.
 */
export const transplantSource = (kept: OrbitNode, fresh: OrbitNode): void => {
  const pairs = new Map<OrbitNode, OrbitNode>();

  const pair = (keptNode: OrbitNode, freshNode: OrbitNode): void => {
    pairs.set(freshNode, keptNode);
    keptNode.source = freshNode.source;
    freshNode.children.forEach((child, index) => pair(keptNode.children[index], child));
  };

  pair(kept, fresh);
  const source = documentSource({ root: fresh });

  if (!source) {
    return;
  }

  const records = new WeakMap<OrbitNode, NodeRecord>();

  for (const [freshNode, keptNode] of pairs) {
    const record = source.records.get(freshNode);

    if (record) {
      records.set(keptNode, { ...record, children: record.children.map((child) => pairs.get(child) ?? child) });
    }
  }

  setDocumentSource({ root: kept }, {
    ...source,
    root: kept,
    records,
    owners: source.owners.map((owner) => (owner === null ? null : (pairs.get(owner) ?? owner))),
  });
};

/** An object's entries that have a value. */
export const definedEntries = (value: object): Record<string, unknown> => {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
};

export const isOrbitDocument = (input: OrbitNode | OrbitDocument): input is OrbitDocument => {
  return typeof (input as OrbitDocument).root === 'object' && (input as OrbitDocument).root !== null && !('children' in input);
};

export const isEmptyTree = (tree: OrbitNode): boolean => {
  return tree.text.trim() === '' && !tree.icon && tree.children.length === 0
    && !hasMediaSource(tree.image) && !hasMediaSource(tree.video) && !hasMediaSource(tree.embed);
};
