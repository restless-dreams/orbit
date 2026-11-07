/**
 * A small, safe markdown renderer for notes. It builds DOM nodes directly
 * (never `innerHTML`), so note text can't inject markup, and links and
 * images go through the same URL guard as the rest of the map.
 *
 * Supported: paragraphs, headings, bullet and numbered lists (nested by
 * indentation), checklists (`- [ ]` and `- [x]`, at any depth), tables
 * (GitHub's: a header row, then a row of dashes, with colons for
 * alignment), blockquotes, fenced code, **bold**, *italic*, ~~strike~~,
 * `code`, [links](https://…), <https://autolinks> and ![images](…).
 *
 * A note is read into blocks first (`readNote`), as plain data that knows
 * the line each checkbox is on, then drawn: the boxes on the page and the
 * lines `setNoteCheckbox` changes come from the same reading.
 */

import { CODE_OR_COMMENT, isNodeLink } from '../node-links.js';
import { guardUrl, resolveUrl } from '../url-guard.js';

/** A box of a note's checklist checked or unchecked: its line in the note, from 0, and whether it's checked now. */
export interface NoteCheck {
  line: number;
  checked: boolean;
}

export interface NoteRenderContext {
  /** Where relative links and pictures resolve from: the map's `baseUrl`. */
  baseUrl?: string;

  /** Whether a `#id` link points at a node of the map; links to missing nodes show as text. */
  resolveLink?: (href: string) => unknown;

  /**
   * Called when someone checks or unchecks a box of the note's checklists,
   * with the box's line in the note and whether it's checked now:
   * `setNoteCheckbox` writes that into the note. Without it, the boxes show
   * but don't change.
   */
  onCheck?: (check: NoteCheck) => void;
}

/** A note as DOM nodes, the way the detail sheet shows it: for pages that show notes in their own UI. */
export const renderNoteMarkdown = (markdown: string, context: NoteRenderContext = {}): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  renderBlocks(readNote(markdown), context, fragment);
  return fragment;
};

/**
 * The note with the checkbox on `line` (counted from 0, as `onCheck` gives
 * it) checked or unchecked, and every other character as it was; null when
 * the note has no box on that line, as after it changed.
 */
export const setNoteCheckbox = (note: string, line: number, checked: boolean): string | null => {
  const box = noteCheckboxes(note).find((candidate) => candidate.line === line);

  if (!box) {
    return null;
  }

  // The lines with the breaks between them, so the note keeps its own.
  const parts = note.split(/(\r\n?|\n)/);
  const written = parts[line * 2] ?? '';
  const shown = withoutComments(note).replace(/\r\n?/g, '\n').split('\n')[line] ?? '';
  const end = box.column + 3;

  // The box was read with comments hidden: it's at that column of the line as written only when nothing before it was.
  if (written.slice(0, end) !== shown.slice(0, end)) {
    return null;
  }

  if (box.checked === checked) {
    return note;
  }

  parts[line * 2] = `${written.slice(0, box.column + 1)}${checked ? 'x' : ' '}${written.slice(box.column + 2)}`;
  return parts.join('');
};

/** A checkbox of a note's checklists: its line, the column of its `[` on that line, and whether it's checked. */
export interface NoteCheckbox {
  line: number;
  column: number;
  checked: boolean;
}

/** The checkboxes of a note's checklists, in the order they show. */
export const noteCheckboxes = (note: string): NoteCheckbox[] => {
  const boxes: NoteCheckbox[] = [];

  const visit = (blocks: NoteBlock[]): void => {
    for (const block of blocks) {
      if (block.kind === 'quote') {
        visit(block.blocks);
      } else if (block.kind === 'list') {
        for (const item of block.items) {
          if (item.box) {
            boxes.push(item.box);
          }

          visit(item.under.filter((part): part is NoteBlock => typeof part !== 'string'));
        }
      }
    }
  };

  visit(readNote(note));
  return boxes;
};

