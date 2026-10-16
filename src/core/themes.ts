import type { OrbitRendererTheme, OrbitThemePreset } from './types.js';

/**
 * Theme tokens. Each token is a CSS custom property: set `--orbit-<token>` on
 * the map or any ancestor to override it. Presets only provide defaults:
 * internally every token resolves as `var(--orbit-<token>, <preset value>)`.
 */
export const THEME_TOKENS = [
  'sans-font', 'serif-font', 'mono-font',
  'font-family', 'label-font', 'display-font', 'label-weight', 'display-weight', 'label-letter-spacing', 'label-shadow',
  'surface', 'surface-pattern', 'text', 'muted-text',
  'root-text', 'node-text', 'node-text-inverse',
  'color-root', 'color-1', 'color-2', 'color-3', 'color-4', 'color-5', 'color-6', 'color-7',
  'shade-light', 'shade-dark',
  'node-fill-opacity', 'moon-opacity', 'node-highlight', 'node-terminator', 'node-shading', 'node-shade-circle',
  'node-stroke', 'node-stroke-tint', 'node-stroke-width', 'badge-stroke',
  'node-shadow', 'node-shadow-tint', 'node-shadow-opacity', 'node-shadow-offset', 'node-shadow-size',
  'sun-shadow-opacity', 'sun-shadow-size',
  'sun-halo', 'sun-halo-tint', 'sun-halo-opacity', 'sun-halo-width', 'sun-halo-dash', 'sun-halo-size',
  'ring-stroke', 'ring-tint', 'ring-opacity', 'ring-width', 'ring-dash',
  'link-stroke', 'link-tint', 'link-opacity', 'link-width', 'link-dash',
  'focus-ring', 'note-indicator',
  'control-background', 'control-border', 'control-text', 'control-muted-text',
  'control-active-background', 'control-active-text', 'control-shadow', 'control-blur',
  'tooltip-background', 'tooltip-text',
  'action-background', 'action-border', 'action-text', 'action-shadow',
  'sheet-background', 'sheet-text', 'sheet-muted-text', 'sheet-border', 'sheet-backdrop', 'sheet-shadow', 'sheet-blur',
  'chip-background', 'chip-text', 'link-text',
  'status-active', 'status-done', 'status-blocked', 'status-todo', 'status-neutral',
  'error-background', 'error-border', 'error-text',
] as const;

export type OrbitThemeToken = (typeof THEME_TOKENS)[number];
export type OrbitThemeTokens = Record<OrbitThemeToken, string>;
export type OrbitThemeName =
  | 'paper' | 'night' | 'glass' | 'glass-night' | 'cosmos' | 'blueprint' | 'ink' | 'contrast'
  | 'flat' | 'flat-night' | 'material' | 'material-night' | 'liquid' | 'liquid-night';

const SYSTEM_FONTS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
const SERIF_FONTS = 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, Cambria, "Times New Roman", serif';
const MONOSPACE_FONTS = 'ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** Pastel planets with a soft colored shadow and a fine rim of their own color, on the page's own background. */
const PAPER: OrbitThemeTokens = {
  // The page's fonts of each kind: set `--orbit-sans-font` to draw every sans-serif theme in your own.
  'sans-font': SYSTEM_FONTS,
  'serif-font': SERIF_FONTS,
  'mono-font': MONOSPACE_FONTS,
  'font-family': 'var(--_orbit-sans-font)',
  'label-font': 'var(--_orbit-font-family)',
  'display-font': 'var(--_orbit-font-family)',
  'label-weight': '600',
  'display-weight': '650',
  'label-letter-spacing': '-0.005em',
  'label-shadow': 'none',
  surface: 'transparent',
  'surface-pattern': 'none',
  text: '#1F2733',
  'muted-text': '#5B6474',
  'root-text': '#1F2733',
  'node-text': '#1F2733',
  'node-text-inverse': '#FFFFFF',
  'color-root': '#FAD86F',
  'color-1': '#FEBAB6',
  'color-2': '#99E0BA',
  'color-3': '#9ED5FD',
  'color-4': '#D6C2FE',
  'color-5': '#F9C191',
  'color-6': '#FCB6D6',
  'color-7': '#82E1E0',
  'shade-light': '#FFFFFF',
  'shade-dark': '#1F2733',
  'node-fill-opacity': '1',
  'moon-opacity': '0.94',
  'node-highlight': 'rgba(255, 255, 255, 0.55)',
  'node-terminator': 'rgba(31, 39, 51, 0)',
  'node-shading': 'rgba(31, 39, 51, 0.12)',
  'node-shade-circle': '0.34 0.3 0.78',
  'node-stroke': '#1F2733',
  'node-stroke-tint': '78%',
  'node-stroke-width': '1',
  'badge-stroke': '#FFFFFF',
  'node-shadow': '#1F2733',
  'node-shadow-tint': '45%',
  'node-shadow-opacity': '0.26',
  'node-shadow-offset': '0.16',
  'node-shadow-size': '0.96',
  'sun-shadow-opacity': '0.3',
  'sun-shadow-size': '0.98',
  'sun-halo': '#1F2733',
  'sun-halo-tint': '72%',
  'sun-halo-opacity': '0.55',
  'sun-halo-width': '1',
  'sun-halo-dash': 'none',
  'sun-halo-size': '1.15',
  'ring-stroke': '#1F2733',
  'ring-tint': '35%',
  'ring-opacity': '0.4',
  'ring-width': '1.5',
  'ring-dash': '1 6',
  'link-stroke': '#1F2733',
  'link-tint': '60%',
  'link-opacity': '0.45',
  'link-width': '1.5',
  'link-dash': 'none',
  'focus-ring': '#2563EB',
  'note-indicator': '#1F2733',
  'control-background': 'rgba(255, 255, 255, 0.92)',
  'control-border': 'rgba(31, 39, 51, 0.12)',
  'control-text': '#1F2733',
  'control-muted-text': '#5B6474',
  'control-active-background': '#1F2733',
  'control-active-text': '#FFFFFF',
  'control-shadow': '0 6px 20px rgba(31, 39, 51, 0.12)',
  'control-blur': '12px',
  'tooltip-background': '#1F2733',
  'tooltip-text': '#FFFFFF',
  'action-background': '#FFFFFF',
  'action-border': 'rgba(31, 39, 51, 0.16)',
  'action-text': '#1F2733',
  'action-shadow': '0 6px 16px rgba(31, 39, 51, 0.18)',
  'sheet-background': '#FFFFFF',
  'sheet-text': '#1F2733',
  'sheet-muted-text': '#5B6474',
  'sheet-border': 'rgba(31, 39, 51, 0.12)',
  'sheet-backdrop': 'rgba(15, 23, 42, 0.45)',
  'sheet-shadow': '0 24px 64px rgba(15, 23, 42, 0.28)',
  'sheet-blur': '0px',
  'chip-background': '#F1F5F9',
  'chip-text': '#334155',
  'link-text': '#2563EB',
  'status-active': '#2563EB',
  'status-done': '#16A34A',
  'status-blocked': '#DC2626',
  'status-todo': '#94A3B8',
  'status-neutral': '#64748B',
  'error-background': '#FFF6F5',
  'error-border': '#E58A8A',
  'error-text': '#7A1F1F',
};

