/**
 * What every reader of another app's file builds: a tree of ideas with what
 * Orbit can show of each, the warnings for what it can't, and the step that
 * turns the tree into an Orbit document, with ids the parsers would give it
 * and links between ideas pointing at those ids.
 */

import { leadingEmoji } from '../parser-markdown.js';
import { findIndexedLinkedNode, indexNodes, isNodeLink } from '../node-links.js';
import { ensureUniqueNodeIds, nodeSlug, setParent } from '../utils.js';
import type { OrbitDocument, OrbitNode } from '../types.js';
import { joinNotes, type ImportedNote } from './notes.js';

/** Every kind of warning reading another app's map gives. */
export const IMPORT_WARNING_CODES = [
  'floating-ideas-moved',
  'summaries-moved',
  'callouts-moved',
  'boundaries-in-notes',
  'links-in-notes',
  'missing-link-targets',
  'icons-not-kept',
  'pictures-not-kept',
  'attachments-not-kept',
  'local-links-not-kept',
  'encrypted-branches-not-read',
  'formatting-not-kept',
] as const;

export type OrbitImportWarningCode = (typeof IMPORT_WARNING_CODES)[number];

/** Something the other app's map had that Orbit keeps another way, or can't keep. */
export interface OrbitImportWarning {
  code: OrbitImportWarningCode;
  message: string;

  /** How many places in the map it's about. */
  count: number;
}

/** Every reason a file can't be read as a map. */
export const IMPORT_ERROR_CODES = ['unknown-format', 'unreadable', 'empty', 'password-protected', 'too-large'] as const;

export type OrbitImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

/** A file that can't be read as a map at all. */
export class OrbitImportError extends Error {
  readonly code: OrbitImportErrorCode;

  constructor(code: OrbitImportErrorCode, message: string) {
    super(message);
    this.name = 'OrbitImportError';
    this.code = code;
  }
}

/** The most ideas a map read from another app may have. */
export const MAX_IMPORTED_IDEAS = 100_000;

/** The deepest a map read from another app may go. */
export const MAX_IMPORTED_DEPTH = 500;

/** A link from one idea to another, by the other app's id for it. */
export interface IdeaLink {
  target: string;

  /** What the other app calls the link, if anything. */
  label?: string;
}

/** An idea as a reader finds it, before it becomes a node. */
export interface ImportedIdea {
  text: string;

  /** The other app's id for it, which links between ideas point at. */
  sourceId?: string;

  /** Its note, in parts: they're joined in order. */
  notes: ImportedNote[];

  /** A web or mail address. */
  link?: string;

  /** Links to other ideas: the first one becomes the idea's link when it has none, the others go in its note. */
  ideaLinks: IdeaLink[];

  collapsed?: boolean;
  status?: string;
  priority?: number;
  tags: string[];

  /** Emoji for its icons, in order: Orbit shows the first. */
  icons: string[];

  color?: string;

  /** Its picture: a web address, or a file in the map's `media`. */
  image?: string;

  children: ImportedIdea[];
}

export const newIdea = (text: string): ImportedIdea => {
  return { text, notes: [], ideaLinks: [], tags: [], icons: [], children: [] };
};

const MESSAGES: Record<OrbitImportWarningCode, (count: number, examples: string) => string> = {
  'floating-ideas-moved': (count, examples) => `${plural(count, 'floating topic')}${examples} had no place in the tree: ${count === 1 ? "it's" : "they're"} now under the center.`,
  'summaries-moved': (count, examples) => `${plural(count, 'summary')}${examples} became ${count === 1 ? 'an idea' : 'ideas'} beside the ideas ${count === 1 ? 'it sums' : 'they sum'} up.`,
  'callouts-moved': (count, examples) => `${plural(count, 'callout')}${examples} became ${count === 1 ? 'an idea' : 'ideas'} under the topic ${count === 1 ? 'it points' : 'they point'} at.`,
  'boundaries-in-notes': (count, examples) => `${plural(count, 'boundary title')}${examples} ${count === 1 ? 'is' : 'are'} now in the note of the idea whose ideas ${count === 1 ? 'it surrounds' : 'they surround'}.`,
  'links-in-notes': (count, examples) => `${plural(count, 'link')}${examples} beyond an idea's first ${count === 1 ? 'is' : 'are'} now in its note.`,
  'missing-link-targets': (count, examples) => `${plural(count, 'link')}${examples} ${count === 1 ? 'points' : 'point'} at an idea that isn't in this map, so ${count === 1 ? 'it was' : 'they were'} left out.`,
  'icons-not-kept': (count, examples) => `${plural(count, 'icon')}${examples} ${count === 1 ? 'was' : 'were'} left out: an idea in Orbit has one icon, an emoji.`,
  'pictures-not-kept': (count, examples) => `${plural(count, 'picture')}${examples} ${count === 1 ? "isn't" : "aren't"} in the file, so ${count === 1 ? 'it was' : 'they were'} left out.`,
  'attachments-not-kept': (count, examples) => `${plural(count, 'attached file')}${examples} ${count === 1 ? 'was' : 'were'} left out; the ideas keep their names.`,
  'local-links-not-kept': (count, examples) => `${plural(count, 'link')}${examples} to files on the computer the map was made on ${count === 1 ? 'was' : 'were'} left out.`,
  'encrypted-branches-not-read': (count, examples) => `${plural(count, 'encrypted branch')}${examples} couldn't be read: the ideas in ${count === 1 ? 'it' : 'them'} were left out.`,
  'formatting-not-kept': (count, examples) => `${plural(count, 'note')}${examples} ${count === 1 ? 'is' : 'are'} kept as plain text, without bold, italics or lists: markdown would have shown ${count === 1 ? 'it' : 'them'} differently.`,
};