/** The note without its HTML comments, which stay in the map's file; code shows them as written. Every line stays on its line. */
const withoutComments = (markdown: string): string => {
  return markdown.replace(CODE_OR_COMMENT, (match: string, code: string | undefined) => code ?? match.replace(/[^\r\n]/g, ''));
};

// Reading

/** A line of the note, as far in as the blocks around it leave it: inside a quote, without its `>`. */
interface NoteLine {
  text: string;

  /** Its line in the note, from 0. */
  line: number;

  /** Where `text` starts on the line, after the quote markers taken off it. */
  offset: number;
}

type CellAlignment = 'left' | 'center' | 'right' | null;

type NoteBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; blocks: NoteBlock[] }
  /** A quote past the nesting cap, shown as its text. */
  | { kind: 'flat-quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: NoteItem[] }
  | { kind: 'table'; alignments: CellAlignment[]; head: string[]; rows: string[][] };

interface NoteItem {
  text: string;

  /** Its checkbox, when it's an item of a checklist. */
  box: NoteCheckbox | null;

  /** What's under its text, in order: lists, and lines after them or past the nesting cap, shown as they are. */
  under: (NoteBlock | string)[];
}

/** Quotes and lists nest at most this deep; deeper lines show as their text, so a note of nothing but `>` degrades instead of stalling or blowing the stack. */
const MAX_NESTING = 100;

const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^\s*>/;
const ENDS_PARAGRAPH = /^\s*(```|~~~|>|#{1,6}\s)/;

/** A checklist item's box, at the start of its text: `[ ]`, `[x]` or `[X]`, then a space or the end of the line. */
const CHECKBOX = /^\[([ xX])\](?:\s+|$)/;

/** A cell of a table's second row: dashes, with a colon at either end for the column's alignment. */
const DELIMITER_CELL = /^:?-+:?$/;

const readNote = (markdown: string): NoteBlock[] => {
  const lines = withoutComments(markdown).replace(/\r\n?/g, '\n').split('\n');
  return readBlocks(lines.map((text, line): NoteLine => ({ text, line, offset: 0 })), 0);
};

const readBlocks = (lines: NoteLine[], depth: number): NoteBlock[] => {
  const blocks: NoteBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].text;

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);

    if (fence) {
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].text.trimStart().startsWith(fence[1])) {
        code.push(lines[index].text);
        index += 1;
      }

      index += 1;
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);

    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: NoteLine[] = [];

      while (index < lines.length && QUOTE.test(lines[index].text)) {
        const { text, line: number, offset } = lines[index];
        const inside = text.replace(/^\s*>\s?/, '');
        quoted.push({ text: inside, line: number, offset: offset + text.length - inside.length });
        index += 1;
      }

      blocks.push(depth >= MAX_NESTING
        ? { kind: 'flat-quote', text: quoted.map((inside) => inside.text).join(' ') }
        : { kind: 'quote', blocks: readBlocks(quoted, depth + 1) });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const [list, next] = readList(lines, index, depth);
      blocks.push(list);
      index = next;
      continue;
    }

    const table = readTable(lines, index);

    if (table) {
      blocks.push(table.block);
      index = table.next;
      continue;
    }

    // A paragraph takes its first line whatever it looks like: a line that starts a block was read above, and one
    // that only looks like it (`#` after four spaces) would otherwise end the paragraph before it began, forever.
    const paragraph = [line.trim()];
    index += 1;

    while (
      index < lines.length
      && lines[index].text.trim() !== ''
      && !ENDS_PARAGRAPH.test(lines[index].text)
      && !LIST_ITEM.test(lines[index].text)
      // A table may start right under a paragraph, as on GitHub.
      && !readTable(lines, index)
    ) {
      paragraph.push(lines[index].text.trim());
      index += 1;
    }

    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
};

const readList = (lines: NoteLine[], start: number, depth: number): [NoteBlock, number] => {
  const first = LIST_ITEM.exec(lines[start].text)!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: NoteItem[] = [];
  let index = start;
  let current: NoteItem | null = null;

  while (index < lines.length) {
    const { text: line, line: number, offset } = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const item = LIST_ITEM.exec(line);
    const lineIndent = line.length - line.trimStart().length;

    if (item && item[1].length === indent && /\d/.test(item[2]) !== ordered) {
      break;
    }

    if (item && item[1].length === indent) {
      const box = CHECKBOX.exec(item[3]);
      current = {
        text: box ? item[3].slice(box[0].length) : item[3],
        box: box ? { line: number, column: offset + line.length - item[3].length, checked: box[1] !== ' ' } : null,
        under: [],
      };
      items.push(current);
      index += 1;
      continue;
    }

    if (item && item[1].length > indent && current) {
      if (depth >= MAX_NESTING) {
        // Past the nesting cap the item's text joins its parent's.
        current.under.push(` ${line.trim()}`);
        index += 1;
        continue;
      }

      const [nested, next] = readList(lines, index, depth + 1);
      current.under.push(nested);
      index = next;
      continue;
    }

    if (!item && lineIndent > indent && current) {
      // A line that goes on with the item's text joins it; one after a list under it comes after that list.
      if (current.under.length === 0) {
        current.text = `${current.text} ${line.trim()}`;
      } else {
        current.under.push(` ${line.trim()}`);
      }

      index += 1;
      continue;
    }

    break;
  }

  return [{ kind: 'list', ordered, items }, index];
};

/**
 * The table that starts at `start`, and the line after it: a header row
 * and a row of dashes with as many cells, each line with a `|`. Its rows go
 * on to a blank line, or a line that starts another block.
 */
const readTable = (lines: NoteLine[], start: number): { block: NoteBlock; next: number } | null => {
  const header = lines[start]?.text;
  const delimiter = lines[start + 1]?.text;

  if (header === undefined || delimiter === undefined || !header.includes('|') || !delimiter.includes('|')) {
    return null;
  }

  const head = splitRow(header);
  const dashes = splitRow(delimiter);

  if (dashes.length !== head.length || !dashes.every((cell) => DELIMITER_CELL.test(cell))) {
    return null;
  }

  const alignments = dashes.map((cell): CellAlignment => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
  });

  const rows: string[][] = [];
  let index = start + 2;

  while (index < lines.length) {
    const line = lines[index].text;

    if (line.trim() === '' || ENDS_PARAGRAPH.test(line) || LIST_ITEM.test(line)) {
      break;
    }

    // A row's missing cells are empty, and cells past the header's are left out.
    const cells = splitRow(line);
    rows.push(head.map((_cell, column) => cells[column] ?? ''));
    index += 1;
  }

  return { block: { kind: 'table', alignments, head, rows }, next: index };
};

