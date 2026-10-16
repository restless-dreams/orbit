import type { OrbitDocumentOptions, OrbitNode, ParsedOrbitDocument } from './types.js';
import { parseYaml, YamlMiniError } from './yaml-mini.js';
import { ensureUniqueNodeIds, nodeSlug, setParent } from './utils.js';
import { detectVideoProvider } from './media.js';
import { DiagnosticCollector } from './diagnostics.js';
import { findFrontmatter, firstContentLineIndex, lineOfKey, normalizeSource, sharedIndentation } from './source.js';
import { assignNodeAttribute, NODE_ATTRIBUTE_KEYS } from './node-attributes.js';
import { applyDocumentOption, DOCUMENT_OPTION_KEYS, unknownOptionMessage } from './document-options.js';
import { checkNodeLinks, type LinkLine } from './node-links.js';
import { encodingOf, setDocumentSource, SourceRecorder, type LineRole, type NodeShape } from './document-source.js';
import { nodesWithExplicitIds } from './utils.js';
import { upgradeFormat } from './format-upgrades.js';

export { OrbitParseError } from './diagnostics.js';

export { SUPPORTED_SCHEMA_VERSION } from './format-upgrades.js';

export interface ParseOptions {
  /**
   * Throw an `OrbitParseError` on the first problem instead of recording a
   * diagnostic and carrying on. Off by default; `orbit validate` turns it on.
   */
  strict?: boolean;

  /**
   * The name of the root Orbit makes up for a document with no single top
   * heading and no title, in the reader's language. Default "Untitled map".
   * Its id is `untitled-map` whatever its name.
   */
  untitled?: string;
}

/** Text of the generated root when a document has no single top-level heading or title. */
export const UNTITLED_ROOT_TEXT = 'Untitled map';
/** The generated root's id, whatever the `untitled` option names it. */
export const UNTITLED_ROOT_ID = 'untitled-map';

// Titles: status checkbox, emoji icon, hashtags, links and inline markdown

// A single emoji: a flag (pair of regional indicators), a keycap, or a
// pictograph with an optional variation selector and skin-tone modifier.
// ©, ® and ™ are pictographs too but read as text in titles, so they never
// become icons.
const EMOJI_UNIT = String.raw`(?:\p{Regional_Indicator}{2}|[0-9#*]️?⃣|(?![©®™])\p{Extended_Pictographic}️?\p{Emoji_Modifier}?)`;
const EMOJI = String.raw`${EMOJI_UNIT}(?:‍${EMOJI_UNIT})*`;
const LEADING_EMOJI = new RegExp(String.raw`^((?:${EMOJI})+)\s+(.*)$`, 'u');
const ONLY_EMOJI = new RegExp(String.raw`^(?:${EMOJI})+$`, 'u');

/** Whether an icon reads back from the start of a title (emoji do; other symbols need an `icon:` attribute). */
export const isTitleIcon = (icon: string): boolean => {
  return ONLY_EMOJI.test(icon);
};

/** The emoji a title starts with, which a map reads as the node's icon, and the text after it; null for a title without one. */
export const leadingEmoji = (title: string): { icon: string; text: string } | null => {
  const match = LEADING_EMOJI.exec(title);
  return match ? { icon: match[1], text: match[2].trim() } : null;
};