/** Luminous planets that glow on a deep navy sky. */
const NIGHT: OrbitThemeTokens = {
  ...PAPER,
  surface: '#0B1120',
  'surface-pattern': 'radial-gradient(120% 90% at 50% 42%, rgba(64, 84, 160, 0.26), transparent 70%)',
  text: '#E6EAF2',
  'muted-text': '#97A3B6',
  'root-text': '#0B1120',
  'node-text': '#0B1120',
  'color-root': '#FEDB6D',
  'color-1': '#FFAAA7',
  'color-2': '#80DAAC',
  'color-3': '#86CDFF',
  'color-4': '#CEB5FE',
  'color-5': '#F8B478',
  'color-6': '#FAA6CE',
  'color-7': '#5EDADA',
  'shade-dark': '#0B1120',
  'node-highlight': 'rgba(255, 255, 255, 0.45)',
  'node-terminator': 'rgba(11, 17, 32, 0)',
  'node-shading': 'rgba(11, 17, 32, 0.2)',
  'node-stroke': '#FFFFFF',
  'node-stroke-tint': '55%',
  'badge-stroke': '#0B1120',
  'node-shadow': '#FFFFFF',
  'node-shadow-tint': '100%',
  'node-shadow-opacity': '0.42',
  'node-shadow-offset': '0',
  'node-shadow-size': '1.16',
  'sun-shadow-opacity': '0.5',
  'sun-shadow-size': '1.4',
  'sun-halo-opacity': '0',
  'ring-stroke': '#FFFFFF',
  'ring-tint': '55%',
  'ring-opacity': '0.34',
  'link-stroke': '#FFFFFF',
  'link-tint': '70%',
  'link-opacity': '0.36',
  'focus-ring': '#93C5FD',
  'note-indicator': '#E6EAF2',
  'control-background': 'rgba(20, 26, 44, 0.84)',
  'control-border': 'rgba(148, 163, 184, 0.22)',
  'control-text': '#E6EAF2',
  'control-muted-text': '#97A3B6',
  'control-active-background': '#E6EAF2',
  'control-active-text': '#0B1120',
  'control-shadow': '0 8px 24px rgba(0, 0, 0, 0.4)',
  'tooltip-background': '#E6EAF2',
  'tooltip-text': '#0B1120',
  'action-background': '#1B2338',
  'action-border': 'rgba(148, 163, 184, 0.3)',
  'action-text': '#E6EAF2',
  'action-shadow': '0 6px 16px rgba(0, 0, 0, 0.45)',
  'sheet-background': '#131A2E',
  'sheet-text': '#E6EAF2',
  'sheet-muted-text': '#97A3B6',
  'sheet-border': 'rgba(148, 163, 184, 0.2)',
  'sheet-backdrop': 'rgba(2, 6, 23, 0.6)',
  'sheet-shadow': '0 24px 64px rgba(0, 0, 0, 0.6)',
  'chip-background': 'rgba(148, 163, 184, 0.16)',
  'chip-text': '#E2E8F0',
  'link-text': '#93C5FD',
  'status-active': '#60A5FA',
  'status-done': '#4ADE80',
  'status-blocked': '#F87171',
  'status-neutral': '#94A3B8',
  'error-background': '#2A1215',
  'error-border': '#F87171',
  'error-text': '#FECACA',
};

/** Frosted, translucent planets with a bright rim, on a soft pastel backdrop of their own. */
const GLASS: OrbitThemeTokens = {
  ...PAPER,
  surface: '#E7EAF8',
  'surface-pattern': [
    'radial-gradient(60% 50% at 16% 18%, rgba(196, 181, 253, 0.75), transparent 70%)',
    'radial-gradient(55% 48% at 86% 24%, rgba(251, 207, 232, 0.85), transparent 70%)',
    'radial-gradient(65% 55% at 52% 96%, rgba(153, 246, 228, 0.7), transparent 70%)',
    'radial-gradient(40% 40% at 90% 85%, rgba(191, 219, 254, 0.8), transparent 70%)',
  ].join(', '),
  text: '#16213A',
  'muted-text': '#414C66',
  'root-text': '#16213A',
  'node-text': '#16213A',
  'color-root': '#FEEEBD',
  'color-1': '#FED6D4',
  'color-2': '#B6F1D0',
  'color-3': '#C7E6FD',
  'color-4': '#E6DAFE',
  'color-5': '#FDDABD',
  'color-6': '#FFD3E6',
  'color-7': '#A5F2F1',
  'shade-dark': '#16213A',
  'node-fill-opacity': '0.55',
  'moon-opacity': '0.5',
  'node-highlight': 'rgba(255, 255, 255, 0.85)',
  'node-terminator': 'rgba(22, 33, 58, 0)',
  'node-shading': 'rgba(22, 33, 58, 0.08)',
  'node-stroke': 'rgba(255, 255, 255, 0.92)',
  'node-stroke-tint': '0%',
  'node-stroke-width': '1.5',
  'node-shadow': '#16213A',
  'node-shadow-tint': '25%',
  'node-shadow-opacity': '0.18',
  'node-shadow-offset': '0.18',
  'node-shadow-size': '0.98',
  'sun-shadow-opacity': '0.22',
  'sun-shadow-size': '1',
  'sun-halo': '#FFFFFF',
  'sun-halo-tint': '0%',
  'sun-halo-opacity': '0.7',
  'sun-halo-width': '1.5',
  'sun-halo-size': '1.13',
  'ring-stroke': '#FFFFFF',
  'ring-tint': '0%',
  'ring-opacity': '0.85',
  'link-stroke': '#FFFFFF',
  'link-tint': '0%',
  'link-opacity': '0.8',
  'note-indicator': '#16213A',
  'control-background': 'rgba(255, 255, 255, 0.42)',
  'control-border': 'rgba(255, 255, 255, 0.62)',
  'control-text': '#16213A',
  'control-muted-text': '#414C66',
  'control-active-background': 'rgba(255, 255, 255, 0.78)',
  'control-active-text': '#16213A',
  'control-shadow': '0 8px 28px rgba(28, 44, 72, 0.18)',
  'control-blur': '18px',
  'tooltip-background': 'rgba(255, 255, 255, 0.86)',
  'tooltip-text': '#16213A',
  'action-background': 'rgba(255, 255, 255, 0.62)',
  'action-border': 'rgba(255, 255, 255, 0.78)',
  'action-text': '#16213A',
  'action-shadow': '0 6px 18px rgba(28, 44, 72, 0.2)',
  'sheet-background': 'rgba(255, 255, 255, 0.8)',
  'sheet-text': '#16213A',
  'sheet-muted-text': '#414C66',
  'sheet-border': 'rgba(255, 255, 255, 0.7)',
  'sheet-backdrop': 'rgba(18, 28, 45, 0.32)',
  'sheet-shadow': '0 24px 70px rgba(28, 44, 72, 0.3)',
  'sheet-blur': '24px',
  'chip-background': 'rgba(255, 255, 255, 0.6)',
};

/** The glass look at night: tinted glass planets that glow over an aurora. */
const GLASS_NIGHT: OrbitThemeTokens = {
  ...NIGHT,
  surface: '#0E1326',
  'surface-pattern': [
    'radial-gradient(60% 50% at 18% 16%, rgba(99, 102, 241, 0.42), transparent 70%)',
    'radial-gradient(55% 50% at 86% 78%, rgba(219, 39, 119, 0.3), transparent 70%)',
    'radial-gradient(45% 40% at 74% 12%, rgba(20, 184, 166, 0.26), transparent 70%)',
  ].join(', '),
  'label-shadow': '0 1px 3px rgba(5, 8, 20, 0.55)',
  text: '#F4F6FF',
  'muted-text': '#A9B2D0',
  // Light labels on every planet: the glass lets the dark sky through.
  'root-text': '#F4F6FF',
  'node-text': '#F4F6FF',
  'node-text-inverse': '#F4F6FF',
  'color-root': '#F8DC86',
  'color-1': '#FFAAA7',
  'color-2': '#6FDEA7',
  'color-3': '#86CDFF',
  'color-4': '#CEB5FE',
  'color-5': '#FEB16B',
  'color-6': '#FFA3CF',
  'color-7': '#36DEDE',
  'shade-dark': '#0E1326',
  'node-fill-opacity': '0.16',
  'moon-opacity': '0.14',
  'node-highlight': 'rgba(255, 255, 255, 0.1)',
  'node-terminator': 'rgba(14, 19, 38, 0)',
  'node-shading': 'rgba(14, 19, 38, 0.18)',
  'node-stroke': 'rgba(255, 255, 255, 0.6)',
  'node-stroke-tint': '45%',
  'node-stroke-width': '1.5',
  'node-shadow-opacity': '0.3',
  'node-shadow-size': '1.14',
  'sun-shadow-opacity': '0.38',
  'sun-shadow-size': '1.35',
  'ring-tint': '20%',
  'ring-opacity': '0.32',
  'link-tint': '30%',
  'link-opacity': '0.32',
  'note-indicator': '#F4F6FF',
  'control-background': 'rgba(30, 38, 64, 0.5)',
  'control-border': 'rgba(255, 255, 255, 0.16)',
  'control-text': '#F4F6FF',
  'control-muted-text': '#A9B2D0',
  'control-active-background': '#F4F6FF',
  'control-active-text': '#0E1326',
  'control-blur': '18px',
  'tooltip-background': 'rgba(244, 246, 255, 0.92)',
  'tooltip-text': '#0E1326',
  'action-background': 'rgba(30, 38, 64, 0.62)',
  'action-border': 'rgba(255, 255, 255, 0.2)',
  'action-text': '#F4F6FF',
  'sheet-background': 'rgba(24, 32, 56, 0.78)',
  'sheet-text': '#F4F6FF',
  'sheet-muted-text': '#A9B2D0',
  'sheet-border': 'rgba(255, 255, 255, 0.14)',
  'sheet-blur': '24px',
};