/**
 * A table row's cells, without the pipes at either end. A cell holds a
 * pipe written `\|`, or inside code: neither ends the cell.
 */
const splitRow = (line: string): string[] => {
  let row = line.trim();

  if (row.startsWith('|')) {
    row = row.slice(1);
  }

  if (row.endsWith('|') && !row.endsWith('\\|')) {
    row = row.slice(0, -1);
  }

  const cells: string[] = [];
  let cell = '';
  let index = 0;

  while (index < row.length) {
    const character = row[index];

    if (character === '\\' && row[index + 1] === '|') {
      cell += '|';
      index += 2;
      continue;
    }

    if (character === '`') {
      // Code as the cell shows it: from a run of backticks to the next run of as many.
      const code = /^(`+)[\s\S]*?\1/.exec(row.slice(index));
      const taken = code ? code[0] : /^`+/.exec(row.slice(index))![0];
      cell += taken.replace(/\\\|/g, '|');
      index += taken.length;
      continue;
    }

    if (character === '|') {
      cells.push(cell.trim());
      cell = '';
      index += 1;
      continue;
    }

    cell += character;
    index += 1;
  }

  cells.push(cell.trim());
  return cells;
};

// Drawing

const renderBlocks = (blocks: NoteBlock[], context: NoteRenderContext, parent: Node): void => {
  for (const block of blocks) {
    renderBlock(block, context, parent);
  }
};

const renderBlock = (block: NoteBlock, context: NoteRenderContext, parent: Node): void => {
  switch (block.kind) {
    case 'paragraph': {
      const element = document.createElement('p');
      appendInline(element, block.text, context);
      parent.appendChild(element);
      break;
    }
    case 'heading': {
      const element = document.createElement(`h${Math.min(5, Math.max(3, block.level + 2))}`);
      appendInline(element, block.text, context);
      parent.appendChild(element);
      break;
    }
    case 'code': {
      const pre = document.createElement('pre');
      const element = document.createElement('code');
      element.textContent = block.text;
      pre.appendChild(element);
      parent.appendChild(pre);
      break;
    }
    case 'quote': {
      const blockquote = document.createElement('blockquote');
      renderBlocks(block.blocks, context, blockquote);
      parent.appendChild(blockquote);
      break;
    }
    case 'flat-quote': {
      const blockquote = document.createElement('blockquote');
      const paragraph = document.createElement('p');
      appendInline(paragraph, block.text, context);
      blockquote.appendChild(paragraph);
      parent.appendChild(blockquote);
      break;
    }
    case 'list':
      parent.appendChild(renderList(block.ordered, block.items, context));
      break;
    case 'table':
      parent.appendChild(renderTable(block.alignments, block.head, block.rows, context));
      break;
  }
};

const renderList = (ordered: boolean, items: NoteItem[], context: NoteRenderContext): HTMLElement => {
  const list = document.createElement(ordered ? 'ol' : 'ul');

  if (items.some((item) => item.box)) {
    list.className = 'orbit-note__checklist';
  }

  for (const item of items) {
    const element = document.createElement('li');

    if (item.box) {
      element.className = 'orbit-note__item';
      element.appendChild(renderCheck(item.box, item.text, context));
    } else {
      appendInline(element, item.text, context);
    }

    for (const part of item.under) {
      if (typeof part === 'string') {
        element.appendChild(document.createTextNode(part));
      } else {
        renderBlock(part, context, element);
      }
    }

    list.appendChild(element);
  }

  return list;
};

/**
 * A checklist item: its box and its text in a label, so the text names the
 * box for screen readers and a press on it checks the box too. The box is
 * a real checkbox, for the keyboard; without `onCheck` it doesn't change.
 */
const renderCheck = (box: NoteCheckbox, text: string, context: NoteRenderContext): HTMLElement => {
  const label = document.createElement('label');
  label.className = 'orbit-note__check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'orbit-note__box';
  input.defaultChecked = box.checked;
  input.checked = box.checked;
  input.dataset.line = String(box.line);
  const onCheck = context.onCheck;

  if (onCheck) {
    input.addEventListener('change', () => onCheck({ line: box.line, checked: input.checked }));
  } else {
    input.disabled = true;
    label.classList.add('orbit-note__check--disabled');
  }

  const words = document.createElement('span');
  words.className = 'orbit-note__label';
  appendInline(words, text, context);
  label.append(input, words);
  return label;
};

/** A table, in a box of its own that scrolls sideways when the table is wider than the note. */
const renderTable = (alignments: CellAlignment[], head: string[], rows: string[][], context: NoteRenderContext): HTMLElement => {
  const scroller = document.createElement('div');
  scroller.className = 'orbit-note__table';
  const table = document.createElement('table');
  const header = document.createElement('thead');
  header.appendChild(renderRow('th', head, alignments, context));
  table.appendChild(header);

  if (rows.length > 0) {
    const body = document.createElement('tbody');

    for (const row of rows) {
      body.appendChild(renderRow('td', row, alignments, context));
    }

    table.appendChild(body);
  }

  scroller.appendChild(table);
  return scroller;
};

/** Cells with more characters than this wrap; shorter ones keep to one line, so a narrow note scrolls a wide table rather than squeezing it. */
const LONG_CELL = 32;

const renderRow = (kind: 'th' | 'td', cells: string[], alignments: CellAlignment[], context: NoteRenderContext): HTMLTableRowElement => {
  const row = document.createElement('tr');

  cells.forEach((text, column) => {
    const cell = document.createElement(kind);
    cell.className = text.length > LONG_CELL ? 'orbit-note__cell orbit-note__cell--long' : 'orbit-note__cell';

    if (kind === 'th') {
      cell.setAttribute('scope', 'col');
    }

    const alignment = alignments[column];

    if (alignment) {
      cell.style.textAlign = alignment;
    }

    appendInline(cell, text, context);
    row.appendChild(cell);
  });

  return row;
};

// URLs may contain one level of balanced parentheses: [x](https://en.wikipedia.org/wiki/Orbit_(film)).
const URL_IN_PARENTHESES = String.raw`\(((?:[^()\s]|\([^()\s]*\))+)\)`;
const INLINE = new RegExp(
  String.raw`(` + '`' + String.raw`+)([\s\S]*?)\1|!\[([^\]]*)\]` + URL_IN_PARENTHESES
    + String.raw`|\[([^\]]+)\]` + URL_IN_PARENTHESES
    + String.raw`|<(https?:\/\/[^>\s]+|mailto:[^>\s]+)>|(\*\*|__)([\s\S]+?)\8|~~([\s\S]+?)~~|(\*|_)([^\s*_][\s\S]*?)\11`,
  'g',
);

const appendInline = (parent: HTMLElement, text: string, context: NoteRenderContext): void => {
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0;

    if (index > last) {
      parent.appendChild(document.createTextNode(text.slice(last, index)));
    }

    last = index + match[0].length;

    if (match[1] !== undefined) {
      const code = document.createElement('code');
      code.textContent = match[2].trim();
      parent.appendChild(code);
    } else if (match[4] !== undefined) {
      const source = guardUrl(match[4], 'image');

      if (source) {
        const image = document.createElement('img');
        image.src = resolveUrl(source, context.baseUrl);
        image.alt = match[3];
        image.loading = 'lazy';
        parent.appendChild(image);
      } else {
        parent.appendChild(document.createTextNode(match[3]));
      }
    } else if (match[6] !== undefined) {
      parent.appendChild(createLink(match[6], match[5], context));
    } else if (match[7] !== undefined) {
      parent.appendChild(createLink(match[7], match[7], context));
    } else if (match[9] !== undefined) {
      const strong = document.createElement('strong');
      appendInline(strong, match[9], context);
      parent.appendChild(strong);
    } else if (match[10] !== undefined) {
      const deleted = document.createElement('del');
      appendInline(deleted, match[10], context);
      parent.appendChild(deleted);
    } else if (match[12] !== undefined) {
      const emphasis = document.createElement('em');
      appendInline(emphasis, match[12], context);
      parent.appendChild(emphasis);
    }
  }

  if (last < text.length) {
    parent.appendChild(document.createTextNode(text.slice(last)));
  }
};

