/**
 * Where a markdown document came from: its text, and which lines each node
 * owns. Saving uses it to write back only what an edit changed, so a map
 * written by hand (or by another app) keeps its own formatting, and
 * everything Orbit doesn't read, through edits.
 */

import type { OrbitDocument, OrbitDocumentOptions, OrbitNode } from './types.js';
import { copyMedia } from './node-attributes.js';

/** What a line is to the node that owns it. */
export type LineRole =
  /** The frontmatter block, and blank lines before it. */
  | 'frontmatter'
  /** A heading or list item line (a setext heading's underline too), or the paragraph that names a generated root. */
  | 'title'
  /** An `<!-- orbit … -->` block. */
  | 'attributes'
  /** A picture or video line, and the comment after it that sets its caption or content type. */
  | 'media'
  /** Text of the node's note: paragraphs, quotes, code, or headings under a list item. */
  | 'note'
  /**
   * The end of the document, which stays at its end: link and footnote
   * definitions there (the root's note), and the blank lines around them.
   */
  | 'end'
  /** Text Orbit keeps without reading: other HTML comments, rules, attribute blocks it couldn't read. */
  | 'foreign'
  | 'blank';

/** How a node was written. */
export type NodeShape =
  | { kind: 'heading'; level: number; setext: boolean }
  /** `indent` is the marker's column, `content` the column its text starts at. */
  | { kind: 'item'; indent: number; marker: string; content: number }
  /** A root Orbit made up: named after the title or a lead paragraph (`lead`), or "Untitled map". */
  | { kind: 'generated'; lead: boolean };

/** A node's own fields, as they were read: to tell which ones an edit changed. */
export type NodeFields = Pick<OrbitNode, 'id' | 'text' | 'icon' | 'link' | 'status' | 'tags' | 'color' | 'paletteColor' | 'priority' | 'collapsed' | 'type' | 'typeVersion' | 'note' | 'noteFormat' | 'image' | 'video' | 'embed' | 'attrs'>;

export interface NodeRecord {
  shape: NodeShape;

  /** The title line, 0-based; null for a generated root without a lead paragraph. */
  titleLine: number | null;

  /** The lines the node and everything under it span, 0-based, end exclusive. */
  start: number;

  end: number;

  /** Whether every line in the span is the node's or under it, so the span can be written back as one piece. */
  contiguous: boolean;

  /** Its children, in their order in the source. */
  children: OrbitNode[];

  fields: NodeFields;

  /** Whether the node's id was written as an attribute (or would have to be). */
  explicitId: boolean;
}

export interface DocumentSource {
  /** The lines as the parser read them: line endings as `\n`, without a byte-order mark or shared indentation. */
  lines: string[];

  /** For each line, the node it belongs to (null for the frontmatter) and what it is there. */
  owners: (OrbitNode | null)[];

  roles: LineRole[];
  records: WeakMap<OrbitNode, NodeRecord>;
  root: OrbitNode;

  /** The options as read, to tell which ones changed. */
  options: OrbitDocumentOptions;

  /** The frontmatter keys Orbit doesn't read, as read, to tell which ones changed. */
  extra: Record<string, unknown>;

  /** The frontmatter's fences, 0-based, when the document has frontmatter. */
  frontmatter: { open: number; close: number } | null;

  /** How the file was written, so it's written back the same way. */
  encoding: SourceEncoding;
}

export interface SourceEncoding {
  lineEnding: '\n' | '\r\n';
  byteOrderMark: boolean;

  /** Indentation every line shared (a map indented inside HTML or a template), put back on save. */
  indentation: string;

  /** Lines around the map that the parser unwrapped: a ```` ```orbit ```` fence. */
  before: string[];

  after: string[];
}

/** How a text is written: its line endings and byte-order mark. Indentation and wrapping are set where they're found. */
export const encodingOf = (text: string): SourceEncoding => {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length;
  return {
    lineEnding: crlf > 0 && crlf * 2 >= lf ? '\r\n' : '\n',
    byteOrderMark: text.startsWith('\uFEFF'),
    indentation: '',
    before: [],
    after: [],
  };
};