const TASK_MARKER = /^\[( |x|X|\/)\]\s+(.*)$/;
const TASK_STATUSES: Record<string, string> = { ' ': 'todo', x: 'done', X: 'done', '/': 'active' };
// A backslash before ASCII punctuation keeps it literal: `\*`, `\#`, `\[`.
const ESCAPE = /\\([!-/:-@[-`{-~])/g;
// While a title is read, escaped characters and code spans wait in
// private-use characters, so nothing inside them is read as markup.
const HIDDEN_BASE = 0x100000;
const HIDDEN = /[\u{100000}-\u{10fffd}]/gu;
/** The last code point the reveal pattern reads: how many tokens one line can hide. */
const HIDDEN_LIMIT = 0x10fffd - HIDDEN_BASE + 1;
// A hashtag at the end, after a space: `#frontend`, `#sprint-3`, `#team/web`.
// It needs a letter, so `#42` stays text; `C#` has no space before it.
const TRAILING_TAG = /\s+#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)$/u;
const CODE_SPAN = /(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
// The destination allows one level of balanced parentheses, as in CommonMark.
const TITLE_LINK = /(!?)\[([^\]]*)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+"[^"]*")?\s*\)/g;
const EMPHASIS = [
  /~~(?=\S)([\s\S]*?\S)~~/g,
  /\*\*(?=\S)([\s\S]*?\S)\*\*/g,
  /(?<![\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu,
  /\*(?=\S)([\s\S]*?\S)\*/g,
  /(?<![\p{L}\p{N}_])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])/gu,
];

export interface TitleParts {
  text: string;
  icon?: string;
  link?: string;
  status?: string;
  tags?: string[];
}

/**
 * Reads a heading's or list item's text. `[ ]`, `[x]` and `[/]` set the
 * status, an emoji first is the icon, hashtags at the end are tags, a link
 * gives the node its link, and bold, italics, code and strikethrough show
 * as plain text. A backslash keeps any of those characters literal.
 */
export const parseTitle = (raw: string): TitleParts => {
  const hidden: string[] = [];

  const hide = (value: string): string => {
    if (hidden.length >= HIDDEN_LIMIT) {
      // Out of private-use codes (a line with ~64k escapes): the text stays literal.
      return value;
    }

    return String.fromCodePoint(HIDDEN_BASE + hidden.push(value) - 1);
  };

  let text = raw.trim().replace(ESCAPE, (_match, character: string) => hide(character));
  text = text.replace(HIDDEN_COMMENT, (_match, before: string, _body: string, after: string) => (before || after ? ' ' : '')).trim();
  const parts: Omit<TitleParts, 'text'> = {};

  const task = TASK_MARKER.exec(text);

  if (task) {
    parts.status = TASK_STATUSES[task[1]];
    text = task[2].trim();
  }

  const emoji = LEADING_EMOJI.exec(text);

  if (emoji) {
    parts.icon = emoji[1];
    text = emoji[2].trim();
  }

  const tags: string[] = [];

  for (let match = TRAILING_TAG.exec(text); match && /\p{L}/u.test(match[1]); match = TRAILING_TAG.exec(text)) {
    tags.unshift(match[1]);
    text = text.slice(0, match.index);
  }

  if (tags.length > 0) {
    parts.tags = tags;
  }

  text = text.replace(CODE_SPAN, (_match, _ticks: string, code: string) => hide(code.replace(/^ ([\s\S]*) $/, '$1')));

  text = text.replace(TITLE_LINK, (match, image: string, label: string, url: string) => {
    if (image) {
      return match;
    }

    parts.link ??= reveal(url, hidden);
    return label;
  });

  // An emoji at the start of a link's text: `[🚀 Launch](…)`.
  const linkedEmoji = parts.icon ? null : LEADING_EMOJI.exec(text);

  if (linkedEmoji) {
    parts.icon = linkedEmoji[1];
    text = linkedEmoji[2].trim();
  }

  for (let pass = 0; pass < 3; pass += 1) {
    const before = text;

    for (const pattern of EMPHASIS) {
      text = text.replace(pattern, '$1');
    }

    if (text === before) {
      break;
    }
  }

  return { text: reveal(text, hidden).trim(), ...parts };
};

const reveal = (text: string, hidden: string[]): string => {
  let revealed = text;

  // Code spans can hold escaped characters, so reveal until nothing is hidden.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = revealed.replace(HIDDEN, (character) => hidden[character.codePointAt(0)! - HIDDEN_BASE] ?? character);

    if (next === revealed) {
      break;
    }

    revealed = next;
  }

  return revealed;
};

// Blocks

interface SourceLine { text: string; line: number; /** Leading spaces (after tab expansion), computed once per line. */ indent: number; }

// Every block knows its first and last line (1-based), so saving can keep
// the lines of whatever an edit didn't touch.
interface HeaderBlock { kind: 'header'; level: number; text: string; line: number; last: number; setext: boolean; }
interface ListBlock { kind: 'list'; items: ListItem[]; line: number; last: number; }
interface ParagraphBlock { kind: 'paragraph'; text: string; line: number; last: number; }
/** A blockquote: a note written as one, never read again as structure. */
interface NoteBlock { kind: 'note'; text: string; line: number; last: number; }
interface BlankBlock { kind: 'blank'; line: number; last: number; }
/** Text Orbit keeps without reading: an HTML comment that isn't Orbit's (`comment` is its text), or a rule. */
interface ForeignBlock { kind: 'foreign'; line: number; last: number; comment?: string; }
type MediaKind = 'image' | 'wrapped' | 'link';

interface MediaBlock {
  kind: 'media';
  mediaKind: MediaKind;
  url: string;
  alt?: string;
  thumb?: string;
  text?: string;
  line: number;
  last: number;
}

/** An `<!-- orbit … -->` comment. `inline` when it ends a heading's or list item's line. */
interface CommentBlock {
  kind: 'comment';
  body: string;
  line: number;
  last: number;

  /** Line of the body's first line, when it starts below the comment's opening. */
  bodyLine?: number;

  inline?: boolean;
}

type Block = HeaderBlock | ListBlock | ParagraphBlock | NoteBlock | BlankBlock | ForeignBlock | MediaBlock | CommentBlock;

interface ListItem {
  text: string;
  line: number;
  inlineAttrs?: string;

  /** Everything written under the item: its note, media, attributes and nested items. */
  content: Block[];
}

type ContentType = 'image' | 'video' | 'embed' | 'none';
const CONTENT_TYPES = new Set<ContentType>(['image', 'video', 'embed', 'none']);

const HEADER = /^ {0,3}(#{1,6})\s+(.*\S)\s*$/;
const HEADER_START = /^ {0,3}#{1,6}\s+/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)\s*$/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|\d{1,9}[.)])\s+(.*\S)\s*$/;
// A list may interrupt a paragraph only with a bullet or an ordered list
// starting at 1, as in CommonMark, so "2024. A good year" stays prose.
const LIST_INTERRUPTS_PARAGRAPH = /^\s*(?:[-*+]|1[.)])\s+\S/;
const QUOTE = /^\s*>/;
const FENCE = /^ {0,3}(```|~~~)/;
// `orbit` in any case, with or without a colon after it: <!-- Orbit: status: done -->.
const INLINE_ATTRIBUTES = /^(.*\S)\s+<!--\s*orbit:?\s+([\s\S]*?)\s*-->\s*$/i;
/** A heading or list item with no text, only attributes: an idea without a name yet, say one holding a picture. */
const ONLY_ATTRIBUTES = /^()<!--\s*orbit:?\s+([\s\S]*?)\s*-->\s*$/i;
/** Any other HTML comment, hidden as markdown hides it; a backslash before `<` keeps it as text. */
const HIDDEN_COMMENT = /(\s*)(?<!\\)<!--([\s\S]*?)-->(\s*)/g;
const WRAPPED_LINE = /^\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const LINK_LINE = /^\[([^\]]*)\]\(([^)]+)\)$/;

// Public API

export const parseOrbitMarkdown = (input: string, options: ParseOptions = {}): ParsedOrbitDocument => {
  const diagnostics = new DiagnosticCollector(options.strict ?? false);
  const rawLines = normalizeSource(input).split('\n');
  const { options: docOptions, extra, bodyStartIndex } = readFrontmatter(rawLines, diagnostics);

  const recorder = new SourceRecorder(rawLines);
  recorder.mark(1, bodyStartIndex, null, 'frontmatter');

  const lines = rawLines.slice(bodyStartIndex).map((raw, index) => {
    const text = expandLeadingTabs(raw);
    return { text, line: bodyStartIndex + index + 1, indent: indentation(text) };
  });

  const root = buildTree(tokenize(lines, { headings: true }), docOptions, diagnostics, firstContentLineIndex(rawLines) === -1, recorder, options.untitled);
  fixLevels(root, 0);
  ensureUniqueNodeIds(root);
  checkNodeLinks(root, diagnostics, noteLinkLines(root, rawLines));
  const document: ParsedOrbitDocument = { root, options: docOptions, warnings: diagnostics.warnings, diagnostics: diagnostics.diagnostics };

  if (Object.keys(extra).length > 0) {
    document.extra = extra;
  }

  const frontmatter = findFrontmatter(rawLines);
  const fences = frontmatter && bodyStartIndex > 0 ? { open: frontmatter.openIndex, close: frontmatter.closeIndex } : null;
  const source = recorder.finish(root, docOptions, extra, fences, nodesWithExplicitIds(root));
  source.encoding = { ...encodingOf(input), indentation: sharedIndentation(input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')) };
  setDocumentSource(document, source);
  // Upgraded after the source is noted: saving then writes the upgraded nodes, and only them.
  upgradeFormat(document, diagnostics, lineOfKey(rawLines, 'schemaVersion'));
  document.warnings = diagnostics.warnings;
  return document;
};

// Frontmatter

const readFrontmatter = (
  lines: string[],
  diagnostics: DiagnosticCollector,
): { options: OrbitDocumentOptions; extra: Record<string, unknown>; bodyStartIndex: number } => {
  const extra: Record<string, unknown> = {};
  const frontmatter = findFrontmatter(lines);

  if (!frontmatter) {
    warnUnclosedFrontmatter(lines, diagnostics);
    return { options: {}, extra, bodyStartIndex: 0 };
  }

  if (isMarkdownBetweenRules(lines, frontmatter.openIndex, frontmatter.closeIndex)) {
    return { options: {}, extra, bodyStartIndex: 0 };
  }

  const bodyStartIndex = frontmatter.closeIndex + 1;
  let parsed: unknown;

  try {
    parsed = parseYaml(frontmatter.yaml) ?? {};
  } catch (error) {
    // The frontmatter's first line is the one after the opening fence.
    const problem = error instanceof YamlMiniError ? error : null;
    const line = problem ? frontmatter.openIndex + 1 + problem.line : frontmatter.openIndex + 1;
    diagnostics.recover('invalid-frontmatter', `Invalid frontmatter YAML: ${problem?.reason ?? (error as Error).message}`, line, 'error');
    return { options: {}, extra, bodyStartIndex };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.recover('invalid-frontmatter', 'Frontmatter must contain "key: value" pairs.', frontmatter.openIndex + 1, 'error');
    return { options: {}, extra, bodyStartIndex };
  }

  const options: OrbitDocumentOptions = {};

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const line = lineOfKey(lines, key, frontmatter.openIndex, frontmatter.closeIndex) ?? frontmatter.openIndex + 1;

    if (!DOCUMENT_OPTION_KEYS.has(key)) {
      diagnostics.recover('unknown-frontmatter-key', unknownOptionMessage(key, 'frontmatter'), line);
      extra[key] = value;
      continue;
    }

    applyDocumentOption(options, key, value, (message) => diagnostics.recover('invalid-option-value', message, line));
  }

  return { options, extra, bodyStartIndex };
};

/** A heading or a list item: the lines that give a map its shape. */
const isStructureLine = (line: string): boolean => {
  return /^ {0,3}#{1,6}\s+\S/.test(line) || /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line);
};

/**
 * A map written between two `---` rules, which only looks like frontmatter:
 * the block holds headings or items and no `key: value` line, and nothing
 * after it has a shape of its own. Read as frontmatter, it would be an empty map.
 */
const isMarkdownBetweenRules = (lines: string[], openIndex: number, closeIndex: number): boolean => {
  const block = lines.slice(openIndex + 1, closeIndex);
  return block.some(isStructureLine)
    && !block.some((line) => /^[A-Za-z_][\w-]*\s*:/.test(line))
    && !lines.slice(closeIndex + 1).some(isStructureLine);
};

/** Frontmatter that opens with `---` and never closes is read as markdown: say so. */
const warnUnclosedFrontmatter = (lines: string[], diagnostics: DiagnosticCollector): void => {
  const openIndex = firstContentLineIndex(lines);

  if (openIndex === -1 || lines[openIndex].trim() !== '---') {
    return;
  }

  const next = lines.slice(openIndex + 1).find((line) => line.trim() !== '');

  if (next !== undefined && /^[A-Za-z_][\w-]*\s*:/.test(next)) {
    diagnostics.recover('invalid-frontmatter', 'The frontmatter has no closing "---" line, so it reads as part of the map. Close it with "---".', openIndex + 1);
  }
};

// Tokenizer

interface TokenizeOptions {
  /** Headings make nodes at the top level; under a list item they are note text. */
  headings: boolean;
}

const tokenize = (lines: SourceLine[], options: TokenizeOptions): Block[] => {
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const { text: raw, line } = lines[index];

    if (raw.trim() === '') {
      blocks.push({ kind: 'blank', line, last: line });
      index += 1;
      continue;
    }

    const header = options.headings ? HEADER.exec(raw) : null;

    if (header) {
      // Drop an optional closing sequence: `## Title ##`.
      blocks.push(...headerBlocks(header[1].length, header[2].replace(/\s+#+$/, ''), line, line, false));
      index += 1;
      continue;
    }

    if (raw.trim().startsWith('<!--')) {
      index = readComment(lines, index, blocks);
      continue;
    }

    if (QUOTE.test(raw)) {
      const quoted: string[] = [];

      while (index < lines.length && QUOTE.test(lines[index].text)) {
        quoted.push(lines[index].text.replace(/^\s*> ?/, ''));
        index += 1;
      }

      blocks.push({ kind: 'note', text: quoted.join('\n'), line, last: lines[index - 1].line });
      continue;
    }

    if (THEMATIC_BREAK.test(raw)) {
      blocks.push({ kind: 'foreign', line, last: line });
      index += 1;
      continue;
    }

    const item = LIST_ITEM.exec(raw);

    if (item) {
      const items: ListItem[] = [];
      index = readList(lines, index, item[1].length, items);
      blocks.push({ kind: 'list', items, line, last: lines[index - 1].line });
      continue;
    }

    const media = mediaBlock(raw.trim(), line);

    if (media) {
      blocks.push(media);
      index += 1;
      continue;
    }

    const fence = FENCE.exec(raw);

    if (fence) {
      let buffer = raw;
      index += 1;

      while (index < lines.length) {
        buffer += '\n' + lines[index].text;
        index += 1;

        if (lines[index - 1].text.trimStart().startsWith(fence[1])) {
          break;
        }
      }

      blocks.push({ kind: 'paragraph', text: buffer, line, last: lines[index - 1].line });
      continue;
    }

    // A paragraph runs until a blank line or another block. Underlined with
    // `===` or `---`, it is a heading instead.
    let buffer = raw;
    index += 1;
    let heading = false;

    while (index < lines.length) {
      const next = lines[index].text;

      if (options.headings && SETEXT_UNDERLINE.test(next)) {
        const level = next.trim().startsWith('=') ? 1 : 2;
        blocks.push(...headerBlocks(level, buffer.split('\n').map((part) => part.trim()).join(' '), line, lines[index].line, true));
        index += 1;
        heading = true;
        break;
      }

      if (endsParagraph(next)) {
        break;
      }

      buffer += '\n' + next;
      index += 1;
    }

    if (!heading) {
      blocks.push({ kind: 'paragraph', text: buffer, line, last: lines[index - 1].line });
    }
  }

  return blocks;
};

const headerBlocks = (level: number, text: string, line: number, last: number, setext: boolean): Block[] => {
  const inline = INLINE_ATTRIBUTES.exec(text) ?? ONLY_ATTRIBUTES.exec(text);

  if (inline) {
    return [
      { kind: 'header', level, text: inline[1], line, last, setext },
      { kind: 'comment', body: inline[2], line, last: line, inline: true },
    ];
  }

  return [{ kind: 'header', level, text, line, last, setext }];
};

const endsParagraph = (next: string): boolean => {
  const trimmed = next.trim();
  return (
    trimmed === '' ||
    HEADER_START.test(next) ||
    LIST_INTERRUPTS_PARAGRAPH.test(next) ||
    QUOTE.test(next) ||
    FENCE.test(next) ||
    THEMATIC_BREAK.test(next) ||
    trimmed.startsWith('<!--') ||
    isStandaloneMedia(trimmed)
  );
};

/** A picture or video on a line of its own is media, even right after a paragraph line. */
const isStandaloneMedia = (text: string): boolean => {
  if (WRAPPED_LINE.test(text) || IMAGE_LINE.test(text)) {
    return true;
  }

  const link = LINK_LINE.exec(text);
  return link !== null && detectVideoProvider(mediaDestination(link[2])) !== null;
};

/** The destination of a media line's parens: the src, with CommonMark's optional "title" dropped. */
const mediaDestination = (raw: string): string => {
  return raw.replace(/\s+(?:"[^"]*"|'[^']*')?\s*$/, '');
};

const mediaBlock = (text: string, line: number): MediaBlock | null => {
  const wrapped = WRAPPED_LINE.exec(text);

  if (wrapped) {
    return { kind: 'media', mediaKind: 'wrapped', alt: wrapped[1], thumb: mediaDestination(wrapped[2]), url: mediaDestination(wrapped[3]), line, last: line };
  }

  const image = IMAGE_LINE.exec(text);

  if (image) {
    return { kind: 'media', mediaKind: 'image', alt: image[1], url: mediaDestination(image[2]), line, last: line };
  }

  const link = LINK_LINE.exec(text);

  if (link) {
    return { kind: 'media', mediaKind: 'link', text: link[1], url: mediaDestination(link[2]), line, last: line };
  }

  return null;
};

/**
 * Reads an HTML comment from `start`: `<!-- orbit … -->` ones become comment
 * blocks, others are kept as they are, unread.
 */
const readComment = (lines: SourceLine[], start: number, blocks: Block[]): number => {
  let index = start;
  let buffer = lines[index].text;
  index += 1;

  while (index < lines.length && !buffer.includes('-->')) {
    buffer += '\n' + lines[index].text;
    index += 1;
  }

  const comment = /<!--\s*([\s\S]*?)\s*-->/.exec(buffer);

  if (comment && /^orbit(?::|\b)/i.test(comment[1])) {
    // Only the `orbit` keyword's own line is trimmed, then the body is
    // dedented, so YAML indented under the comment keeps its nesting.
    const startsBelow = /^orbit:?[^\S\n]*\n/i.test(comment[1]);
    const body = comment[1].replace(/^orbit:?[^\S\n]*\n?/i, '');
    blocks.push({
      kind: 'comment',
      body: dedent(body.split('\n')).join('\n'),
      line: lines[start].line,
      last: lines[index - 1].line,
      bodyLine: startsBelow ? lines[start].line + 1 : lines[start].line,
    });
  } else {
    blocks.push({ kind: 'foreign', line: lines[start].line, last: lines[index - 1].line, comment: comment?.[1] });
  }

  return index;
};

const readList = (lines: SourceLine[], start: number, baseIndent: number, items: ListItem[]): number => {
  let index = start;

  while (index < lines.length) {
    const { text: raw, line } = lines[index];

    if (raw.trim() === '') {
      index += 1;
      continue;
    }

    const match = THEMATIC_BREAK.test(raw) ? null : LIST_ITEM.exec(raw);

    if (!match || match[1].length < baseIndent) {
      break;
    }

    let text = match[2];
    let inlineAttrs: string | undefined;
    const inline = INLINE_ATTRIBUTES.exec(text) ?? ONLY_ATTRIBUTES.exec(text);

    if (inline) {
      text = inline[1];
      inlineAttrs = inline[2];
    }

    index += 1;

    // The item's first line is its title. Lines indented under it, and lines
    // that continue it without a blank line in between, are its content.
    const indented: SourceLine[] = [];
    const content: SourceLine[] = [];
    let blanks: SourceLine[] = [];
    let continues = true;

    while (index < lines.length) {
      const next = lines[index];

      if (isBlank(next)) {
        blanks.push(next);
        continues = false;
        index += 1;
        continue;
      }

      if (next.indent > baseIndent) {
        content.push(...blanks, next);
        indented.push(next);
        blanks = [];
        index += 1;
        continue;
      }

      if (continues && continuesItem(next.text)) {
        content.push({ text: next.text.trimStart(), line: next.line, indent: 0 });
        index += 1;
        continue;
      }

      break;
    }

    let shift = Number.POSITIVE_INFINITY;

    for (const entry of indented) {
      shift = Math.min(shift, entry.indent);
    }

    const indentedSet = new Set(indented);
    const dedented = content.map((entry) =>
      indentedSet.has(entry) ? { text: entry.text.slice(shift), line: entry.line, indent: entry.indent - shift } : entry);
    items.push({ text, line, inlineAttrs, content: tokenize(dedented, { headings: false }) });
  }

  return index;
};

/** A line right after a list item, not indented, that still belongs to it (CommonMark's lazy continuation). */
const continuesItem = (text: string): boolean => {
  return !(
    LIST_ITEM.test(text) ||
    HEADER_START.test(text) ||
    QUOTE.test(text) ||
    FENCE.test(text) ||
    THEMATIC_BREAK.test(text) ||
    text.trim().startsWith('<!--')
  );
};

const indentation = (text: string): number => {
  return /^ */.exec(text)![0].length;
};

/** A line with nothing but whitespace: its leading spaces are its whole length. No trim() copy. */
const isBlank = (line: SourceLine): boolean => {
  if (line.indent === line.text.length) {
    return true;
  }

  // Printable ASCII past the indent is visible; a control character (a form
  // feed, a vertical tab) or exotic whitespace needs the slow check.
  const code = line.text.charCodeAt(line.indent);
  return (code < 33 || code > 126) && /^\s*$/.test(line.text);
};

/** Tabs in the indentation count to the next multiple of four columns. */
const expandLeadingTabs = (text: string): string => {
  const leading = /^[ \t]*/.exec(text)![0];

  if (!leading.includes('\t')) {
    return text;
  }

  let columns = 0;

  for (const character of leading) {
    columns = character === '\t' ? columns + 4 - (columns % 4) : columns + 1;
  }

  return ' '.repeat(columns) + text.slice(leading.length);
};

const dedent = (lines: string[]): string[] => {
  const shift = Math.min(...lines.filter((line) => line.trim() !== '').map(indentation));
  return Number.isFinite(shift) && shift > 0 ? lines.map((line) => line.slice(Math.min(shift, indentation(line)))) : lines;
};

// Tree building

const buildTree = (
  blocks: Block[],
  docOptions: OrbitDocumentOptions,
  diagnostics: DiagnosticCollector,
  inputIsBlank: boolean,
  recorder: SourceRecorder,
  untitled: string | undefined,
): OrbitNode => {
  const attacher = new ContentAttacher(diagnostics, recorder, untitled);
  const headers = blocks.filter((block): block is HeaderBlock => block.kind === 'header');
  const root = headers.length > 0
    ? buildFromHeadings(blocks, headers, docOptions, attacher)
    : buildFromLists(blocks, docOptions, diagnostics, attacher, inputIsBlank);
  attacher.finish();
  return root;
};

/**
 * Headings nest by level, and everything else belongs to the heading above
 * it. One heading at the top level, written first, is the root; several
 * share a root named after the title.
 */
const buildFromHeadings = (
  blocks: Block[],
  headers: HeaderBlock[],
  docOptions: OrbitDocumentOptions,
  attacher: ContentAttacher,
): OrbitNode => {
  const topLevel = Math.min(...headers.map((header) => header.level));
  const topHeaders = headers.filter((header) => header.level === topLevel);
  const rootHeader = topHeaders.length === 1 && topHeaders[0] === headers[0] ? headers[0] : null;
  const lead = rootHeader || docOptions.title !== undefined ? null : leadParagraph(blocks, headers[0]);
  const root = rootHeader ? attacher.addHeading(rootHeader) : attacher.addGeneratedRoot(docOptions.title ?? lead?.text, lead, headers[0].line);
  attacher.setRoot(root);
  attacher.keepAtDocumentLevel(blocks);
  // Text before the root heading belongs to the root too.
  const stack: { node: OrbitNode; level: number }[] = [{ node: root, level: rootHeader ? topLevel : 0 }];

  for (const block of blocks) {
    if (block === lead || block === rootHeader) {
      continue;
    }

    if (block.kind !== 'header') {
      attacher.attach(block, stack[stack.length - 1].node);
      continue;
    }

    while (stack.length > 1 && stack[stack.length - 1].level >= block.level) {
      stack.pop();
    }

    const node = attacher.addHeading(block);
    const parent = stack[stack.length - 1].node;
    setParent(node, parent);
    parent.children.push(node);
    stack.push({ node, level: block.level });
    attacher.reset();
  }

  return root;
};

/** Documents without headings: the outline comes from their bullet or numbered lists. */
const buildFromLists = (
  blocks: Block[],
  docOptions: OrbitDocumentOptions,
  diagnostics: DiagnosticCollector,
  attacher: ContentAttacher,
  inputIsBlank: boolean,
): OrbitNode => {
  const lists = blocks.filter((block): block is ListBlock => block.kind === 'list');

  if (lists.length === 0) {
    if (inputIsBlank) {
      diagnostics.recover('empty-document', 'The document is empty.', 1);
      const empty = emptyNode();
      attacher.setRoot(empty);
      return empty;
    }

    const firstContent = blocks.find((block) => block.kind !== 'blank');
    diagnostics.recover(
      'no-structure',
      'No headings or lists found. Start the map with a "# Title" heading or a bullet list.',
      firstContent?.line,
    );
    // Only text: it's the note of a map with no ideas yet, so editing the map keeps it.
    const root = attacher.addGeneratedRoot(docOptions.title, null, firstContent?.line ?? 1, true);
    attacher.setRoot(root);

    for (const block of blocks) {
      attacher.attach(block, root);
    }

    return root;
  }

  const [firstList] = lists;
  const lead = docOptions.title !== undefined ? null : leadParagraph(blocks, firstList);

  if (!docOptions.title && !lead && lists.length === 1 && firstList.items.length === 1) {
    // A single top-level item is the root: `- Project\n  - Research`.
    const root = attacher.addItem(firstList.items[0], undefined);
    attacher.setRoot(root);
    attacher.keepAtDocumentLevel(blocks);

    for (const block of blocks) {
      if (block !== firstList) {
        attacher.attach(block, root);
      }
    }

    return root;
  }

  const root = attacher.addGeneratedRoot(docOptions.title ?? lead?.text, lead, firstList.line);
  attacher.setRoot(root);
  attacher.keepAtDocumentLevel(blocks);

  for (const block of blocks) {
    if (block !== lead) {
      attacher.attach(block, root);
    }
  }

  return root;
};

/** A single-line paragraph directly before `target` (with only blank lines between) names the generated root. */
const leadParagraph = (blocks: Block[], target: Block): ParagraphBlock | null => {
  const targetIndex = blocks.indexOf(target);
  const before = blocks.slice(0, targetIndex).filter((block) => block.kind !== 'blank');

  if (before.length !== 1 || before[0].kind !== 'paragraph' || before[0].text.includes('\n')) {
    return null;
  }

  return before[0];
};

const syntheticRoot = (text: string | undefined, diagnostics: DiagnosticCollector, line: number, quiet = false, untitled = UNTITLED_ROOT_TEXT): OrbitNode => {
  if (text !== undefined) {
    return makeNode({ text, line });
  }

  if (!quiet) {
    diagnostics.note(
      'synthetic-root',
      `No single top-level heading, so the map is rooted at "${untitled}". Add a "# Title" heading or a title in the frontmatter to name it.`,
      line,
    );
  }

  // Named in the reader's language, with the same id in every one.
  return { ...makeNode({ text: untitled, line }), id: UNTITLED_ROOT_ID };
};

/**
 * A paragraph of link reference or footnote definitions (`[docs]: https://…`,
 * `[^1]: …`). They belong to the whole document, wherever they're written:
 * deleting the idea above them mustn't take them along.
 */
const isDefinitions = (text: string): boolean => {
  const lines = text.split('\n');
  return DEFINITION.test(lines[0]) && lines.every((line) => DEFINITION.test(line) || /^\s{2,}\S/.test(line));
};

const DEFINITION = /^ {0,3}\[\^?[^\]\n]+\]:\s*\S/;

/** How a list item's line is written: where its marker is, the marker, and where its text starts. */
const itemShape = (raw: string): NodeShape => {
  const match = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)/.exec(raw);

  if (!match) {
    return { kind: 'item', indent: 0, marker: '-', content: 2 };
  }

  const indent = expandLeadingTabs(match[1]).length;
  return { kind: 'item', indent, marker: match[2], content: indent + match[2].length + match[3].length };
};

// Content: lists become children; everything else is a note, media or attributes

type MediaAssign = 'image' | 'video' | 'embed' | 'note';

/**
 * Attaches blocks to nodes in document order: every list's items become
 * children, and paragraphs, quotes, code, media lines and attribute
 * comments go to the node itself.
 */
class ContentAttacher {
  private readonly diagnostics: DiagnosticCollector;
  private readonly recorder: SourceRecorder;
  private readonly notes = new Map<OrbitNode, string[]>();

  /** The map's root, which definitions belong to. */
  private root: OrbitNode | null = null;

  /** Blocks of the whole document rather than of the idea above them: definitions at its end. */
  private documentLevel = new Set<Block>();

  /** The list item made last, in reading order. */
  private lastItem: OrbitNode | null = null;

  /** The node a list was just attached to, and that list's last item, until anything else comes (a blank line too). */
  private afterList: { node: OrbitNode; item: OrbitNode; lastLine: number } | null = null;

  /** The media line just read, which a `contentType` comment below it can reclassify. */
  private lastMedia: { node: OrbitNode; block: MediaBlock; result: MediaAssign } | null = null;

  /** A `contentType` comment waiting for the media line below it. */
  private pendingContentType: { node: OrbitNode; kind: ContentType } | null = null;

  /** The made-up root's name, when it has no title. */
  private readonly untitled: string | undefined;

  constructor(diagnostics: DiagnosticCollector, recorder: SourceRecorder, untitled?: string) {
    this.diagnostics = diagnostics;
    this.recorder = recorder;
    this.untitled = untitled;
  }

  setRoot(root: OrbitNode): void {
    this.root = root;
  }

  /**
   * Link reference and footnote definitions at the end of the document
   * (`[docs]: https://…`, `[^1]: …`) belong to the whole map, not to the
   * idea above them: deleting that idea mustn't take them along.
   */
  keepAtDocumentLevel(blocks: Block[]): void {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index];

      if (block.kind === 'blank') {
        continue;
      }

      if (block.kind !== 'paragraph' || !isDefinitions(block.text)) {
        return;
      }

      this.documentLevel.add(block);
    }
  }

  /** A heading's node, its line recorded as its title. */
  addHeading(header: HeaderBlock): OrbitNode {
    noteAttributeComments(header.text, header.line, this.diagnostics);
    const node = makeNode(header);
    this.recorder.mark(header.line, header.last, node, 'title');
    this.recorder.shape(node, { kind: 'heading', level: header.level, setext: header.setext }, header.line);
    return node;
  }

  /** A root Orbit makes up: named after the title, the paragraph `lead`, or "Untitled map". */
  addGeneratedRoot(text: string | undefined, lead: ParagraphBlock | null, line: number, quiet = false): OrbitNode {
    const node = syntheticRoot(text, this.diagnostics, line, quiet, this.untitled);

    if (lead) {
      this.recorder.mark(lead.line, lead.last, node, 'title');
    }

    this.recorder.shape(node, { kind: 'generated', lead: lead !== null }, lead ? lead.line : null);
    return node;
  }

  attach(block: Block, node: OrbitNode): void {
    if (block.kind === 'comment' && !block.inline && this.afterList?.node === node && block.line === this.afterList.lastLine + 1) {
      const item = this.afterList.item.text;
      this.diagnostics.note('attributes-after-list', `This attribute block sets "${node.text}"'s attributes: it isn't indented under "${item}" above it. Indent it to set "${item}"'s.`, block.line);
    }

    this.afterList = null;

    switch (block.kind) {
      case 'blank':
        // A blank line goes with the line above it (see SourceRecorder.finish).
        return;
      case 'foreign':
        if (block.comment !== undefined) {
          noteAttributeComments(`<!--${block.comment}-->`, block.line, this.diagnostics);
        }

        this.recorder.mark(block.line, block.last, node, 'foreign');
        return;
      case 'comment':
        this.applyComment(block, node);
        return;
      case 'media': {
        const forced = this.pendingContentType?.node === node ? this.pendingContentType.kind : null;
        this.pendingContentType = null;
        const result = assignMedia(block, node, this.noteParts(node), forced);
        this.lastMedia = { node, block, result };
        this.recorder.mark(block.line, block.last, node, result === 'note' ? 'note' : 'media');
        return;
      }
      case 'list':
        for (const item of block.items) {
          this.addItem(item, node);
        }

        this.afterList = this.lastItem ? { node, item: this.lastItem, lastLine: lastLineOf(block.items) } : null;
        break;
      case 'header':
        this.noteParts(node).push(`${'#'.repeat(block.level)} ${block.text}`);
        this.recorder.mark(block.line, block.last, node, 'note');
        break;
      case 'note':
      case 'paragraph': {
        const documentLevel = this.documentLevel.has(block) && this.root !== null;
        const owner = documentLevel ? this.root! : node;
        this.noteParts(owner).push(block.text);
        this.recorder.mark(block.line, block.last, owner, documentLevel ? 'end' : 'note');
        break;
      }
    }

    this.reset();
  }

  /** Builds a list item's node (under `parent`, if any) with everything written under it. */
  addItem(item: ListItem, parent: OrbitNode | undefined): OrbitNode {
    noteAttributeComments(item.text, item.line, this.diagnostics);
    const node = makeNode(item);
    this.lastItem = node;
    this.recorder.mark(item.line, item.line, node, 'title');
    this.recorder.shape(node, itemShape(this.recorder.line(item.line)), item.line);

    if (parent) {
      setParent(node, parent);
      parent.children.push(node);
    }

    if (item.inlineAttrs !== undefined) {
      applyAttributeBlock(node, { kind: 'comment', body: item.inlineAttrs, line: item.line, last: item.line, inline: true }, this.diagnostics);
    }

    this.reset();

    for (const block of item.content) {
      this.attach(block, node);
    }

    this.reset();
    return node;
  }

  /** Forgets the media line just read, at a new heading or after other content. */
  reset(): void {
    this.lastMedia = null;
    this.pendingContentType = null;
  }

  /** Writes the collected notes, after any `note` attribute. */
  finish(): void {
    for (const [node, parts] of this.notes) {
      const note = parts.join('\n\n');

      // Emptiness is checked on the trimmed form, but the stored note keeps
      // its whitespace: blockquote notes carry it on purpose.
      if (note.trim()) {
        node.note = node.note ? `${node.note}\n\n${note}` : note;
        // Only a default: an explicit `noteFormat` attribute wins.
        node.noteFormat = node.noteFormat ?? 'markdown';
      }
    }
  }

  private noteParts(node: OrbitNode): string[] {
    let parts = this.notes.get(node);

    if (!parts) {
      parts = [];
      this.notes.set(node, parts);
    }

    return parts;
  }

  private applyComment(block: CommentBlock, node: OrbitNode): void {
    const keys = applyAttributeBlock(node, block, this.diagnostics, {
      applyContentType: (kind) => {
        if (this.lastMedia?.node === node) {
          reclassify(node, this.lastMedia.block, kind, this.noteParts(node), this.lastMedia.result);
          this.lastMedia.result = kind === 'none' ? 'note' : kind;
          const media = this.lastMedia.block;
          this.recorder.mark(media.line, media.last, node, this.lastMedia.result === 'note' ? 'note' : 'media');
        } else {
          this.pendingContentType = { node, kind };
        }
      },
      clearLastMedia: () => {
        this.lastMedia = null;
      },
      captionTarget: () => {
        const last = this.lastMedia;
        return last?.node === node && (last.result === 'image' || last.result === 'video' || last.result === 'embed') ? last.result : null;
      },
    });

    if (!block.inline) {
      // A comment that only says what the media line above it is goes with it; one Orbit
      // couldn't read is kept as it's written.
      const role: LineRole = keys === null ? 'foreign' : keys.length > 0 && keys.every((key) => key === 'contentType' || key === 'caption') ? 'media' : 'attributes';
      this.recorder.mark(block.line, block.last, node, role);
    }
  }
}

