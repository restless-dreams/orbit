/**
 * Saving an edited map without rewriting it. Every line an edit didn't
 * change is written back as it was, and only what changed is written again,
 * in place, in Orbit's own form: a renamed idea gets a new title, a moved
 * one takes its lines along. A map written by hand, or by another app,
 * keeps its formatting and everything Orbit doesn't read: other HTML
 * comments, rules, the frontmatter keys of other apps.
 *
 * The result is read back before it's used: when it doesn't read as the
 * edited map, saving falls back to rewriting the changed ideas whole, then
 * to Orbit's own form for the whole map.
 */

import type { OrbitDocument, OrbitDocumentOptions, OrbitNode } from './types.js';
import { nodeFields, type DocumentSource, type LineRole, type NodeFields, type NodeRecord, type NodeShape } from './document-source.js';
import { CHECKBOXES, collectFrontmatter, HEADING_LEVELS, nodePieces, renderMedia, titleLine, type NodePieces, type Writing } from './markdown-writing.js';
import { emitYaml, type YamlValue } from './yaml-mini.js';
import { nodesWithExplicitIds } from './utils.js';
import { parseOrbit } from './dispatch.js';
import { UNTITLED_ROOT_ID } from './parser-markdown.js';

/** Where a node is written: as a heading of a level, a list item at a column, or as the made-up root. */
type Context =
  | { kind: 'heading'; level: number }
  | { kind: 'item'; indent: number; marker: string }
  | { kind: 'generated' };

/** Lines of a node's own, in a row, with one role: after which of its children they come (-1: before them all). */
interface Run {
  from: number;
  to: number;
  role: LineRole;
  after: number;
}

/** What an edit changed in a node's own lines. */
interface Changes {
  title: boolean;
  attributes: boolean;
  media: boolean;
  note: boolean;
}

/** Thrown when the map can't be written by patching; saving falls back to the next way. */
class CannotPatch extends Error {}

/**
 * The document as markdown, its source's lines kept wherever nothing
 * changed; null when that can't be done faithfully.
 */
export const patchMarkdown = (document: OrbitDocument, source: DocumentSource): string | null => {
  if (document.root !== source.root) {
    return null;
  }

  for (const coarse of [false, true]) {
    const patcher = new Patcher(document, source, coarse);
    let lines: string[];

    try {
      lines = patcher.write();
    } catch (error) {
      if (error instanceof CannotPatch) {
        continue;
      }

      throw error;
    }

    const text = encode(lines, source);

    // The made-up root's new name may be written as the title option. A document without extra keys of its own
    // keeps the ones its file has, so that's what the text should read back with.
    if (lines === source.lines || readsAs(text, { ...document, options: patcher.writtenOptions, extra: document.extra ?? source.extra })) {
      return text;
    }
  }

  return null;
};

/**
 * The patched text without checking that it reads back, or why it couldn't
 * be made: for tests and debugging.
 */
export const patchedText = (document: OrbitDocument, source: DocumentSource, coarse = false): string => {
  return encode(new Patcher(document, source, coarse).write(), source);
};

/**
 * Whether `text` reads back as the `expected` map: the same options and
 * keys, and the same tree, each node with the same id and the same
 * fields, as Orbit would write them.
 */
const readsAs = (text: string, expected: OrbitDocument): boolean => {
  let read: OrbitDocument;

  try {
    // A made-up root keeps its id in every language: read it back with the name it was given.
    read = parseOrbit(text, { untitled: expected.root.id === UNTITLED_ROOT_ID ? expected.root.text : undefined });
  } catch {
    return false;
  }

  if (JSON.stringify(collectFrontmatter(read)) !== JSON.stringify(collectFrontmatter(expected))) {
    return false;
  }

  const readIds = nodesWithExplicitIds(read.root);
  const expectedIds = nodesWithExplicitIds(expected.root);
  const same = (left: OrbitNode, right: OrbitNode): boolean =>
    left.id === right.id
    && JSON.stringify(describe(left, false, readIds.has(left))) === JSON.stringify(describe(right, false, expectedIds.has(right)))
    && left.children.length === right.children.length
    && left.children.every((child, index) => same(child, right.children[index]));
  return same(read.root, expected.root);
};

