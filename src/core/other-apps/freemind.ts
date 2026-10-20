/**
 * FreeMind and Freeplane maps (`.mm`): nodes with their text (plain, or
 * HTML), notes and Freeplane's details, links and arrow links, folds, icons,
 * background colors, attributes and pictures.
 */

import { freeMindIcon } from './icons.js';
import { buildDocument, ImportReport, newIdea, oneLine, OrbitImportError, sourceLink, type ImportedIdea } from './ideas.js';
import { attributeOf, childElement, childElements, textContent, type MarkupElement } from './markup.js';
import { keptAddress, noteFromBlocks, noteFromHtml, noteFromPlainText, titleFromHtml, type ImportedNote, type NoteAddresses, type NoteBlock } from './notes.js';
import { baseName, readXmlFile, type OrbitImport, type OrbitImportOptions } from './reading.js';

/** A FreeMind or Freeplane map, from its file's bytes or text. */
export const importFreeMind = (data: Uint8Array | string, options: OrbitImportOptions = {}): OrbitImport => {
  const map = readXmlFile(data, 'map', 'a FreeMind or Freeplane map');
  const nodes = childElements(map, 'node');

  if (nodes.length === 0) {
    throw new OrbitImportError('empty', 'The map has no nodes.');
  }

  const report = new ImportReport();
  let root: ImportedIdea;

  if (nodes.length === 1) {
    root = readNode(nodes[0], report);
  } else {
    root = newIdea(baseName(options.name) || options.untitled || 'Untitled map');
    root.children = nodes.map((node) => readNode(node, report));
  }

  return { format: 'freemind', maps: [{ document: buildDocument(root, report), media: {}, warnings: report.warnings }] };
};

