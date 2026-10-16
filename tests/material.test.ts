import { describe, expect, test } from 'bun:test';
import { MATERIAL_COLOR_TOKENS, MATERIAL_SEED, materialColors, materialTheme } from '../src/core/material';
import { ORBIT_THEME_PRESETS, registerTheme, resolveThemeTokens, themeTokens } from '../src/core/themes';
import { contrastRatio, toHex, toneColor } from '../src/core/engine/colors';
import { backdrops, color, worstLabelContrast } from './theme-contrast';

/** Colors people might build a theme from: a wheel of hues at three strengths, grays, and a few brands' colors. */
const SEEDS = [
  ...[0.04, 0.1, 0.2].flatMap((chroma) => Array.from({ length: 12 }, (_, step) => toHex(toneColor(step * 30, chroma, 50)))),
  '#000000', '#777777', '#FFFFFF', '#0B57D0', '#E11D48', '#16A34A', '#F59E0B', '#7C3AED', 'oklch(0.6 0.2 30)',
];

describe('Material themes', () => {
  test('are what the material and material-night themes are built from', () => {
    for (const [dark, preset] of [[false, ORBIT_THEME_PRESETS.material], [true, ORBIT_THEME_PRESETS['material-night']]] as const) {
      const colors = materialColors(MATERIAL_SEED, dark);

      for (const token of MATERIAL_COLOR_TOKENS) {
        expect(`${token}: ${preset[token]}`).toBe(`${token}: ${colors[token].toUpperCase()}`);
      }
    }
  });

  test('build on the matching preset', () => {
    expect(materialTheme('#0B57D0').preset).toBe('material');
    expect(materialTheme('#0B57D0', { dark: true }).preset).toBe('material-night');
  });

  test.each(SEEDS)('from %s keep labels and text readable, light and dark', (seed) => {
    for (const dark of [false, true]) {
      const theme = materialTheme(seed, { dark });
      const tokens = resolveThemeTokens(theme.preset as 'material' | 'material-night', theme);
      const worst = worstLabelContrast(tokens);
      expect({ seed, dark, passes: worst.ratio >= 4.5, where: worst.where }).toEqual({ seed, dark, passes: true, where: worst.where });

      for (const backdrop of backdrops(tokens)) {
        expect(contrastRatio(color(tokens.text), backdrop)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(color(tokens['muted-text']), backdrop)).toBeGreaterThanOrEqual(4.5);
      }

      for (const [text, background] of [['sheet-text', 'sheet-background'], ['tooltip-text', 'tooltip-background'], ['control-text', 'control-background'], ['chip-text', 'chip-background'], ['error-text', 'error-background']] as const) {
        expect(contrastRatio(color(tokens[text]), color(tokens[background]))).toBeGreaterThanOrEqual(7);
      }

      expect(contrastRatio(color(tokens['link-text']), color(tokens['sheet-background']))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('give the sun the seed itself when it has the tone Material gives the sun (40)', () => {
    const tokens = materialTheme('#6750A4').tokens ?? {};
    expect(tokens['color-root']).toBe('#6750a4');
  });

  test('can be named for every map', () => {
    const unregister = registerTheme('brand-material', materialTheme('#0B57D0', { dark: true }));

    try {
      const tokens = themeTokens('brand-material');
      expect(tokens.surface).toBe(materialColors('#0B57D0', true).surface);
      expect(tokens['node-stroke-width']).toBe(ORBIT_THEME_PRESETS['material-night']['node-stroke-width']);
    } finally {
      unregister();
    }
  });

  test('say which colors they can read', () => {
    expect(() => materialTheme('brand blue')).toThrow('A Material theme needs a color Orbit can read');
  });
});
