/**
 * Changes to a map's tree, behind the renderer's `addNode`, `updateNode`,
 * `removeNode` and `moveNode`, and the map tools, which make them on a map
 * that isn't drawn too. Ids follow the parsers' rules, so a map saved with
 * `toMarkdown()` reads back with the same ids. Given the palette's rules,
 * each change keeps the colors of the top-level nodes it doesn't change
 * (see `keepBranchColors`).
 */

import type { OrbitNewNode, OrbitNode, OrbitNodeInput } from './types.js';
import { branchColorsBefore, keepBranchColors, type BranchColorRules } from './branch-colors.js';
import { mediaWithExtras, unreadAttributes } from './node-attributes.js';
import { readNodeInput } from './node-input.js';
import { findIndexedLinkedNode, indexNodes, nodeLinksOf } from './node-links.js';
import { findNodeById, getNodePath, nodeSlug, setParent } from './utils.js';
import { documentSource } from './document-source.js';
import { unreadParts, yamlSource } from './yaml-source.js';
import { ideaName, isNewerFormat, newerFormatError } from './format-upgrades.js';

/** The attributes `addNode` and `updateNode` set, in the order nodes list them. */
const ATTRIBUTE_KEYS = [
  'icon', 'color', 'paletteColor', 'status', 'priority', 'tags', 'collapsed', 'type', 'typeVersion', 'link', 'note', 'noteFormat', 'image', 'video', 'audio', 'embed', 'attrs',
] as const satisfies readonly Exclude<keyof OrbitNodeInput, 'text'>[];

/** The attributes that are a file's, whose fields Orbit doesn't read are kept through edits (see `mediaWithExtras`). */
const MEDIA_KEYS: ReadonlySet<string> = new Set(['image', 'video', 'audio', 'embed']);

/** Every id in the tree. */
export const nodeIds = (root: OrbitNode): Set<string> => {
  const ids = new Set<string>();

  const visit = (node: OrbitNode): void => {
    ids.add(node.id);

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
  return ids;
};

/** `base` when no node has it, otherwise `base-2`, `base-3`…, the way the parsers number repeated titles. */
export const uniqueId = (base: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(base)) {
    return base;
  }

  let suffix = 2;

  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
};

/**
 * A new node with `input`'s text, attributes and children, each with an id
 * from its text that no node in `taken` has, numbered in reading order as
 * the parsers number repeated titles.
 */
export const createNode = (input: OrbitNewNode, taken: ReadonlySet<string>): OrbitNode => {
  const ids = new Set(taken);

  const create = (entry: OrbitNewNode): OrbitNode => {
    const node: OrbitNode = { id: '', text: '', level: 0, children: [] };
    const read = readNodeInput(entry);
    assignAttributes(node, { ...read, text: read.text ?? '' });
    node.id = uniqueId(nodeSlug(node.text), ids);
    ids.add(node.id);
    node.children = (entry.children ?? []).map(create);
    return node;
  };

  return create(input);
};

/** What `createNode` takes to add a copy of `node`: its text, attributes and children, without its id or its place in a source. */
export const newNodeFrom = (node: OrbitNode): OrbitNewNode => {
  const copy: OrbitNewNode = { text: node.text };
  const source = node as unknown as Record<string, unknown>;
  const target = copy as unknown as Record<string, unknown>;

  for (const key of ATTRIBUTE_KEYS) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }

  if (node.children.length > 0) {
    copy.children = node.children.map(newNodeFrom);
  }

  return copy;
};

/**
 * Sets the text and attributes `changes` names, read by `readNodeInput`. An
 * attribute set to `undefined` is removed.
 */
export const assignAttributes = (node: OrbitNode, changes: OrbitNodeInput): void => {
  if (typeof changes.text === 'string') {
    // A title is one line: a line break would end the heading in the saved map.
    node.text = changes.text.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  }

  const target = node as unknown as Record<string, unknown>;

  for (const key of ATTRIBUTE_KEYS) {
    if (!(key in changes)) {
      continue;
    }

    const value: unknown = changes[key];

    if (value === undefined) {
      delete target[key];
    } else if (Array.isArray(value)) {
      target[key] = [...value];
    } else if (MEDIA_KEYS.has(key) && typeof value === 'object' && value !== null) {
      target[key] = mediaWithExtras(value, target[key]);
    } else if (typeof value === 'object' && value !== null) {
      target[key] = { ...value };
    } else {
      target[key] = value;
    }
  }
};

