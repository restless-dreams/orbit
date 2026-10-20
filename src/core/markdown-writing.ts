/**
 * How Orbit writes a map as markdown: its own form, the way people write
 * maps. `serializeOrbitMarkdown` writes a whole map this way, and saving an
 * edited map writes its changed ideas this way (see source-patch.ts).
 */

import type { OrbitDocument, OrbitNode } from './types.js';
import { emitYaml, assignKey, plainScalarReadsBack, type YamlValue } from './yaml-mini.js';
import { nodesWithExplicitIds } from './utils.js';
import { detectVideoProvider } from './media.js';
import { isTitleIcon, parseOrbitMarkdown, parseTitle } from './parser-markdown.js';
import { mediaExtras } from './node-attributes.js';

/** A whole map in Orbit's own form. */
export const writeMarkdown = (doc: OrbitDocument): string => {
  let out = '';
  const fmKeys = collectFrontmatter(doc);

  if (Object.keys(fmKeys).length > 0) {
    out += '---\n' + emitYaml(fmKeys as unknown as YamlValue) + '---\n\n';
  }

  out += emitHeading(doc.root, 1, { explicitIds: nodesWithExplicitIds(doc.root) });
  return out;
};

export const collectFrontmatter = (doc: Pick<OrbitDocument, 'options' | 'extra'>): Record<string, unknown> => {
  const o = doc.options;
  const r: Record<string, unknown> = {};

  if (o.title) {
    r.title = o.title;
  }

  if (o.theme) {
    r.theme = o.theme;
  }

  if (o.viewMode) {
    r.view = o.viewMode;
  }

  if (o.showRings !== undefined) {
    r.showRings = o.showRings;
  }

  if (o.interactive !== undefined) {
    r.interactive = o.interactive;
  }

  if (o.orbitAnimation !== undefined) {
    r.animation = o.orbitAnimation;
  }

  if (o.orbitSpeed !== undefined) {
    r.speed = o.orbitSpeed;
  }

  if (o.palette) {
    r.palette = o.palette;
  }

  if (o.height !== undefined) {
    r.height = o.height;
  }

  if (o.maxDepth !== undefined) {
    r.maxDepth = o.maxDepth;
  }

  if (o.className) {
    r.className = o.className;
  }

  if (o.baseUrl) {
    r.baseUrl = o.baseUrl;
  }

  if (o.schemaVersion !== undefined) {
    r.schemaVersion = o.schemaVersion;
  }

  // Keys Orbit doesn't read, after its own: as they were written.
  for (const [key, value] of Object.entries(doc.extra ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(r, key)) {
      assignKey(r, key, value);
    }
  }

  return r;
};

/**
 * The root and its children are headings; everything under them is a
 * list, the way people write maps. Below two levels, headings would only
 * make a map harder to read.
 */
export const HEADING_LEVELS = 2;

/** The statuses a list item writes as a checkbox. */
export const CHECKBOXES: Record<string, string> = { todo: '[ ]', done: '[x]', active: '[/]' };

/** What writing a node needs besides the node: which ids to write. */
export interface Writing {
  /** The nodes whose ids the parsers wouldn't make from their text, so they are written. */
  explicitIds: ReadonlySet<OrbitNode>;
}

export const emitHeading = (node: OrbitNode, level: number, writing: Writing): string => {
  const parts = nodeParts(node, false, writing, '');
  const out = `${'#'.repeat(level)} ${parts.line}\n${parts.body}`;

  if (node.children.length === 0) {
    return out;
  }

  if (level < HEADING_LEVELS) {
    return out + node.children.map((child) => `\n${emitHeading(child, level + 1, writing)}`).join('');
  }

  return out + emitList(node.children, '', writing);
};

export const emitList = (children: OrbitNode[], indent: string, writing: Writing): string => {
  let out = '';

  for (const child of children) {
    const parts = nodeParts(child, true, writing, `${indent}  `);
    out += `${indent}- ${parts.line}\n${parts.body}`;
    out += emitList(child.children, `${indent}  `, writing);
  }

  return out;
};

/**
 * A node as written: its line after the heading's `#`s or the item's
 * marker (title, then the attributes that fit on it), and what follows the
 * line, indented by `indent`.
 */
export const nodeParts = (node: OrbitNode, listItem: boolean, writing: Writing, indent: string): { line: string; title: string; inline: string; body: string } => {
  const pieces = nodePieces(node, listItem, writing, indent);
  return { line: `${pieces.title}${pieces.inline}`.trimStart(), title: pieces.title, inline: pieces.inline, body: pieces.attributes + pieces.media + pieces.note };
};