const createLink = (url: string, label: string, context: NoteRenderContext): Node => {
  if (isNodeLink(url)) {
    // A link to another node of the map: the detail sheet flies there.
    const resolved = !context.resolveLink || context.resolveLink(url);
    const element = document.createElement(resolved ? 'a' : 'span');

    if (element instanceof HTMLAnchorElement) {
      element.href = url;
    }

    appendInline(element, label, context);
    return element;
  }

  const safe = guardUrl(url, 'link');

  if (!safe) {
    return document.createTextNode(label);
  }

  const link = document.createElement('a');
  link.href = resolveUrl(safe, context.baseUrl);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  appendInline(link, label, context);
  return link;
};

/** A table's row of dashes, which plain text leaves out. */
const DELIMITER_ROW = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/gm;

/** The note as plain text, for tooltips: markdown syntax removed (a table's pipes and a checklist's boxes too), whitespace collapsed. */
export const noteToPlainText = (markdown: string): string => {
  return withoutComments(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/([*_])(\S(?:[\s\S]*?\S)?)\1/g, '$2')
    .replace(DELIMITER_ROW, '')
    .split('\\|')
    .map((part) => part.replace(/\|/g, ' '))
    .join('|')
    .replace(/^\s*(#{1,6}|>|[-*+]|\d{1,9}[.)])\s+/gm, '')
    .replace(/^\[[ xX]\]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
};