/** Sources by the root of the tree read from them: copies of a document (`{ ...document, options }`) share it. */
const SOURCES = new WeakMap<OrbitNode, DocumentSource>();

/**
 * The source a document's tree was read from, when it was read from
 * markdown. Kept by the tree's root, off the document itself, so documents
 * stay plain data that JSON leaves out, and a copy of a document with other
 * options (or a map holding the tree) still saves from its source.
 */
export const documentSource = (document: Pick<OrbitDocument, 'root'>): DocumentSource | undefined => {
  const source = SOURCES.get(document.root);
  return source?.root === document.root ? source : undefined;
};

/** Remembers where a document's tree came from (see `documentSource`). */
export const setDocumentSource = (document: Pick<OrbitDocument, 'root'>, source: DocumentSource): void => {
  SOURCES.set(document.root, source);
};

/** A copy of a node's own fields, deep enough that edits to the node don't reach it. */
export const nodeFields = (node: OrbitNode): NodeFields => {
  const copy = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  return {
    id: node.id,
    text: node.text,
    icon: node.icon,
    link: node.link,
    status: node.status,
    tags: copy(node.tags) as string[] | undefined,
    color: node.color,
    paletteColor: node.paletteColor,
    priority: node.priority,
    collapsed: node.collapsed,
    type: node.type,
    typeVersion: node.typeVersion,
    note: node.note,
    noteFormat: node.noteFormat,
    image: node.image && copyMedia(node.image),
    video: node.video && copyMedia(node.video),
    embed: node.embed && copyMedia(node.embed),
    attrs: copy(node.attrs) as NodeFields['attrs'],
  };
};

/**
 * Collects, while a document is parsed, which node owns each line and what
 * the line is, then works out each node's span.
 */
export class SourceRecorder {
  readonly owners: (OrbitNode | null)[];
  readonly roles: (LineRole | undefined)[];
  private readonly lines: string[];
  private readonly shapes = new Map<OrbitNode, { shape: NodeShape; titleLine: number | null }>();

  constructor(lines: string[]) {
    this.lines = lines;
    this.owners = new Array(lines.length).fill(null);
    this.roles = new Array(lines.length).fill(undefined);
  }

  /** Lines `first` to `last` (1-based, inclusive) belong to `node` as `role`. */
  mark(first: number, last: number, node: OrbitNode | null, role: LineRole): void {
    for (let line = Math.max(1, first); line <= last && line <= this.lines.length; line += 1) {
      this.owners[line - 1] = node;
      this.roles[line - 1] = role;
    }
  }

  /** A line's text (1-based), as read. */
  line(line: number): string {
    return this.lines[line - 1] ?? '';
  }

  /** How `node` was written, and its title line (1-based), if it has one. */
  shape(node: OrbitNode, shape: NodeShape, titleLine: number | null): void {
    this.shapes.set(node, { shape, titleLine: titleLine === null ? null : titleLine - 1 });
  }

