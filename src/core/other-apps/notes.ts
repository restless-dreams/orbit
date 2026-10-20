/**
 * Notes and titles from other apps. HTML notes become markdown (paragraphs,
 * headings, lists, quotes, code, bold, italic, strikethrough, links and
 * pictures), never HTML. When markdown would show the note's text any other
 * way (a `*` or `_` in it, a line that starts like a list), the note is kept
 * as plain text instead, exactly as written: formatting can be lost, words
 * never are.
 */

import { childElements, isElement, parseHtml, textContent, type MarkupElement, type MarkupNode } from './markup.js';

/** A note as Orbit keeps it. */
export interface ImportedNote {
  text: string;
  format: 'markdown' | 'plain';
}

/** Inline content, as the note's reader shows it. */
export type NoteInline =
  | { kind: 'text'; text: string }
  | { kind: 'break' }
  | { kind: 'strong' | 'emphasis' | 'strike'; children: NoteInline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: NoteInline[] }
  | { kind: 'image'; src: string; alt: string };

/** A block of a note. */
export type NoteBlock =
  | { kind: 'paragraph'; inline: NoteInline[] }
  | { kind: 'heading'; level: number; inline: NoteInline[] }
  | { kind: 'list'; ordered: boolean; items: NoteBlock[][] }
  | { kind: 'quote'; blocks: NoteBlock[] }
  | { kind: 'code'; text: string };

/** How addresses in a note are kept. */
export interface NoteAddresses {
  /** The address a link keeps, or null for its text alone. Default: web and mail addresses, and `#` links. */
  link?: (href: string) => string | null;

  /** The address a picture keeps, or null for its description alone. Default: web addresses. */
  picture?: (src: string) => string | null;
}

const BLOCK_CONTAINERS = new Set([
  'html', 'body', 'div', 'p', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'center', 'figure', 'figcaption',
  'address', 'details', 'summary', 'dl', 'dt', 'dd', 'form', 'fieldset', 'tbody', 'thead', 'tfoot', 'caption', '#fragment',
]);
const SKIPPED = new Set(['head', 'title', 'script', 'style', 'meta', 'link', 'template', 'object', 'iframe', 'svg', 'math']);
const HEADINGS = new Map<string, number>([['h1', 1], ['h2', 2], ['h3', 3], ['h4', 4], ['h5', 5], ['h6', 6]]);
const INLINE_KINDS = new Map<string, 'strong' | 'emphasis' | 'strike'>([
  ['strong', 'strong'], ['b', 'strong'], ['em', 'emphasis'], ['i', 'emphasis'], ['cite', 'emphasis'], ['s', 'strike'], ['strike', 'strike'], ['del', 'strike'],
]);
const CODE_ELEMENTS = new Set(['code', 'tt', 'kbd', 'samp', 'var']);

/** Web and mail addresses, and links within the map. */
export const isKeptLink = (href: string): boolean => {
  return /^(https?:\/\/|mailto:)\S+$/i.test(href) || /^#\S+$/.test(href);
};

/** An address as a link keeps it: `www.example.com` is a web address; a file or anything else is null. */
export const keptAddress = (href: string): string | null => {
  const address = href.trim();

  if (/^www\.[^\s/]+\.\S+$/i.test(address)) {
    return `https://${address}`;
  }

  return isKeptLink(address) ? address : null;
};

const isWebAddress = (src: string): boolean => {
  return /^https?:\/\/\S+$/i.test(src);
};

/** An HTML note (an element, or HTML as text) as an Orbit note; undefined when it holds no text. */
export const noteFromHtml = (html: MarkupElement | string, addresses: NoteAddresses = {}): ImportedNote | undefined => {
  const element = typeof html === 'string' ? parseHtml(html) : html;
  return noteFromBlocks(readBlocks(element.children, addresses), addresses);
};

