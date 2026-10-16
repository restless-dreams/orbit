import type { OrbitDocumentOptions, RendererOptions } from './types.js';
import { isThemeName, themeNames } from './themes.js';
import { didYouMean } from './suggest.js';

/** Document-level options accepted in markdown frontmatter and as YAML top-level keys. */
export const DOCUMENT_OPTION_KEYS = new Set([
  'title', 'theme', 'view', 'showRings', 'interactive',
  'animation', 'speed', 'palette', 'height', 'maxDepth',
  'className', 'baseUrl', 'schemaVersion', 'flavor',
]);

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
        options.viewMode = value;
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
        options.orbitAnimation = flag;
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
        options[key === 'speed' ? 'orbitSpeed' : key] = number;
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
    case 'baseUrl':
      if (value !== null && value !== undefined) {
        options[key] = String(value);
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
export const documentToRendererOptions = (options: OrbitDocumentOptions): RendererOptions => {
  const result: RendererOptions = {};

  if (options.viewMode) {
    result.viewMode = options.viewMode;
  }

  if (options.showRings !== undefined) {
    result.showRings = options.showRings;
  }

  if (options.interactive !== undefined) {
    result.interactive = options.interactive;
  }

  if (options.orbitAnimation !== undefined) {
    result.orbitAnimation = options.orbitAnimation;
  }

  if (Number.isFinite(options.orbitSpeed)) {
    result.orbitSpeed = options.orbitSpeed;
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
