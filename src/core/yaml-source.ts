/**
 * Where a YAML document written for a newer version of the format came
 * from: its text, and each node's entry as written. This version can't read
 * all of such a map (see `upgradeFormat`), so saving it starts from what was
 * written: unchanged, the text comes back as it was, and after edits only
 * the entries they changed are written again.
 */

import type { OrbitDocument, OrbitDocumentOptions, OrbitNode } from './types.js';
import type { YamlValue } from './yaml-mini.js';
import { nodeFields, type NodeFields } from './document-source.js';
import { nodesWithExplicitIds } from './utils.js';

export interface YamlNodeRecord {
  /** Its entry as written: a map, or plain text. None for a root Orbit made up for several top-level nodes. */
  entry: YamlValue | undefined;

  /** The keys its text and children were read from: `text` and `children`, or the synonyms that stood in for them. */
  textKey: string;

  childrenKey: string;

  /** Its own fields as read, and whether its id was written, to tell which ones changed. */
  fields: NodeFields;

  explicitId: boolean;

  /** Its children as read, in their order. */
  children: OrbitNode[];
}

export interface YamlSource {
  /** The text as it was given, written back while nothing changes. */
  text: string;

  /** The document's top-level map, as read. */
  map: Record<string, YamlValue>;

  root: OrbitNode;
  records: WeakMap<OrbitNode, YamlNodeRecord>;

  /** The options and the top-level keys Orbit doesn't read, as read, to tell which ones changed. */
  options: OrbitDocumentOptions;

  extra: Record<string, unknown>;
}

/** Where a node's text and children were read from, noted while the tree is built. */
export interface YamlEntry {
  raw: unknown;
  textKey: string;
  childrenKey: string;
}

/**
 * What this version couldn't read of an idea's entry, and so can't write
 * again without losing it: its ideas (a newer version's map of them, say),
 * its text (a map), or the whole entry (a list).
 */
export interface UnreadParts {
  entry: boolean;
  children: boolean;
  text: boolean;
}

export const unreadParts = (source: YamlSource | undefined, node: OrbitNode): UnreadParts => {
  const record = source?.records.get(node);
  const entry = record?.entry;

  if (record === undefined || entry === undefined) {
    // A root Orbit made up, for no ideas it could read: what's written in their place is its ideas.
    const nodes = source !== undefined && node === source.root ? source.map.nodes : undefined;
    return { entry: false, children: nodes !== undefined && nodes !== null && !Array.isArray(nodes), text: false };
  }

  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { entry: Array.isArray(entry), children: false, text: false };
  }

  const children = entry[record.childrenKey];
  const text = entry[record.textKey];
  return {
    entry: false,
    children: children !== undefined && children !== null && !Array.isArray(children),
    text: text !== null && typeof text === 'object',
  };
};

/** Sources by the root of the tree read from them, as markdown's are (see `documentSource`). */
const SOURCES = new WeakMap<OrbitNode, YamlSource>();

/** The source a document's tree was read from, when it was read from YAML written for a newer format. */
export const yamlSource = (document: Pick<OrbitDocument, 'root'>): YamlSource | undefined => {
  const source = SOURCES.get(document.root);
  return source?.root === document.root ? source : undefined;
};

/** Remembers where a document's tree came from (see `yamlSource`). */
export const setYamlSource = (document: Pick<OrbitDocument, 'root'>, source: YamlSource): void => {
  SOURCES.set(document.root, source);
};

/**
 * The source of a document just read: copies of what was written and of
 * what was read from it, deep enough that edits to the document don't
 * reach them. `entries` are the nodes' entries as the parser met them.
 */
export const recordYamlSource = (
  text: string,
  map: Record<string, unknown>,
  root: OrbitNode,
  entries: ReadonlyMap<OrbitNode, YamlEntry>,
  options: OrbitDocumentOptions,
  extra: Record<string, unknown>,
): YamlSource => {
  const copies = new Map<object, YamlValue>();
  const copiedMap = copyValue(map, copies) as Record<string, YamlValue>;
  const explicitIds = nodesWithExplicitIds(root);
  const records = new WeakMap<OrbitNode, YamlNodeRecord>();

  const record = (node: OrbitNode): void => {
    const entry = entries.get(node);
    const raw = entry?.raw;
    records.set(node, {
      entry: raw !== null && typeof raw === 'object' ? copies.get(raw) : raw as YamlValue | undefined,
      textKey: entry?.textKey ?? 'text',
      childrenKey: entry?.childrenKey ?? 'children',
      fields: nodeFields(node),
      explicitId: explicitIds.has(node),
      children: [...node.children],
    });
    node.children.forEach(record);
  };

  record(root);
  return {
    text,
    map: copiedMap,
    root,
    records,
    options: copyValue(options, new Map()) as OrbitDocumentOptions,
    extra: copyValue(extra, new Map()) as Record<string, unknown>,
  };
};

/** A copy of a value read from YAML; `copies` gets each object's copy. Keys like `__proto__` stay keys. */
const copyValue = (value: unknown, copies: Map<object, YamlValue>): YamlValue => {
  if (value === null || typeof value !== 'object') {
    return value as YamlValue;
  }

  const copy: YamlValue = Array.isArray(value)
    ? value.map((item) => copyValue(item, copies))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item, copies)]));
  copies.set(value, copy);
  return copy;
};
