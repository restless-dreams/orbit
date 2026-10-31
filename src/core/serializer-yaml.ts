import type { OrbitDocument, OrbitDocumentOptions, OrbitNode } from './types.js';
import { currentDocumentOptions, DOCUMENT_OPTION_KEYS } from './document-options.js';
import { assignKey, emitYaml, type YamlValue } from './yaml-mini.js';
import { nodesWithExplicitIds } from './utils.js';
import { mediaExtras, motionValue, unreadAttributes } from './node-attributes.js';
import { ideaName, newerFormatError, writtenSchemaVersion } from './format-upgrades.js';
import { nodeFields } from './document-source.js';
import { unreadParts, yamlSource, type YamlNodeRecord, type YamlSource } from './yaml-source.js';
import { parseOrbitYAML } from './parser-yaml.js';
import { UNTITLED_ROOT_ID } from './parser-markdown.js';

/**
 * A map as Orbit's YAML. One read from YAML written for a newer version of
 * the format comes back as it was written, with only what edits changed
 * written again, so everything this version can't read of it is kept; a
 * change that would replace some of that throws, and nothing is written.
 * Other documents are written in Orbit's own form.
 */
export const serializeOrbitYAML = (doc: OrbitDocument): string => {
  const source = yamlSource(doc);
  return source ? patchYaml(doc, source) : writeYaml(doc);
};

/** A map in Orbit's own form. */
const writeYaml = (doc: OrbitDocument): string => {
  const out = documentEntries(doc.options, doc.extra);
  out.nodes = [serializeNode(doc.root, nodesWithExplicitIds(doc.root))];
  return emitYaml(out);
};

/** What Orbit writes before a map's nodes: its options, then the top-level keys Orbit doesn't read. */
const documentEntries = (options: OrbitDocumentOptions, extra: Record<string, unknown> | undefined): Record<string, YamlValue> => {
  const out: Record<string, YamlValue> = {};
  const opts = currentDocumentOptions(options);

  if (opts.title) {
    out.title = opts.title;
  }

  if (opts.theme) {
    out.theme = opts.theme;
  }

  if (opts.view) {
    out.view = opts.view;
  }

  if (opts.showRings !== undefined) {
    out.showRings = opts.showRings;
  }

  if (opts.interactive !== undefined) {
    out.interactive = opts.interactive;
  }

  if (opts.animation !== undefined) {
    out.animation = opts.animation;
  }

  if (opts.speed !== undefined) {
    out.speed = opts.speed;
  }

  if (opts.palette) {
    out.palette = opts.palette as YamlValue;
  }

  if (opts.height !== undefined) {
    out.height = opts.height;
  }

  if (opts.maxDepth !== undefined) {
    out.maxDepth = opts.maxDepth;
  }

  if (opts.className) {
    out.className = opts.className;
  }

  if (opts.baseUrl) {
    out.baseUrl = opts.baseUrl;
  }

  const schemaVersion = writtenSchemaVersion(opts);

  if (schemaVersion !== undefined) {
    out.schemaVersion = schemaVersion;
  }

  // Keys Orbit doesn't read, after its own: as they were written.
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(out, key) && key !== 'nodes') {
      assignKey(out, key, value as YamlValue);
    }
  }

  return out;
};

const serializeNode = (n: OrbitNode, explicitIds: ReadonlySet<OrbitNode>): YamlValue => {
  const obj = nodeEntries(n, explicitIds.has(n));

  if (n.children.length) {
    obj.children = n.children.map((child) => serializeNode(child, explicitIds));
  }

  return obj;
};

