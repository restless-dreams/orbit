/**
 * OPML, the outline format outliners and most mind map apps read and write.
 * Reading keeps each outline's text, its note (`_note`, the convention
 * OmniOutliner started and Workflowy, Dynalist and MindNode follow), its
 * done or todo state (`_status`, `_complete`, `complete`), its link
 * (`type="link"`'s `url`, a feed's `htmlUrl` or `xmlUrl`) and its categories
 * as tags. Writing gives the same back, so a map Orbit writes reads back the
 * same, and other apps read its text, notes, links and checkboxes.
 */

import { parseOrbit } from '../dispatch.js';
import { isNodeLink } from '../node-links.js';
import type { OrbitDocument, OrbitNode } from '../types.js';
import { buildDocument, ImportReport, newIdea, OrbitImportError, type ImportedIdea } from './ideas.js';
import { attributeOf, childElement, childElements, textContent, type MarkupElement } from './markup.js';
import { isKeptLink, keptAddress, noteFromHtml, noteFromPlainText, titleFromHtml, type ImportedNote } from './notes.js';
import { baseName, readXmlFile, type OrbitImport, type OrbitImportOptions } from './reading.js';

/** Tags that make an outline's text or note HTML, as Workflowy writes its formatting. */
const HTML_TAGS = /<\/?(b|i|u|s|em|strong|a|span|br|code|mark|strike|del|sup|sub|font|p|div|ul|ol|li)\b[^>]*>/i;

/** An OPML file, from its bytes or text. */
export const importOPML = (data: Uint8Array | string, options: OrbitImportOptions = {}): OrbitImport => {
  const opml = readXmlFile(data, 'opml', 'an OPML file');
  const head = childElement(opml, 'head');
  const titleElement = head ? childElement(head, 'title') : undefined;
  const title = titleElement ? baseName(textContent(titleElement).replace(/\s+/g, ' ').trim()) : '';
  const body = childElement(opml, 'body');
  const outlines = body ? childElements(body, 'outline') : [];

  if (outlines.length === 0) {
    throw new OrbitImportError('empty', 'The OPML file has no outlines.');
  }

  const report = new ImportReport();
  let root: ImportedIdea;

  if (outlines.length === 1) {
    root = readOutline(outlines[0], report);
  } else {
    root = newIdea(title || baseName(options.name) || options.untitled || 'Untitled map');
    root.children = outlines.map((outline) => readOutline(outline, report));
  }

  return { format: 'opml', maps: [{ document: buildDocument(root, report), media: {}, warnings: report.warnings }] };
};

const readOutline = (outline: MarkupElement, report: ImportReport): ImportedIdea => {
  const text = attributeOf(outline, 'text') ?? attributeOf(outline, 'title') ?? '';
  const idea = newIdea(text);

  // Orbit says when a title that looks like HTML is plain text.
  if (HTML_TAGS.test(text) && outline.attributes._textFormat !== 'plain') {
    const title = titleFromHtml(text);
    idea.text = title.text;

    if (title.link && isKeptLink(title.link) && !title.link.startsWith('#')) {
      idea.link = title.link;
    }
  }

  const note = readNote(outline, idea, report);

  if (note) {
    idea.notes.push(note);
  }

  idea.status = readStatus(outline);
  const link = readLink(outline);
  const kept = link ? keptAddress(link) : null;

  if (kept) {
    idea.link = kept;
  } else if (link) {
    report.add('local-links-not-kept', link);
  }

  const categories = attributeOf(outline, 'category');

  if (categories) {
    idea.tags.push(...categories.split(',').map((category) => category.trim().replace(/^\/+/, '')).filter((category) => category !== ''));
  }

  idea.children = childElements(outline, 'outline').map((child) => readOutline(child, report));
  return idea;
};

/** The outline's note: `_note`, an older app's `note`, or a feed's description. */
const readNote = (outline: MarkupElement, idea: ImportedIdea, report: ImportReport): ImportedNote | undefined => {
  const text = attributeOf(outline, '_note') ?? outline.attributes.note ?? attributeOf(outline, 'description');

  if (text === undefined || text.trim() === '') {
    return undefined;
  }

  // Orbit says how to read a note when its text alone wouldn't.
  const format = outline.attributes._noteFormat;

  if (format === 'markdown' || format === 'plain') {
    return { text: text.replace(/\r\n?/g, '\n').trim(), format };
  }

  if (HTML_TAGS.test(text)) {
    const note = noteFromHtml(text.replace(/\r\n?|\n/g, '<br>'));

    if (note?.format === 'plain') {
      report.add('formatting-not-kept', idea.text || undefined);
    }

    return note;
  }

  return noteFromPlainText(text);
};

