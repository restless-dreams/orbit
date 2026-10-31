import type { OrbitDocumentOptions, OrbitRendererOptions } from './types.js';
import { withNewNames, withOldNames } from './deprecated.js';
import { isThemeName, themeNames } from './themes.js';
import { didYouMean } from './suggest.js';
import { isWebBase } from './url-guard.js';

/** Document-level options accepted in markdown frontmatter and as YAML top-level keys. */
export const DOCUMENT_OPTION_KEYS = new Set([
  'title', 'theme', 'view', 'showRings', 'interactive',
  'animation', 'speed', 'palette', 'height', 'maxDepth',
  'className', 'baseUrl', 'schemaVersion', 'flavor',
]);

/** The document options' names before 0.4.0, by the name each has now, which the document writes (docs/compatibility.md). */
const RENAMED_DOCUMENT_OPTIONS = { viewMode: 'view', orbitAnimation: 'animation', orbitSpeed: 'speed' } as const;

/**
 * A document's `options` under the names Orbit reads: options made by hand
 * with an old name (`viewMode`, `orbitAnimation`, `orbitSpeed`) are read as
 * the new one, with a warning. Everything that reads a document's options
 * from a caller reads them through this.
 */
export const currentDocumentOptions = (options: OrbitDocumentOptions): OrbitDocumentOptions =>
  withNewNames(options, RENAMED_DOCUMENT_OPTIONS, 'The document option');

/** Lets a parsed document's `options` answer to their old names until 1.0, with a warning, as code written for 0.3 reads them. */
export const withOldOptionNames = (options: OrbitDocumentOptions): OrbitDocumentOptions =>
  withOldNames(options, RENAMED_DOCUMENT_OPTIONS, 'The document option');

/** Keys people (and agents) reach for instead of a document option's name. */
const OPTION_SYNONYMS: Record<string, string> = {
  viewMode: 'view',
  mode: 'view',
  rings: 'showRings',
  depth: 'maxDepth',
  colors: 'palette',
  name: 'title',
  orbitAnimation: 'animation',
  orbitSpeed: 'speed',
  class: 'className',
};

/** Words people (and agents) reach for instead of a theme's name. */
export const THEME_SYNONYMS: Record<string, string> = {
  dark: 'night',
  light: 'paper',
  default: 'paper',
  frosted: 'glass',
  'glass-dark': 'glass-night',
  'dark-glass': 'glass-night',
  space: 'cosmos',
  stars: 'cosmos',
  'high-contrast': 'contrast',
  monochrome: 'ink',
  sketch: 'ink',
  solid: 'flat',
  'flat-dark': 'flat-night',
  'dark-flat': 'flat-night',
  'material-you': 'material',
  'material-dark': 'material-night',
  'dark-material': 'material-night',
  'liquid-glass': 'liquid',
  'liquid-dark': 'liquid-night',
  'dark-liquid': 'liquid-night',
  'liquid-glass-night': 'liquid-night',
};


/** The message for a key that isn't a document option, with the option it probably means. */
export const unknownOptionMessage = (key: string, place: 'frontmatter' | 'top-level'): string => {
  const known = place === 'top-level' ? [...DOCUMENT_OPTION_KEYS, 'nodes'] : [...DOCUMENT_OPTION_KEYS];
  return `Unknown ${place} key "${key}" (ignored).${didYouMean(key, known, place === 'top-level' ? { ...OPTION_SYNONYMS, ...NODES_SYNONYMS } : OPTION_SYNONYMS)}`;
};

/** Keys people (and agents) reach for instead of a YAML map's `nodes`. */
const NODES_SYNONYMS: Record<string, string> = {
  root: 'nodes',
  tree: 'nodes',
  map: 'nodes',
  children: 'nodes',
  items: 'nodes',
};

/** `true`, `false` and their usual spellings in YAML (`yes`, `off`, `1`, …). */
const readFlag = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  const word = String(value).trim().toLowerCase();

  if (['true', 'yes', 'on', '1'].includes(word)) {
    return true;
  }

  if (['false', 'no', 'off', '0'].includes(word)) {
    return false;
  }

  return undefined;
};

/**
 * Sets one document option from its frontmatter (or YAML top-level) value.
 * A value that can't be used is left out and described to `report`.
 */