const readNode = (node: MarkupElement, report: ImportReport): ImportedIdea => {
  const idea = newIdea('');
  const id = node.attributes.ID;

  if (id) {
    idea.sourceId = id;
  }

  readTitle(node, idea, report);
  const addresses = noteAddresses(report);
  const details: ImportedNote[] = [];
  const notes: ImportedNote[] = [];

  for (const content of childElements(node, 'richcontent')) {
    const type = (content.attributes.TYPE ?? '').toUpperCase();

    if (type === 'NOTE' || type === 'DETAILS') {
      const note = richContentNote(content, addresses, report, idea.text);

      if (note) {
        (type === 'DETAILS' ? details : notes).push(note);
      }
    }
  }

  // FreeMind before 0.9 kept notes in a hook.
  for (const hook of childElements(node, 'hook')) {
    if (/NodeNote/.test(hook.attributes.NAME ?? '')) {
      const text = childElement(hook, 'text');
      const note = noteFromPlainText(text ? textContent(text) : undefined);

      if (note) {
        notes.push(note);
      }
    }
  }

  idea.notes.push(...details, ...notes);
  const attributes = attributeNote(node);

  if (attributes) {
    idea.notes.push(attributes);
  }

  readLink(node.attributes.LINK, idea, report);

  for (const arrow of childElements(node, 'arrowlink')) {
    const target = arrow.attributes.DESTINATION;

    if (target) {
      const label = oneLine(arrow.attributes.MIDDLE_LABEL || arrow.attributes.SOURCE_LABEL || arrow.attributes.TARGET_LABEL || '');
      idea.ideaLinks.push(label ? { target, label } : { target });
    }
  }

  if (node.attributes.FOLDED === 'true') {
    idea.collapsed = true;
  }

  const background = node.attributes.BACKGROUND_COLOR;

  if (background && /^#[0-9A-Fa-f]{6}$/.test(background)) {
    idea.color = background.toUpperCase();
  }

  for (const icon of childElements(node, 'icon')) {
    const name = icon.attributes.BUILTIN ?? '';
    const meaning = freeMindIcon(name);

    if (!meaning) {
      report.add('icons-not-kept', name.replace(/^.*\//, ''));
    } else if ('icon' in meaning) {
      idea.icons.push(meaning.icon);
    } else if ('priority' in meaning) {
      idea.priority ??= meaning.priority;
    } else {
      idea.status ??= meaning.status;
    }
  }

  for (const hook of childElements(node, 'hook')) {
    if (hook.attributes.NAME === 'ExternalObject' && hook.attributes.URI) {
      readPicture(hook.attributes.URI, idea, report);
    }
  }

  if (node.attributes.ENCRYPTED_CONTENT) {
    report.add('encrypted-branches-not-read', idea.text || undefined);
  }

  idea.children = childElements(node, 'node').map((child) => readNode(child, report));
  return idea;
};

/** The node's text: its `TEXT`, or its rich content as a reader sees it, whose first link becomes the node's link. */
const readTitle = (node: MarkupElement, idea: ImportedIdea, report: ImportReport): void => {
  const rich = childElements(node, 'richcontent').find((content) => (content.attributes.TYPE ?? '').toUpperCase() === 'NODE');
  const text = node.attributes.TEXT ?? node.attributes.LOCALIZED_TEXT;

  if (rich) {
    const html = childElement(rich, 'html');
    const plain = childElement(rich, 'text');

    if (html) {
      const title = titleFromHtml(html);
      idea.text = title.text;
      readLink(title.link, idea, report);

      for (const image of findElements(html, 'img')) {
        readPicture(image.attributes.src ?? '', idea, report);
      }
    } else {
      idea.text = plain ? textContent(plain) : textContent(rich);
    }

    return;
  }

  if (text !== undefined && /^\s*<html>/i.test(text)) {
    // FreeMind before 0.9 wrote HTML titles into the attribute.
    const title = titleFromHtml(text);
    idea.text = title.text;
    readLink(title.link, idea, report);
    return;
  }

  idea.text = text ?? '';
};

const readLink = (link: string | undefined, idea: ImportedIdea, report: ImportReport): void => {
  const address = link?.trim();

  if (!address || idea.link) {
    return;
  }

  const kept = keptAddress(address);

  if (address.startsWith('#') || /^(ID_\d+|_?Freemind_Link_\d+)$/.test(address)) {
    // Freeplane sometimes writes a link to another node without its "#".
    idea.ideaLinks.push({ target: address.replace(/^#/, '') });
  } else if (kept) {
    idea.link = kept;
  } else {
    report.add('local-links-not-kept', address);
  }
};

const readPicture = (address: string, idea: ImportedIdea, report: ImportReport): void => {
  if (/^https?:\/\/\S+$/i.test(address)) {
    idea.image ??= address;
  } else if (address !== '') {
    report.add('pictures-not-kept', address.replace(/^.*[/\\]/, ''));
  }
};

/** Links and pictures in a note: other nodes by their ids, web addresses as they are; files on the author's computer can't come along. */
const noteAddresses = (report: ImportReport): NoteAddresses => {
  return {
    link: (href) => {
      if (href.startsWith('#')) {
        return sourceLink(href.slice(1));
      }

      const kept = keptAddress(href);

      if (kept) {
        return kept;
      }

      report.add('local-links-not-kept', href);
      return null;
    },
    picture: (src) => {
      if (/^https?:\/\/\S+$/i.test(src)) {
        return src;
      }

      report.add('pictures-not-kept', src.replace(/^.*[/\\]/, ''));
      return null;
    },
  };
};

/** A note or details: HTML, or Freeplane's plain text (markdown when it says so). */
const richContentNote = (content: MarkupElement, addresses: NoteAddresses, report: ImportReport, title: string): ImportedNote | undefined => {
  const html = childElement(content, 'html');

  if (html) {
    const note = noteFromHtml(html, addresses);

    if (note?.format === 'plain') {
      report.add('formatting-not-kept', title || undefined);
    }

    return note;
  }

  const plain = childElement(content, 'text');
  const text = plain ? textContent(plain) : textContent(content);

  if (/\/markdown$/i.test(content.attributes['CONTENT-TYPE'] ?? '') && text.trim() !== '') {
    return { text: text.replace(/\r\n?/g, '\n').trim(), format: 'markdown' };
  }

  return noteFromPlainText(text);
};

/** Freeplane's attributes, as a list in the note: name, then value. */
const attributeNote = (node: MarkupElement): ImportedNote | undefined => {
  const items: NoteBlock[][] = [];

  for (const attribute of childElements(node, 'attribute')) {
    const name = (attributeOf(attribute, 'NAME') ?? '').trim();
    const value = (attributeOf(attribute, 'VALUE') ?? '').trim();

    if (name !== '' || value !== '') {
      items.push([{ kind: 'paragraph', inline: name === '' ? [{ kind: 'text', text: value }] : [{ kind: 'strong', children: [{ kind: 'text', text: `${name}:` }] }, { kind: 'text', text: ` ${value}` }] }]);
    }
  }

  return items.length === 0 ? undefined : noteFromBlocks([{ kind: 'list', ordered: false, items }]);
};

/** Every element with this local name inside `element`. */
const findElements = (element: MarkupElement, localName: string): MarkupElement[] => {
  const found: MarkupElement[] = [];
  const pending = [element];

  while (pending.length > 0) {
    const next = pending.pop() as MarkupElement;

    for (const child of childElements(next)) {
      if (child.localName.toLowerCase() === localName) {
        found.push(child);
      }

      pending.push(child);
    }
  }

  return found;
};