/** Stars for `cosmos`, scattered at random over a 640 px tile: each `M x y h0` is a dot (a zero-length, round-capped stroke). */
const STARS = [
  { width: 1.1, color: '#fff', opacity: 0.45, points: 'M462 375h0M252 311h0M202 477h0M298 443h0M208 600h0M167 216h0M541 306h0M47 605h0M401 38h0M101 610h0M620 113h0M189 63h0M293 536h0M199 606h0M241 266h0M82 304h0M52 6h0M50 137h0M104 532h0M103 368h0M278 199h0M245 328h0M51 59h0M194 68h0M37 219h0M322 310h0M339 230h0M552 48h0M576 155h0M612 480h0' },
  { width: 1.5, color: '#e3e9ff', opacity: 0.75, points: 'M568 195h0M633 111h0M342 180h0M527 323h0M532 283h0M623 494h0M123 125h0M310 588h0M127 394h0M36 377h0M297 418h0M306 11h0M244 382h0M153 210h0M173 288h0M104 454h0' },
  { width: 2.1, color: '#fff', opacity: 0.95, points: 'M221 502h0M523 249h0M489 393h0M633 604h0M173 467h0M218 505h0' },
  { width: 1.5, color: '#ffe7c7', opacity: 0.8, points: 'M382 480h0M367 90h0M103 79h0M497 64h0M339 614h0M541 446h0' },
];

/** The star tile as a CSS background layer. */
const starfield = (): string => {
  const paths = STARS.map((stars) => `<path d='${stars.points}' stroke='${stars.color}' stroke-opacity='${stars.opacity}' stroke-width='${stars.width}' stroke-linecap='round'/>`);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='640'>${paths.join('')}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23')}") 0 0 / 640px 640px`;
};

/** Jewel-toned planets lit from one side, a star with a corona, and a field of stars. */
const COSMOS: OrbitThemeTokens = {
  ...NIGHT,
  surface: '#05060E',
  'surface-pattern': [
    starfield(),
    'radial-gradient(80% 60% at 78% 16%, rgba(98, 70, 214, 0.26), transparent 70%)',
    'radial-gradient(70% 55% at 14% 88%, rgba(16, 150, 160, 0.16), transparent 70%)',
  ].join(', '),
  'label-shadow': '0 1px 2px rgba(0, 0, 0, 0.45)',
  text: '#E7E9F7',
  'muted-text': '#9CA3C4',
  'root-text': '#1A1206',
  'node-text': '#14102B',
  'node-text-inverse': '#FFFFFF',
  'color-root': '#FFC75A',
  'color-1': '#285CC2',
  'color-2': '#863CA4',
  'color-3': '#A42C71',
  'color-4': '#017272',
  'color-5': '#0B7643',
  'color-6': '#A14206',
  'color-7': '#5D4DBE',
  'shade-light': '#4B4F7A',
  'shade-dark': '#05060E',
  'moon-opacity': '1',
  'node-highlight': 'rgba(255, 244, 214, 0.1)',
  'node-terminator': 'rgba(5, 6, 14, 0.28)',
  'node-shading': 'rgba(5, 6, 14, 0.6)',
  'node-stroke': 'rgba(255, 255, 255, 0.6)',
  'node-stroke-tint': '50%',
  'badge-stroke': '#05060E',
  'node-shadow-opacity': '0.4',
  'node-shadow-size': '1.12',
  'sun-shadow-opacity': '0.7',
  'sun-shadow-size': '1.55',
  'ring-stroke': '#8EA2FF',
  'ring-tint': '20%',
  'ring-opacity': '0.32',
  'ring-width': '1',
  'ring-dash': 'none',
  'link-stroke': '#8EA2FF',
  'link-tint': '45%',
  'link-opacity': '0.4',
  'link-width': '1',
  'focus-ring': '#A5B4FF',
  'note-indicator': '#E7E9F7',
  'control-background': 'rgba(14, 16, 32, 0.8)',
  'control-border': 'rgba(142, 162, 255, 0.2)',
  'control-text': '#E7E9F7',
  'control-muted-text': '#9CA3C4',
  'control-active-background': '#E7E9F7',
  'control-active-text': '#05060E',
  'control-shadow': '0 8px 24px rgba(0, 0, 0, 0.5)',
  'control-blur': '14px',
  'tooltip-background': '#E7E9F7',
  'tooltip-text': '#05060E',
  'action-background': '#14172B',
  'action-border': 'rgba(142, 162, 255, 0.28)',
  'action-text': '#E7E9F7',
  'action-shadow': '0 6px 16px rgba(0, 0, 0, 0.5)',
  'sheet-background': '#0D0F1E',
  'sheet-text': '#E7E9F7',
  'sheet-muted-text': '#9CA3C4',
  'sheet-border': 'rgba(142, 162, 255, 0.16)',
  'sheet-backdrop': 'rgba(2, 3, 10, 0.65)',
  'sheet-shadow': '0 24px 64px rgba(0, 0, 0, 0.65)',
  'chip-background': 'rgba(142, 162, 255, 0.14)',
  'chip-text': '#DDE3FF',
  'link-text': '#A5B4FF',
};

