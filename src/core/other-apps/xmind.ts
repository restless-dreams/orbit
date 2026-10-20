/**
 * XMind workbooks (`.xmind`): zip archives holding `content.json` (XMind
 * 2020 and later, and XMind Zen) or `content.xml` (XMind 8 and earlier),
 * with their pictures. Each sheet becomes a map: its topics with their notes,
 * labels, markers, links, folds, fill colors and pictures, floating topics,
 * summaries and callouts under the topics they belong with, and
 * relationships as links.
 */

import { xmindMarker } from './icons.js';
import { buildDocument, ImportReport, newIdea, OrbitImportError, sourceLink, type ImportedIdea } from './ideas.js';
import { attributeOf, childElement, childElements, isElement, MarkupError, parseXml, textContent, type MarkupElement } from './markup.js';
import { keptAddress, noteFromBlocks, noteFromHtml, noteFromPlainText, type ImportedNote, type NoteAddresses, type NoteBlock, type NoteInline } from './notes.js';
import type { OrbitImportedMap, OrbitImport, OrbitImportOptions } from './reading.js';
import { isZip, ZipArchive, ZipError } from './zip.js';

/** The extensions of the pictures a map keeps. */
const PICTURE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'heif']);

/**
 * An XMind workbook, from its bytes; or its `content.json` or `content.xml`
 * as text, which reads without pictures.
 */
export const importXMind = (data: Uint8Array | string, options: OrbitImportOptions = {}): OrbitImport => {
  const workbook = openWorkbook(data);
  const maps: OrbitImportedMap[] = [];

  if (workbook.json !== undefined) {
    for (const sheet of workbook.json) {
      if (isObject(sheet) && isObject(sheet.rootTopic)) {
        maps.push(new JsonSheetReader(workbook.archive).read(sheet));
      }
    }
  } else if (workbook.xml) {
    const styles = workbook.archive ? readStyles(workbook.archive) : new Map<string, string>();
    const comments = workbook.archive ? readComments(workbook.archive) : new Map<string, string[]>();

    for (const sheet of childElements(workbook.xml, 'sheet')) {
      const topic = childElement(sheet, 'topic');

      if (topic) {
        maps.push(new XmlSheetReader(workbook.archive, styles, comments).read(sheet, topic));
      }
    }
  }

  if (maps.length === 0) {
    throw new OrbitImportError('empty', `The workbook${options.name ? ` ${options.name}` : ''} has no sheet with a topic.`);
  }

  return { format: 'xmind', maps };
};

interface Workbook {
  archive: ZipArchive | null;
  json?: unknown[];
  xml?: MarkupElement;
}

const openWorkbook = (data: Uint8Array | string): Workbook => {
  if (typeof data === 'string') {
    return readContent(data, null, data.trimStart().startsWith('[') ? 'json' : 'xml');
  }

  if (!isZip(data)) {
    return readContent(new TextDecoder('utf-8').decode(data), null, 'xml');
  }

  let archive: ZipArchive;

  try {
    archive = new ZipArchive(data);
  } catch (error) {
    throw unreadable(error);
  }

  if (isEncrypted(archive)) {
    throw new OrbitImportError('password-protected', 'The workbook is protected with a password: open it in XMind and save it without one first.');
  }

  try {
    // XMind 2020 and later also write a content.xml that only says to open the file in a newer XMind.
    if (archive.has('content.json')) {
      return readContent(archive.text('content.json') ?? '', archive, 'json');
    }

    if (archive.has('content.xml')) {
      return readContent(archive.text('content.xml') ?? '', archive, 'xml');
    }
  } catch (error) {
    throw unreadable(error);
  }

  throw new OrbitImportError('unreadable', "The file is a zip archive, but not an XMind workbook: it has no content.json or content.xml.");
};

const readContent = (text: string, archive: ZipArchive | null, kind: 'json' | 'xml'): Workbook => {
  if (kind === 'json') {
    let json: unknown;

    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new OrbitImportError('unreadable', `The workbook's content.json can't be read: ${(error as Error).message}.`);
    }

    if (!Array.isArray(json)) {
      throw new OrbitImportError('unreadable', "The workbook's content.json isn't a list of sheets.");
    }

    return { archive, json };
  }

  let xml: MarkupElement;

  try {
    xml = parseXml(text);
  } catch (error) {
    throw unreadable(error);
  }

  if (xml.localName !== 'xmap-content') {
    throw new OrbitImportError('unreadable', `The file isn't an XMind workbook: it starts with <${xml.name}>, not <xmap-content>.`);
  }

  return { archive, xml };
};