/** The pieces of a node as written, each ending with a line break (or empty): see `nodeParts`. */
export interface NodePieces {
  title: string;

  /** The attributes on the title line, with the space before them; empty when they don't fit there. */
  inline: string;

  /** The attributes that didn't fit on the line, as a block of their own. */
  attributes: string;

  media: string;
  note: string;
}

export const nodePieces = (node: OrbitNode, listItem: boolean, writing: Writing, indent: string): NodePieces => {
  const { title, attributes } = titleLine(node, listItem, writing);
  let inline = inlineAttributes(attributes);
  let block = inline ? {} : attributes;

  if (title === '' && inline === '') {
    // A line without a title only reads back with an attribute on it: the id, at least.
    inline = ` <!-- orbit id: ${inlineValue(node.id) ?? JSON.stringify(node.id)} -->`;
    block = Object.fromEntries(Object.entries(attributes).filter(([key]) => key !== 'id'));
  }

  return {
    title,
    inline,
    attributes: attributeBlock(block, indent),
    media: indentLines(renderMedia(node).trimEnd(), indent),
    note: noteLines(node, indent),
  };
};

/**
 * A node's title as written: a checkbox for a list item's status, its
 * icon, its text, its link around them and its tags as hashtags, with the
 * attributes those don't carry.
 */