/** A node's own entries, as Orbit writes them: everything but its children. */
const nodeEntries = (n: OrbitNode, explicitId: boolean): Record<string, YamlValue> => {
  const obj: Record<string, YamlValue> = { text: n.text };

  if (explicitId) {
    obj.id = n.id;
  }

  if (n.icon) {
    obj.icon = n.icon;
  }

  if (n.color) {
    obj.color = n.color;
  }

  if (n.paletteColor !== undefined) {
    obj.paletteColor = n.paletteColor;
  }

  if (n.type) {
    obj.type = n.typeVersion === undefined ? n.type : `${n.type}@${n.typeVersion}`;
  }

  if (n.link) {
    obj.link = n.link;
  }

  if (n.tags) {
    obj.tags = n.tags;
  }

  if (n.status) {
    obj.status = n.status;
  }

  if (n.priority !== undefined) {
    obj.priority = n.priority;
  }

  if (n.collapsed !== undefined) {
    obj.collapsed = n.collapsed;
  }

  // A picture, video, sound or embed keeps the fields Orbit doesn't read, before its own.
  if (n.image) {
    const { motion, ...image } = n.image;
    // A live photo's motion goes first: versions from before live photos keep it with those fields, which they write there.
    obj.image = { ...(motion === undefined ? {} : { motion: motionValue(motion) }), ...mediaExtras(n.image), ...image } as unknown as YamlValue;
  }

  if (n.video) {
    obj.video = { ...mediaExtras(n.video), ...n.video } as unknown as YamlValue;
  }

  // A sound with nothing but its address is written as the address.
  if (n.audio) {
    obj.audio = n.audio.caption === undefined && mediaExtras(n.audio) === undefined
      ? n.audio.src
      : { ...mediaExtras(n.audio), ...n.audio } as unknown as YamlValue;
  }

  if (n.embed) {
    obj.embed = { ...mediaExtras(n.embed), ...n.embed } as unknown as YamlValue;
  }

  if (n.note) {
    obj.note = n.note;

    if (n.noteFormat && n.noteFormat !== 'markdown') {
      obj.noteFormat = n.noteFormat;
    }
  }

  if (n.attrs) {
    for (const [k, v] of Object.entries(n.attrs)) {
      // A value Orbit couldn't read for one of its own attributes is written back, unless one was set since:
      // it reads back the same way. Keys a node map reads as structure (its
      // text, its children) are never written from attrs: they would reparse
      // as real structure.
      if (!RESERVED_NODE_KEYS.has(k) && !Object.prototype.hasOwnProperty.call(obj, k)) {
        assignKey(obj, k, v as YamlValue);
      }
    }
  }

  return obj;
};

/** Keys `buildNode` reads as the node's structure: a value under them would become a title or children. */
const RESERVED_NODE_KEYS = new Set(['text', 'children']);

/** The media a caption beside them, at the node's level, is read into. */
const CAPTIONED_MEDIA = ['image', 'video', 'embed'];

/**
 * A map read from YAML for a newer version of the format, as it was written
 * but for what edits changed: the options and ideas that changed are written
 * again where they were, and every other entry, what this version can't
 * read included, is kept as written. The text comes back as it was while
 * nothing changes. A change that would replace what this version can't
 * read throws instead, as the editing methods refuse it (see `editing.ts`),
 * and so does a result that wouldn't read as the edited map.
 */