/** A plain text note: markdown when it reads the same as markdown, otherwise plain, as written. */
export const noteFromPlainText = (text: string | undefined): ImportedNote | undefined => {
  const cleaned = (text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');

  if (cleaned.trim() === '') {
    return undefined;
  }

  const paragraphs = cleaned.split(/\n{2,}/);
  const readsTheSame = paragraphs.every((paragraph) => !paragraph.includes('\n') && isInertText(paragraph) && isInertLineStart(paragraph));
  return { text: cleaned, format: readsTheSame ? 'markdown' : 'plain' };
};

/** Blocks as a note: markdown when every word reads back as written, otherwise plain text. */
export const noteFromBlocks = (blocks: NoteBlock[], addresses: NoteAddresses = {}): ImportedNote | undefined => {
  const kept = blocks.filter((block) => !isEmptyBlock(block));

  if (kept.length === 0) {
    return undefined;
  }

  const writer = new MarkdownWriter(addresses);
  const markdown = writer.blocks(kept);

  if (writer.inert && markdown.trim() !== '') {
    return { text: markdown, format: 'markdown' };
  }

  const plain = plainBlocks(kept).trim();
  return plain === '' ? undefined : { text: plain, format: 'plain' };
};

/** Two or more notes as one: markdown if all are, otherwise plain text, separated by blank lines. */
export const joinNotes = (notes: (ImportedNote | undefined)[]): ImportedNote | undefined => {
  const present = notes.filter((note): note is ImportedNote => note !== undefined && note.text.trim() !== '');

  if (present.length <= 1) {
    return present[0];
  }

  return {
    text: present.map((note) => note.text).join('\n\n'),
    format: present.every((note) => note.format === 'markdown') ? 'markdown' : 'plain',
  };
};

/** A title from HTML: what a reader sees, on one line, and the address of its first link. */
export const titleFromHtml = (html: MarkupElement | string): { text: string; link?: string } => {
  const element = typeof html === 'string' ? parseHtml(html) : html;
  const pieces = inlineFrom(element.children, {});
  const link = firstLink(pieces);
  return { text: plainInline(pieces, false, false).replace(/\s+/g, ' ').trim(), ...(link ? { link } : {}) };
};

const firstLink = (pieces: NoteInline[]): string | undefined => {
  for (const piece of pieces) {
    if (piece.kind === 'link') {
      return piece.href;
    }

    if (piece.kind === 'strong' || piece.kind === 'emphasis' || piece.kind === 'strike') {
      const inner = firstLink(piece.children);

      if (inner) {
        return inner;
      }
    }
  }

  return undefined;
};

/** The note's blocks, from HTML nodes. */
export const readBlocks = (nodes: MarkupNode[], addresses: NoteAddresses): NoteBlock[] => {
  const blocks: NoteBlock[] = [];
  let inline: NoteInline[] = [];

  const flush = (): void => {
    const trimmed = trimInline(inline);

    if (trimmed.length > 0) {
      blocks.push({ kind: 'paragraph', inline: trimmed });
    }

    inline = [];
  };

  for (const node of nodes) {
    if (!isElement(node)) {
      inline.push(...inlineFrom([node], addresses));
      continue;
    }

    const name = node.localName.toLowerCase();

    if (SKIPPED.has(name)) {
      continue;
    }

    const headingLevel = HEADINGS.get(name);

    if (headingLevel !== undefined) {
      flush();
      const content = trimInline(inlineFrom(node.children, addresses).map((piece) => (piece.kind === 'break' ? { kind: 'text', text: ' ' } as NoteInline : piece)));

      if (content.length > 0) {
        blocks.push({ kind: 'heading', level: headingLevel, inline: content });
      }
    } else if (name === 'ul' || name === 'ol' || name === 'menu' || name === 'dir') {
      flush();
      const items = node.children
        .filter((child) => isElement(child) || child.trim() !== '')
        .map((child) => readBlocks(isElement(child) && child.localName.toLowerCase() === 'li' ? child.children : [child], addresses))
        .filter((item) => item.some((block) => !isEmptyBlock(block)));

      if (items.length > 0) {
        blocks.push({ kind: 'list', ordered: name === 'ol', items });
      }
    } else if (name === 'li') {
      flush();
      blocks.push({ kind: 'list', ordered: false, items: [readBlocks(node.children, addresses)] });
    } else if (name === 'blockquote') {
      flush();
      const quoted = readBlocks(node.children, addresses);

      if (quoted.length > 0) {
        blocks.push({ kind: 'quote', blocks: quoted });
      }
    } else if (name === 'pre') {
      flush();
      const code = textContent(node).replace(/^\n/, '').replace(/\s+$/, '');

      if (code !== '') {
        blocks.push({ kind: 'code', text: code });
      }
    } else if (name === 'table') {
      flush();
      blocks.push(...tableRows(node, addresses));
    } else if (name === 'hr') {
      flush();
    } else if (BLOCK_CONTAINERS.has(name)) {
      flush();
      blocks.push(...readBlocks(node.children, addresses));
    } else {
      inline.push(...inlineFrom([node], addresses));
    }
  }

  flush();
  return blocks;
};

/** Each row of a table as a paragraph, its cells' text between middle dots. */
const tableRows = (table: MarkupElement, addresses: NoteAddresses): NoteBlock[] => {
  const rows: NoteBlock[] = [];
  const pending: MarkupElement[] = [table];

  while (pending.length > 0) {
    const element = pending.shift() as MarkupElement;

    for (const child of childElements(element)) {
      const name = child.localName.toLowerCase();

      if (name === 'tr') {
        const cells = childElements(child).filter((cell) => /^t[dh]$/.test(cell.localName.toLowerCase()));
        const inline: NoteInline[] = [];

        for (const cell of cells) {
          const content = trimInline(inlineFrom(cell.children, addresses).map((piece) => (piece.kind === 'break' ? { kind: 'text', text: ' ' } as NoteInline : piece)));

          if (content.length > 0) {
            if (inline.length > 0) {
              inline.push({ kind: 'text', text: ' · ' });
            }

            inline.push(...content);
          }
        }

        if (inline.length > 0) {
          rows.push({ kind: 'paragraph', inline });
        }
      } else if (name !== 'td' && name !== 'th') {
        pending.push(child);
      }
    }
  }

  return rows;
};

/** Inline content from HTML nodes; block elements inside it read as their text. */
const inlineFrom = (nodes: MarkupNode[], addresses: NoteAddresses): NoteInline[] => {
  const pieces: NoteInline[] = [];

  for (const node of nodes) {
    if (!isElement(node)) {
      const text = node.replace(/[ \t\n\r\f]+/g, ' ');

      if (text !== '') {
        pieces.push({ kind: 'text', text });
      }

      continue;
    }

    const name = node.localName.toLowerCase();

    if (SKIPPED.has(name)) {
      continue;
    }

    if (name === 'br') {
      pieces.push({ kind: 'break' });
    } else if (name === 'img') {
      const src = node.attributes.src ?? Object.entries(node.attributes).find(([key]) => key.endsWith(':src'))?.[1] ?? '';
      pieces.push({ kind: 'image', src, alt: (node.attributes.alt ?? node.attributes.title ?? '').trim() });
    } else if (INLINE_KINDS.has(name)) {
      pieces.push({ kind: INLINE_KINDS.get(name) as 'strong' | 'emphasis' | 'strike', children: inlineFrom(node.children, addresses) });
    } else if (CODE_ELEMENTS.has(name)) {
      pieces.push({ kind: 'code', text: textContent(node).replace(/\s+/g, ' ') });
    } else if (name === 'a') {
      const href = (node.attributes.href ?? Object.entries(node.attributes).find(([key]) => key.endsWith(':href'))?.[1] ?? '').trim();
      const children = inlineFrom(node.children, addresses);

      if (href) {
        pieces.push({ kind: 'link', href, children });
      } else {
        pieces.push(...children);
      }
    } else {
      // A block inside a line, or an element HTML only uses for looks: its content, between spaces where blocks part.
      const block = BLOCK_CONTAINERS.has(name) || HEADINGS.has(name) || name === 'li' || name === 'tr';
      const content = inlineFrom(node.children, addresses);

      if (block && pieces.length > 0) {
        pieces.push({ kind: 'break' });
      }

      pieces.push(...content);
    }
  }

  return pieces;
};

/** Inline content without the spaces and line breaks at its ends. */
const trimInline = (pieces: NoteInline[]): NoteInline[] => {
  const result = [...pieces];

  while (result.length > 0 && isBlankPiece(result[0])) {
    result.shift();
  }

  while (result.length > 0 && isBlankPiece(result[result.length - 1])) {
    result.pop();
  }

  if (result.length > 0 && result[0].kind === 'text') {
    result[0] = { kind: 'text', text: result[0].text.replace(/^ +/, '') };
  }

  const last = result.length - 1;

  if (last >= 0 && result[last].kind === 'text') {
    result[last] = { kind: 'text', text: (result[last] as { text: string }).text.replace(/ +$/, '') };
  }

  return result;
};

const isBlankPiece = (piece: NoteInline): boolean => {
  return piece.kind === 'break' || (piece.kind === 'text' && piece.text.trim() === '');
};

const isEmptyBlock = (block: NoteBlock): boolean => {
  switch (block.kind) {
    case 'paragraph':
    case 'heading':
      return plainInline(block.inline, false).trim() === '' && !block.inline.some((piece) => piece.kind === 'image' && piece.src !== '');
    case 'list':
      return block.items.every((item) => item.every(isEmptyBlock));
    case 'quote':
      return block.blocks.every(isEmptyBlock);
    case 'code':
      return block.text.trim() === '';
  }
};

// Text markdown would read as something else: emphasis, code, links, pictures, escapes, HTML and character references.
const ACTIVE_CHARACTERS = /[`*_~[\]<\\]|&#?[A-Za-z0-9]+;/;
// Lines markdown reads as headings, quotes, lists, rules, fences or code.
const ACTIVE_LINE_START = /^(\s{4,}|\s*(#{1,6}(\s|$)|>|[-*+](\s|$)|\d{1,9}[.)](\s|$)|```|~~~|[-=_]{3,}\s*$))/;