/** A link markdown can hold in a title, `[text](link)`: no spaces, parentheses, quotes, angle brackets or backslashes. */
const isTitleLink = (link: string): boolean => {
  return /^[^\s()<>"'\\]+$/.test(link);
};

export const titleLine = (node: OrbitNode, listItem: boolean, writing: Writing): { title: string; attributes: Record<string, unknown> } => {
  const attributes = collectAttrs(node, writing.explicitIds);
  let title = escapeTitle(node.text);
  const linked = node.link !== undefined && isTitleLink(node.link);

  if (linked && title === node.text) {
    // Inside the link's brackets, brackets of the text's own would end it.
    title = title.replace(/[[\]]/g, '\\$&');
  }

  if (node.icon && isTitleIcon(node.icon)) {
    title = `${node.icon} ${title}`;
  }

  if (linked) {
    title = `[${title}](${node.link})`;
  }

  const checkbox = listItem && node.status ? CHECKBOXES[node.status] : undefined;

  if (checkbox) {
    title = `${checkbox} ${title}`;
    delete attributes.status;
  }

  if (node.tags?.length && node.tags.every(isHashtag)) {
    title += node.tags.map((tag) => ` #${tag}`).join('');
    delete attributes.tags;
  }

  return { title, attributes };
};

/** Whether a tag reads back as a hashtag at the end of a title. */
const isHashtag = (tag: string): boolean => {
  return /^[\p{L}\p{N}_][\p{L}\p{N}_/-]*$/u.test(tag) && /\p{L}/u.test(tag);
};

/** The longest comment of more than `INLINE_ENTRIES` attributes that still goes on the node's line. */
const INLINE_LENGTH = 80;
/** Up to this many attributes go on the node's line however long their values are, within `inlineValue`'s limit. */
const INLINE_ENTRIES = 3;

/**
 * Attributes on the node's own line, `<!-- orbit status: done, priority: 2 -->`,
 * when they are short, plain values: up to three of them, or more while the
 * comment stays short, as a goal's numbers are (`type: goal, target: 5,
 * current: 2, unit: apples`). Keys that wouldn't survive the comma-separated
 * form (with a quote, a comma, a colon or a space of their own) go to the
 * block form instead.
 */
export const inlineAttributes = (attributes: Record<string, unknown>): string => {
  const entries = Object.entries(attributes);

  if (entries.length === 0 || !entries.every(([key, value]) => INLINE_KEY.test(key) && inlineValue(value) !== null)) {
    return '';
  }

  const comment = ` <!-- orbit ${entries.map(([key, value]) => `${key}: ${inlineValue(value)}`).join(', ')} -->`;
  return entries.length <= INLINE_ENTRIES || comment.length <= INLINE_LENGTH ? comment : '';
};

/** A key the comma-separated inline form reads back: what its pair pattern accepts. */
const INLINE_KEY = /^[A-Za-z][\w-]*$/;

export const inlineValue = (value: unknown): string | null => {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value !== 'string' || value.length > 60 || /[\r\n]|--/.test(value)) {
    return null;
  }

  // Quoted when the parser wouldn't hand it back plain, when it holds a
  // character the inline form itself reads (a comma splits attributes, a
  // quote toggles them, a bracket or brace nests so the comma after it
  // doesn't split, ":" and "#" are syntax anywhere they appear), or when it
  // starts like a number (`2026-11-01` reads as text, but plain it would look
  // like one).
  return plainScalarReadsBack(value) && !/["',:#[\]{}]/.test(value) && !/^-?\d/.test(value) ? value : JSON.stringify(value);
};

/** What follows a node's line, indented under a list item: attributes that didn't fit on the line, media, then the note. */
export const body = (node: OrbitNode, blockAttributes: Record<string, unknown>, indent: string): string => {
  return attributeBlock(blockAttributes, indent) + indentLines(renderMedia(node).trimEnd(), indent) + noteLines(node, indent);
};

/** Attributes as a `<!-- orbit … -->` block of their own, indented by `indent`; nothing when there are none. */
export const attributeBlock = (attributes: Record<string, unknown>, indent: string): string => {
  return Object.keys(attributes).length > 0 ? indentLines(`<!-- orbit\n${commentYaml(attributes)}\n-->`, indent) : '';
};

/** A node's note as written under it, indented by `indent`. */
export const noteLines = (node: OrbitNode, indent: string): string => {
  return node.note ? indentLines(noteText(node.note, indent !== ''), indent) : '';
};

/**
 * A note as paragraphs when they read back as the same note, otherwise
 * quoted: quoted lines never turn into nodes, so a note can hold lines that
 * look like headings, lists or media.
 */
export const noteText = (note: string, listItem: boolean): string => {
  return plainNoteReadsBack(note, listItem) ? note : note.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');
};

/**
 * Whether a note written as plain paragraphs reads back as the same note,
 * and leaves what follows it alone: a node after it must still be a node
 * (an unclosed code fence, say, would swallow it).
 */
const plainNoteReadsBack = (note: string, listItem: boolean): boolean => {
  // Indentation inside a list item is measured against its other lines: quoted, it stays exact.
  if (/^[ \t]/m.test(note)) {
    return false;
  }

  const source = listItem
    ? `# Map\n\n## Branch\n- Node\n${indentLines(note, '  ')}  - Next\n- After\n`
    : `# Map\n\n## Node\n${note}\n- Next\n\n## After\n`;
  const document = parseOrbitMarkdown(source);
  const branches = document.root.children;
  const node = listItem ? branches[0]?.children[0] : branches[0];
  const after = listItem ? branches[0]?.children[1] : branches[1];

  if (!node || node.note !== note || node.children.length !== 1 || node.children[0].text !== 'Next' || after?.text !== 'After') {
    return false;
  }

  // Nothing in the note may read as the node's own attributes or media.
  const read = new Set(['id', 'text', 'level', 'children', 'source', 'note']);
  return Object.entries(node).every(([key, value]) => read.has(key) || value === undefined || (key === 'noteFormat' && value === 'markdown'));
};

export const indentLines = (text: string, indent: string): string => {
  if (text === '') {
    return '';
  }

  return `${text.split('\n').map((line) => (line === '' ? '' : `${indent}${line}`)).join('\n')}\n`;
};

/** Characters a title reads as markup: emphasis, code, links, checkboxes, hashtags. */
const TITLE_MARKUP = /[\\`*_~[\]#<]/g;

/**
 * A node's text as a heading or list item title: as is when it reads back
 * unchanged, otherwise with its markup characters escaped.
 */
export const escapeTitle = (text: string): string => {
  // A comment would be read as attributes, and a closing `#` run dropped from a heading.
  const misread = /<!--/.test(text) || /\s#+$/.test(text) || !readsBack(text);
  return misread ? text.replace(TITLE_MARKUP, '\\$&') : text;
};

const readsBack = (text: string): boolean => {
  const parts = parseTitle(text);
  return parts.text === text && parts.icon === undefined && parts.link === undefined && parts.tags === undefined && parts.status === undefined;
};

/**
 * A node's media as markdown lines, each followed (when needed) by an
 * attribute comment carrying what the line form cannot express: an explicit
 * `contentType` when auto-detection would misclassify, and the caption.
 */
/** Media a markdown line can hold: plain addresses, and alt text without brackets. Others go in the attributes. */
const fitsOnALine = (media: { src: string; alt?: string; thumbnail?: string; provider?: string }): boolean => {
  // A media line reads its provider back from the address: one set differently would be rewritten.
  const providerKept = media.provider === undefined || media.provider === (detectVideoProvider(media.src) ?? 'native');
  return providerKept && isTitleLink(media.src) && (media.thumbnail === undefined || isTitleLink(media.thumbnail)) && !/[[\]\n]/.test(media.alt ?? '')
    && mediaExtras(media) === undefined;
};

/** A media value as an attribute: its defined fields, and a video's provider only when its address doesn't say it. */
const mediaAttribute = (media: { src: string; alt?: string; caption?: string; thumbnail?: string; provider?: string }): Record<string, unknown> => {
  // Fields Orbit doesn't read go first, as written; Orbit's own follow.
  const value: Record<string, unknown> = { src: media.src, ...mediaExtras(media) };

  for (const key of ['alt', 'thumbnail', 'caption'] as const) {
    if (media[key] !== undefined) {
      value[key] = media[key];
    }
  }

  if (media.provider !== undefined && media.provider !== (detectVideoProvider(media.src) ?? 'native')) {
    value.provider = media.provider;
  }

  return value;
};

export const renderMedia = (node: OrbitNode): string => {
  let out = '';

  if (node.image && fitsOnALine(node.image)) {
    out += `![${node.image.alt ?? ''}](${node.image.src})\n`;
    out += mediaMarker(undefined, node.image.caption);
  }

  if (node.video && fitsOnALine(node.video)) {
    const v = node.video;
    const detected = detectVideoProvider(v.src);
    out += v.thumbnail ? `[![](${v.thumbnail})](${v.src})\n` : `[video](${v.src})\n`;
    out += mediaMarker(detected === null ? 'video' : undefined, v.caption);
  }

  if (node.embed && fitsOnALine(node.embed)) {
    out += `[embed](${node.embed.src})\n`;
    out += mediaMarker('embed', node.embed.caption);
  }

  return out;
};

const mediaMarker = (contentType: 'video' | 'embed' | undefined, caption: string | undefined): string => {
  const fields: Record<string, unknown> = {};

  if (contentType) {
    fields.contentType = contentType;
  }

  if (caption !== undefined) {
    fields.caption = caption;
  }

  if (Object.keys(fields).length === 0) {
    return '';
  }

  const yaml = commentYaml(fields);
  return yaml.includes('\n') ? `<!-- orbit\n${yaml}\n-->\n` : `<!-- orbit ${yaml} -->\n`;
};

/**
 * YAML to write inside an HTML comment. A "-->" in a value would end the
 * comment early, so its ">" is written as an escape; strings holding one are
 * always double-quoted, where the escape reads back as ">".
 */
export const commentYaml = (value: Record<string, unknown>): string => {
  return emitYaml(value as unknown as YamlValue).trimEnd().replace(/--(!?)>/g, '--$1\\u003e');
};

/** Attributes carried in `<!-- orbit ... -->` comments: the ones a node's title and lines don't show. */
export const collectAttrs = (node: OrbitNode, explicitIds: ReadonlySet<OrbitNode>): Record<string, unknown> => {
  const r: Record<string, unknown> = {};

  if (node.icon && !isTitleIcon(node.icon)) {
    r.icon = node.icon;
  }

  if (node.color) {
    r.color = node.color;
  }

  if (node.paletteColor !== undefined) {
    r.paletteColor = node.paletteColor;
  }

  if (node.status) {
    r.status = node.status;
  }

  if (node.priority !== undefined) {
    r.priority = node.priority;
  }

  if (node.tags) {
    r.tags = node.tags;
  }

  if (node.collapsed !== undefined) {
    r.collapsed = node.collapsed;
  }

  if (node.type) {
    r.type = node.typeVersion === undefined ? node.type : `${node.type}@${node.typeVersion}`;
  }

  if (node.link && !isTitleLink(node.link)) {
    r.link = node.link;
  }

  for (const key of ['image', 'video', 'embed'] as const) {
    const media = node[key];

    if (media && !fitsOnALine(media)) {
      r[key] = mediaAttribute(media);
    }
  }

  if (node.noteFormat && node.noteFormat !== 'markdown' && node.note) {
    r.noteFormat = node.noteFormat;
  }

  if (explicitIds.has(node)) {
    r.id = node.id;
  }

  if (node.attrs) {
    for (const [k, v] of Object.entries(node.attrs)) {
      // A value Orbit couldn't read for one of its own attributes is written back, unless one was set since.
      if (!Object.prototype.hasOwnProperty.call(r, k)) {
        assignKey(r, k, v);
      }
    }
  }

  return r;
};