const reclassify = (
  node: OrbitNode,
  media: MediaBlock,
  kind: ContentType,
  noteLines: string[],
  previous: MediaAssign | null,
): void => {
  // Undo only what this media block was read as, so an earlier block's
  // assignment survives.
  if (previous === 'image') {
    node.image = undefined;
  } else if (previous === 'video') {
    node.video = undefined;
  } else if (previous === 'embed') {
    node.embed = undefined;
  } else if (previous === 'note') {
    const reconstructed = reconstructMediaSource(media);

    if (noteLines.length && noteLines[noteLines.length - 1] === reconstructed) {
      noteLines.pop();
    }
  }

  if (kind === 'none') {
    noteLines.push(reconstructMediaSource(media));
    return;
  }

  if (kind === 'image') {
    node.image = { src: media.url, alt: media.alt || undefined };
    return;
  }

  if (kind === 'video') {
    const provider = detectVideoProvider(media.url) ?? 'native';
    node.video = { src: media.url, provider, thumbnail: media.mediaKind === 'wrapped' ? media.thumb : undefined };
    return;
  }

  node.embed = { src: media.url };
};

interface AttributeContext {
  applyContentType: (kind: ContentType) => void;
  clearLastMedia: () => void;

  /** The media of the line just above the block, which a caption in it describes. */
  captionTarget: () => MediaKey | null;
}