/** Lines written as the source was: its line endings, byte-order mark, indentation and wrapping. */
const encode = (lines: string[], source: DocumentSource): string => {
  const { encoding } = source;
  const indented = encoding.indentation ? lines.map((line) => (line.trim() === '' ? line : encoding.indentation + line)) : lines;
  const text = [...encoding.before, ...indented, ...encoding.after].join(encoding.lineEnding);
  return encoding.byteOrderMark ? `\uFEFF${text}` : text;
};

class Patcher {
  private readonly lines: string[];
  private readonly records: WeakMap<OrbitNode, NodeRecord>;
  private readonly writing: Writing;
  private readonly cleanness = new Map<OrbitNode, boolean>();
  private readonly document: OrbitDocument;
  private readonly source: DocumentSource;

  /** Rewrite changed ideas whole, instead of only their changed lines. */
  private readonly coarse: boolean;

  /** The node whose own lines are being written. */
  private current: OrbitNode | null = null;

  /** The options the frontmatter was written with. */
  writtenOptions: OrbitDocumentOptions = {};

  /** Whether the made-up root is written as a heading of its own. */
  private rootHeading = false;

  constructor(document: OrbitDocument, source: DocumentSource, coarse: boolean) {
    this.document = document;
    this.source = source;
    this.coarse = coarse;
    this.lines = source.lines;
    this.records = source.records;
    this.writing = { explicitIds: nodesWithExplicitIds(document.root) };
  }

  write(): string[] {
    const root = this.document.root;
    const record = this.record(root);
    this.rootHeading = record.shape.kind === 'generated' && this.becomesHeading(root, record);
    const options = this.options();
    this.writtenOptions = options;
    const optionsChanged = JSON.stringify(this.frontmatterKeys(options)) !== JSON.stringify(this.frontmatterKeys(this.source.options, this.source.extra));

    if (!optionsChanged && this.isClean(root)) {
      return this.lines;
    }

    const out = this.frontmatter(options);
    const body: string[] = [];
    const context: Context = this.rootHeading ? { kind: 'heading', level: 1 } : contextOf(record.shape);
    this.emit(root, context, body);

    // A frontmatter that went takes the blank line that kept it apart with it: the map starts at its first line.
    if (this.source.frontmatter && out.length === 0) {
      while (body.length > 0 && body[0].trim() === '') {
        body.shift();
      }
    }

    out.push(...body);

    // A file that ended with a line break still does.
    if (this.lines[this.lines.length - 1] === '' && out[out.length - 1] !== '') {
      out.push('');
    }

    return out;
  }

  /**
   * Whether the root Orbit made up gets a heading of its own: when it's
   * renamed, or its attributes or media change (a heading line is where they
   * go), or a map of only text gets its first idea. Not when its children are
   * top-level headings themselves: a heading above them would change their
   * levels, so a new name goes to the frontmatter's title instead.
   */
  private becomesHeading(root: OrbitNode, record: NodeRecord): boolean {
    if (record.children.some((child) => this.records.get(child)?.shape.kind === 'heading')) {
      return false;
    }

    if (record.children.length === 0 && root.children.length > 0) {
      return true;
    }

    const changes = this.changes(root, record, this.ownRuns(root, record));
    return changes.title || changes.attributes || changes.media;
  }

  /** The options to write: the document's, with the made-up root's new name as its title when it has no heading. */
  private options(): OrbitDocumentOptions {
    const options = { ...this.document.options };
    const root = this.document.root;
    const record = this.record(root);

    if (record.shape.kind === 'generated' && !this.rootHeading && root.text !== record.fields.text) {
      options.title = root.text;
    }

    return options;
  }

  private record(node: OrbitNode): NodeRecord {
    const record = this.records.get(node);

    if (!record) {
      throw new CannotPatch('A node without a record');
    }

    return record;
  }

  /** Whether a node and everything under it are as they were read. */
  private isClean(node: OrbitNode): boolean {
    let clean = this.cleanness.get(node);

    if (clean === undefined) {
      const record = this.records.get(node);
      clean = record !== undefined
        && this.ownUnchanged(node, record)
        && sameChildren(node.children, record.children)
        && node.children.every((child) => this.isClean(child));
      this.cleanness.set(node, clean);
    }

    return clean;
  }

  private ownUnchanged(node: OrbitNode, record: NodeRecord): boolean {
    return JSON.stringify(nodeFields(node)) === JSON.stringify(record.fields) && this.writing.explicitIds.has(node) === record.explicitId;
  }

  // Frontmatter

