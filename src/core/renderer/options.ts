/**
 * The renderer's options: the caller's merged over the document's over the
 * defaults, and the values Orbit works out from them (insets, spin settings).
 */

import { withNewNames } from '../deprecated.js';
import type { Insets } from '../engine/camera.js';
import { DEFAULT_SPIN_SETTINGS, type SpinSettings } from '../engine/spin.js';
import { mergeThemes } from '../themes.js';
import type { OrbitInsets, OrbitRendererOptions, OrbitSpinOptions } from '../types.js';

export type ResolvedRendererOptions = OrbitRendererOptions &
  Required<Pick<OrbitRendererOptions, 'view' | 'showRings' | 'interactive' | 'animation' | 'speed' | 'showControls'>>;

/** The options' names before 0.4.0, by the name each has now (docs/compatibility.md): they keep working until 1.0. */
const RENAMED_OPTIONS = { viewMode: 'view', orbitAnimation: 'animation', orbitSpeed: 'speed', mediaViewer: 'showMediaViewer' } as const;

/**
 * The renderer's `options`, or another function's that share their names
 * (`renderToSVGString`'s, a print's, a web page's), under the names Orbit
 * reads: one set by its old name counts as the new one, and warns once.
 * Everything that takes those options from a caller reads them through this.
 */
export const currentOptions = <T extends object>(options: T): T => withNewNames(options, RENAMED_OPTIONS, 'The option');

export const spinSettings = (options: OrbitSpinOptions | undefined): SpinSettings => {
  return {
    ...DEFAULT_SPIN_SETTINGS,
    ...(options?.decay !== undefined && options.decay > 0 ? { decay: options.decay } : {}),
    ...(options?.maxSpeed !== undefined && options.maxSpeed > 0 ? { maxSpeed: options.maxSpeed } : {}),
    snap: options?.snap === 'planet',
  };
};

export const mergeRendererOptions = (base: OrbitRendererOptions, overrides: OrbitRendererOptions): ResolvedRendererOptions => {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  merged.theme = mergeThemes(base.theme, overrides.theme);
  return merged as unknown as ResolvedRendererOptions;
};

/** The room the page's controls take at the map's edges, as numbers of px (none for anything else). */
export const resolveInsets = (insets: OrbitInsets | undefined): Insets => {
  const side = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
  return { top: side(insets?.top), right: side(insets?.right), bottom: side(insets?.bottom), left: side(insets?.left) };
};
