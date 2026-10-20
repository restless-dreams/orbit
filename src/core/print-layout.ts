/**
 * A map laid out for paper: its title, the map as a picture that fits the
 * page, then every idea in reading order with its details, link, note and
 * media. Orbit's web pages print with it, and so can any page that shows a
 * map: lay it out in an element that only shows in print.
 */

import { parseOrbit } from './dispatch.js';
import { documentToRendererOptions } from './document-options.js';
import { MapExtensions, guarded, type OrbitNodeType, type OrbitStatusStyle } from './extensions.js';
import { OrbitWords, type OrbitStrings } from './languages.js';
import { hasMediaSource, videoPageUrl, youtubeThumbnailUrl } from './media.js';
import { findIndexedLinkedNode, indexNodes, isNodeLink } from './node-links.js';
import { renderToSVGString } from './render-to-svg.js';
import { ensureStyles } from './styles.js';
import { expandTheme, mergeThemes, resolvePalette, resolveThemeTokens, themeName, type OrbitThemeName } from './themes.js';
import { guardUrl, resolveUrl } from './url-guard.js';
import { resolveColor } from './engine/colors.js';
import { assignNodeColors } from './engine/scene.js';
import { renderNoteMarkdown } from './ui/note-markdown.js';
import type { OrbitDocument, OrbitNode, OrbitRendererTheme, OrbitThemePreset, ViewMode } from './types.js';

export interface OrbitPrintOptions {
  /** The heading at the top. Default: the map's `title`, or its root's text. */
  title?: string;

  /** Whether the map's picture comes before the outline. Default: true. */
  picture?: boolean;

  /** What the picture shows: `focus`, a node with its orbit, or `all`, the whole map. Default: the map's `view`, or `focus`. */
  viewMode?: ViewMode;

  /** The node in the middle of the picture in focus mode, by id. Default: the root. */
  focus?: string;

  /**
   * The map's theme: a theme name or `{ preset, tokens }`. Default: the
   * document's. Paper is light, so a dark theme prints as its light
   * counterpart (see `printTheme`), and nothing prints a background.
   */
  theme?: OrbitThemePreset | (string & {}) | OrbitRendererTheme;

  /** The map's colors: the root's, then one per top-level branch. Default: the document's, or the theme's. */
  palette?: string[];

  /** The language of the few words the layout has: a BCP 47 tag. Default: English. */
  language?: string;

  /** Words to change, over the language's. */
  strings?: Partial<OrbitStrings>;

  /** Resolves relative picture, video and link URLs. Default: the document's `baseUrl`. */
  baseUrl?: string;

  /** Node types by name, before the registered ones: their icons, colors, labels and details. */
  nodeTypes?: Record<string, OrbitNodeType>;

  /** Status words and how they look, before the registered ones. */
  statuses?: Record<string, OrbitStatusStyle>;

  /** The type a node that names none is laid out as (see `RendererOptions.nodeTypeFor`). */
  nodeTypeFor?: (node: OrbitNode) => string | undefined;

  /** Prefix for the picture's SVG ids; give each layout in one page its own. Default: `orbit-print`. */
  idPrefix?: string;
}

/** The light theme each dark built-in theme prints as. Light themes print as themselves. */
export const PRINT_THEMES: Readonly<Partial<Record<OrbitThemePreset, OrbitThemeName>>> = {
  auto: 'paper',
  night: 'paper',
  'glass-night': 'glass',
  cosmos: 'paper',
  blueprint: 'ink',
  'flat-night': 'flat',
  'material-night': 'material',
  'liquid-night': 'liquid',
};

/** The tokens a dark theme of your own keeps when it prints as its light counterpart: its colors, not what it set for a dark page. */
const PALETTE_TOKENS = ['color-root', 'color-1', 'color-2', 'color-3', 'color-4', 'color-5', 'color-6', 'color-7'];

/** The picture's size before it's scaled to the page: a square, the shape of an orbit, about a tablet's width, so names print at the size they read on one. */
const PICTURE_SIZE = 720;

/**
 * The theme a map prints in: the map's own when it's light, otherwise its
 * light counterpart (`PRINT_THEMES`), always without a background. A dark
 * theme of your own keeps only its colors (`color-root` to `color-7`).
 */
