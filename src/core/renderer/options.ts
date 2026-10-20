/**
 * The renderer's options: the caller's merged over the document's over the
 * defaults, and the values Orbit works out from them (insets, spin settings).
 */

import type { Insets } from '../engine/camera.js';
import { DEFAULT_SPIN_SETTINGS, type SpinSettings } from '../engine/spin.js';
import { mergeThemes } from '../themes.js';
import type { OrbitInsets, OrbitSpinOptions, RendererOptions } from '../types.js';

export type ResolvedRendererOptions = RendererOptions &
  Required<Pick<RendererOptions, 'viewMode' | 'showRings' | 'interactive' | 'orbitAnimation' | 'orbitSpeed' | 'showControls'>>;

export const spinSettings = (options: OrbitSpinOptions | undefined): SpinSettings => {
  return {
    ...DEFAULT_SPIN_SETTINGS,
    ...(options?.decay !== undefined && options.decay > 0 ? { decay: options.decay } : {}),
    ...(options?.maxSpeed !== undefined && options.maxSpeed > 0 ? { maxSpeed: options.maxSpeed } : {}),
    snap: options?.snap === 'planet',
  };
};

export const mergeRendererOptions = (base: RendererOptions, overrides: RendererOptions): ResolvedRendererOptions => {
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