const isInertText = (text: string): boolean => {
  return !ACTIVE_CHARACTERS.test(text);
};

const isInertLineStart = (line: string): boolean => {
  return !ACTIVE_LINE_START.test(line);
};

/** Writes blocks as markdown, and notes whether any text would read back differently (`inert` turns false). */
class MarkdownWriter {
  inert = true;
  private readonly addresses: NoteAddresses;

  constructor(addresses: NoteAddresses) {
    this.addresses = addresses;
  }

  blocks(blocks: NoteBlock[]): string {
    return blocks.map((block) => this.block(block)).filter((text) => text !== '').join('\n\n');
  }

  private block(block: NoteBlock): string {
    switch (block.kind) {
      case 'paragraph': {
        // Markdown in notes has no line breaks inside a paragraph: each line becomes a paragraph of its own.
        const lines = this.inlineLines(block.inline);
        return lines.map((line) => this.lineStart(line)).filter((line) => line !== '').join('\n\n');
      }
      case 'heading': {
        const text = this.inlineLines(block.inline).join(' ').trim();
        return text === '' ? '' : `${'#'.repeat(block.level)} ${text}`;
      }
      case 'list':
        return this.list(block, 0);
      case 'quote': {
        const inner = this.blocks(block.blocks);
        return inner.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');
      }
      case 'code': {
        if (/^\s*(```|~~~)/m.test(block.text)) {
          this.inert = false;
        }

        return `\`\`\`\n${block.text}\n\`\`\``;
      }
    }
  }

  private list(list: Extract<NoteBlock, { kind: 'list' }>, indent: number): string {
    const lines: string[] = [];

    list.items.forEach((item, index) => {
      const marker = list.ordered ? `${index + 1}.` : '-';
      const nested: string[] = [];
      const words: string[] = [];

      for (const block of item) {
        if (block.kind === 'list') {
          nested.push(this.list(block, indent + marker.length + 1));
        } else {
          words.push(this.flatText(block));
        }
      }

      const text = words.filter((word) => word !== '').join(' ');
      lines.push(`${' '.repeat(indent)}${marker} ${text}`.trimEnd());
      lines.push(...nested);
    });

    return lines.join('\n');
  }

  /** A block inside a list item, on the item's line. */
  private flatText(block: NoteBlock): string {
    switch (block.kind) {
      case 'paragraph':
      case 'heading':
        return this.inlineLines(block.inline).join(' ').trim();
      case 'quote':
        return block.blocks.map((inner) => this.flatText(inner)).join(' ');
      case 'code':
        return this.code(block.text.replace(/\s+/g, ' '));
      case 'list':
        return this.list(block, 0);
    }
  }

  /** A paragraph's first characters, checked: a line that starts like a list or a heading would read as one. */
  private lineStart(line: string): string {
    if (!isInertLineStart(line)) {
      this.inert = false;
    }

    return line.trim();
  }

  /** Inline content as markdown lines, split where it breaks. */
  private inlineLines(pieces: NoteInline[]): string[] {
    return this.inlineText(pieces).split('\n').map((line) => line.replace(/ {2,}/g, ' ').trim());
  }

  /** Inline content as markdown, breaks as line feeds, spaces where the note had them. */
  private inlineText(pieces: NoteInline[]): string {
    return mergeNeighbors(pieces).map((piece) => (piece.kind === 'break' ? '\n' : this.inline(piece))).join('');
  }

  private inline(piece: NoteInline): string {
    switch (piece.kind) {
      case 'text':
        if (!isInertText(piece.text)) {
          this.inert = false;
        }

        return piece.text;
      case 'break':
        return ' ';
      case 'strong':
      case 'emphasis':
      case 'strike': {
        const inner = this.inlineText(piece.children).replace(/\n/g, ' ').replace(/ {2,}/g, ' ');
        // Spaces at the ends go outside the marks: markdown doesn't read "** bold**" as bold.
        const [, before, middle, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) as RegExpExecArray;

        if (middle === '') {
          return inner;
        }

        const mark = piece.kind === 'strong' ? '**' : piece.kind === 'emphasis' ? '*' : '~~';
        return `${before}${mark}${middle}${mark}${after}`;
      }
      case 'code':
        return this.code(piece.text);
      case 'link': {
        const label = this.inlineLines(piece.children).join(' ').trim();
        const href = (this.addresses.link ?? defaultLink)(piece.href);

        if (!href) {
          return label;
        }

        return label === '' || label === href ? `<${encodeAddress(href)}>` : `[${label}](${encodeAddress(href)})`;
      }
      case 'image': {
        const src = piece.src ? (this.addresses.picture ?? defaultPicture)(piece.src) : null;

        if (!src) {
          if (!isInertText(piece.alt)) {
            this.inert = false;
          }

          return piece.alt;
        }

        if (!isInertText(piece.alt)) {
          this.inert = false;
        }

        return `![${piece.alt}](${encodeAddress(src)})`;
      }
    }
  }

  private code(text: string): string {
    const trimmed = text.trim();

    if (trimmed === '') {
      return '';
    }

    if (trimmed.includes('`')) {
      this.inert = false;
    }

    return `\`${trimmed}\``;
  }
}

/** Neighbors of the same kind as one: two italic runs side by side would close and reopen their marks, which markdown misreads. */
const mergeNeighbors = (pieces: NoteInline[]): NoteInline[] => {
  const merged: NoteInline[] = [];

  for (const piece of pieces) {
    const last = merged[merged.length - 1];

    if (last && last.kind === piece.kind && (piece.kind === 'strong' || piece.kind === 'emphasis' || piece.kind === 'strike')) {
      merged[merged.length - 1] = { kind: piece.kind, children: [...(last as { children: NoteInline[] }).children, ...piece.children] };
    } else {
      merged.push(piece);
    }
  }

  return merged;
};

const defaultLink = (href: string): string | null => {
  return keptAddress(href);
};

const defaultPicture = (src: string): string | null => {
  return isWebAddress(src) ? src : null;
};

/** An address as a markdown link takes it: spaces and parentheses escaped. */
const encodeAddress = (address: string): string => {
  return address.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/</g, '%3C').replace(/>/g, '%3E');
};

/** Blocks as plain text: lists keep their markers, links their addresses. */
const plainBlocks = (blocks: NoteBlock[], indent = ''): string => {
  return blocks.map((block) => plainBlock(block, indent)).filter((text) => text.trim() !== '').join('\n\n');
};

const plainBlock = (block: NoteBlock, indent: string): string => {
  switch (block.kind) {
    case 'paragraph':
      return prefixLines(plainInline(block.inline, true), indent);
    case 'heading':
      return prefixLines(plainInline(block.inline, false).trim(), indent);
    case 'list':
      return block.items.map((item, index) => {
        const marker = block.ordered ? `${index + 1}. ` : '- ';
        const text = plainBlocks(item.filter((inner) => inner.kind !== 'list'), '').replace(/\n+/g, ' ').trim();
        const nested = item.filter((inner) => inner.kind === 'list').map((inner) => plainBlock(inner, `${indent}${' '.repeat(marker.length)}`));
        return [`${indent}${marker}${text}`.trimEnd(), ...nested].join('\n');
      }).join('\n');
    case 'quote':
      return prefixLines(plainBlocks(block.blocks), `${indent}> `);
    case 'code':
      return prefixLines(block.text, indent);
  }
};

const prefixLines = (text: string, prefix: string): string => {
  return prefix === '' ? text : text.split('\n').map((line) => `${prefix}${line}`).join('\n');
};

/** Inline content as plain text; `breaks` keeps line breaks, otherwise they're spaces, and `addresses` writes a link's address after its text. */
const plainInline = (pieces: NoteInline[], breaks: boolean, addresses = true): string => {
  let text = '';

  for (const piece of pieces) {
    switch (piece.kind) {
      case 'text':
        text += piece.text;
        break;
      case 'break':
        text += breaks ? '\n' : ' ';
        break;
      case 'strong':
      case 'emphasis':
      case 'strike':
        text += plainInline(piece.children, breaks, addresses);
        break;
      case 'code':
        text += piece.text;
        break;
      case 'link': {
        const label = plainInline(piece.children, breaks, addresses).trim();
        const href = addresses && isKeptLink(piece.href) && !piece.href.startsWith('#') ? piece.href : '';
        text += href && label && label !== href ? `${label} (${href})` : label || href;
        break;
      }
      case 'image':
        text += piece.alt;
        break;
    }
  }

  return text.split('\n').map((line) => line.replace(/ {2,}/g, ' ').trim()).join('\n');
};