type MediaKey = 'image' | 'video' | 'embed';

/** Keys an attribute block takes besides the node attributes. */
const MARKDOWN_ATTRIBUTE_VOCABULARY = { keys: ['contentType'] };

/**
 * Applies a `<!-- orbit ... -->` block to a node. Media keys are applied
 * before `caption`, which describes, in order: the one image, video or embed
 * the block itself sets; the media line just above the block; or else the
 * node's video, embed or image.
 */
const applyAttributeBlock = (
  node: OrbitNode,
  comment: CommentBlock,
  diagnostics: DiagnosticCollector,
  context?: AttributeContext,
): string[] | null => {
  const body = comment.body.trim();

  if (body === '') {
    return [];
  }

  // On one line, `status: active, priority: 1` is two attributes.
  const pairs = comment.inline ? commaSeparatedAttributes(body) : null;
  let parsed: Record<string, unknown>;

  try {
    parsed = pairs
      ? Object.assign({}, ...pairs.map((pair) => parseYaml(pair) as Record<string, unknown>))
      : ((parseYaml(body) ?? {}) as Record<string, unknown>);
  } catch (error) {
    const problem = error instanceof YamlMiniError ? error : null;
    // A pair split out of a one-line comment keeps no line numbers of its own.
    const line = problem && !pairs ? (comment.bodyLine ?? comment.line) + problem.line - 1 : comment.line;
    diagnostics.recover('invalid-attributes', `Invalid YAML in attribute block: ${problem?.reason ?? (error as Error).message}`, line);
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    diagnostics.recover('invalid-attributes', 'An attribute block must contain "key: value" pairs.', comment.line);
    return null;
  }

  const entries = Object.entries(parsed);

  for (const [key, value] of entries) {
    if (key === 'caption') {
      continue;
    }

    if (key === 'contentType') {
      if (!CONTENT_TYPES.has(value as ContentType)) {
        diagnostics.recover(
          'unknown-content-type',
          `Unknown contentType "${String(value)}"; expected image, video, embed or none.`,
          comment.line,
        );
        continue;
      }

      context?.applyContentType(value as ContentType);
      continue;
    }

    assignNodeAttribute(node, key, value, diagnostics, comment.line, MARKDOWN_ATTRIBUTE_VOCABULARY);

    if (key === 'image' || key === 'video' || key === 'embed') {
      context?.clearLastMedia();
    }
  }

  const mediaSet = entries.map(([key]) => key).filter((key): key is MediaKey => key === 'image' || key === 'video' || key === 'embed');

  for (const [key, value] of entries) {
    if (key !== 'caption') {
      continue;
    }

    const described = mediaSet.length === 1 ? mediaSet[0] : mediaSet.length === 0 ? context?.captionTarget() ?? null : null;
    const media = described ? node[described] : undefined;

    if (media && value !== null && value !== undefined) {
      media.caption = String(value);
    } else {
      assignNodeAttribute(node, key, value, diagnostics, comment.line);
    }
  }

  return entries.map(([key]) => key);
};