export const printTheme = (theme: string | OrbitRendererTheme | undefined): OrbitRendererTheme => {
  const expanded = expandTheme(theme);
  const preset = themeName(expanded);
  const light = PRINT_THEMES[preset] ?? (preset === 'auto' ? 'paper' : preset);
  const own = typeof expanded === 'object' ? expanded.tokens ?? {} : {};
  const kept = light === preset ? own : Object.fromEntries(Object.entries(own).filter(([token]) => PALETTE_TOKENS.includes(token)));
  return { preset: light, tokens: { ...kept, surface: 'transparent', 'surface-pattern': 'none' } };
};

/**
 * Lays a map out for print in `container`, replacing what it held, and
 * returns the layout: the title, the map as a picture that fits the page,
 * then every idea in reading order, nested by depth, with its icon, status,
 * priority, tags, link (its address printed), note, picture and video. An
 * idea stays whole across page breaks, and a heading stays with what
 * follows it.
 *
 * It's laid out on screen like any element: hide it there and show it in
 * print, as Orbit's web pages do.
 *
 * @example
 * ```ts
 * import { renderPrintLayout } from '@restless-dreams/orbit';
 *
 * renderPrintLayout(document.querySelector('#print'), markdown, { viewMode: 'all' });
 * // #print { display: none } @media print { #print { display: block } #app { display: none } }
 * ```
 */
export const renderPrintLayout = (container: HTMLElement, input: string | OrbitDocument, options: OrbitPrintOptions = {}): HTMLElement => {
  const words = new OrbitWords(options.language, options.strings);
  const map = typeof input === 'string' ? parseOrbit(input, { untitled: words.text('untitledMap') }) : input;
  const fromDocument = documentToRendererOptions(map.options);
  const theme = printTheme(mergeThemes(fromDocument.theme, options.theme));
  const tokens: Record<string, string> = resolveThemeTokens(themeName(theme), theme);
  const extensions = new MapExtensions({ nodeTypes: options.nodeTypes, statuses: options.statuses, nodeTypeFor: options.nodeTypeFor });
  const palette = options.palette ?? fromDocument.palette;
  const colors = assignNodeColors(map.root, resolvePalette(palette), (node) => extensions.color(node));
  const nodes = indexNodes(map.root);
  const layout: PrintContext = {
    words,
    tokens,
    extensions,
    colors,
    baseUrl: options.baseUrl ?? fromDocument.baseUrl,
    linked: (href) => findIndexedLinkedNode(nodes, href),
  };
  const title = options.title ?? (map.options.title || map.root.text || words.text('untitledMap'));
  const article = element('article', 'orbit-print');
  article.lang = words.locale;
  article.style.cssText = themeProperties(tokens);
  const heading = element('h1', 'orbit-print__title');
  appendName(heading, map.root, title, layout);
  article.append(heading, ...entryParts(map.root, layout));

  if (options.picture !== false) {
    const figure = element('figure', 'orbit-print__picture');
    const svg = renderToSVGString(map, {
      width: PICTURE_SIZE,
      height: PICTURE_SIZE,
      viewMode: options.viewMode,
      focus: options.focus,
      theme,
      palette,
      title,
      language: options.language,
      strings: options.strings,
      baseUrl: layout.baseUrl,
      idPrefix: options.idPrefix ?? 'orbit-print',
      nodeTypes: options.nodeTypes,
      statuses: options.statuses,
      nodeTypeFor: options.nodeTypeFor,
    });
    // Orbit's own SVG, read as SVG: every text and address in it is escaped.
    figure.appendChild(document.importNode(new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement, true));
    article.appendChild(figure);
  }

  if (map.root.children.length > 0) {
    const outline = element('div', 'orbit-print__outline');
    outline.append(...map.root.children.map((child) => idea(child, 1, layout)));
    article.appendChild(outline);
  }

  container.replaceChildren(article);
  ensureStyles(article);
  return article;
};

interface PrintContext {
  words: OrbitWords;
  tokens: Record<string, string>;
  extensions: MapExtensions;
  colors: Map<string, string>;
  baseUrl: string | undefined;
  linked: (href: string) => OrbitNode | null;
}