  /**
   * The frontmatter's keys and values for `options`, with the keys Orbit
   * doesn't read (`extra`, by default the document's): other apps' keys, and
   * keys an app keeps there itself, are saved when they change too. A
   * document without `extra` changes none of them: one built from a tree and
   * options alone would otherwise drop every key another app wrote, so only
   * an `extra` object, even an empty one, removes keys.
   */
  private frontmatterKeys(options: OrbitDocumentOptions, extra = this.document.extra ?? this.source.extra): Record<string, unknown> {
    return collectFrontmatter({ options, extra });
  }

  /** The frontmatter, with the keys whose values changed written again and the rest as they were. */
  private frontmatter(options: OrbitDocumentOptions): string[] {
    const fences = this.source.frontmatter;
    const before = this.frontmatterKeys(this.source.options, this.source.extra);
    const after = this.frontmatterKeys(options);
    const lines = fences ? this.lines.slice(0, fences.close + 1) : [];
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    const changed = keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));

    if (changed.length === 0) {
      return fences ? lines : this.lines.slice(0, this.bodyStart());
    }

    if (!fences) {
      const written = Object.fromEntries(Object.entries(after));
      return ['---', ...yamlLines(written), '---', '', ...this.lines.slice(0, this.bodyStart())];
    }

    const open = fences.open;
    let close = fences.close;

    for (const key of changed) {
      const range = keyRange(lines, key, open + 1, close);
      const replacement = after[key] === undefined ? [] : yamlLines({ [key]: after[key] });

      if (range) {
        lines.splice(range.from, range.to - range.from, ...replacement);
        close += replacement.length - (range.to - range.from);
      } else {
        lines.splice(close, 0, ...replacement);
        close += replacement.length;
      }
    }

    // A frontmatter left with nothing in it goes.
    if (lines.slice(open + 1, close).every((line) => line.trim() === '')) {
      lines.splice(open, close - open + 1);
    }

    return lines;
  }

  private bodyStart(): number {
    const fences = this.source.frontmatter;
    return fences ? fences.close + 1 : 0;
  }

  // Nodes

  /** Writes `node` and everything under it, as `context` asks, into `out`. */
  private emit(node: OrbitNode, context: Context, out: string[]): void {
    const record = this.records.get(node);

    if (!record) {
      this.generate(node, context, out);
      return;
    }

    if (this.isClean(node) && sameContext(record.shape, context) && record.contiguous) {
      // An underlined heading needs a blank line before it, or its text would join the paragraph above.
      if (record.shape.kind === 'heading' && record.shape.setext && this.lines[record.start]?.trim() !== '') {
        separate(out);
      }

      const lines = this.lines.slice(record.start, record.end);

      // An indented heading starts at the margin: with what's around it written again, a list item before it could take it.
      if (context.kind === 'heading' && record.titleLine !== null) {
        const index = record.titleLine - record.start;
        lines[index] = lines[index].replace(/^ {1,3}(?=#)/, '');
      }

      out.push(...lines);
      return;
    }

    const runs = this.ownRuns(node, record);
    const changes = this.changes(node, record, runs);
    this.current = node;
    const kindChanged = record.shape.kind !== context.kind;
    const pieces = nodePieces(node, context.kind === 'item', this.writing, ' '.repeat(contentColumn(record.shape, context)));
    const head = runs.filter((run) => run.after < 0);

    if (kindChanged && record.shape.kind !== 'generated') {
      this.rewriteOwn(record, context, pieces, runs, out);
    } else {
      this.patchOwn(record, context, pieces, head, changes, out);
    }

    this.emitChildren(node, record, context, runs, changes, out);
  }

  /** The lines a node owns, in runs of one role. */
  private ownRuns(node: OrbitNode, record: NodeRecord): Run[] {
    const starts = record.children.map((child) => this.record(child).start);
    const runs: Run[] = [];

    for (let line = record.start; line < record.end; line += 1) {
      if (this.source.owners[line] !== node) {
        continue;
      }

      const role = this.source.roles[line];
      let after = -1;

      while (after + 1 < starts.length && starts[after + 1] <= line) {
        after += 1;
      }

      const last = runs[runs.length - 1];

      if (last && last.to === line && last.role === role && last.after === after) {
        last.to = line + 1;
      } else {
        runs.push({ from: line, to: line + 1, role, after });
      }
    }

    return runs;
  }

  private changes(node: OrbitNode, record: NodeRecord, runs: Run[]): Changes {
    const listItem = record.shape.kind === 'item';
    const before = describe(asNode(record.fields), listItem, record.explicitId);
    const after = describe(node, listItem, this.writing.explicitIds.has(node));
    const changes: Changes = {
      title: before.title !== after.title,
      attributes: before.attributes !== after.attributes,
      media: before.media !== after.media,
      note: before.note !== after.note,
    };
    // A note written (partly) as a `note:` attribute is written again as text whenever either changes.
    const noteAttribute = /(^|[\s,])note\s*:/;
    const titleComment = record.titleLine === null ? '' : (INLINE_COMMENT.exec(this.lines[record.titleLine]) ?? [''])[0];

    if (runs.some((run) => run.role === 'attributes' && noteAttribute.test(this.text(run))) || noteAttribute.test(titleComment)) {
      if (changes.note || changes.attributes) {
        changes.note = true;
        changes.attributes = true;
      }
    }

    if (this.coarse && Object.values(changes).some(Boolean)) {
      return { title: true, attributes: true, media: true, note: true };
    }

    return changes;
  }

  private text(run: Run): string {
    return this.lines.slice(run.from, run.to).join('\n');
  }

  /**
   * A node's own lines with what changed written again in place: a new
   * title on its line, new attributes after it, media and note where the old
   * ones were. Everything else, including what Orbit doesn't read, stays.
   */
  private patchOwn(record: NodeRecord, context: Context, pieces: NodePieces, head: Run[], changes: Changes, out: string[]): void {
    const shift = indentShift(record.shape, context);
    const own: string[] = [];
    let afterTitle = 0;
    let wroteAttributes = false;
    let wroteMedia = false;
    let wroteNote = false;
    const generated = record.shape.kind === 'generated';

    // The made-up root that becomes a heading: its line goes first.
    if (generated && context.kind === 'heading') {
      own.push(`${'#'.repeat(context.level)} ${`${pieces.title}${pieces.inline}`.trimStart()}`);
      afterTitle = own.length;

      if (pieces.attributes) {
        own.push(...splitLines(pieces.attributes));
        afterTitle = own.length;
      }

      wroteAttributes = true;
    }

    for (const run of head) {
      const lines = this.lines.slice(run.from, run.to);

      switch (run.role) {
        case 'title': {
          if (generated) {
            // A lead paragraph names the root. Once the root has a heading, or a new name in the frontmatter, it goes.
            if (context.kind !== 'heading' && !changes.title) {
              own.push(...lines);
            }

            afterTitle = own.length;
            break;
          }

          own.push(...this.patchTitle(lines, record, context, pieces, changes));
          afterTitle = own.length;

          if (changes.attributes && pieces.attributes) {
            own.push(...splitLines(pieces.attributes));
            afterTitle = own.length;
          }

          wroteAttributes = true;
          break;
        }
        case 'attributes':
          if (!changes.attributes) {
            own.push(...shiftLines(lines, shift));
          }

          break;
        case 'media':
          if (!changes.media) {
            own.push(...shiftLines(lines, shift));
          } else if (!wroteMedia) {
            own.push(...splitLines(pieces.media));
            wroteMedia = true;
          }

          break;
        case 'note':
        case 'end':
          if (!changes.note) {
            own.push(...shiftLines(lines, shift));
          } else if (!wroteNote) {
            own.push(...splitLines(pieces.note));
            wroteNote = true;
          }

          break;
        default:
          own.push(...shiftLines(lines, shift));
      }
    }

    // A generated root has no title line: its attributes go first, on lines of their own.
    if (changes.attributes && !wroteAttributes && pieces.attributes) {
      own.splice(afterTitle, 0, ...splitLines(pieces.attributes));
      afterTitle += splitLines(pieces.attributes).length;
    }

    if (changes.media && !wroteMedia && pieces.media) {
      own.splice(afterTitle, 0, ...splitLines(pieces.media));
    }

    if (changes.note && !wroteNote && pieces.note) {
      let end = own.length;

      while (end > afterTitle && own[end - 1].trim() === '') {
        end -= 1;
      }

      const note = splitLines(pieces.note);
      // Between a heading and its note, a blank line, as Orbit writes them.
      own.splice(end, 0, ...note);
    }

    // A heading the root just got, or an underlined one, needs a blank line before it; others are kept as written.
    const blankBefore = record.shape.kind !== 'heading' || (record.shape.setext && own[0] === this.lines[record.titleLine ?? -1]);

    if (context.kind === 'heading' && own.length > 0 && own[0].trim() !== '' && blankBefore) {
      separate(out);
    }

    out.push(...own);
  }

  /** A node that changed between heading and list item: its own lines written again, keeping what Orbit doesn't read. */
  private rewriteOwn(record: NodeRecord, context: Context, pieces: NodePieces, runs: Run[], out: string[]): void {
    if (context.kind === 'heading') {
      separate(out);
      out.push(`${'#'.repeat(context.level)} ${`${pieces.title}${pieces.inline}`.trimStart()}`);
    } else if (context.kind === 'item') {
      out.push(`${' '.repeat(context.indent)}${markerOf(record.shape, context)} ${`${pieces.title}${pieces.inline}`.trimStart()}`);
    } else {
      throw new CannotPatch('A node can only become the root by being it');
    }

    out.push(...splitLines(pieces.attributes + pieces.media + pieces.note));
    const column = contentColumn(record.shape, context);

    for (const run of runs) {
      if (run.role === 'foreign') {
        out.push(...this.lines.slice(run.from, run.to).map((line) => ' '.repeat(column) + line.trimStart()));
      }
    }
  }

  /** The title line, with its new title, attributes, level or indentation. */
  private patchTitle(lines: string[], record: NodeRecord, context: Context, pieces: NodePieces, changes: Changes): string[] {
    const shape = record.shape;
    const fresh = `${pieces.title}${pieces.inline}`.trimStart();

    if (shape.kind === 'heading' && context.kind === 'heading') {
      const match = ATX.exec(lines[0]);

      if (shape.setext || !match) {
        return !changes.title && !changes.attributes && shape.level === context.level ? lines : [`${'#'.repeat(context.level)} ${fresh}`];
      }

      // Written again, a heading starts at the margin: indented, a list item before it could take it.
      return [`${'#'.repeat(context.level)}${match[3]}${this.titleText(match[4], record, pieces, changes)}`];
    }

    if (shape.kind === 'item' && context.kind === 'item') {
      const match = ITEM.exec(lines[0]);

      if (!match) {
        return [`${' '.repeat(context.indent)}${shape.marker} ${fresh}`];
      }

      const indent = context.indent === shape.indent ? match[1] : ' '.repeat(context.indent);
      return [`${indent}${match[2]}${match[3]}${this.titleText(match[4], record, pieces, changes)}`];
    }

    throw new CannotPatch('A title line of another kind');
  }

  /** A title line's text after its marker: the title and the attributes on it, each kept unless it changed. */
  private titleText(text: string, record: NodeRecord, pieces: NodePieces, changes: Changes): string {
    const inline = INLINE_COMMENT.exec(text);
    let title = inline ? text.slice(0, inline.index) : text;
    const comment = changes.attributes ? pieces.inline : inline ? text.slice(inline.index) : '';

    // A heading's closing `#`s only close it at the end of its line: before a comment, they'd join its title.
    if (record.shape.kind === 'heading' && comment) {
      title = title.replace(/\s+#+\s*$/, '');
    }

    const hidden = changes.title ? TRAILING_COMMENTS.exec(title) : null;
    const bare = hidden ? title.slice(0, hidden.index) : title;
    const written = `${changes.title ? `${this.retitle(bare, record, pieces)}${hidden ? hidden[0].trimEnd() : ''}` : title}${comment}`;
    return written.trimStart();
  }

  /**
   * A changed title. When only a list item's checkbox changed (an idea
   * checked off, say), only the checkbox is written again, so the title
   * keeps its own markdown: bold, code, links.
   */
  private retitle(title: string, record: NodeRecord, pieces: NodePieces): string {
    if (record.shape.kind !== 'item' || this.coarse) {
      return pieces.title;
    }

    const node = this.current;
    const box = node?.status ? CHECKBOXES[node.status] : undefined;
    const before = titleLine(asNode({ ...record.fields, status: node?.status }), true, { explicitIds: new Set() }).title;

    if (!node || before !== pieces.title) {
      return pieces.title;
    }

    const written = CHECKBOX.exec(title);
    const rest = written ? title.slice(written[0].length) : title.trimStart();
    return box ? `${box} ${rest}` : rest;
  }

  /**
   * The children, each followed by what the node wrote right after it.
   * What came after the last child stays after all of them: the node's
   * closing text. Text after a heading belongs to that heading, so under a
   * heading (or at the top level) the node's own text goes before its first
   * child heading, and definitions at the end of the document stay at its end.
   */
  private emitChildren(node: OrbitNode, record: NodeRecord, context: Context, runs: Run[], changes: Changes, out: string[]): void {
    let previous: Context | null = null;
    let headings = false;
    const kinds = this.childKinds(node, context);
    const last = record.children.length - 1;
    const placed = new Set<number>();
    const originalIndex = new Map(record.children.map((child, index) => [child, index]));

    const flush = (): void => {
      for (let index = 0; index <= last; index += 1) {
        if (!placed.has(index)) {
          this.emitGap(record, index, runs, changes, context, out);
          placed.add(index);
        }
      }
    };

    node.children.forEach((child, position) => {
      const index = originalIndex.get(child) ?? -1;
      const childContext = this.childContext(child, record, context, previous, kinds[position], index !== -1);

      if (childContext.kind === 'heading' && !headings) {
        flush();
        headings = true;
      }

      this.emit(child, childContext, out);
      previous = childContext;

      if (index !== -1 && index !== last && !placed.has(index)) {
        this.emitGap(record, index, runs, changes, context, out);
        placed.add(index);
      }
    });

    // What came after children that moved away, or were deleted, is still the node's own.
    flush();

    for (const run of runs) {
      // The document's end stays at its end. Definitions there are the root's note: written
      // again with it when it changed, though the blank lines around them stay.
      const definitions = run.role === 'end' && this.lines.slice(run.from, run.to).some((line) => line.trim() !== '');

      if (run.role === 'end' && !(definitions && changes.note)) {
        out.push(...this.lines.slice(run.from, run.to));
      }
    }
  }

  private emitGap(record: NodeRecord, index: number, runs: Run[], changes: Changes, context: Context, out: string[]): void {
    const shift = indentShift(record.shape, context);

    for (const run of runs) {
      if (run.after !== index || run.role === 'end') {
        continue;
      }

      const dropped = (run.role === 'attributes' && changes.attributes) || (run.role === 'media' && changes.media) || (run.role === 'note' && changes.note);

      if (!dropped) {
        out.push(...shiftLines(this.lines.slice(run.from, run.to), shift));
      }
    }
  }

  /**
   * Under a heading, or at the top level, whether each child is written as
   * a list item or a heading. Items have to come first: after a heading,
   * they'd belong to it. Each child would rather stay as it was written (a
   * new one, like the sibling before it), so the split between items and
   * headings is where the fewest children change.
   */
  private childKinds(node: OrbitNode, context: Context): ('heading' | 'item')[] {
    // Markdown has six levels of headings: below the sixth, children are list items.
    if (context.kind === 'item' || (context.kind === 'heading' && context.level >= 6)) {
      return node.children.map(() => 'item');
    }

    const preferHeadings = context.kind === 'generated' || context.level < HEADING_LEVELS;

    const written = node.children.map((child) => {
      const shape = this.records.get(child)?.shape;
      return shape?.kind === 'heading' || shape?.kind === 'item' ? shape.kind : null;
    });

    // New children take after the sibling before them, or the one after them.
    const before: ('heading' | 'item' | null)[] = [];
    let seen: 'heading' | 'item' | null = null;

    for (const kind of written) {
      before.push(seen);
      seen = kind ?? seen;
    }

    const after: ('heading' | 'item' | null)[] = new Array(written.length).fill(null);
    seen = null;

    for (let index = written.length - 1; index >= 0; index -= 1) {
      after[index] = seen;
      seen = written[index] ?? seen;
    }

    const wanted = written.map((kind, index) => kind ?? before[index] ?? after[index] ?? (preferHeadings ? 'heading' : 'item'));
    // Changes for each split: headings before it become items, items after it become headings.
    const total = wanted.filter((kind) => kind === 'item').length;
    let split = preferHeadings ? 0 : wanted.length;
    let fewest = Number.POSITIVE_INFINITY;
    let headingsBefore = 0;
    let itemsBefore = 0;

    for (let candidate = 0; candidate <= wanted.length; candidate += 1) {
      const changes = headingsBefore + (total - itemsBefore);

      if (changes < fewest || (changes === fewest && !preferHeadings)) {
        fewest = changes;
        split = candidate;
      }

      if (candidate < wanted.length) {
        if (wanted[candidate] === 'heading') {
          headingsBefore += 1;
        } else {
          itemsBefore += 1;
        }
      }
    }

    return wanted.map((_kind, index) => (index < split ? 'item' : 'heading'));
  }

  /**
   * Where a child is written, as `kind` says (see `childKinds`): an item
   * keeps its marker; a heading keeps its level relative to its parent, so
   * a map that skips a level (`#`, then `###`) keeps skipping it.
   */
  private childContext(child: OrbitNode, record: NodeRecord, context: Context, previous: Context | null, kind: 'heading' | 'item', original: boolean): Context {
    const shape = this.records.get(child)?.shape;

    if (context.kind === 'item') {
      const column = contentColumn(record.shape, context);
      return { kind: 'item', indent: column, marker: shape?.kind === 'item' ? shape.marker : nextMarker(previous) };
    }

    if (kind === 'item') {
      return { kind: 'item', indent: 0, marker: shape?.kind === 'item' ? shape.marker : nextMarker(previous) };
    }

    const firstShape = record.children.length > 0 ? this.records.get(record.children[0])?.shape : undefined;
    const parentLevel = context.kind === 'heading' ? context.level : 0;
    const shift = context.kind === 'heading' && record.shape.kind === 'heading' ? context.level - record.shape.level : 0;
    const wanted = original && shape?.kind === 'heading'
      ? shape.level + shift
      : previous?.kind === 'heading'
        ? previous.level
        : firstShape?.kind === 'heading' ? firstShape.level + shift : parentLevel + 1;
    // No deeper than the heading before it, or it would read as that heading's child.
    const level = Math.max(parentLevel + 1, previous?.kind === 'heading' ? Math.min(wanted, previous.level) : wanted);

    if (level > 6) {
      throw new CannotPatch('Headings only go six levels deep');
    }

    return { kind: 'heading', level };
  }

  /** A node Orbit didn't read, with everything under it, in Orbit's own form. */
  private generate(node: OrbitNode, context: Context, out: string[]): void {
    if (context.kind === 'heading') {
      const pieces = nodePieces(node, false, this.writing, '');
      separate(out);
      out.push(`${'#'.repeat(context.level)} ${`${pieces.title}${pieces.inline}`.trimStart()}`, ...splitLines(pieces.attributes + pieces.media + pieces.note));
      let previous: Context | null = null;

      for (const child of node.children) {
        const childContext: Context = context.level < HEADING_LEVELS
          ? { kind: 'heading', level: context.level + 1 }
          : { kind: 'item', indent: 0, marker: nextMarker(previous) };
        this.generate(child, childContext, out);
        previous = childContext;
      }

      return;
    }

    if (context.kind === 'item') {
      const column = context.indent + context.marker.length + 1;
      const pieces = nodePieces(node, true, this.writing, ' '.repeat(column));
      out.push(`${' '.repeat(context.indent)}${context.marker} ${`${pieces.title}${pieces.inline}`.trimStart()}`, ...splitLines(pieces.attributes + pieces.media + pieces.note));
      let previous: Context | null = null;

      for (const child of node.children) {
        const childContext: Context = { kind: 'item', indent: column, marker: nextMarker(previous) };
        this.generate(child, childContext, out);
        previous = childContext;
      }

      return;
    }

    throw new CannotPatch('A new root');
  }
}

const ATX = /^( {0,3})(#{1,6})([ \t]+)(.*)$/;
const CHECKBOX = /^\s*\[( |x|X|\/)\]\s+/;
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/;
const INLINE_COMMENT = /\s*<!--\s*orbit:?\s[\s\S]*-->\s*$/i;
/** Other comments at the end of a title: hidden, and kept when the title changes. */
const TRAILING_COMMENTS = /(?:\s*(?<!\\)<!--[\s\S]*?-->)+\s*$/;

const contextOf = (shape: NodeShape): Context => {
  if (shape.kind === 'heading') {
    return { kind: 'heading', level: shape.level };
  }

  if (shape.kind === 'item') {
    return { kind: 'item', indent: shape.indent, marker: shape.marker };
  }

  return { kind: 'generated' };
};

const sameContext = (shape: NodeShape, context: Context): boolean => {
  if (shape.kind === 'heading') {
    return context.kind === 'heading' && context.level === shape.level;
  }

  if (shape.kind === 'item') {
    return context.kind === 'item' && context.indent === shape.indent;
  }

  return context.kind === 'generated';
};

const sameChildren = (current: OrbitNode[], original: OrbitNode[]): boolean => {
  return current.length === original.length && current.every((child, index) => child === original[index]);
};

/** Columns an item's lines move by in its new place. */
const indentShift = (shape: NodeShape, context: Context): number => {
  return shape.kind === 'item' && context.kind === 'item' ? context.indent - shape.indent : 0;
};

/** The column a node's own text starts at under it (0 for headings). */
const contentColumn = (shape: NodeShape, context: Context): number => {
  if (context.kind !== 'item') {
    return 0;
  }

  if (shape.kind === 'item') {
    return shape.content + context.indent - shape.indent;
  }

  return context.indent + context.marker.length + 1;
};

const markerOf = (shape: NodeShape, context: Context): string => {
  if (shape.kind === 'item') {
    return shape.marker;
  }

  return context.kind === 'item' ? context.marker : '-';
};

/** The marker after a sibling's: the next number in a numbered list, the same bullet otherwise. */
const nextMarker = (previous: Context | null): string => {
  if (previous?.kind !== 'item') {
    return '-';
  }

  const numbered = /^(\d+)([.)])$/.exec(previous.marker);
  return numbered ? `${Number(numbered[1]) + 1}${numbered[2]}` : previous.marker;
};

/** Moves lines right (or left, as far as their indentation goes) by `shift` columns. */
const shiftLines = (lines: string[], shift: number): string[] => {
  if (shift === 0) {
    return lines;
  }

  return lines.map((line) => {
    if (line.trim() === '') {
      return line;
    }

    const expanded = line.replace(/^[ \t]+/, (indent) => expandTabs(indent));

    if (shift > 0) {
      return ' '.repeat(shift) + expanded;
    }

    const indent = /^ */.exec(expanded)![0].length;
    return expanded.slice(Math.min(indent, -shift));
  });
};

const expandTabs = (indent: string): string => {
  let columns = 0;

  for (const character of indent) {
    columns = character === '\t' ? columns + 4 - (columns % 4) : columns + 1;
  }

  return ' '.repeat(columns);
};

const splitLines = (text: string): string[] => {
  if (text === '') {
    return [];
  }

  const lines = text.split('\n');

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
};

/** A blank line before a heading, unless the line before is blank already. */
const separate = (out: string[]): void => {
  if (out.length > 0 && out[out.length - 1].trim() !== '') {
    out.push('');
  }
};

/** A node's own fields as a node, to write them as they were. */
const asNode = (fields: NodeFields): OrbitNode => {
  return { ...fields, level: 0, children: [] } as OrbitNode;
};

/** What Orbit would write for a node's title, attributes, media and note, to compare before and after an edit. */
const describe = (node: OrbitNode, listItem: boolean, explicitId: boolean): { title: string; attributes: string; media: string; note: string } => {
  const writing = { explicitIds: explicitId ? new Set([node]) : new Set<OrbitNode>() };
  const { title, attributes } = titleLine(node, listItem, writing);
  // The note as text, not as written: writing it decides whether to quote it, which reads it again (slow on big maps).
  return { title, attributes: JSON.stringify(attributes), media: renderMedia(node), note: node.note ?? '' };
};

/** A key's lines in a frontmatter: its own line and the lines indented under it (or a list right below it). */
const keyRange = (lines: string[], key: string, from: number, to: number): { from: number; to: number } | null => {
  // The key as it may be written: bare, or quoted (the emitter double-quotes keys that need it).
  const written = [key, JSON.stringify(key), `'${key.replace(/'/g, "''")}'`]
    .map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`^(?:${written.join('|')})\\s*:`);

  for (let index = from; index < to; index += 1) {
    if (pattern.test(lines[index])) {
      let end = index + 1;

      while (end < to && (lines[end].trim() === '' || /^\s/.test(lines[end]) || /^-(\s|$)/.test(lines[end]))) {
        end += 1;
      }

      // Blank lines after the value belong to what follows.
      while (end > index + 1 && lines[end - 1].trim() === '') {
        end -= 1;
      }

      return { from: index, to: end };
    }
  }

  return null;
};

const yamlLines = (value: Record<string, unknown>): string[] => {
  return splitLines(emitYaml(value as unknown as YamlValue));
};
