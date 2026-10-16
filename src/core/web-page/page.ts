/**
 * A map as a web page: one HTML file with Orbit, the map and its pictures
 * inside, which opens in any browser, offline. Readers explore it with
 * Orbit's own controls, or present it: one idea at a time, in reading order,
 * with its note as a caption (see runtime.ts, the page's script).
 */

import { parseOrbit } from '../dispatch.js';
import { serializeOrbitMarkdown } from '../serializer-markdown.js';
import { OrbitWords, type OrbitStrings } from '../languages.js';
import { expandTheme, isOrbitThemePreset, themeTokens, type OrbitThemeTokens } from '../themes.js';
import type { OrbitDocument, OrbitRendererTheme, ViewMode } from '../types.js';

export interface OrbitWebPageOptions {
  /**
   * Orbit's web page script, the file `@restless-dreams/orbit/web-page.js`,
   * as text. It goes inside the page, so the page needs nothing else.
   */
  script: string;

  /** The page's title. Default: the map's `title`, or its root's text. */
  title?: string;

  /** The map's theme, instead of its frontmatter's: a theme name or `{ preset, tokens }`. */
  theme?: string | OrbitRendererTheme;

  /** How the map opens: `focus` (default) or `all`, the overview. */
  viewMode?: ViewMode;

  /** The node in focus when the map opens, by id. Default: the root. */
  focus?: string;

  /** The language of the page and the map's words: a tag like `es`. Default: English. */
  language?: string;

  /** Single words to change: `{ present: 'Show' }`. */
  strings?: Partial<OrbitStrings>;

  /**
   * Pictures to put inside the page, by the address the map gives them:
   * `{ 'photos/summit.jpg': 'data:image/jpeg;base64,…' }`. A node's picture,
   * a video's thumbnail and pictures in notes are swapped for them, so they
   * show wherever the page goes.
   */
  media?: Record<string, string>;
}

/** Orbit's logo, the page's icon. */
const ORBIT_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='18 18 72 72'%3E%3Cdefs%3E%3CradialGradient id='d' gradientUnits='userSpaceOnUse' cx='32.4' cy='23.76' r='102.6'%3E%3Cstop offset='0' stop-color='%234A35A8'/%3E%3Cstop offset='1' stop-color='%2318134A'/%3E%3C/radialGradient%3E%3C/defs%3E%3Crect x='18' y='18' width='72' height='72' rx='16' fill='url(%23d)'/%3E%3Cpath d='M67.53,35.36 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M69.84,37.38 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M71.86,39.69 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M76.52,57.07 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M75.92,60.08 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M74.93,62.99 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M62.21,75.71 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M59.3,76.7 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M56.29,77.3 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M38.91,72.64 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M36.6,70.62 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M34.58,68.31 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M29.92,50.93 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M30.52,47.92 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M31.51,45.01 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M44.23,32.29 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M47.14,31.3 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z M50.15,30.7 a0.78,0.78 0 1,0 1.56,0 a0.78,0.78 0 1,0 -1.56,0 Z' fill='%23E2E6FF' fill-opacity='.5'/%3E%3Ccircle cx='54' cy='54' r='11' fill='%23FAD86F'/%3E%3Ccircle cx='60.08' cy='31.3' r='6.4' fill='%23FF9E96'/%3E%3Ccircle cx='76.7' cy='47.92' r='6.4' fill='%23F8B478'/%3E%3Ccircle cx='70.62' cy='70.62' r='6.4' fill='%237FDAAB'/%3E%3Ccircle cx='47.92' cy='76.7' r='6.4' fill='%2386CDFF'/%3E%3Ccircle cx='31.3' cy='60.08' r='6.4' fill='%23C9B1FE'/%3E%3Ccircle cx='37.38' cy='37.38' r='6.4' fill='%23F7A3D4'/%3E%3C/svg%3E";

/** What a web page carries for its script, as JSON in `#orbit-page`. */
export interface WebPageData {
  /** The map, in markdown or YAML. */
  source: string;

  theme?: string | OrbitRendererTheme;
  viewMode?: ViewMode;
  focus?: string;
  language?: string;
  strings?: Partial<OrbitStrings>;
  media: Record<string, string>;
}

/**
 * The map as one HTML page, with Orbit inside (`options.script`): open it in
 * any browser, offline, to explore the map or present it.
 *
 * ```ts
 * import { readFileSync } from 'node:fs';
 * import { exportWebPage } from '@restless-dreams/orbit';
 *
 * const script = readFileSync(new URL(import.meta.resolve('@restless-dreams/orbit/web-page.js')), 'utf8');
 * const html = exportWebPage(markdown, { script, theme: 'night' });
 * ```
 */