/** An idea and the ideas under it: a heading by depth, its details, then its children, indented. */
const idea = (node: OrbitNode, depth: number, layout: PrintContext): HTMLElement => {
  const section = element('section', 'orbit-print__idea');
  section.dataset.depth = String(depth);
  const entry = element('div', node.children.length > 0 ? 'orbit-print__entry orbit-print__entry--parent' : 'orbit-print__entry');
  // Top-level ideas and theirs get sizes of their own; deeper ones share the third.
  const level = `h${Math.min(depth + 1, 6)}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const name = element(level, `orbit-print__name orbit-print__name--depth-${Math.min(depth, 3)}`);
  const dot = element('span', 'orbit-print__dot');
  dot.setAttribute('aria-hidden', 'true');
  dot.style.setProperty('--orbit-print-dot', resolveColor(layout.colors.get(node.id) ?? layout.tokens['color-1'] ?? '#888888', layout.tokens));
  name.appendChild(dot);
  appendName(name, node, node.text || layout.words.text('untitled'), layout);
  entry.append(name, ...entryParts(node, layout));
  section.appendChild(entry);

  if (node.children.length > 0) {
    const children = element('div', 'orbit-print__children');
    children.append(...node.children.map((child) => idea(child, depth + 1, layout)));
    section.appendChild(children);
  }

  return section;
};

/** A node's icon and name, in a heading. */
const appendName = (heading: HTMLElement, node: OrbitNode, text: string, layout: PrintContext): void => {
  const icon = layout.extensions.icon(node);

  if (icon) {
    const glyph = element('span', 'orbit-print__icon');
    glyph.textContent = icon;
    heading.append(glyph, document.createTextNode(' '));
  }

  heading.appendChild(document.createTextNode(text));
};

/** What an idea has besides its name: its chips, link, the type's details, note and media. */
const entryParts = (node: OrbitNode, layout: PrintContext): HTMLElement[] => {
  const parts: HTMLElement[] = [];
  const chips = chipsOf(node, layout);

  if (chips) {
    parts.push(chips);
  }

  const link = linkOf(node, layout);

  if (link) {
    parts.push(link);
  }

  const details = layout.extensions.nodeType(node)?.details;

  if (details) {
    const section = element('div', 'orbit-print__details');
    guarded('A node type’s details', undefined, () => details(node, section));

    if (section.childNodes.length > 0) {
      parts.push(section);
    }
  }

  if (node.note?.trim()) {
    const note = element('div', 'orbit-print__note');

    if (node.noteFormat === 'plain') {
      note.classList.add('orbit-print__note--plain');
      note.textContent = node.note;
    } else {
      note.appendChild(renderNoteMarkdown(node.note, { baseUrl: layout.baseUrl, resolveLink: layout.linked }));
    }

    parts.push(note);
  }

  parts.push(...mediaOf(node, layout));
  return parts;
};

/** The type, status, priority and tags, as the detail sheet shows them. */
const chipsOf = (node: OrbitNode, layout: PrintContext): HTMLElement | null => {
  const chips: HTMLElement[] = [];
  const typeLabel = layout.extensions.nodeType(node)?.label;

  if (typeLabel) {
    chips.push(chip(typeLabel));
  }

  if (node.status) {
    const status = chip(node.status, 'orbit-print__chip--status');
    const look = layout.extensions.status(node.status);
    status.style.setProperty('--orbit-print-status', resolveColor(look.color ?? `var(--_orbit-status-${look.tone})`, layout.tokens));
    chips.push(status);
  }

  if (node.priority !== undefined) {
    chips.push(chip(layout.words.text('priority', { priority: node.priority })));
  }

  for (const tag of node.tags ?? []) {
    chips.push(chip(`#${tag}`));
  }

  if (chips.length === 0) {
    return null;
  }

  const container = element('p', 'orbit-print__chips');
  container.append(...chips);
  return container;
};

const chip = (text: string, modifier?: string): HTMLElement => {
  const span = element('span', modifier ? `orbit-print__chip ${modifier}` : 'orbit-print__chip');
  span.textContent = text;
  return span;
};

/** A link printed with its address, since paper can't be clicked; a link to another idea names it. */
const linkOf = (node: OrbitNode, layout: PrintContext): HTMLElement | null => {
  if (!node.link) {
    return null;
  }

  const paragraph = element('p', 'orbit-print__link');

  if (isNodeLink(node.link)) {
    const target = layout.linked(node.link);

    if (!target) {
      return null;
    }

    paragraph.textContent = `→ ${layout.words.text('seeIdea', { name: target.text || layout.words.text('theIdea') })}`;
    return paragraph;
  }

  const address = guardUrl(node.link, 'link');

  if (!address) {
    return null;
  }

  paragraph.appendChild(addressLink(resolveUrl(address, layout.baseUrl)));
  return paragraph;
};

/** An address as a link, written out: PDFs keep it clickable, and paper shows where it goes. */
const addressLink = (href: string): HTMLAnchorElement => {
  const anchor = element('a', 'orbit-print__address');
  anchor.href = href;
  anchor.textContent = href;
  return anchor;
};