/**
 * Whether the node's id was made from its text, as the parsers make ids,
 * rather than set with an `id` attribute: `research`, or `research-2` for
 * a second "Research". Suffixes start at 2 (the parsers never make `-1`),
 * so a hand-set `foo-1` is explicit.
 */
export const hasTextId = (node: OrbitNode): boolean => {
  const base = nodeSlug(node.text);

  if (node.id === base) {
    return true;
  }

  const suffix = node.id.startsWith(`${base}-`) ? node.id.slice(base.length + 1) : '';
  return /^[1-9]\d*$/.test(suffix) && Number(suffix) >= 2;
};

/** Whether a link in the map, a node's link or one in a note, points at `node`. */
export const isLinkedTo = (root: OrbitNode, node: OrbitNode): boolean => {
  const nodes = indexNodes(root);
  const visit = (current: OrbitNode): boolean =>
    nodeLinksOf(current).some((href) => findIndexedLinkedNode(nodes, href) === node) || current.children.some(visit);
  return visit(root);
};

/** Puts `node` among `parent`'s children at `index` (clamped; default last), with its levels and parent links. */
export const insertChild = (parent: OrbitNode, node: OrbitNode, parentLevel: number, index?: number): void => {
  const count = parent.children.length;
  const position = index === undefined || !Number.isFinite(index) ? count : Math.min(count, Math.max(0, Math.trunc(index)));
  parent.children.splice(position, 0, node);
  place(node, parent, parentLevel + 1);
};

/** Sets `level` through a subtree, and each node's link to its parent. */
const place = (node: OrbitNode, parent: OrbitNode, level: number): void => {
  setParent(node, parent);
  node.level = level;

  for (const child of node.children) {
    place(child, node, level + 1);
  }
};

/** Takes `node` out of `parent`'s children. */
export const detachChild = (parent: OrbitNode, node: OrbitNode): void => {
  const index = parent.children.indexOf(node);

  if (index !== -1) {
    parent.children.splice(index, 1);
  }

  setParent(node, undefined);
};

/** Whether `root` is the tree of a map read from a file written for a newer format: edits mustn't lose what this version can't read of it. */
const isNewerMap = (root: OrbitNode): boolean => {
  const markdown = documentSource({ root });
  return yamlSource({ root }) !== undefined || (markdown !== undefined && isNewerFormat(markdown.options));
};

/**
 * Refuses, before anything changes, ideas added or moved under `parent` in a
 * map written for a newer format, when its ideas are written in a form this
 * version can't read: writing the new ones would lose them.
 */
const refuseIdeasUnder = (root: OrbitNode, parent: OrbitNode): void => {
  const parts = isNewerMap(root) ? unreadParts(yamlSource({ root }), parent) : undefined;

  if (parts?.children) {
    throw newerFormatError(`${ideaName(parent)}'s ideas are`, 'adding one would lose them');
  }

  if (parts?.entry) {
    throw newerFormatError(`${ideaName(parent)} is`, 'adding ideas under it would lose it');
  }
};

/**
 * Refuses, before anything changes, a change to what this version couldn't
 * read of `node` in a map written for a newer format: new text for text it
 * can't read, a new value for an attribute whose value it couldn't read, or
 * any change to an idea written in a form it can't read. Taking a value
 * away loses nothing it was asked to keep: removing one, as removing an idea,
 * is the edit.
 */