export const exportWebPage = (input: string | OrbitDocument, options: OrbitWebPageOptions): string => {
  const document = typeof input === 'string' ? parseOrbit(input) : input;
  const source = typeof input === 'string' ? input : serializeOrbitMarkdown(input);
  const words = new OrbitWords(options.language, options.strings);
  const title = options.title ?? (document.options.title || document.root.text || 'Orbit');
  const data: WebPageData = {
    source,
    theme: options.theme,
    viewMode: options.viewMode,
    focus: options.focus,
    language: options.language,
    strings: options.strings,
    media: options.media ?? {},
  };
  const theme = options.theme ?? document.options.theme;
  return `<!doctype html>
<html lang="${escapeAttribute(words.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="Orbit">
<link rel="icon" href="${ORBIT_ICON}">
<title>${escapeText(title)}</title>
<style>
${pageStyles(theme)}
</style>
</head>
<body>
<div class="page" id="page">
  <div class="page__map" id="page-map" aria-label="${escapeAttribute(title)}"></div>
  <button class="page__present" type="button" data-present><span aria-hidden="true">▶</span> ${escapeText(words.text('present'))}</button>
  <section class="page__caption" id="page-caption" aria-live="polite" hidden>
    <h1 class="page__title" id="page-title"></h1>
    <div class="page__note" id="page-note"></div>
  </section>
  <nav class="page__controls" id="page-controls" hidden>
    <button class="page__button" type="button" data-step="-1" aria-label="${escapeAttribute(words.text('previous'))}">‹</button>
    <span class="page__count" id="page-count"></span>
    <button class="page__button" type="button" data-step="1" aria-label="${escapeAttribute(words.text('next'))}">›</button>
    <button class="page__button" type="button" data-close aria-label="${escapeAttribute(words.text('close'))}">✕</button>
  </nav>
</div>
<script type="application/json" id="orbit-page">${scriptJson(data)}</script>
<script type="application/json" id="orbit-script">${scriptJson(options.script)}</script>
<script>
  // Orbit runs from a script element made here: text inside one is never read as HTML.
  (function () {
    var script = document.createElement('script');
    script.textContent = JSON.parse(document.getElementById('orbit-script').textContent);
    document.body.appendChild(script);
  })();
</script>
</body>
</html>
`;
};

/** The colors the page takes from the theme: its background, and the caption's, from the detail sheet's. */
const pageColors = (tokens: OrbitThemeTokens): string => {
  const surface = tokens.surface === 'transparent' ? '#ffffff' : tokens.surface;
  return [
    `--page-background: ${surface};`,
    `--page-card: ${tokens['sheet-background']};`,
    `--page-text: ${tokens['sheet-text']};`,
    `--page-muted: ${tokens['sheet-muted-text']};`,
    `--page-border: ${tokens['sheet-border']};`,
    `--page-shadow: ${tokens['sheet-shadow']};`,
  ].join(' ');
};

/** The tokens a theme option stands for: a built-in theme's, with the option's own on top. */
const tokensOf = (theme: string | OrbitRendererTheme | undefined): OrbitThemeTokens => {
  const expanded = expandTheme(theme);
  const preset = typeof expanded === 'string' ? expanded : expanded?.preset;
  const base = themeTokens(isOrbitThemePreset(preset) ? preset : 'paper');
  return typeof expanded === 'object' && expanded?.tokens ? { ...base, ...expanded.tokens } as OrbitThemeTokens : base;
};

const pageStyles = (theme: string | OrbitRendererTheme | undefined): string => {
  const automatic = (typeof theme === 'string' ? theme : theme?.preset) === 'auto';
  const colors = automatic
    ? `:root { ${pageColors(themeTokens('paper'))} }\n@media (prefers-color-scheme: dark) { :root { ${pageColors(themeTokens('night'))} } }`
    : `:root { ${pageColors(tokensOf(theme))} }`;
  return `${colors}
html, body { margin: 0; height: 100%; background: var(--page-background); }
body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--page-text); }
.page__map { position: fixed; inset: 0; }
.page__present, .page__controls {
  position: fixed; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 18px; border: 1px solid var(--page-border);
  border-radius: 22px; background: var(--page-card); color: var(--page-text); box-shadow: var(--page-shadow); font: inherit; font-weight: 600;
}
.page__present { cursor: pointer; }
.page__controls { padding: 0 6px; transition: opacity 200ms ease; }
.page__button { min-width: 44px; min-height: 44px; border: 0; border-radius: 22px; background: none; color: inherit; font: inherit; font-size: 20px; cursor: pointer; }
.page__button:focus-visible, .page__present:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.page__count { min-width: 4em; text-align: center; color: var(--page-muted); font-variant-numeric: tabular-nums; }
.page__caption {
  position: fixed; left: 50%; bottom: calc(max(16px, env(safe-area-inset-bottom)) + 60px); transform: translateX(-50%);
  box-sizing: border-box; width: min(720px, calc(100% - 32px)); max-height: 40vh; overflow: auto; padding: 16px 20px;
  border: 1px solid var(--page-border); border-radius: 16px; background: var(--page-card); color: var(--page-text); box-shadow: var(--page-shadow);
}
.page__title { margin: 0; font-size: 20px; line-height: 1.3; }
.page__note:not(:empty) { margin-top: 8px; }
.page__note p { margin: 0 0 8px; }
.page__note img { max-width: 100%; border-radius: 8px; }
.page__note a { color: inherit; }
.page--presenting .page__present { display: none; }
.page--presenting:not(.page--controls) .page__controls { opacity: 0; }
.page--presenting:not(.page--controls) { cursor: none; }
[hidden] { display: none !important; }`;
};

/** JSON inside a script element: `<` written as `\\u003c`, so nothing in it can end the element or open a comment. */
const scriptJson = (value: unknown): string => {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
};

const escapeText = (text: string): string => {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

const escapeAttribute = (text: string): string => {
  return escapeText(text).replace(/"/g, '&quot;');
};