  /**
   * The finished source. Blank lines nothing claimed go with the text they
   * lead up to (an idea moved takes the blank line before it, and the
   * paragraph after a list keeps the blank line that keeps it out of the
   * list); at the end of the document, with the line above. Every line has
   * an owner, so spans cover the whole document.
   */
  finish(
    root: OrbitNode,
    options: OrbitDocumentOptions,
    extra: Record<string, unknown>,
    frontmatter: DocumentSource['frontmatter'],
    explicitIds: ReadonlySet<OrbitNode>,
  ): DocumentSource {
    const owners = [...this.owners];
    const claimed = [...this.roles];
    let next: OrbitNode | null = null;
    let nextRole: LineRole | undefined;

    for (let index = this.lines.length - 1; index >= 0; index -= 1) {
      const role = claimed[index];

      if (role !== undefined) {
        if (role !== 'frontmatter') {
          next = owners[index];
          nextRole = role;
        }
      } else if (next && this.lines[index].trim() === '') {
        owners[index] = next;
        // The blank line before definitions at the end stays with them.
        claimed[index] = nextRole === 'end' ? 'end' : 'blank';
      }
    }

    const roles: LineRole[] = [];
    let owner: OrbitNode | null = null;
    let lastClaimed = -1;

    claimed.forEach((role, index) => {
      if (role !== undefined && role !== 'frontmatter') {
        lastClaimed = index;
      }
    });

    for (let index = 0; index < this.lines.length; index += 1) {
      const role = claimed[index];

      if (role !== undefined) {
        roles.push(role);

        if (role !== 'frontmatter') {
          owner = owners[index];
        }

        continue;
      }

      const blank = this.lines[index].trim() === '';

      if (index > lastClaimed) {
        // After every node: the end of the document, which stays at the end.
        owners[index] = root;
        roles.push(blank ? 'end' : 'foreign');
      } else {
        owners[index] = owner ?? root;
        roles.push(blank ? 'blank' : 'foreign');
      }
    }

    const records = new WeakMap<OrbitNode, NodeRecord>();
    const firstLines = new Map<OrbitNode, number>();
    const lastLines = new Map<OrbitNode, number>();

    owners.forEach((node, index) => {
      if (node) {
        if (!firstLines.has(node)) {
          firstLines.set(node, index);
        }

        lastLines.set(node, index);
      }
    });

    const spanOf = (node: OrbitNode): { start: number; end: number } => {
      let start = firstLines.get(node) ?? Number.POSITIVE_INFINITY;
      let end = (lastLines.get(node) ?? -1) + 1;

      for (const child of node.children) {
        const span = spanOf(child);
        start = Math.min(start, span.start);
        end = Math.max(end, span.end);
      }

      const known = this.shapes.get(node);
      const shape: NodeShape = known?.shape ?? { kind: 'generated', lead: false };

      if (!Number.isFinite(start)) {
        start = end = 0;
      }

      records.set(node, {
        shape,
        titleLine: known?.titleLine ?? null,
        start,
        end,
        contiguous: true,
        children: [...node.children],
        fields: nodeFields(node),
        explicitId: explicitIds.has(node),
      });
      return { start, end };
    };

    spanOf(root);
    // A span with another node's line inside it (definitions written halfway through an idea's text, say).
    // A depth-first walk's enter/exit counters bracket a node's descendants, so the ancestor test is O(1).
    const brackets = new Map<OrbitNode, [number, number]>();
    let order = 0;

    const bracket = (node: OrbitNode): void => {
      const enter = order;
      order += 1;

      for (const child of node.children) {
        bracket(child);
      }

      brackets.set(node, [enter, order]);
    };

    bracket(root);

    const insideOf = (node: OrbitNode, ancestor: OrbitNode): boolean => {
      const [enter, exit] = brackets.get(ancestor)!;
      const bracketed = brackets.get(node)!;
      return bracketed[0] >= enter && bracketed[0] < exit;
    };

    const check = (node: OrbitNode): void => {
      const record = records.get(node)!;

      for (let index = record.start; index < record.end; index += 1) {
        const owner = owners[index];

        if (owner && !insideOf(owner, node)) {
          record.contiguous = false;
          break;
        }
      }

      node.children.forEach(check);
    };

    root.children.forEach(check);
    // The root spans the whole body, blank lines at the end included.
    const rootRecord = records.get(root)!;
    rootRecord.start = Math.min(rootRecord.start, frontmatter ? frontmatter.close + 1 : 0);
    rootRecord.end = this.lines.length;
    return {
      lines: this.lines,
      owners,
      roles,
      records,
      root,
      options: JSON.parse(JSON.stringify(options)) as OrbitDocumentOptions,
      extra: JSON.parse(JSON.stringify(extra)) as Record<string, unknown>,
      frontmatter,
      encoding: { lineEnding: '\n', byteOrderMark: false, indentation: '', before: [], after: [] },
    };
  }
}
