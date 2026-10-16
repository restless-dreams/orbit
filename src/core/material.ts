import { parseColor, toHex, toneColor, toOklch } from './engine/colors.js';
import type { OrbitRendererTheme } from './types.js';

/**
 * Material 3 themes from one color, the way Material You colors an app from
 * its wallpaper: tonal palettes in the color's hue, surfaces and containers
 * picked by tone, and branches in hues spread evenly around the color wheel
 * from it. Picking colors by tone is what keeps text readable: two tones 50
 * apart always have at least 4.5:1 contrast.
 */

/** Material's baseline color: the `material` and `material-night` themes are built from it. */
export const MATERIAL_SEED = '#6750A4';

export interface MaterialThemeOptions {
  /** Dark surfaces with light text, like `material-night`, instead of light ones. */
  dark?: boolean;
}

/** The tokens a Material theme takes from its color: everything else comes from `material` or `material-night`. */
export const MATERIAL_COLOR_TOKENS = [
  'surface', 'text', 'muted-text', 'root-text', 'node-text', 'node-text-inverse',
  'color-root', 'color-1', 'color-2', 'color-3', 'color-4', 'color-5', 'color-6', 'color-7',
  'shade-light', 'shade-dark', 'node-stroke', 'badge-stroke', 'sun-halo', 'ring-stroke', 'link-stroke',
  'focus-ring', 'note-indicator',
  'control-background', 'control-text', 'control-muted-text', 'control-active-background', 'control-active-text',
  'tooltip-background', 'tooltip-text', 'action-background', 'action-text',
  'sheet-background', 'sheet-text', 'sheet-muted-text', 'sheet-border', 'chip-background', 'chip-text', 'link-text',
  'status-active', 'status-done', 'status-blocked', 'status-todo', 'status-neutral',
  'error-background', 'error-border', 'error-text',
] as const;

export type MaterialColorToken = (typeof MATERIAL_COLOR_TOKENS)[number];

/** How far around the wheel each branch's hue is from the seed's: a seventh of a turn apart, three sevenths between neighbors. */
const BRANCH_HUES = [0, 3, 6, 2, 5, 1, 4].map((step) => (step * 360) / 7);
/** The most chroma any palette keeps: more, and containers would stop looking like Material's. */
const MOST_CHROMA = 0.16;
/** Branch containers: colorful whatever the seed, as categories need to be told apart. */
const BRANCH_CHROMA = 0.11;
const ERROR = { hue: 25, chroma: 0.19 };
const SUCCESS = { hue: 145, chroma: 0.13 };

/**
 * A Material 3 theme built from `seed`, any CSS color Orbit reads (hex,
 * `rgb()`, `oklch()`…). Use it as the `theme` option, or name it for every
 * map: `registerTheme('brand', materialTheme('#0B57D0'))`.
 */
export const materialTheme = (seed: string, options: MaterialThemeOptions = {}): OrbitRendererTheme => {
  const dark = options.dark === true;
  return { preset: dark ? 'material-night' : 'material', tokens: materialColors(seed, dark) };
};

/** Every color token of a Material theme built from `seed`. */
export const materialColors = (seed: string, dark: boolean): Record<MaterialColorToken, string> => {
  const parsed = parseColor(seed);

  if (!parsed) {
    throw new Error(`A Material theme needs a color Orbit can read, such as "#0B57D0" or "oklch(0.55 0.15 260)": got "${seed}".`);
  }

  const { hue, chroma } = toOklch(parsed);
  const primaryChroma = Math.min(chroma, MOST_CHROMA);
  const palette = (paletteHue: number, paletteChroma: number) => (tone: number) => toHex(toneColor(paletteHue, paletteChroma, tone));
  const primary = palette(hue, primaryChroma);
  const secondary = palette(hue, Math.min(primaryChroma / 3, 0.05));
  const neutral = palette(hue, Math.min(primaryChroma / 10, 0.012));
  const neutralVariant = palette(hue, Math.min(primaryChroma / 5, 0.024));
  const error = palette(ERROR.hue, ERROR.chroma);
  const success = palette(SUCCESS.hue, SUCCESS.chroma);
  const branches = BRANCH_HUES.map((offset) => palette((hue + offset) % 360, BRANCH_CHROMA));
  // Light themes use tone 40 for what stands out, 90 for containers and 10 on them; dark ones 80, 30 and 90.
  const [accent, container, onContainer] = dark ? [80, 30, 90] : [40, 90, 10];
  // Branches a little deeper than Material's containers, so a small moon still shows on the surface.
  const branchTone = dark ? 32 : 88;
  const [colorRoot, ...colors] = [primary(accent), ...branches.map((branch) => branch(branchTone))];
  return {
    surface: neutral(dark ? 6 : 98),
    text: neutral(dark ? 90 : 10),
    'muted-text': neutralVariant(dark ? 80 : 30),
    'root-text': neutral(10),
    'node-text': neutral(10),
    'node-text-inverse': neutral(dark ? 90 : 100),
    'color-root': colorRoot,
    'color-1': colors[0],
    'color-2': colors[1],
    'color-3': colors[2],
    'color-4': colors[3],
    'color-5': colors[4],
    'color-6': colors[5],
    'color-7': colors[6],
    // Siblings step a few tones lighter or darker, staying on their side of the text's contrast
    // and clear of the surface.
    'shade-light': dark ? neutral(40) : neutralVariant(80),
    'shade-dark': dark ? neutral(12) : neutralVariant(50),
    'node-stroke': neutralVariant(dark ? 30 : 80),
    'badge-stroke': neutral(dark ? 6 : 98),
    'sun-halo': primary(accent),
    'ring-stroke': neutralVariant(dark ? 30 : 80),
    'link-stroke': neutralVariant(dark ? 60 : 50),
    'focus-ring': primary(accent),
    'note-indicator': primary(accent),
    'control-background': neutral(dark ? 12 : 94),
    'control-text': neutral(dark ? 90 : 10),
    'control-muted-text': neutralVariant(dark ? 80 : 30),
    'control-active-background': secondary(container),
    'control-active-text': secondary(onContainer),
    'tooltip-background': neutral(dark ? 90 : 20),
    'tooltip-text': neutral(dark ? 20 : 95),
    'action-background': neutral(dark ? 17 : 92),
    'action-text': neutral(dark ? 90 : 10),
    'sheet-background': neutral(dark ? 10 : 96),
    'sheet-text': neutral(dark ? 90 : 10),
    'sheet-muted-text': neutralVariant(dark ? 80 : 30),
    'sheet-border': neutralVariant(dark ? 30 : 80),
    'chip-background': secondary(container),
    'chip-text': secondary(onContainer),
    'link-text': primary(accent),
    'status-active': primary(accent),
    'status-done': success(accent),
    'status-blocked': error(accent),
    'status-todo': neutralVariant(60),
    'status-neutral': neutralVariant(dark ? 70 : 50),
    'error-background': error(container),
    'error-border': error(accent),
    'error-text': error(onContainer),
  };
};