export const applyDocumentOption = (
  options: OrbitDocumentOptions,
  key: string,
  value: unknown,
  report: (message: string) => void = () => undefined,
): void => {
  const positiveNumber = (minimum: number): number | undefined => {
    const number = typeof value === 'number' ? value : Number(String(value).trim());

    if (Number.isFinite(number) && number >= minimum && String(value).trim() !== '') {
      return number;
    }

    report(`${key} must be a number${minimum > 0 ? ' above 0' : ' of 0 or more'}, got "${String(value)}".`);
    return undefined;
  };

  switch (key) {
    case 'view':
      if (value === 'focus' || value === 'all') {
        options.view = value;
      } else {
        report(`view must be "focus" or "all" (the overview), got "${String(value)}".${didYouMean(String(value), ['focus', 'all'], { overview: 'all', tree: 'all', full: 'all' })}`);
      }

      return;
    case 'palette':
      if (Array.isArray(value)) {
        options.palette = value.map(String);
      } else if (typeof value === 'string' && value.trim() !== '') {
        options.palette = value.split(',').map((color) => color.trim()).filter(Boolean);
      } else {
        report('palette must be a list of colors, such as ["#F8D978", "#F5A3A8"].');
      }

      return;
    case 'showRings':
    case 'interactive':
    case 'animation': {
      const flag = readFlag(value);

      if (flag === undefined) {
        report(`${key} must be true or false, got "${String(value)}".`);
        return;
      }

      if (key === 'animation') {
        options.animation = flag;
      } else if (key === 'interactive') {
        options.interactive = flag;
      } else {
        options.showRings = flag;
      }

      return;
    }
    case 'speed':
    case 'height':
    case 'schemaVersion': {
      const number = positiveNumber(Number.MIN_VALUE);

      if (number !== undefined) {
        options[key] = number;
      }

      return;
    }
    case 'maxDepth': {
      const number = positiveNumber(0);

      if (number !== undefined) {
        options.maxDepth = number;
      }

      return;
    }
    case 'theme':
      options.theme = String(value);

      if (!isThemeName(options.theme)) {
        report(`Unknown theme "${options.theme}". Themes: ${themeNames().join(', ')}.${didYouMean(options.theme, themeNames(), THEME_SYNONYMS)}`);
      }

      return;
    case 'title':
    case 'className':
      if (value !== null && value !== undefined) {
        options[key] = String(value);
      }

      return;
    case 'baseUrl':
      if (value === null || value === undefined) {
        return;
      }

      // The map's relative addresses are joined to it, and take its scheme: joined to `javascript://x/`,
      // a link or an embed would run as a script. So a map names only a web address or a relative path.
      if (isWebBase(String(value))) {
        options.baseUrl = String(value);
      } else {
        report(`baseUrl must be a web address (http or https) or a relative path, got "${String(value)}".`);
      }

      return;
    case 'flavor':
      // Read by the dispatcher, not stored.
      if (value !== 'markdown' && value !== 'yaml') {
        report(`flavor must be "markdown" or "yaml", got "${String(value)}".`);
      }

      return;
    default:
      return;
  }
};

/**
 * The renderer options a document asks for in its frontmatter (or YAML
 * top-level keys). `title` becomes the map's accessible label. Container
 * concerns (`height`, `className`) are left to the caller.
 */
export const documentToRendererOptions = (given: OrbitDocumentOptions): OrbitRendererOptions => {
  const options = currentDocumentOptions(given);
  const result: OrbitRendererOptions = {};

  if (options.view) {
    result.view = options.view;
  }

  if (options.showRings !== undefined) {
    result.showRings = options.showRings;
  }

  if (options.interactive !== undefined) {
    result.interactive = options.interactive;
  }

  if (options.animation !== undefined) {
    result.animation = options.animation;
  }

  if (Number.isFinite(options.speed)) {
    result.speed = options.speed;
  }

  if (Number.isFinite(options.maxDepth)) {
    result.maxDepth = options.maxDepth;
  }

  if (options.palette && options.palette.length > 0) {
    result.palette = options.palette;
  }

  if (isThemeName(options.theme)) {
    result.theme = options.theme;
  }

  if (options.title) {
    result.ariaLabel = options.title;
  }

  if (options.baseUrl) {
    result.baseUrl = options.baseUrl;
  }

  return result;
};