/** A technical drawing: outlined planets, construction lines and monospaced labels on a gridded blue sheet. */
const BLUEPRINT: OrbitThemeTokens = {
  ...NIGHT,
  'font-family': 'var(--_orbit-mono-font)',
  'label-weight': '500',
  'display-weight': '600',
  // Monospaced letters, set a little tighter so names stay compact.
  'label-letter-spacing': '-0.02em',
  'label-shadow': 'none',
  surface: '#123A7A',
  'surface-pattern': [
    'linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px) 0 0 / 120px 120px',
    'linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px) 0 0 / 120px 120px',
    'linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px) 0 0 / 24px 24px',
    'linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px) 0 0 / 24px 24px',
  ].join(', '),
  text: '#FFFFFF',
  'muted-text': 'rgba(255, 255, 255, 0.72)',
  // White lines and lettering throughout, as on a print.
  'root-text': '#FFFFFF',
  'node-text': '#FFFFFF',
  'node-text-inverse': '#FFFFFF',
  'color-root': '#FFFFFF',
  'color-1': '#C2F3F5',
  'color-2': '#CCF3DD',
  'color-3': '#D4ECFD',
  'color-4': '#EBE3FC',
  'color-5': '#FFE2CA',
  'color-6': '#FEDEEC',
  'color-7': '#C2F3F2',
  'shade-light': '#FFFFFF',
  'shade-dark': '#123A7A',
  'node-fill-opacity': '0.12',
  'moon-opacity': '0.12',
  'node-highlight': 'rgba(255, 255, 255, 0)',
  'node-terminator': 'rgba(18, 58, 122, 0)',
  'node-shading': 'rgba(18, 58, 122, 0)',
  'node-stroke': '#FFFFFF',
  'node-stroke-tint': '30%',
  'node-stroke-width': '1.5',
  'badge-stroke': '#123A7A',
  'node-shadow-opacity': '0',
  'sun-shadow-opacity': '0',
  'sun-halo': '#FFFFFF',
  'sun-halo-tint': '0%',
  'sun-halo-opacity': '0.7',
  'sun-halo-width': '1',
  'sun-halo-dash': '4 4',
  'sun-halo-size': '1.2',
  'ring-stroke': '#FFFFFF',
  'ring-tint': '0%',
  'ring-opacity': '0.5',
  'ring-width': '1',
  'ring-dash': '7 5',
  'link-stroke': '#FFFFFF',
  'link-tint': '0%',
  'link-opacity': '0.55',
  'link-width': '1',
  'focus-ring': '#FFD166',
  'note-indicator': '#FFFFFF',
  'control-background': 'rgba(14, 45, 99, 0.9)',
  'control-border': 'rgba(255, 255, 255, 0.32)',
  'control-text': '#FFFFFF',
  'control-muted-text': 'rgba(255, 255, 255, 0.72)',
  'control-active-background': '#FFFFFF',
  'control-active-text': '#123A7A',
  'control-shadow': 'none',
  'control-blur': '0px',
  'tooltip-background': '#FFFFFF',
  'tooltip-text': '#123A7A',
  'action-background': '#123A7A',
  'action-border': 'rgba(255, 255, 255, 0.6)',
  'action-text': '#FFFFFF',
  'action-shadow': 'none',
  'sheet-background': '#0F3470',
  'sheet-text': '#FFFFFF',
  'sheet-muted-text': 'rgba(255, 255, 255, 0.75)',
  'sheet-border': 'rgba(255, 255, 255, 0.25)',
  'sheet-backdrop': 'rgba(5, 18, 42, 0.6)',
  'sheet-shadow': '0 24px 64px rgba(0, 0, 0, 0.45)',
  'chip-background': 'rgba(255, 255, 255, 0.12)',
  'chip-text': '#FFFFFF',
  'link-text': '#BFE3FF',
  'status-active': '#7CC4FF',
  'status-done': '#7EE2A8',
  'status-blocked': '#FF8A8A',
  'status-todo': 'rgba(255, 255, 255, 0.6)',
  'status-neutral': 'rgba(255, 255, 255, 0.75)',
  'error-background': '#3A1622',
  'error-border': '#FF8A8A',
  'error-text': '#FFD7D7',
};

/** Black line art on the page's own background: outlined planets, a black sun and serif lettering. */
const INK: OrbitThemeTokens = {
  ...PAPER,
  'label-font': 'var(--_orbit-serif-font)',
  'display-font': 'var(--_orbit-serif-font)',
  'label-weight': '600',
  'display-weight': '600',
  'label-letter-spacing': '0',
  text: '#111111',
  'muted-text': '#55555F',
  'root-text': '#111111',
  'node-text': '#111111',
  'color-root': '#111111',
  'color-1': '#FFFFFF',
  'color-2': '#F7F4EE',
  'color-3': '#EEF2F6',
  'color-4': '#F4F0F7',
  'color-5': '#F1F5EF',
  'color-6': '#F8F1EF',
  'color-7': '#EFF4F4',
  'shade-dark': '#111111',
  'moon-opacity': '1',
  'node-highlight': 'rgba(255, 255, 255, 0)',
  'node-terminator': 'rgba(17, 17, 17, 0)',
  'node-shading': 'rgba(17, 17, 17, 0)',
  'node-stroke': '#111111',
  'node-stroke-tint': '0%',
  'node-stroke-width': '1.5',
  'node-shadow-opacity': '0',
  'sun-shadow-opacity': '0',
  'sun-halo': '#111111',
  'sun-halo-tint': '0%',
  'sun-halo-opacity': '1',
  'sun-halo-width': '1',
  'sun-halo-size': '1.12',
  'ring-stroke': '#111111',
  'ring-tint': '0%',
  'ring-opacity': '0.6',
  'ring-width': '1.5',
  'ring-dash': '0.5 5',
  'link-stroke': '#111111',
  'link-tint': '0%',
  'link-opacity': '0.7',
  'link-width': '1',
  'focus-ring': '#C81E1E',
  'note-indicator': '#C81E1E',
  'control-background': 'rgba(255, 255, 255, 0.95)',
  'control-border': '#111111',
  'control-text': '#111111',
  'control-muted-text': '#55555F',
  'control-active-background': '#111111',
  'control-active-text': '#FFFFFF',
  'control-shadow': '2px 2px 0 #111111',
  'control-blur': '0px',
  'tooltip-background': '#111111',
  'tooltip-text': '#FFFFFF',
  'action-background': '#FFFFFF',
  'action-border': '#111111',
  'action-text': '#111111',
  'action-shadow': '2px 2px 0 #111111',
  'sheet-background': '#FFFFFF',
  'sheet-text': '#111111',
  'sheet-muted-text': '#55555F',
  'sheet-border': '#111111',
  'sheet-backdrop': 'rgba(17, 17, 17, 0.35)',
  'sheet-shadow': '6px 6px 0 #111111',
  'chip-background': '#F3F1EC',
  'chip-text': '#111111',
  'link-text': '#C81E1E',
  'status-active': '#1D4ED8',
  'status-done': '#15803D',
  'status-blocked': '#C81E1E',
  'status-todo': '#9CA3AF',
  'status-neutral': '#6B7280',
  'error-background': '#FFF5F5',
  'error-border': '#C81E1E',
  'error-text': '#7A1414',
};

/** Maximum legibility: black text and outlines, solid colors and bold labels on white. */
const CONTRAST: OrbitThemeTokens = {
  ...PAPER,
  'label-weight': '700',
  'display-weight': '800',
  'label-letter-spacing': '0',
  surface: '#FFFFFF',
  text: '#000000',
  'muted-text': '#3D3D3D',
  'root-text': '#000000',
  'node-text': '#000000',
  'color-root': '#FFE066',
  'color-1': '#FFA8A8',
  'color-2': '#8CE99A',
  'color-3': '#74C0FC',
  'color-4': '#B197FC',
  'color-5': '#FFC078',
  'color-6': '#F783AC',
  'color-7': '#63E6BE',
  // Deeper nodes only get lighter, so black text stays well above AAA.
  'shade-dark': '#FFFFFF',
  'moon-opacity': '1',
  'node-highlight': 'rgba(255, 255, 255, 0)',
  'node-terminator': 'rgba(0, 0, 0, 0)',
  'node-shading': 'rgba(0, 0, 0, 0)',
  'node-stroke': '#000000',
  'node-stroke-tint': '0%',
  'node-stroke-width': '2',
  'node-shadow-opacity': '0',
  'sun-shadow-opacity': '0',
  'sun-halo-opacity': '0',
  'ring-stroke': '#000000',
  'ring-tint': '0%',
  'ring-opacity': '0.7',
  'ring-width': '1.5',
  'ring-dash': '3 5',
  'link-stroke': '#000000',
  'link-tint': '0%',
  'link-opacity': '0.8',
  'link-width': '2',
  'focus-ring': '#0040DD',
  'note-indicator': '#000000',
  'control-background': '#FFFFFF',
  'control-border': '#000000',
  'control-text': '#000000',
  'control-muted-text': '#3D3D3D',
  'control-active-background': '#000000',
  'control-active-text': '#FFFFFF',
  'control-shadow': 'none',
  'control-blur': '0px',
  'tooltip-background': '#000000',
  'tooltip-text': '#FFFFFF',
  'action-background': '#FFFFFF',
  'action-border': '#000000',
  'action-text': '#000000',
  'action-shadow': 'none',
  'sheet-background': '#FFFFFF',
  'sheet-text': '#000000',
  'sheet-muted-text': '#3D3D3D',
  'sheet-border': '#000000',
  'sheet-backdrop': 'rgba(0, 0, 0, 0.6)',
  'sheet-shadow': 'none',
  'chip-background': '#F0F0F0',
  'chip-text': '#000000',
  'link-text': '#0040DD',
  'status-active': '#0040DD',
  'status-done': '#007A33',
  'status-blocked': '#C00000',
  'status-todo': '#595959',
  'status-neutral': '#3D3D3D',
  'error-background': '#FFFFFF',
  'error-border': '#C00000',
  'error-text': '#7A0000',
};