/** OmniOutliner's `_status`, Workflowy's `_complete` and Dynalist's `complete`, as Orbit's statuses. */
const readStatus = (outline: MarkupElement): string | undefined => {
  const status = attributeOf(outline, '_status')?.trim();

  if (status) {
    return CHECKBOX_STATUSES.get(status.toLowerCase()) ?? status;
  }

  const complete = (outline.attributes._complete ?? outline.attributes.complete ?? outline.attributes.checked ?? outline.attributes._checked)?.trim().toLowerCase();

  if (complete === 'true') {
    return 'done';
  }

  return outline.attributes.checkbox === 'true' ? 'todo' : undefined;
};

/** The outline's address: a link's or an include's `url`, a feed's site or the feed itself. */
const readLink = (outline: MarkupElement): string | undefined => {
  const url = outline.attributes.url ?? outline.attributes.htmlUrl ?? outline.attributes.xmlUrl;
  return url?.trim() || undefined;
};

export interface OrbitOPMLOptions {
  /** The outline's title, in its head. Default: the map's `title`, or its root's text. */
  title?: string;
}

/** Orbit's statuses that are checkboxes in OPML, the others written as they are. */
const STATUS_CHECKBOXES = new Map([['done', 'checked'], ['todo', 'unchecked'], ['active', 'indeterminate']]);
const CHECKBOX_STATUSES = new Map([...STATUS_CHECKBOXES].map(([status, checkbox]) => [checkbox, status]));

/** Statuses Workflowy should show crossed out. */
const DONE_WORDS = new Set(['done', 'complete', 'completed', 'shipped']);

/**
 * A map as OPML: the root is the one top outline, each node an outline
 * with its icon and text, its note in `_note`, its link as `type="link"`
 * with a `url`, its status in `_status` (`checked`, `unchecked` and
 * `indeterminate` for done, todo and active; any other word as it is) and
 * `_complete`, and its tags as `category`. Pictures, videos, colors and
 * priorities have no place in OPML: a zip or the map's own file keeps them.
 */
export const exportOPML = (input: string | OrbitDocument, options: OrbitOPMLOptions = {}): string => {
  const document = typeof input === 'string' ? parseOrbit(input) : input;
  const title = options.title ?? (document.options.title || document.root.text);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title)}</title>`,
    '  </head>',
    '  <body>',
  ];

  const write = (node: OrbitNode, depth: number): void => {
    const indent = '  '.repeat(depth + 2);
    const attributes = outlineAttributes(node).map(([name, value]) => ` ${name}="${escapeXml(value, true)}"`).join('');

    if (node.children.length === 0) {
      lines.push(`${indent}<outline${attributes}/>`);
      return;
    }

    lines.push(`${indent}<outline${attributes}>`);

    for (const child of node.children) {
      write(child, depth + 1);
    }

    lines.push(`${indent}</outline>`);
  };

  write(document.root, 0);
  lines.push('  </body>', '</opml>', '');
  return lines.join('\n');
};

const outlineAttributes = (node: OrbitNode): [string, string][] => {
  const text = node.icon ? `${node.icon} ${node.text}` : node.text;
  const attributes: [string, string][] = [['text', text]];

  if (HTML_TAGS.test(text)) {
    attributes.push(['_textFormat', 'plain']);
  }

  if (node.note) {
    attributes.push(['_note', node.note]);
    const format = node.noteFormat ?? 'markdown';

    // Said only when the note's text alone would read the other way.
    if (noteFromPlainText(node.note)?.format !== format) {
      attributes.push(['_noteFormat', format]);
    }
  }

  const status = node.status?.trim();

  if (status) {
    attributes.push(['_status', STATUS_CHECKBOXES.get(status) ?? status]);

    if (DONE_WORDS.has(status.toLowerCase())) {
      attributes.push(['_complete', 'true']);
    }
  }

  if (node.link && (isKeptLink(node.link) || isNodeLink(node.link))) {
    attributes.push(['type', 'link'], ['url', node.link]);
  }

  if (node.tags && node.tags.length > 0) {
    attributes.push(['category', node.tags.map((tag) => tag.replace(/,/g, ' ')).join(',')]);
  }

  return attributes;
};

/** Text for XML; in an attribute, line breaks and tabs are written as references, so readers keep them. */
const escapeXml = (text: string, attribute = false): string => {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return attribute ? escaped.replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;').replace(/\t/g, '&#9;') : escaped;
};
