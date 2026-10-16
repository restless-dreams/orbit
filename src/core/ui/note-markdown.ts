/**
 * A small, safe markdown renderer for notes. It builds DOM nodes directly
 * (never `innerHTML`), so note text can't inject markup, and links and
 * images go through the same URL guard as the rest of the map.
 *
 * Supported: paragraphs, headings, bullet and numbered lists (nested by
 * indentation), blockquotes, fenced code, **bold**, *italic*, ~~strike~~,
 * `code`, [links](https://…), <https://autolinks> and ![images](…).
 */

import { isNodeLink } from '../node-links.js';
import { guardUrl, resolveUrl } from '../url-guard.js';

export interface NoteRenderContext {
  /** Where relative links and pictures resolve from: the map's `baseUrl`. */
  baseUrl?: string;

  /** Whether a `#id` link points at a node of the map; links to missing nodes show as text. */
  resolveLink?: (href: string) => unknown;
}

/** A note as DOM nodes, the way the detail sheet shows it: for pages that show notes in their own UI. */
export const renderNoteMarkdown = (markdown: string, context: NoteRenderContext = {}): DocumentFragment => {
  return renderBlocks(withoutComments(markdown), context, 0);
};

/** Code, kept as written, or an HTML comment, hidden as markdown hides it. */
const CODE_OR_COMMENT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)|<!--[\s\S]*?-->/g;

/** The note without its HTML comments, which stay in the map's file; code shows them as written. */
const withoutComments = (markdown: string): string => {
  return markdown.replace(CODE_OR_COMMENT, (_match, code: string | undefined) => code ?? '');
};

/** Quotes and lists nest at most this deep; deeper lines show as their text, so a note of nothing but `>` degrades instead of stalling or blowing the stack. */
const MAX_NESTING = 100;

const renderBlocks = (markdown: string, context: NoteRenderContext, depth: number): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = /^\s*(```|~~~)/.exec(line);

    if (fence) {
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trimStart().startsWith(fence[1])) {
        code.push(lines[index]);
        index += 1;
      }

      index += 1;
      const pre = document.createElement('pre');
      const element = document.createElement('code');
      element.textContent = code.join('\n');
      pre.appendChild(element);
      fragment.appendChild(pre);
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);

    if (heading) {
      const level = Math.min(5, Math.max(3, heading[1].length + 2));
      const element = document.createElement(`h${level}`);
      appendInline(element, heading[2], context);
      fragment.appendChild(element);
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];

      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }

      const blockquote = document.createElement('blockquote');

      if (depth >= MAX_NESTING) {
        const paragraph = document.createElement('p');
        appendInline(paragraph, quoted.join(' '), context);
        blockquote.appendChild(paragraph);
      } else {
        blockquote.appendChild(renderBlocks(quoted.join('\n'), context, depth + 1));
      }

      fragment.appendChild(blockquote);
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const [list, next] = readList(lines, index, context, depth);
      fragment.appendChild(list);
      index = next;
      continue;
    }

    const paragraph: string[] = [];

    while (
      index < lines.length
      && lines[index].trim() !== ''
      && !/^\s*(```|~~~|>|#{1,6}\s)/.test(lines[index])
      && !LIST_ITEM.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    const element = document.createElement('p');
    appendInline(element, paragraph.join(' '), context);
    fragment.appendChild(element);
  }

  return fragment;
};

const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

const readList = (lines: string[], start: number, context: NoteRenderContext, depth: number): [HTMLElement, number] => {
  const first = LIST_ITEM.exec(lines[start])!;
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const list = document.createElement(ordered ? 'ol' : 'ul');
  let index = start;
  let current: HTMLLIElement | null = null;

  while (index < lines.length) {
    const line = lines[index];

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
      current = document.createElement('li');
      appendInline(current, item[3], context);
      list.appendChild(current);
      index += 1;
      continue;
    }

    if (item && item[1].length > indent && current) {
      if (depth >= MAX_NESTING) {
        // Past the nesting cap the item's text joins its parent's.
        current.appendChild(document.createTextNode(` ${line.trim()}`));
        index += 1;
        continue;
      }

      const [nested, next] = readList(lines, index, context, depth + 1);
      current.appendChild(nested);
      index = next;
      continue;
    }

    if (!item && lineIndent > indent && current) {
      current.appendChild(document.createTextNode(` ${line.trim()}`));
      index += 1;
      continue;
    }

    break;
  }

  return [list, index];
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

/** The note as plain text, for tooltips: markdown syntax removed, whitespace collapsed. */
export const noteToPlainText = (markdown: string): string => {
  return withoutComments(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/([*_])(\S(?:[\s\S]*?\S)?)\1/g, '$2')
    .replace(/^\s*(#{1,6}|>|[-*+]|\d{1,9}[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
};
