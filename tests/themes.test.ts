import { describe, expect, test } from 'bun:test';
import {
  ORBIT_THEME_PRESETS,
  THEME_TOKENS,
  resolveThemeTokens,
  mergeThemes,
  themeObjectTokens,
  themeOverrides,
  themeStylesheet,
  themeTokens,
  type OrbitThemeName,
} from '../src/core/themes';
import { contrastRatio } from '../src/core/engine/colors';
import { backdrops, color, over, worstLabelContrast } from './theme-contrast';

const THEMES = Object.keys(ORBIT_THEME_PRESETS) as OrbitThemeName[];
const DARK = ['night', 'glass-night', 'cosmos', 'blueprint', 'flat-night', 'material-night', 'liquid-night'];

describe.each(THEMES)('the %s theme', (name) => {
  const tokens = themeTokens(name);

  test('sets every token', () => {
    for (const token of THEME_TOKENS) {
      expect(ORBIT_THEME_PRESETS[name][token]?.trim() ?? '').not.toBe('');
    }
  });

  test('keeps labels at WCAG AA contrast (4.5:1) on every node color and shade', () => {
    const worst = worstLabelContrast(tokens);
    expect({ passes: worst.ratio >= 4.5, where: worst.where }).toEqual({ passes: true, where: worst.where });
  });

  test('keeps page text and control text readable', () => {
    for (const backdrop of backdrops(tokens)) {
      expect(contrastRatio(color(tokens.text), backdrop)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(over(color(tokens['muted-text']), 1, backdrop), backdrop)).toBeGreaterThanOrEqual(4.5);
    }

    const sheet = color(tokens['sheet-background'].startsWith('rgba') ? '#FFFFFF' : tokens['sheet-background']);

    if (color(tokens['sheet-background']).alpha === 1) {
      expect(contrastRatio(color(tokens['sheet-text']), sheet)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(over(color(tokens['sheet-muted-text']), 1, sheet), sheet)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(color(tokens['link-text']), sheet)).toBeGreaterThanOrEqual(4.5);
    }

    if (color(tokens['tooltip-background']).alpha === 1) {
      expect(contrastRatio(color(tokens['tooltip-text']), color(tokens['tooltip-background']))).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('theme stylesheet', () => {
  const css = themeStylesheet();

  test('tells the browser which themes are dark', () => {
    for (const name of THEMES) {
      const scheme = /color-scheme:(\w+)/.exec(css.slice(css.indexOf(`[data-orbit-theme="${name}"]`)))?.[1];
      expect(`${name}: ${scheme}`).toBe(`${name}: ${DARK.includes(name) ? 'dark' : 'light'}`);
    }
  });

  test('lets every token be overridden from the page', () => {
    expect(css).toContain('--_orbit-ring-dash:var(--orbit-ring-dash,1 6);');
    expect(css).toContain('--_orbit-label-font:var(--orbit-label-font,var(--_orbit-font-family));');
    expect(css).toContain('--_orbit-font-family:var(--orbit-font-family,var(--_orbit-sans-font));');
    expect(css).toContain('--_orbit-sans-font:var(--orbit-sans-font,ui-sans-serif, system-ui');
  });
});

describe('theme values', () => {
  test('resolve tokens that follow another, such as the label font', () => {
    expect(themeTokens('paper')['label-font']).toBe(ORBIT_THEME_PRESETS.paper['sans-font']);
    expect(resolveThemeTokens('paper', { tokens: { 'font-family': 'Inter' } })['label-font']).toBe('Inter');
    // A theme with its own lettering keeps it.
    expect(resolveThemeTokens('ink', { tokens: { 'font-family': 'Inter' } })['display-font']).toBe(ORBIT_THEME_PRESETS.paper['serif-font']);
    // Values the page resolved win.
    expect(resolveThemeTokens('paper', {}, { 'font-family': 'Georgia' })['label-font']).toBe('Georgia');
  });

  test('take the page\'s font of each kind: a brand sans-serif for sans-serif themes, while blueprint keeps its monospace and ink its serif', () => {
    const brand = { 'sans-font': '"Google Sans Flex", sans-serif' };

    for (const name of ['paper', 'night', 'glass', 'glass-night', 'cosmos', 'contrast'] as const) {
      expect(`${name}: ${resolveThemeTokens(name, {}, brand)['label-font']}`).toBe(`${name}: "Google Sans Flex", sans-serif`);
    }

    expect(resolveThemeTokens('blueprint', {}, brand)['label-font']).toBe(ORBIT_THEME_PRESETS.paper['mono-font']);
    expect(resolveThemeTokens('ink', {}, brand)['label-font']).toBe(ORBIT_THEME_PRESETS.paper['serif-font']);
    // Ink's controls and sheet stay sans-serif, in the brand's font.
    expect(resolveThemeTokens('ink', {}, brand)['font-family']).toBe('"Google Sans Flex", sans-serif');
    // A theme object can set them too.
    expect(resolveThemeTokens('blueprint', { tokens: { 'mono-font': 'Inconsolata, monospace' } })['label-font']).toBe('Inconsolata, monospace');
  });

  test('come from a theme object\'s tokens', () => {
    const theme = { tokens: { surface: '#101010', 'ring-dash': 'none', 'sun-halo-opacity': '0', unknown: 'x', 'node-text': '' } as Record<string, string> };
    expect(themeObjectTokens(theme)).toEqual({ surface: '#101010', 'ring-dash': 'none', 'sun-halo-opacity': '0' });
    expect(themeOverrides(theme)['--_orbit-ring-dash']).toBe('var(--orbit-ring-dash, none)');
  });

  test('build on the theme named before them when they have no preset', () => {
    expect(mergeThemes('cosmos', { tokens: { surface: '#000' } })).toEqual({ preset: 'cosmos', tokens: { surface: '#000' } });
    expect(mergeThemes('cosmos', { preset: 'ink' })).toEqual({ preset: 'ink' });
    expect(mergeThemes('cosmos', 'night')).toBe('night');
    expect(mergeThemes('cosmos', undefined)).toBe('cosmos');
    expect(mergeThemes(undefined, { tokens: {} })).toEqual({ tokens: {} });
  });
});