const assignMedia = (block: MediaBlock, node: OrbitNode, noteLines: string[], forced: ContentType | null): MediaAssign => {
  const toNote = (): MediaAssign => {
    noteLines.push(reconstructMediaSource(block));
    return 'note';
  };

  if (forced === 'none') {
    return toNote();
  }

  if (forced === 'image') {
    if (node.image) {
      return toNote();
    }

    node.image = { src: block.url, alt: block.alt || undefined };
    return 'image';
  }

  if (forced === 'video') {
    if (node.video) {
      return toNote();
    }

    node.video = { src: block.url, provider: detectVideoProvider(block.url) ?? 'native', thumbnail: block.mediaKind === 'wrapped' ? block.thumb : undefined };
    return 'video';
  }

  if (forced === 'embed') {
    if (node.embed) {
      return toNote();
    }

    node.embed = { src: block.url };
    return 'embed';
  }

  // Auto-detect path
  if (block.mediaKind === 'wrapped') {
    const provider = detectVideoProvider(block.url);

    if (provider) {
      // Wrapped video: only consume into node.video; if taken, fall to note.
      if (!node.video) {
        node.video = { src: block.url, provider, thumbnail: block.thumb };
        return 'video';
      }
    } else if (!node.image) {
      // Wrapped link that's not a video: treat the inner thumbnail as the image.
      node.image = { src: block.thumb!, alt: block.alt || undefined };
      return 'image';
    }
  } else if (block.mediaKind === 'image') {
    if (!node.image) {
      node.image = { src: block.url, alt: block.alt || undefined };
      return 'image';
    }
  } else if (block.mediaKind === 'link') {
    const provider = detectVideoProvider(block.url);

    if (!node.video && provider) {
      node.video = { src: block.url, provider };
      return 'video';
    }
  }

  return toNote();
};

