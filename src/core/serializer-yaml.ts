import type { OrbitDocument, OrbitNode } from './types.js';
import { assignKey, emitYaml, type YamlValue } from './yaml-mini.js';
import { nodesWithExplicitIds } from './utils.js';
import { mediaExtras } from './node-attributes.js';

export const serializeOrbitYAML = (doc: OrbitDocument): string => {
  const out: Record<string, YamlValue> = {};
  const opts = doc.options;

  if (opts.title) {
    out.title = opts.title;
  }

  if (opts.theme) {
    out.theme = opts.theme;
  }

  if (opts.viewMode) {
    out.view = opts.viewMode;
  }

  if (opts.showRings !== undefined) {
    out.showRings = opts.showRings;
  }

  if (opts.interactive !== undefined) {
    out.interactive = opts.interactive;
  }

  if (opts.orbitAnimation !== undefined) {
    out.animation = opts.orbitAnimation;
  }

  if (opts.orbitSpeed !== undefined) {
    out.speed = opts.orbitSpeed;
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

  if (opts.schemaVersion !== undefined) {
    out.schemaVersion = opts.schemaVersion;
  }

  // Keys Orbit doesn't read, after its own: as they were written.
  for (const [key, value] of Object.entries(doc.extra ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(out, key) && key !== 'nodes') {
      assignKey(out, key, value as YamlValue);
    }
  }

  out.nodes = [serializeNode(doc.root, nodesWithExplicitIds(doc.root))];
  return emitYaml(out);
};

const serializeNode = (n: OrbitNode, explicitIds: ReadonlySet<OrbitNode>): YamlValue => {
  const obj: Record<string, YamlValue> = { text: n.text };

  if (explicitIds.has(n)) {
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

  // A picture, video or embed keeps the fields Orbit doesn't read.
  if (n.image) {
    obj.image = { ...mediaExtras(n.image), ...n.image } as unknown as YamlValue;
  }

  if (n.video) {
    obj.video = { ...mediaExtras(n.video), ...n.video } as unknown as YamlValue;
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

  if (n.children.length) {
    obj.children = n.children.map((child) => serializeNode(child, explicitIds));
  }

  return obj;
};

/** Keys `buildNode` reads as the node's structure: a value under them would become a title or children. */
const RESERVED_NODE_KEYS = new Set(['text', 'children']);