/** Solid, saturated planets with white lettering: no shading, shadows or glow, and a white edge where bodies overlap. */
const FLAT: OrbitThemeTokens = {
  ...PAPER,
  'label-weight': '650',
  'display-weight': '750',
  'label-letter-spacing': '0',
  text: '#111827',
  'muted-text': '#4B5563',
  'root-text': '#111827',
  'node-text': '#111827',
  'node-text-inverse': '#FFFFFF',
  'color-root': '#FFC233',
  'color-1': '#C82F2C',
  'color-2': '#007B3D',
  'color-3': '#0C66D7',
  'color-4': '#844DCC',
  'color-5': '#AD5000',
  'color-6': '#BE307D',
  'color-7': '#007777',
  'shade-dark': '#111827',
  'moon-opacity': '1',
  'node-highlight': 'rgba(255, 255, 255, 0)',
  'node-terminator': 'rgba(17, 24, 39, 0)',
  'node-shading': 'rgba(17, 24, 39, 0)',
  'node-stroke': '#FFFFFF',
  'node-stroke-tint': '0%',
  'node-stroke-width': '2',
  'node-shadow-opacity': '0',
  'sun-shadow-opacity': '0',
  'sun-halo': '#111827',
  'sun-halo-tint': '100%',
  'sun-halo-opacity': '0.3',
  'sun-halo-width': '6',
  'sun-halo-dash': 'none',
  'sun-halo-size': '1.14',
  'ring-stroke': '#111827',
  'ring-tint': '0%',
  'ring-opacity': '0.14',
  'ring-width': '1.5',
  'ring-dash': 'none',
  'link-stroke': '#111827',
  'link-tint': '100%',
  'link-opacity': '0.55',
  'link-width': '2',
  'link-dash': 'none',
  'focus-ring': '#0C66D7',
  'note-indicator': '#111827',
  'control-background': '#FFFFFF',
  'control-border': '#E5E7EB',
  'control-text': '#111827',
  'control-muted-text': '#4B5563',
  'control-active-background': '#111827',
  'control-active-text': '#FFFFFF',
  'control-shadow': 'none',
  'control-blur': '0px',
  'tooltip-background': '#111827',
  'tooltip-text': '#FFFFFF',
  'action-background': '#FFFFFF',
  'action-border': '#E5E7EB',
  'action-text': '#111827',
  'action-shadow': 'none',
  'sheet-background': '#FFFFFF',
  'sheet-text': '#111827',
  'sheet-muted-text': '#4B5563',
  'sheet-border': '#E5E7EB',
  'sheet-backdrop': 'rgba(17, 24, 39, 0.5)',
  'sheet-shadow': 'none',
  'chip-background': '#F3F4F6',
  'chip-text': '#111827',
  'link-text': '#0C66D7',
  'status-active': '#0C66D7',
  'status-done': '#007B3D',
  'status-blocked': '#C82F2C',
  'status-todo': '#9CA3AF',
  'status-neutral': '#6B7280',
  'error-background': '#FEF2F2',
  'error-border': '#C82F2C',
  'error-text': '#7F1D1D',
};

/** The flat look at night: bright solid planets with dark lettering, cut out from a near-black page. */
const FLAT_NIGHT: OrbitThemeTokens = {
  ...FLAT,
  surface: '#121418',
  text: '#F3F4F6',
  'muted-text': '#9CA3AF',
  'root-text': '#0B0D12',
  'node-text': '#0B0D12',
  'node-text-inverse': '#F3F4F6',
  'color-root': '#FFD25A',
  'color-1': '#FF9287',
  'color-2': '#3EC873',
  'color-3': '#7EB2FF',
  'color-4': '#C29FFF',
  'color-5': '#FF9657',
  'color-6': '#FF8BC1',
  'color-7': '#00C4C5',
  'shade-dark': '#121418',
  'node-stroke': '#121418',
  'badge-stroke': '#121418',
  'sun-halo': '#FFFFFF',
  'sun-halo-opacity': '0.55',
  'sun-halo-width': '4',
  'ring-stroke': '#FFFFFF',
  'link-stroke': '#FFFFFF',
  'link-opacity': '0.6',
  'focus-ring': '#7EB2FF',
  'note-indicator': '#F3F4F6',
  'control-background': '#1C1F26',
  'control-border': '#2D3139',
  'control-text': '#F3F4F6',
  'control-muted-text': '#9CA3AF',
  'control-active-background': '#F3F4F6',
  'control-active-text': '#121418',
  'tooltip-background': '#F3F4F6',
  'tooltip-text': '#121418',
  'action-background': '#1C1F26',
  'action-border': '#2D3139',
  'action-text': '#F3F4F6',
  'sheet-background': '#1A1D23',
  'sheet-text': '#F3F4F6',
  'sheet-muted-text': '#9CA3AF',
  'sheet-border': '#2D3139',
  'sheet-backdrop': 'rgba(0, 0, 0, 0.6)',
  'chip-background': '#262A32',
  'chip-text': '#E5E7EB',
  'link-text': '#7EB2FF',
  'status-active': '#7EB2FF',
  'status-done': '#3EC873',
  'status-blocked': '#FF9287',
  'status-todo': '#6B7280',
  'status-neutral': '#9CA3AF',
  'error-background': '#2A1517',
  'error-border': '#FF9287',
  'error-text': '#FECACA',
};

/** What Material themes share whatever their color: flat tonal surfaces, no rims or shadows on planets, raised controls. */
const MATERIAL_LOOK: Partial<OrbitThemeTokens> = {
  'label-weight': '550',
  'display-weight': '650',
  'label-letter-spacing': '0',
  'surface-pattern': 'none',
  'node-fill-opacity': '1',
  'moon-opacity': '1',
  'node-highlight': 'rgba(255, 255, 255, 0)',
  'node-terminator': 'rgba(0, 0, 0, 0)',
  'node-shading': 'rgba(0, 0, 0, 0)',
  'node-stroke-tint': '0%',
  'node-stroke-width': '0',
  'node-shadow-opacity': '0',
  'sun-shadow-opacity': '0',
  'sun-halo-tint': '0%',
  'sun-halo-opacity': '0.18',
  'sun-halo-width': '8',
  'sun-halo-dash': 'none',
  'sun-halo-size': '1.16',
  'ring-tint': '0%',
  'ring-opacity': '1',
  'ring-width': '1',
  'ring-dash': 'none',
  'link-tint': '0%',
  'link-opacity': '0.7',
  'link-width': '1.5',
  'link-dash': 'none',
  'control-border': 'transparent',
  'control-shadow': '0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 6px 2px rgba(0, 0, 0, 0.15)',
  'control-blur': '0px',
  'action-border': 'transparent',
  'action-shadow': '0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px 1px rgba(0, 0, 0, 0.15)',
  'sheet-backdrop': 'rgba(0, 0, 0, 0.32)',
  'sheet-shadow': '0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 8px 3px rgba(0, 0, 0, 0.15)',
  'sheet-blur': '0px',
};

/**
 * Material 3: tonal containers in hues spread around the wheel from
 * Material's baseline purple, the sun in its primary color, on a tonal
 * surface. `materialTheme(color)` builds the same look from any color; these
 * values are what it gives for Material's baseline color (`MATERIAL_SEED`).
 */