const plural = (count: number, noun: string): string => {
  const word = count === 1 ? noun : noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : /(ch|sh|s|x)$/.test(noun) ? `${noun}es` : `${noun}s`;
  return `${count === 1 ? 'One' : count} ${word}`;
};

/** The warnings for one map, each kind counted once with a few examples. */
export class ImportReport {
  private readonly found = new Map<OrbitImportWarningCode, { count: number; examples: string[] }>();

  add(code: OrbitImportWarningCode, example?: string): void {
    const entry = this.found.get(code) ?? { count: 0, examples: [] };
    const shown = example === undefined ? '' : oneLine(example);
    entry.count += 1;

    if (shown !== '' && entry.examples.length < 3 && !entry.examples.includes(shown)) {
      entry.examples.push(shown);
    }

    this.found.set(code, entry);
  }

  /** The warnings in the order of `IMPORT_WARNING_CODES`. */
  get warnings(): OrbitImportWarning[] {
    const order = (code: OrbitImportWarningCode): number => IMPORT_WARNING_CODES.indexOf(code);

    return [...this.found.entries()].sort(([first], [second]) => order(first) - order(second)).map(([code, { count, examples }]) => {
      const shown = examples.map((example) => `“${example.length > 40 ? `${example.slice(0, 39)}…` : example}”`);
      const more = count > examples.length && examples.length > 0 ? ', …' : '';
      return { code, count, message: MESSAGES[code](count, shown.length > 0 ? ` (${shown.join(', ')}${more})` : '') };
    });
  }
}

/** A title on one line, as Orbit keeps titles: line breaks, tabs and runs of spaces become one space; other spaces stay as they are. */
export const oneLine = (text: string): string => {
  return text.replace(/[\t\n\v\f\r\u2028\u2029 ]+/g, ' ').replace(/^ | $/g, '');
};

/** Placeholder for links to ideas until the ideas have Orbit's ids. */
const SOURCE_LINK = '#orbit-source:';

/** A link in a note to the idea with this id in the other app: it points at the idea's Orbit id once the map is built. */
export const sourceLink = (sourceId: string): string => {
  return `${SOURCE_LINK}${encodeURIComponent(sourceId)}`;
};

/**
 * The tree as an Orbit document: titles on one line, an emoji at the start
 * of a title as the idea's icon (as Orbit's markdown reads it), ids from the
 * titles as the parsers give them, and links between ideas pointing at them.
 */