/** The node's picture, its video as a thumbnail and its address, and an embed's address. */
const mediaOf = (node: OrbitNode, layout: PrintContext): HTMLElement[] => {
  const figures: HTMLElement[] = [];

  if (hasMediaSource(node.image)) {
    const source = guardUrl(node.image.src, 'image');

    if (source) {
      const figure = element('figure', 'orbit-print__media');
      const image = element('img', 'orbit-print__image');
      image.src = resolveUrl(source, layout.baseUrl);
      image.alt = node.image.alt ?? '';
      figure.appendChild(image);
      appendCaption(figure, node.image.caption ?? node.image.alt);
      figures.push(figure);
    }
  }

  if (hasMediaSource(node.video)) {
    const source = guardUrl(node.video.src, 'video');

    if (source) {
      const resolved = resolveUrl(source, layout.baseUrl);
      const figure = element('figure', 'orbit-print__media orbit-print__media--video');
      const thumbnail = node.video.thumbnail ? guardUrl(node.video.thumbnail, 'image') : youtubeThumbnailUrl(resolved);

      if (thumbnail) {
        const image = element('img', 'orbit-print__image');
        image.src = resolveUrl(thumbnail, layout.baseUrl);
        image.alt = '';
        figure.appendChild(image);
      }

      const caption = element('figcaption', 'orbit-print__caption');
      caption.append(document.createTextNode(`${node.video.caption ?? layout.words.text('video')}: `), addressLink(videoPageUrl(resolved, node.video.provider)));
      figure.appendChild(caption);
      figures.push(figure);
    }
  }

  if (hasMediaSource(node.embed) && !hasMediaSource(node.video)) {
    const source = guardUrl(node.embed.src, 'embed');

    if (source) {
      const figure = element('figure', 'orbit-print__media orbit-print__media--embed');
      const caption = element('figcaption', 'orbit-print__caption');

      if (node.embed.caption) {
        caption.append(document.createTextNode(`${node.embed.caption}: `));
      }

      caption.appendChild(addressLink(resolveUrl(source, layout.baseUrl)));
      figure.appendChild(caption);
      figures.push(figure);
    }
  }

  return figures;
};

const appendCaption = (figure: HTMLElement, text: string | undefined): void => {
  if (text?.trim()) {
    const caption = element('figcaption', 'orbit-print__caption');
    caption.textContent = text;
    figure.appendChild(caption);
  }
};

/** The theme's text, fonts and chip colors for the layout, resolved to plain values. Page CSS can set the public ones. */
const themeProperties = (tokens: Record<string, string>): string => {
  const value = (token: string, fallback: string) => resolveColor(tokens[token] ?? fallback, tokens);
  const font = (token: string, fallback: string) => resolveFont(tokens[token] ?? fallback, tokens);
  return [
    `--_orbit-print-text: ${value('text', '#1F2733')};`,
    `--_orbit-print-muted-text: ${value('muted-text', '#5B6474')};`,
    `--_orbit-print-link-text: ${value('link-text', value('text', '#1F2733'))};`,
    `--_orbit-print-chip-background: ${value('chip-background', '#EEF0F4')};`,
    `--_orbit-print-chip-text: ${value('chip-text', value('text', '#1F2733'))};`,
    `--_orbit-print-border: ${value('sheet-border', '#D9DDE3')};`,
    `--_orbit-print-font: ${font('font-family', 'sans-serif')};`,
    `--_orbit-print-display-font: ${font('display-font', font('font-family', 'sans-serif'))};`,
  ].join(' ');
};

/** A font token with the tokens it refers to written out: `var(--_orbit-sans-font)` becomes the fonts it names. */
const resolveFont = (value: string, tokens: Record<string, string>): string => {
  let font = value;

  // Fonts refer to other font tokens a step or two deep.
  for (let depth = 0; depth < 4 && font.includes('var('); depth += 1) {
    font = font.replace(/var\(--_?orbit-([a-z0-9-]+)(?:\s*,\s*([^()]+))?\)/gi, (whole, token: string, fallback?: string) => tokens[token] ?? fallback?.trim() ?? whole);
  }

  // A value that still refers to something can't be written into a style: the browser's sans-serif instead.
  return font.includes('var(') || /[;{}]/.test(font) ? 'sans-serif' : font;
};

const element = <Name extends keyof HTMLElementTagNameMap>(name: Name, className: string): HTMLElementTagNameMap[Name] => {
  const created = document.createElement(name);
  created.className = className;
  return created;
};