const MATERIAL: OrbitThemeTokens = {
  ...PAPER,
  ...MATERIAL_LOOK,
  surface: '#FAF9FF',
  text: '#1C1B21',
  'muted-text': '#484553',
  'root-text': '#1C1B21',
  'node-text': '#1C1B21',
  'node-text-inverse': '#FFFFFF',
  'color-root': '#6750A4',
  'color-1': '#DFD8FF',
  'color-2': '#FBD985',
  'color-3': '#BCE1FF',
  'color-4': '#FFD3C7',
  'color-5': '#76F0EA',
  'color-6': '#FFD0E9',
  'color-7': '#B3EBA5',
  'shade-light': '#C7C4D6',
  'shade-dark': '#787585',
  'node-stroke': '#C7C4D6',
  'badge-stroke': '#FAF9FF',
  'sun-halo': '#6750A4',
  'ring-stroke': '#C7C4D6',
  'link-stroke': '#787585',
  'focus-ring': '#6750A4',
  'note-indicator': '#6750A4',
  'control-background': '#EEEDF6',
  'control-text': '#1C1B21',
  'control-muted-text': '#484553',
  'control-active-background': '#E4DFFF',
  'control-active-text': '#1D182F',
  'tooltip-background': '#313036',
  'tooltip-text': '#F1F0F9',
  'action-background': '#E9E7F0',
  'action-text': '#1C1B21',
  'sheet-background': '#F4F2FB',
  'sheet-text': '#1C1B21',
  'sheet-muted-text': '#484553',
  'sheet-border': '#C7C4D6',
  'chip-background': '#E4DFFF',
  'chip-text': '#1D182F',
  'link-text': '#6750A4',
  'status-active': '#6750A4',
  'status-done': '#1C6D26',
  'status-blocked': '#B91B25',
  'status-todo': '#928F9F',
  'status-neutral': '#787585',
  'error-background': '#FFDAD6',
  'error-border': '#B91B25',
  'error-text': '#410004',
};

/** Material 3's dark scheme: deep tonal containers with light lettering, the sun in the light primary. */
const MATERIAL_NIGHT: OrbitThemeTokens = {
  ...NIGHT,
  ...MATERIAL_LOOK,
  'control-shadow': '0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 8px 3px rgba(0, 0, 0, 0.15)',
  surface: '#141318',
  text: '#E3E1EA',
  'muted-text': '#C7C4D6',
  'root-text': '#1C1B21',
  'node-text': '#1C1B21',
  'node-text-inverse': '#E3E1EA',
  'color-root': '#CBBEFF',
  'color-1': '#524084',
  'color-2': '#5F4800',
  'color-3': '#004F7B',
  'color-4': '#7F341F',
  'color-5': '#005552',
  'color-6': '#78335D',
  'color-7': '#245615',
  'shade-light': '#5F5D65',
  'shade-dark': '#201F25',
  'node-stroke': '#484553',
  'badge-stroke': '#141318',
  'sun-halo': '#CBBEFF',
  'ring-stroke': '#484553',
  'link-stroke': '#928F9F',
  'focus-ring': '#CBBEFF',
  'note-indicator': '#CBBEFF',
  'control-background': '#201F25',
  'control-text': '#E3E1EA',
  'control-muted-text': '#C7C4D6',
  'control-active-background': '#49435D',
  'control-active-text': '#E4DFFF',
  'tooltip-background': '#E3E1EA',
  'tooltip-text': '#313036',
  'action-background': '#2A2930',
  'action-text': '#E3E1EA',
  'sheet-background': '#1C1B21',
  'sheet-text': '#E3E1EA',
  'sheet-muted-text': '#C7C4D6',
  'sheet-border': '#484553',
  'chip-background': '#49435D',
  'chip-text': '#E4DFFF',
  'link-text': '#CBBEFF',
  'status-active': '#CBBEFF',
  'status-done': '#8AD88D',
  'status-blocked': '#FFB3AD',
  'status-todo': '#928F9F',
  'status-neutral': '#ACA9BA',
  'error-background': '#930014',
  'error-border': '#FFB3AD',
  'error-text': '#FFDAD6',
};

/**
 * Liquid glass: clear planets with a bright specular highlight, a white
 * rim and light caught along the far edge, over a vivid wallpaper of their
 * own that the glass lets through.
 */
const LIQUID: OrbitThemeTokens = {
  ...PAPER,
  'label-letter-spacing': '-0.01em',
  surface: '#E9EEF8',
  'surface-pattern': [
    'radial-gradient(70% 55% at 12% 14%, rgba(90, 140, 255, 0.55), transparent 70%)',
    'radial-gradient(60% 50% at 88% 20%, rgba(255, 120, 190, 0.5), transparent 70%)',
    'radial-gradient(70% 60% at 30% 92%, rgba(60, 220, 200, 0.45), transparent 72%)',
    'radial-gradient(55% 45% at 92% 88%, rgba(255, 190, 90, 0.55), transparent 70%)',
  ].join(', '),
  text: '#0F1630',
  'muted-text': '#3B4560',
  // Dark labels on every planet: the glass lets the light wallpaper through.
  'root-text': '#0F1630',
  'node-text': '#0F1630',
  'node-text-inverse': '#0F1630',
  'color-root': '#FFC83D',
  'color-1': '#FF6B7A',
  'color-2': '#2FD08A',
  'color-3': '#4DA3FF',
  'color-4': '#9B7BFF',
  'color-5': '#FF9A3D',
  'color-6': '#FF6FB5',
  'color-7': '#22C7D6',
  'shade-dark': '#0F1630',
  'node-fill-opacity': '0.32',
  'moon-opacity': '0.28',
  // Clear in the middle, with a lens edge: the shading's circle sits a little
  // to the bottom right, so light catches the rim all around, most at the top
  // left, just past a faint darker band where the glass bends the light.
  'node-highlight': 'rgba(255, 255, 255, 0)',
  'node-terminator': 'rgba(16, 24, 60, 0.07)',
  'node-shading': 'rgba(255, 255, 255, 0.95)',
  'node-shade-circle': '0.53 0.55 0.56',
  'node-stroke': '#FFFFFF',
  'node-stroke-tint': '0%',
  'node-stroke-width': '1.25',
  'node-shadow': '#1B2550',
  'node-shadow-tint': '0%',
  'node-shadow-opacity': '0.16',
  'node-shadow-offset': '0.14',
  'node-shadow-size': '1',
  'sun-shadow-opacity': '0.2',
  'sun-shadow-size': '1.02',
  'sun-halo': '#FFFFFF',
  'sun-halo-tint': '0%',
  'sun-halo-opacity': '0.9',
  'sun-halo-width': '1.5',
  'sun-halo-dash': 'none',
  'sun-halo-size': '1.1',
  'ring-stroke': '#FFFFFF',
  'ring-tint': '0%',
  'ring-opacity': '0.7',
  'ring-width': '1.25',
  'ring-dash': 'none',
  'link-stroke': '#FFFFFF',
  'link-tint': '0%',
  'link-opacity': '0.75',
  'link-dash': 'none',
  'note-indicator': '#0F1630',
  'control-background': 'rgba(255, 255, 255, 0.38)',
  'control-border': 'rgba(255, 255, 255, 0.75)',
  'control-text': '#0F1630',
  'control-muted-text': '#3B4560',
  'control-active-background': 'rgba(255, 255, 255, 0.85)',
  'control-active-text': '#0F1630',
  'control-shadow': '0 10px 30px rgba(20, 30, 70, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
  'control-blur': '24px',
  'tooltip-background': 'rgba(255, 255, 255, 0.88)',
  'tooltip-text': '#0F1630',
  'action-background': 'rgba(255, 255, 255, 0.55)',
  'action-border': 'rgba(255, 255, 255, 0.85)',
  'action-text': '#0F1630',
  'action-shadow': '0 6px 18px rgba(20, 30, 70, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
  'sheet-background': 'rgba(255, 255, 255, 0.7)',
  'sheet-text': '#0F1630',
  'sheet-muted-text': '#3B4560',
  'sheet-border': 'rgba(255, 255, 255, 0.8)',
  'sheet-backdrop': 'rgba(15, 22, 48, 0.25)',
  'sheet-shadow': '0 30px 80px rgba(20, 30, 70, 0.3)',
  'sheet-blur': '30px',
  'chip-background': 'rgba(255, 255, 255, 0.6)',
  'chip-text': '#1E293B',
  'link-text': '#1D4ED8',
};