const unreadable = (error: unknown): OrbitImportError => {
  if (error instanceof ZipError && /encrypted/.test(error.message)) {
    return new OrbitImportError('password-protected', 'The workbook is protected with a password: open it in XMind and save it without one first.');
  }

  if (error instanceof ZipError || error instanceof MarkupError) {
    return new OrbitImportError('unreadable', `The workbook can't be read: ${error.message}.`);
  }

  return error instanceof OrbitImportError ? error : new OrbitImportError('unreadable', `The workbook can't be read: ${(error as Error).message}.`);
};

/** Whether XMind encrypted the workbook's content with a password. */
const isEncrypted = (archive: ZipArchive): boolean => {
  try {
    const manifest = archive.has('META-INF/manifest.xml') ? archive.text('META-INF/manifest.xml') ?? '' : '';
    const json = archive.has('manifest.json') ? archive.text('manifest.json') ?? '' : '';
    return /<encryption-data/.test(manifest) || /"encryption/.test(json);
  } catch {
    return false;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};

/** What reading one sheet shares: its warnings, its pictures, and its topics by id for relationships. */
abstract class SheetReader {
  protected readonly archive: ZipArchive | null;
  protected readonly report = new ImportReport();
  protected readonly media: Record<string, Uint8Array> = {};
  protected readonly topics = new Map<string, ImportedIdea>();
  private readonly pictureNames = new Map<string, string | null>();

  constructor(archive: ZipArchive | null) {
    this.archive = archive;
  }

  protected finish(root: ImportedIdea): OrbitImportedMap {
    return { document: buildDocument(root, this.report), media: this.media, warnings: this.report.warnings };
  }

  /** A topic's link: to another topic, a web or mail address; an attached file or a file elsewhere can't come along. */
  protected readLink(href: string | undefined, idea: ImportedIdea): void {
    const address = href?.trim();

    if (!address) {
      return;
    }

    const topic = /^xmind:#(.+)$/.exec(address);

    const kept = address.startsWith('#') ? null : keptAddress(address);

    if (topic) {
      idea.ideaLinks.push({ target: topic[1] });
    } else if (kept) {
      idea.link = kept;
    } else if (/^xap:/.test(address)) {
      if (PICTURE_EXTENSIONS.has(extensionOf(address)) && !idea.image) {
        idea.image = this.picture(address, idea.text) ?? undefined;
      } else {
        this.report.add('attachments-not-kept', idea.text || address.replace(/^.*\//, ''));
      }
    } else {
      this.report.add('local-links-not-kept', address);
    }
  }

  /** A picture's address in the map: a web address as it is, a picture inside the workbook as a file of the map's `media`. */
  protected picture(src: string, example: string): string | null {
    if (/^https?:\/\/\S+$/i.test(src)) {
      return src;
    }

    const inside = /^xap:(.+)$/.exec(src)?.[1];

    if (!inside || !this.archive) {
      this.report.add('pictures-not-kept', example || src.replace(/^.*[/\\]/, ''));
      return null;
    }

    if (!this.pictureNames.has(inside)) {
      this.pictureNames.set(inside, this.unpackPicture(inside));
    }

    const name = this.pictureNames.get(inside) ?? null;

    if (!name) {
      this.report.add('pictures-not-kept', example || inside.replace(/^.*\//, ''));
    }

    return name;
  }

  private unpackPicture(path: string): string | null {
    const extension = extensionOf(path);

    if (!PICTURE_EXTENSIONS.has(extension)) {
      return null;
    }

    let bytes: Uint8Array | null;

    try {
      bytes = this.archive?.read(path) ?? null;
    } catch {
      bytes = null;
    }

    if (!bytes) {
      return null;
    }

    const base = path.replace(/^.*\//, '').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '') || 'picture';
    let name = `media/${base}.${extension}`;

    for (let suffix = 2; this.media[name] !== undefined; suffix++) {
      name = `media/${base}-${suffix}.${extension}`;
    }

    this.media[name] = bytes;
    return name;
  }

  protected noteAddresses(example: string): NoteAddresses {
    return {
      link: (href) => {
        const topic = /^xmind:#(.+)$/.exec(href);

        if (topic) {
          return sourceLink(topic[1]);
        }

        const kept = href.startsWith('#') ? null : keptAddress(href);

        if (kept) {
          return kept;
        }

        this.report.add('local-links-not-kept', href);
        return null;
      },
      picture: (src) => this.picture(src, example),
    };
  }

  protected htmlNote(html: MarkupElement | string, idea: ImportedIdea): ImportedNote | undefined {
    const note = noteFromHtml(html, this.noteAddresses(idea.text));

    if (note?.format === 'plain') {
      this.report.add('formatting-not-kept', idea.text || undefined);
    }

    return note;
  }

  protected readMarker(markerId: string, idea: ImportedIdea): void {
    const meaning = xmindMarker(markerId);

    if (!meaning) {
      this.report.add('icons-not-kept', markerId);
    } else if ('icon' in meaning) {
      idea.icons.push(meaning.icon);
    } else if ('priority' in meaning) {
      idea.priority ??= meaning.priority;
    } else {
      idea.status ??= meaning.status;
    }
  }

  /** Relationships between topics, as links from the first topic to the second. */
  protected relate(fromId: string | undefined, toId: string | undefined, title: string | undefined): void {
    const from = fromId ? this.topics.get(fromId) : undefined;

    if (!from || !toId) {
      this.report.add('missing-link-targets', title || undefined);
      return;
    }

    const label = title?.trim();
    from.ideaLinks.push(label ? { target: toId, label } : { target: toId });
  }

  /** Topics XMind places beside the tree, under the topic they belong with, warned about by kind. */
  protected adopt(idea: ImportedIdea, children: ImportedIdea[], code: 'floating-ideas-moved' | 'summaries-moved' | 'callouts-moved'): void {
    for (const child of children) {
      this.report.add(code, child.text || undefined);
      idea.children.push(child);
    }
  }

  /** A titled boundary's title, as a line of the note of the topic whose subtopics it surrounds. */
  protected boundaryNote(titles: string[], idea: ImportedIdea): void {
    for (const title of titles) {
      const text = title.trim();

      if (text !== '') {
        this.report.add('boundaries-in-notes', text);
        const note = noteFromPlainText(text);

        if (note) {
          idea.notes.push(note);
        }
      }
    }
  }
}

const extensionOf = (path: string): string => {
  return /\.([A-Za-z0-9]+)$/.exec(path)?.[1].toLowerCase() ?? '';
};

/** A sheet of `content.json`. */
class JsonSheetReader extends SheetReader {
  read(sheet: Record<string, unknown>): OrbitImportedMap {
    const root = this.topic(sheet.rootTopic as Record<string, unknown>, 0);

    for (const relationship of Array.isArray(sheet.relationships) ? sheet.relationships : []) {
      if (isObject(relationship)) {
        this.relate(asString(relationship.end1Id), asString(relationship.end2Id), asString(relationship.title));
      }
    }

    return this.finish(root);
  }

  private topic(topic: Record<string, unknown>, depth: number): ImportedIdea {
    if (depth > 500) {
      throw new OrbitImportError('too-large', 'The sheet goes more than 500 levels deep.');
    }

    const idea = newIdea(asString(topic.title) ?? '');
    const id = asString(topic.id);

    if (id) {
      idea.sourceId = id;
      this.topics.set(id, idea);
    }

    const note = this.note(topic.notes, idea);

    if (note) {
      idea.notes.push(note);
    }

    if (Array.isArray(topic.labels)) {
      idea.tags.push(...topic.labels.filter((label): label is string => typeof label === 'string'));
    }

    for (const marker of Array.isArray(topic.markers) ? topic.markers : []) {
      const markerId = isObject(marker) ? asString(marker.markerId) : undefined;

      if (markerId) {
        this.readMarker(markerId, idea);
      }
    }

    this.readLink(asString(topic.href), idea);

    if (isObject(topic.image)) {
      const src = asString(topic.image.src);

      if (src) {
        idea.image ??= this.picture(src, idea.text) ?? undefined;
      }
    }

    if (topic.branch === 'folded') {
      idea.collapsed = true;
    }

    const style = isObject(topic.style) && isObject(topic.style.properties) ? topic.style.properties : {};
    const fill = asString(style['svg:fill']);

    if (fill && /^#[0-9A-Fa-f]{6}$/.test(fill)) {
      idea.color = fill.toUpperCase();
    }

    const children = isObject(topic.children) ? topic.children : {};
    const kind = (name: string): ImportedIdea[] => (Array.isArray(children[name]) ? children[name] as unknown[] : [])
      .filter(isObject)
      .map((child) => this.topic(child, depth + 1));

    idea.children.push(...kind('attached'));
    this.adopt(idea, kind('summary'), 'summaries-moved');
    this.adopt(idea, kind('callout'), 'callouts-moved');
    this.adopt(idea, kind('detached'), 'floating-ideas-moved');

    const boundaries = Array.isArray(topic.boundaries) ? topic.boundaries.filter(isObject).map((boundary) => asString(boundary.title) ?? '') : [];
    this.boundaryNote(boundaries, idea);
    return idea;
  }

  /** A topic's note: its HTML (XMind 2020 and later), its paragraphs (XMind Zen), or its plain text. */
  private note(notes: unknown, idea: ImportedIdea): ImportedNote | undefined {
    if (!isObject(notes)) {
      return undefined;
    }

    const html = isObject(notes.realHTML) ? asString(notes.realHTML.content) : undefined;

    if (html) {
      return this.htmlNote(html, idea);
    }

    const paragraphs = isObject(notes.html) && isObject(notes.html.content) && Array.isArray(notes.html.content.paragraphs) ? notes.html.content.paragraphs : null;

    if (paragraphs) {
      const blocks: NoteBlock[] = paragraphs.filter(isObject).map((paragraph) => ({
        kind: 'paragraph',
        inline: (Array.isArray(paragraph.spans) ? paragraph.spans : []).filter(isObject).map((span) => styledSpan(span)),
      }));
      const note = noteFromBlocks(blocks);

      if (note?.format === 'plain') {
        this.report.add('formatting-not-kept', idea.text || undefined);
      }

      return note;
    }

    return noteFromPlainText(isObject(notes.plain) ? asString(notes.plain.content) : undefined);
  }
}

/** A span of an XMind Zen note, with its bold, italics and strikethrough. */
const styledSpan = (span: Record<string, unknown>): NoteInline => {
  const properties = isObject(span.style) && isObject(span.style.properties) ? span.style.properties : {};
  let piece: NoteInline = { kind: 'text', text: (asString(span.text) ?? '').replace(/\s+/g, ' ') };

  if (/line-through/.test(asString(properties['fo:text-decoration']) ?? '')) {
    piece = { kind: 'strike', children: [piece] };
  }

  if (asString(properties['fo:font-style']) === 'italic') {
    piece = { kind: 'emphasis', children: [piece] };
  }

  if (/^(bold|[6-9]00)$/.test(asString(properties['fo:font-weight']) ?? '')) {
    piece = { kind: 'strong', children: [piece] };
  }

  return piece;
};

/** A sheet of `content.xml`. */
class XmlSheetReader extends SheetReader {
  private readonly styles: Map<string, string>;
  private readonly comments: Map<string, string[]>;

  constructor(archive: ZipArchive | null, styles: Map<string, string>, comments: Map<string, string[]>) {
    super(archive);
    this.styles = styles;
    this.comments = comments;
  }

  read(sheet: MarkupElement, topic: MarkupElement): OrbitImportedMap {
    const root = this.topic(topic);

    for (const relationships of childElements(sheet, 'relationships')) {
      for (const relationship of childElements(relationships, 'relationship')) {
        const title = childElement(relationship, 'title');
        this.relate(relationship.attributes.end1, relationship.attributes.end2, title ? textContent(title) : undefined);
      }
    }

    return this.finish(root);
  }

  private topic(topic: MarkupElement): ImportedIdea {
    const title = childElement(topic, 'title');
    const idea = newIdea(title ? textContent(title) : '');
    const id = topic.attributes.id;

    if (id) {
      idea.sourceId = id;
      this.topics.set(id, idea);
    }

    const notes = childElement(topic, 'notes');

    if (notes) {
      const html = childElement(notes, 'html');
      const plain = childElement(notes, 'plain');
      const note = html ? this.htmlNote(html, idea) : noteFromPlainText(plain ? textContent(plain) : undefined);

      if (note) {
        idea.notes.push(note);
      }
    }

    for (const comment of id ? this.comments.get(id) ?? [] : []) {
      const note = noteFromPlainText(comment);

      if (note) {
        idea.notes.push(note);
      }
    }

    for (const labels of childElements(topic, 'labels')) {
      idea.tags.push(...childElements(labels, 'label').map((label) => textContent(label)));
    }

    for (const markers of childElements(topic, 'marker-refs')) {
      for (const marker of childElements(markers, 'marker-ref')) {
        const markerId = marker.attributes['marker-id'];

        if (markerId) {
          this.readMarker(markerId, idea);
        }
      }
    }

    this.readLink(attributeOf(topic, 'href'), idea);
    const image = childElement(topic, 'img');
    const src = image ? attributeOf(image, 'src') : undefined;

    if (src) {
      idea.image ??= this.picture(src, idea.text) ?? undefined;
    }

    if (topic.attributes.branch === 'folded') {
      idea.collapsed = true;
    }

    const fill = this.styles.get(topic.attributes['style-id'] ?? '');

    if (fill) {
      idea.color = fill;
    }

    const children = childElement(topic, 'children');
    const kind = (type: string): ImportedIdea[] => (children ? childElements(children, 'topics') : [])
      .filter((topics) => (topics.attributes.type ?? 'attached') === type)
      .flatMap((topics) => childElements(topics, 'topic').map((child) => this.topic(child)));

    idea.children.push(...kind('attached'));
    this.adopt(idea, kind('summary'), 'summaries-moved');
    this.adopt(idea, kind('callout'), 'callouts-moved');
    this.adopt(idea, kind('detached'), 'floating-ideas-moved');

    const boundaries = childElements(topic, 'boundaries').flatMap((list) => childElements(list, 'boundary')).map((boundary) => {
      const boundaryTitle = childElement(boundary, 'title');
      return boundaryTitle ? textContent(boundaryTitle) : '';
    });

    this.boundaryNote(boundaries, idea);
    return idea;
  }
}

/** Topic fill colors by style id, from `styles.xml`. */
const readStyles = (archive: ZipArchive): Map<string, string> => {
  const fills = new Map<string, string>();

  try {
    const text = archive.has('styles.xml') ? archive.text('styles.xml') : null;

    if (!text) {
      return fills;
    }

    const pending = [parseXml(text)];

    while (pending.length > 0) {
      const element = pending.pop() as MarkupElement;

      for (const child of element.children) {
        if (!isElement(child)) {
          continue;
        }

        if (child.localName === 'style' && child.attributes.type === 'topic' && child.attributes.id) {
          const properties = childElement(child, 'topic-properties');
          const fill = properties ? attributeOf(properties, 'fill') : undefined;

          if (fill && /^#[0-9A-Fa-f]{6}$/.test(fill)) {
            fills.set(child.attributes.id, fill.toUpperCase());
          }
        }

        pending.push(child);
      }
    }
  } catch {
    // Styles only color topics: a map without them still reads.
  }

  return fills;
};

/** Comments by topic id, from `comments.xml`: "author: text". */
const readComments = (archive: ZipArchive): Map<string, string[]> => {
  const comments = new Map<string, string[]>();

  try {
    const text = archive.has('comments.xml') ? archive.text('comments.xml') : null;

    if (!text) {
      return comments;
    }

    for (const comment of childElements(parseXml(text), 'comment')) {
      const topic = comment.attributes['object-id'];
      const content = childElement(comment, 'content');
      const words = content ? textContent(content).replace(/\r\n?/g, '\n').trim() : '';

      if (topic && words !== '') {
        const author = (comment.attributes.author ?? '').trim();
        comments.set(topic, [...(comments.get(topic) ?? []), author ? `${author}: ${words}` : words]);
      }
    }
  } catch {
    // Comments are extra: a map without them still reads.
  }

  return comments;
};