/**
 * `key: value, key: value` on one line, split into its pairs; null when the
 * text isn't a list of pairs. Commas inside quotes or brackets don't split,
 * and a backslash escapes the next character inside double quotes.
 */
const commaSeparatedAttributes = (body: string): string[] | null => {
  if (body.includes('\n')) {
    return null;
  }

  const pairs: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];

    if (quote) {
      if (character === '\\' && quote === '"') {
        index += 1;
      } else if (character === quote) {
        quote = '';
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[' || character === '{') {
      depth += 1;
    } else if (character === ']' || character === '}') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      pairs.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }

  pairs.push(body.slice(start).trim());
  const isPair = (text: string) => /^[A-Za-z][\w-]*\s*:(\s|$)/.test(text);
  return pairs.length > 1 && pairs.every(isPair) ? pairs : null;
};

const reconstructMediaSource = (block: MediaBlock): string => {
  if (block.mediaKind === 'image') {
    return `![${block.alt ?? ''}](${block.url})`;
  }

  if (block.mediaKind === 'wrapped') {
    return `[![${block.alt ?? ''}](${block.thumb})](${block.url})`;
  }

  return `[${block.text ?? ''}](${block.url})`;
};

// Shared helpers

/** Where a link in a node's note is: the first line from the node's title up to the next node's that has it. */
const noteLinkLines = (root: OrbitNode, rawLines: string[]): LinkLine => {
  const titles: number[] = [];

  const collect = (node: OrbitNode): void => {
    if (node.source?.line !== undefined) {
      titles.push(node.source.line);
    }

    node.children.forEach(collect);
  };

  collect(root);
  titles.sort((a, b) => a - b);

  return (node, href, inNote) => {
    const start = node.source?.line;

    if (start === undefined || !inNote) {
      return start;
    }

    const end = titles.find((line) => line > start) ?? rawLines.length + 1;

    for (let line = start; line < end; line += 1) {
      if (rawLines[line - 1].includes(`](${href})`)) {
        return line;
      }
    }

    return start;
  };
};

/** The last line a list's items take, blank lines after them aside. */
const lastLineOf = (items: ListItem[]): number => {
  const item = items[items.length - 1];
  const content = item.content.filter((block) => block.kind !== 'blank');
  const last = content[content.length - 1];

  if (last?.kind === 'list') {
    return lastLineOf(last.items);
  }

  return last ? last.last : item.line;
};

/**
 * Notes a comment that sets nothing because it lacks the `orbit` keyword,
 * although it reads like attributes: `<!-- status: done -->`.
 */
const noteAttributeComments = (text: string, line: number, diagnostics: DiagnosticCollector): void => {
  for (const match of text.matchAll(HIDDEN_COMMENT)) {
    const body = match[2].trim();
    const key = /^([A-Za-z]+)\s*:/.exec(body)?.[1];

    if (key !== undefined && (NODE_ATTRIBUTE_KEYS as readonly string[]).includes(key)) {
      diagnostics.note('comment-without-orbit', `This comment is hidden, so it sets nothing: to set "${key}", write <!-- orbit ${body} -->.`, line);
    }
  }
};

const makeNode = (source: { text: string; line: number }): OrbitNode => {
  const parts = parseTitle(source.text);
  const node: OrbitNode = {
    id: nodeSlug(parts.text),
    text: parts.text,
    level: 0,
    children: [],
    icon: parts.icon,
    link: parts.link,
    source: { line: source.line, raw: '' },
  };

  if (parts.status) {
    node.status = parts.status;
  }

  if (parts.tags) {
    node.tags = parts.tags;
  }

  return node;
};

const emptyNode = (): OrbitNode => {
  return { id: 'empty', text: '', level: 0, children: [] };
};

const fixLevels = (node: OrbitNode, level: number): void => {
  node.level = level;

  for (const child of node.children) {
    setParent(child, node);
    fixLevels(child, level + 1);
  }
};