const refuseChanges = (root: OrbitNode, node: OrbitNode, changes: OrbitNodeInput): void => {
  if (!isNewerMap(root)) {
    return;
  }

  const parts = unreadParts(yamlSource({ root }), node);
  const name = ideaName(node);

  if (parts.entry && Object.keys(changes).length > 0) {
    throw newerFormatError(`${name} is`, 'changing it would lose it');
  }

  if (parts.text && typeof changes.text === 'string') {
    throw newerFormatError(`${name}'s text is`, 'new text would lose it');
  }

  for (const key of unreadAttributes(node.attrs)) {
    const value = (changes as Record<string, unknown>)[key];
    const inAttrs = changes.attrs?.[key];

    if (value !== undefined || (inAttrs !== undefined && JSON.stringify(inAttrs) !== JSON.stringify(node.attrs?.[key]))) {
      throw newerFormatError(`${name}'s ${key} is`, `a new ${key} would lose it`);
    }
  }
};

/** Adds `input`, with its children, under `parentId` at `index` among its children (default: last). Null when there's no such parent. */
export const addToTree = (root: OrbitNode, parentId: string, input: OrbitNewNode, index?: number, colors?: BranchColorRules): { node: OrbitNode; parent: OrbitNode } | null => {
  const path = getNodePath(root, parentId);

  if (path.length === 0) {
    return null;
  }

  const parent = path[path.length - 1];
  refuseIdeasUnder(root, parent);
  const before = colors && branchColorsBefore(root, colors);
  const node = createNode(input, nodeIds(root));
  insertChild(parent, node, path.length - 1, index);

  if (colors && before) {
    keepBranchColors(root, before, colors, { node, keepsColor: false });
  }

  return { node, parent };
};

/**
 * Sets the text and attributes `changes` names on `id`. New text gives the
 * node a new id when its id came from its text and no link points at it,
 * so the saved map needs no id attribute. Null when there's no such node.
 */
export const updateInTree = (root: OrbitNode, id: string, changes: OrbitNodeInput, colors?: BranchColorRules): { node: OrbitNode; previousId: string } | null => {
  const node = findNodeById(root, id);

  if (!node) {
    return null;
  }

  // Every value is read before any changes: one Orbit can't read throws with the node as it was.
  const read = readNodeInput(changes);
  refuseChanges(root, node, read);
  const previousId = node.id;
  const previousText = node.text;
  const textId = typeof read.text === 'string' && hasTextId(node);
  const before = colors && branchColorsBefore(root, colors);
  assignAttributes(node, read);

  // Links are looked at once the changes are made: a link they add, to the node itself too, keeps the id it names.
  if (textId && node.text !== previousText && !isLinkedTo(root, node)) {
    const taken = nodeIds(root);
    taken.delete(node.id);
    node.id = uniqueId(nodeSlug(node.text), taken);
  }

  if (colors && before) {
    keepBranchColors(root, before, colors, { node, keepsColor: false });
  }

  return { node, previousId };
};

/** Takes `id` and everything under it out of the tree. Null when there's no such node, or for the root. */
export const removeFromTree = (root: OrbitNode, id: string, colors?: BranchColorRules): { node: OrbitNode; parent: OrbitNode } | null => {
  const path = getNodePath(root, id);

  if (path.length < 2) {
    return null;
  }

  const node = path[path.length - 1];
  const parent = path[path.length - 2];
  const before = colors && branchColorsBefore(root, colors);
  detachChild(parent, node);

  if (colors && before) {
    keepBranchColors(root, before, colors);
  }

  return { node, parent };
};

/**
 * Moves `id`, with everything under it, under `parentId` at `index` among
 * its children (default: last). Null when either node is missing, the node
 * is the root, or `parentId` is inside it.
 */
export const moveInTree = (root: OrbitNode, id: string, parentId: string, index?: number, colors?: BranchColorRules): { node: OrbitNode; from: OrbitNode; to: OrbitNode } | null => {
  const path = getNodePath(root, id);
  const parentPath = getNodePath(root, parentId);
  const node = path[path.length - 1];

  if (path.length < 2 || parentPath.length === 0 || parentPath.includes(node)) {
    return null;
  }

  const from = path[path.length - 2];
  const to = parentPath[parentPath.length - 1];
  refuseIdeasUnder(root, to);
  const before = colors && branchColorsBefore(root, colors);
  detachChild(from, node);
  insertChild(to, node, parentPath.length - 1, index);

  if (colors && before) {
    keepBranchColors(root, before, colors, { node, keepsColor: true });
  }

  return { node, from, to };
};