/** Liquid glass at night: clear planets that glow in their own color over a deep, vivid wallpaper. */
const LIQUID_NIGHT: OrbitThemeTokens = {
  ...NIGHT,
  'label-letter-spacing': '-0.01em',
  'label-shadow': '0 1px 3px rgba(3, 6, 20, 0.6)',
  surface: '#070B1A',
  'surface-pattern': [
    'radial-gradient(70% 55% at 14% 12%, rgba(79, 70, 229, 0.55), transparent 70%)',
    'radial-gradient(60% 50% at 88% 22%, rgba(219, 39, 119, 0.42), transparent 70%)',
    'radial-gradient(70% 60% at 26% 94%, rgba(6, 182, 212, 0.36), transparent 72%)',
    'radial-gradient(55% 45% at 92% 90%, rgba(249, 115, 22, 0.32), transparent 70%)',
  ].join(', '),
  text: '#F5F7FF',
  'muted-text': '#B4BDD8',
  // Light labels on every planet: the glass lets the dark wallpaper through.
  'root-text': '#F8FAFF',
  'node-text': '#F8FAFF',
  'node-text-inverse': '#F8FAFF',
  'color-root': '#FFD66B',
  'color-1': '#FF6B8B',
  'color-2': '#34D399',
  'color-3': '#60A5FA',
  'color-4': '#A78BFA',
  'color-5': '#FB923C',
  'color-6': '#F472B6',
  'color-7': '#22D3EE',
  'shade-dark': '#070B1A',
  'node-fill-opacity': '0.2',
  'moon-opacity': '0.16',
  'node-highlight': 'rgba(255, 255, 255, 0)',
  'node-terminator': 'rgba(255, 255, 255, 0.04)',
  'node-shading': 'rgba(255, 255, 255, 0.7)',
  'node-shade-circle': '0.53 0.55 0.56',
  'node-stroke': 'rgba(255, 255, 255, 0.75)',
  'node-stroke-tint': '0%',
  'node-stroke-width': '1.25',
  'badge-stroke': '#070B1A',
  'node-shadow-opacity': '0.3',
  'node-shadow-size': '1.1',
  'sun-shadow-opacity': '0.45',
  'sun-shadow-size': '1.3',
  'sun-halo': '#FFFFFF',
  'sun-halo-tint': '0%',
  'sun-halo-opacity': '0.6',
  'sun-halo-width': '1.5',
  'sun-halo-dash': 'none',
  'sun-halo-size': '1.1',
  'ring-tint': '0%',
  'ring-opacity': '0.28',
  'ring-width': '1.25',
  'ring-dash': 'none',
  'link-tint': '0%',
  'link-opacity': '0.35',
  'link-dash': 'none',
  'note-indicator': '#F5F7FF',
  'control-background': 'rgba(255, 255, 255, 0.1)',
  'control-border': 'rgba(255, 255, 255, 0.22)',
  'control-text': '#F5F7FF',
  'control-muted-text': '#B4BDD8',
  'control-active-background': 'rgba(255, 255, 255, 0.9)',
  'control-active-text': '#070B1A',
  'control-shadow': '0 10px 30px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
  'control-blur': '24px',
  'tooltip-background': 'rgba(245, 247, 255, 0.92)',
  'tooltip-text': '#070B1A',
  'action-background': 'rgba(255, 255, 255, 0.12)',
  'action-border': 'rgba(255, 255, 255, 0.28)',
  'action-text': '#F5F7FF',
  'action-shadow': '0 6px 18px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
  'sheet-background': 'rgba(22, 28, 52, 0.72)',
  'sheet-text': '#F5F7FF',
  'sheet-muted-text': '#B4BDD8',
  'sheet-border': 'rgba(255, 255, 255, 0.18)',
  'sheet-backdrop': 'rgba(2, 4, 14, 0.5)',
  'sheet-shadow': '0 30px 80px rgba(0, 0, 0, 0.6)',
  'sheet-blur': '30px',
  'chip-background': 'rgba(255, 255, 255, 0.12)',
  'chip-text': '#E8ECFF',
};

export const ORBIT_THEME_PRESETS: Readonly<Record<OrbitThemeName, Readonly<OrbitThemeTokens>>> = {
  paper: PAPER,
  night: NIGHT,
  glass: GLASS,
  'glass-night': GLASS_NIGHT,
  cosmos: COSMOS,
  blueprint: BLUEPRINT,
  ink: INK,
  contrast: CONTRAST,
  flat: FLAT,
  'flat-night': FLAT_NIGHT,
  material: MATERIAL,
  'material-night': MATERIAL_NIGHT,
  liquid: LIQUID,
  'liquid-night': LIQUID_NIGHT,
};

/** Themes drawn on a dark background, so the browser's own widgets (scrollbars, form controls) match. */
const DARK_THEMES = new Set<OrbitThemeName>(['night', 'glass-night', 'cosmos', 'blueprint', 'flat-night', 'material-night', 'liquid-night']);

/** Whether `value` names a built-in theme: one of the presets or `auto`. */
export const isOrbitThemePreset = (value: unknown): value is OrbitThemePreset => {
  return typeof value === 'string' && (value === 'auto' || Object.prototype.hasOwnProperty.call(ORBIT_THEME_PRESETS, value));
};

/** The built-in theme a `theme` option starts from (registered names followed), `paper` when it names none. */
export const themeName = (theme: string | OrbitRendererTheme | undefined): OrbitThemePreset => {
  const expanded = expandTheme(theme);
  const preset = typeof expanded === 'string' ? expanded : expanded?.preset;
  return isOrbitThemePreset(preset) ? preset : 'paper';
};

const registeredThemes = new Map<string, OrbitRendererTheme>();

/**
 * Names a theme for every map, so `theme: 'brand'` works in options, in a
 * document's frontmatter and on `<orbit-map theme="brand">`. It starts from
 * `preset` (a built-in theme or another registered one) and sets its own
 * tokens. Returns a function that removes it again.
 */
export const registerTheme = (name: string, theme: OrbitRendererTheme): () => void => {
  if (isOrbitThemePreset(name)) {
    throw new Error(`"${name}" is one of Orbit's own themes; give yours another name.`);
  }

  if (!/^[\w-]+$/.test(name)) {
    throw new Error(`Theme names use letters, digits, "-" and "_", so they work in attributes and frontmatter: "${name}".`);
  }

  const definition: OrbitRendererTheme = { preset: theme.preset, tokens: { ...theme.tokens } };
  registeredThemes.set(name, definition);

  return () => {
    if (registeredThemes.get(name) === definition) {
      registeredThemes.delete(name);
    }
  };
};

/** Whether `value` names a theme: a built-in one, `auto`, or a registered one. */
export const isThemeName = (value: unknown): value is string => {
  return isOrbitThemePreset(value) || (typeof value === 'string' && registeredThemes.has(value));
};

/** Every theme name: the built-in ones, `auto`, then the registered ones. */
export const themeNames = (): string[] => {
  return [...Object.keys(ORBIT_THEME_PRESETS), 'auto', ...registeredThemes.keys()];
};

/**
 * A `theme` option with registered names replaced by what they stand for:
 * `'brand'` becomes its `{ preset, tokens }`, and `{ preset: 'brand', tokens }`
 * adds its own tokens on top of brand's.
 */