const patchYaml = (document: OrbitDocument, source: YamlSource): string => {
  const { records } = source;
  const explicitIds = nodesWithExplicitIds(document.root);
  // A document without keys of its own keeps the ones its file has, as markdown's do.
  const extra = document.extra ?? source.extra;
  const top = documentEntries(document.options, extra);
  const topAsRead = documentEntries(source.options, source.extra);
  const asRead = (record: YamlNodeRecord) => nodeEntries({ ...record.fields, level: 0, children: [] } as OrbitNode, record.explicitId);
  const sameChildren = (node: OrbitNode, record: YamlNodeRecord): boolean =>
    node.children.length === record.children.length && node.children.every((child, index) => child === record.children[index]);

  const unchanged = (node: OrbitNode): boolean => {
    const record = records.get(node);
    return record !== undefined
      && sameChildren(node, record)
      && JSON.stringify(nodeFields(node)) === JSON.stringify(record.fields)
      && explicitIds.has(node) === record.explicitId
      && node.children.every(unchanged);
  };

  if (sameJson(top, topAsRead) && unchanged(document.root)) {
    return source.text;
  }

  const writeNode = (node: OrbitNode): YamlValue => {
    const record = records.get(node);
    const entries = nodeEntries(node, explicitIds.has(node));
    const written = record?.entry;

    if (record === undefined || !isMap(written)) {
      // Plain text is kept while it says all there is; a new idea is written in Orbit's own form, ideas moved under it in theirs.
      if (record !== undefined && written !== undefined && sameChildren(node, record) && sameJson(asRead(record), entries)) {
        return written;
      }

      if (unreadParts(source, node).entry) {
        throw newerFormatError(`${ideaName(node)} is`, 'writing its changes would lose it', true);
      }

      return node.children.length > 0 ? { ...entries, children: node.children.map(writeNode) } : entries;
    }

    const before = asRead(record);
    const parts = unreadParts(source, node);

    for (const key of [...(parts.text ? ['text'] : []), ...unreadAttributes(record.fields.attrs)]) {
      if (own(entries, key) !== undefined && !sameJson(own(before, key), own(entries, key))) {
        throw newerFormatError(`${ideaName(node)}'s ${key} is`, `writing its new ${key} would lose it`, true);
      }
    }

    const entry = patchedEntries(written, before, entries, (key) => (key === 'text' ? record.textKey : key), record.childrenKey);

    // A caption beside a picture, video or embed is read into it, and written inside it: once one of them changes, all three are written as Orbit writes them.
    if (Object.prototype.hasOwnProperty.call(written, 'caption') && record.fields.attrs?.caption === undefined
      && CAPTIONED_MEDIA.some((key) => !sameJson(before[key], entries[key]))) {
      delete entry.caption;

      for (const key of CAPTIONED_MEDIA) {
        if (entries[key] === undefined) {
          delete entry[key];
        } else {
          entry[key] = entries[key];
        }
      }
    }

    if (!sameChildren(node, record)) {
      if (parts.children) {
        throw newerFormatError(`${ideaName(node)}'s ideas are`, 'writing the ones added under it would lose them', true);
      }

      if (node.children.length === 0) {
        delete entry[record.childrenKey];
      } else {
        entry[record.childrenKey] = node.children.map(writeNode);
      }
    } else if (Array.isArray(written[record.childrenKey])) {
      entry[record.childrenKey] = node.children.map(writeNode);
    }

    return entry;
  };

  // An option this version couldn't read is kept as written, unless a value is set for it.
  for (const key of Object.keys(source.map)) {
    if (DOCUMENT_OPTION_KEYS.has(key) && key !== 'flavor' && source.map[key] !== null && own(topAsRead, key) === undefined && own(top, key) !== undefined) {
      throw newerFormatError(`The map's ${key} is`, `writing its new ${key} would lose it`, true);
    }
  }

  const root = document.root;
  const rootRecord = records.get(root);
  const map = patchedEntries(source.map, topAsRead, top, (key) => key, 'nodes');

  // A root Orbit made up stays made up while it's unchanged: for several top-level ideas, named after the title;
  // for none it could read, empty, with what's written in their place kept.
  const madeUp = rootRecord !== undefined && rootRecord.entry === undefined && sameJson(asRead(rootRecord), nodeEntries(root, explicitIds.has(root)));
  const severalAtTop = Array.isArray(source.map.nodes) && source.map.nodes.length > 1;

  if (madeUp && severalAtTop && root.children.length > 1 && sameJson(top.title, topAsRead.title)) {
    map.nodes = root.children.map(writeNode);
  } else if (!madeUp || severalAtTop || root.children.length > 0) {
    if (rootRecord?.entry === undefined && unreadParts(source, root).children) {
      throw newerFormatError('The map\'s ideas are', 'writing the ones added would lose them', true);
    }

    map.nodes = [writeNode(root)];
  }

  const text = emitYaml(map);

  if (!readsAs(text, { ...document, extra })) {
    throw newerFormatError('This map is', 'its changes can\'t be written without losing some of what it says', true);
  }

  return text;
};

/**
 * `written` with the entries that changed from `before` to `after` written
 * again in their place (under the key `keyOf` gives), the ones gone left
 * out, and new ones before `last`, or at the end.
 */
const patchedEntries = (
  written: Record<string, YamlValue>,
  before: Record<string, YamlValue>,
  after: Record<string, YamlValue>,
  keyOf: (key: string) => string,
  last: string,
): Record<string, YamlValue> => {
  const changes = new Map<string, YamlValue | undefined>();

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!sameJson(own(before, key), own(after, key))) {
      changes.set(keyOf(key), own(after, key));
    }
  }

  const entry: Record<string, YamlValue> = {};

  const addNew = (): void => {
    for (const [key, value] of changes) {
      if (!Object.prototype.hasOwnProperty.call(written, key)) {
        if (value !== undefined) {
          assignKey(entry, key, value);
        }

        changes.delete(key);
      }
    }
  };

  for (const [key, value] of Object.entries(written)) {
    if (key === last) {
      addNew();
    }

    const now = changes.has(key) ? changes.get(key) : value;

    if (now !== undefined) {
      assignKey(entry, key, now);
    }
  }

  addNew();
  return entry;
};

/** Whether `text` reads back as `expected`: Orbit would write both the same. */
const readsAs = (text: string, expected: OrbitDocument): boolean => {
  try {
    // A made-up root keeps its id in every language: read it back with the name it was given.
    const read = parseOrbitYAML(text, { untitled: expected.root.id === UNTITLED_ROOT_ID ? expected.root.text : undefined });
    return writeYaml(read) === writeYaml(expected);
  } catch {
    return false;
  }
};

const own = (map: Record<string, YamlValue>, key: string): YamlValue | undefined => {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
};

const sameJson = (first: unknown, second: unknown): boolean => {
  return JSON.stringify(first) === JSON.stringify(second);
};

const isMap = (value: YamlValue | undefined): value is Record<string, YamlValue> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