export const buildDocument = (rootIdea: ImportedIdea, report: ImportReport): OrbitDocument => {
  let count = 0;
  const bySource = new Map<string, OrbitNode>();
  const pending: [ImportedIdea, OrbitNode][] = [];

  const build = (idea: ImportedIdea, level: number): OrbitNode => {
    count += 1;

    if (count > MAX_IMPORTED_IDEAS) {
      throw new OrbitImportError('too-large', `The map has more than ${MAX_IMPORTED_IDEAS.toLocaleString('en')} ideas.`);
    }

    if (level > MAX_IMPORTED_DEPTH) {
      throw new OrbitImportError('too-large', `The map goes more than ${MAX_IMPORTED_DEPTH} levels deep.`);
    }

    let text = oneLine(idea.text);
    const icons = idea.icons.filter((icon) => icon !== '');
    let icon = icons[0];
    const emoji = icon === undefined ? leadingEmoji(text) : null;

    if (emoji) {
      icon = emoji.icon;
      text = emoji.text;
    }

    for (const extra of icons.slice(1)) {
      report.add('icons-not-kept', extra);
    }

    const node: OrbitNode = { id: nodeSlug(text), text, level, children: [] };

    if (icon) {
      node.icon = icon;
    }

    if (idea.collapsed && idea.children.length > 0) {
      node.collapsed = true;
    }

    if (idea.status) {
      node.status = idea.status;
    }

    if (idea.priority !== undefined && Number.isFinite(idea.priority)) {
      node.priority = idea.priority;
    }

    const tags = [...new Set(idea.tags.map((tag) => oneLine(tag)).filter((tag) => tag !== ''))];

    if (tags.length > 0) {
      node.tags = tags;
    }

    if (idea.color) {
      node.color = idea.color;
    }

    if (idea.link) {
      node.link = idea.link;
    }

    if (idea.image) {
      node.image = { src: idea.image };
    }

    if (idea.sourceId !== undefined && !bySource.has(idea.sourceId)) {
      bySource.set(idea.sourceId, node);
    }

    pending.push([idea, node]);

    for (const child of idea.children) {
      const childNode = build(child, level + 1);
      setParent(childNode, node);
      node.children.push(childNode);
    }

    return node;
  };

  const root = build(rootIdea, 0);
  ensureUniqueNodeIds(root);

  for (const [idea, node] of pending) {
    const extraLines: { label: string; target: OrbitNode }[] = [];

    for (const link of idea.ideaLinks) {
      const target = bySource.get(link.target);

      if (!target) {
        report.add('missing-link-targets', link.label ?? node.text);
        continue;
      }

      if (!node.link && !link.label) {
        node.link = `#${target.id}`;
      } else {
        report.add('links-in-notes', link.label ?? target.text);
        extraLines.push({ label: link.label ?? target.text, target });
      }
    }

    const note = joinNotes([...idea.notes, linkNote(extraLines, idea.notes)]);

    if (note) {
      node.note = resolveSourceLinks(note.text, bySource, note.format);

      if (note.format === 'plain') {
        node.noteFormat = 'plain';
      }
    }
  }

  // A file's own `#id` links (an OPML file Orbit wrote) point at the ids the titles give, or nowhere.
  const nodes = indexNodes(root);

  for (const [, node] of pending) {
    if (isNodeLink(node.link) && !findIndexedLinkedNode(nodes, node.link)) {
      report.add('missing-link-targets', node.link);
      delete node.link;
    }
  }

  return { root, options: {}, warnings: [], diagnostics: [] };
};

/** Links to other ideas as lines of a note: markdown links, or their names in a plain note. */
const linkNote = (lines: { label: string; target: OrbitNode }[], notes: ImportedNote[]): ImportedNote | undefined => {
  if (lines.length === 0) {
    return undefined;
  }

  const plain = notes.some((note) => note.format === 'plain') || lines.some(({ label }) => /[[\]`*_~<\\]/.test(label));

  if (plain) {
    return { text: lines.map(({ label, target }) => (label === target.text ? `→ ${label}` : `→ ${label}: ${target.text}`)).join('\n'), format: 'plain' };
  }

  return { text: lines.map(({ label, target }) => `→ [${label || target.text}](#${target.id})`).join('\n\n'), format: 'markdown' };
};

/** Links in a markdown note to the other app's ids, pointed at Orbit's ids; links to ideas that aren't in the map keep their text. */
const resolveSourceLinks = (text: string, bySource: Map<string, OrbitNode>, format: 'markdown' | 'plain'): string => {
  if (format !== 'markdown' || !text.includes(SOURCE_LINK)) {
    return text;
  }

  const target = (encoded: string): OrbitNode | undefined => {
    try {
      return bySource.get(decodeURIComponent(encoded));
    } catch {
      return undefined;
    }
  };

  return text
    .replace(/\[([^\]]*)\]\(#orbit-source:([^)\s]+)\)/g, (_, label: string, encoded: string) => {
      const node = target(encoded);
      return node ? `[${label || node.text}](#${node.id})` : label;
    })
    .replace(/<#orbit-source:([^>\s]+)>/g, (_, encoded: string) => {
      const node = target(encoded);
      return node ? `[${node.text}](#${node.id})` : '';
    });
};