export const expandTheme = (theme: string | OrbitRendererTheme | undefined): string | OrbitRendererTheme | undefined => {
  let expanded = theme;

  // A registered theme may start from another; a few steps cover any sensible chain.
  for (let depth = 0; depth < 4; depth += 1) {
    const name = typeof expanded === 'string' ? expanded : expanded?.preset;
    const registered = name === undefined ? undefined : registeredThemes.get(name);

    if (!registered) {
      break;
    }

    expanded = typeof expanded === 'string' ? registered : { preset: registered.preset, tokens: { ...registered.tokens, ...expanded?.tokens } };
  }

  return expanded;
};

/**
 * Combines a `theme` option with one set before it, such as the document's
 * `theme:`: a theme object without a `preset` builds on the earlier theme
 * instead of replacing it.
 */
export const mergeThemes = (
  base: string | OrbitRendererTheme | undefined,
  override: string | OrbitRendererTheme | undefined,
): string | OrbitRendererTheme | undefined => {
  if (override === undefined || typeof override === 'string' || override.preset !== undefined || base === undefined) {
    return override ?? base;
  }

  const preset = typeof base === 'string' ? base : base.preset;
  return preset === undefined ? override : { ...override, preset };
};

/** Concrete token values for a theme name, built in or registered, e.g. for exports outside a page. `auto` resolves to `paper`. */
export const themeTokens = (name: string | undefined): OrbitThemeTokens => {
  const expanded = expandTheme(name);
  return resolveThemeTokens(themeName(expanded), typeof expanded === 'object' ? expanded : undefined);
};

/** A preset's values as written, where a token may refer to another (`var(--_orbit-font-family)`). */
const presetTokens = (preset: OrbitThemePreset | undefined): OrbitThemeTokens => {
  const name = preset ?? 'paper';
  return { ...ORBIT_THEME_PRESETS[name === 'auto' ? 'paper' : name] };
};

/**
 * Concrete values for every token: the preset's, then the theme object's,
 * then any the page resolved (`page`, already concrete). A token that refers
 * to another, such as the label font following `font-family`, follows it
 * through all three.
 */
export const resolveThemeTokens = (
  preset: OrbitThemePreset | undefined,
  theme?: OrbitRendererTheme,
  page: Partial<Record<OrbitThemeToken, string>> = {},
): OrbitThemeTokens => {
  return resolveTokenReferences({ ...presetTokens(preset), ...themeObjectTokens(theme), ...page }) as OrbitThemeTokens;
};

const resolveTokenReferences = (tokens: Record<string, string>): Record<string, string> => {
  const resolved: Record<string, string> = {};

  const resolve = (value: string, depth: number): string => {
    if (depth > 4 || !value.includes('var(')) {
      return value;
    }

    const substituted = value.replace(/var\(--_?orbit-([a-z0-9-]+)(?:\s*,\s*([^()]+))?\)/gi, (whole, token: string, fallback?: string) => {
      return tokens[token] ?? fallback?.trim() ?? whole;
    });

    return substituted === value ? value : resolve(substituted, depth + 1);
  };

  for (const [token, value] of Object.entries(tokens)) {
    resolved[token] = resolve(value, 0);
  }

  return resolved;
};

const tokenDeclarations = (tokens: OrbitThemeTokens): string => {
  return THEME_TOKENS.map((token) => `--_orbit-${token}:var(--orbit-${token},${tokens[token]});`).join('');
};

/**
 * Where the stylesheet mixes a node's own color into a theme color, with
 * `color-mix()`: what it paints, the theme color, the tint (how much of the
 * node's own color goes in) and the node's own color.
 */
interface ColorMix {
  paints: string;
  base: OrbitThemeToken;
  tint: OrbitThemeToken;
  own: string;
}

const MIXES: readonly ColorMix[] = [
  { paints: '.orbit-node__shade{stroke:', base: 'node-stroke', tint: 'node-stroke-tint', own: 'var(--orbit-node-color,var(--_orbit-node-stroke))' },
  { paints: '.orbit-node__shadow{fill:', base: 'node-shadow', tint: 'node-shadow-tint', own: 'var(--orbit-node-color)' },
  { paints: '.orbit-node__halo{stroke:', base: 'sun-halo', tint: 'sun-halo-tint', own: 'var(--orbit-node-color)' },
  { paints: '.orbit-ring{stroke:', base: 'ring-stroke', tint: 'ring-tint', own: 'var(--orbit-ring-color,var(--_orbit-ring-stroke))' },
  { paints: '.orbit-link{stroke:', base: 'link-stroke', tint: 'link-tint', own: 'var(--orbit-link-color,var(--_orbit-link-stroke))' },
];

/**
 * For browsers without `color-mix()`: each mix of a theme as one of its two
 * colors. The node's own only where the mix is mostly that: even a quarter
 * of the theme's color is what makes a sun's halo show on a light page.
 */
const plainMixes = (selector: string, tokens: OrbitThemeTokens): string => {
  return MIXES.map((mix) => `${selector} ${mix.paints}${parseFloat(tokens[mix.tint]) >= 75 ? mix.own : `var(--_orbit-${mix.base})`}}`).join('');
};

/** CSS that gives `.orbit[data-orbit-theme="…"]` each preset's token defaults. */
export const themeStylesheet = (): string => {
  const names = Object.keys(ORBIT_THEME_PRESETS) as OrbitThemeName[];
  const presets = names
    .map((name) => `.orbit[data-orbit-theme="${name}"]{${tokenDeclarations(ORBIT_THEME_PRESETS[name])}color-scheme:${DARK_THEMES.has(name) ? 'dark' : 'light'};}`)
    .join('');
  const automatic = `.orbit[data-orbit-theme="auto"]{${tokenDeclarations(PAPER)}color-scheme:light;}`
    + `@media (prefers-color-scheme: dark){.orbit[data-orbit-theme="auto"]{${tokenDeclarations(NIGHT)}color-scheme:dark;}}`;
  const plain = names.map((name) => plainMixes(`.orbit[data-orbit-theme="${name}"]`, ORBIT_THEME_PRESETS[name])).join('')
    + plainMixes('.orbit[data-orbit-theme="auto"]', PAPER)
    + `@media (prefers-color-scheme: dark){${plainMixes('.orbit[data-orbit-theme="auto"]', NIGHT)}}`;
  return presets + automatic + `@supports not (color: color-mix(in srgb, red, blue)){${plain}}`;
};

const PALETTE_TOKENS: OrbitThemeToken[] = ['color-root', 'color-1', 'color-2', 'color-3', 'color-4', 'color-5', 'color-6', 'color-7'];

const KNOWN_TOKENS = new Set<string>(THEME_TOKENS);

/** The token values a `theme` object sets. Unknown tokens and empty values are skipped. */
export const themeObjectTokens = (theme: OrbitRendererTheme | undefined): Partial<OrbitThemeTokens> => {
  const tokens: Partial<OrbitThemeTokens> = {};

  for (const [token, value] of Object.entries(theme?.tokens ?? {})) {
    if (KNOWN_TOKENS.has(token) && typeof value === 'string' && value !== '') {
      tokens[token as OrbitThemeToken] = value;
    }
  }

  return tokens;
};

/**
 * Custom properties to set inline on the map for a `theme` object. Each
 * value replaces the preset's default but still yields to a `--orbit-*`
 * property the page sets in its own CSS.
 */
export const themeOverrides = (theme: OrbitRendererTheme | undefined): Record<string, string> => {
  const properties: Record<string, string> = {};

  for (const [token, value] of Object.entries(themeObjectTokens(theme))) {
    properties[`--_orbit-${token}`] = `var(--orbit-${token}, ${value})`;
  }

  return properties;
};

/**
 * The colors nodes are painted with: the custom palette when given (first
 * entry for the root), otherwise the theme's palette tokens.
 */
export const resolvePalette = (palette: string[] | undefined): string[] => {
  if (palette && palette.length > 0) {
    return [...palette];
  }

  return PALETTE_TOKENS.map((token) => `var(--_orbit-${token})`);
};
