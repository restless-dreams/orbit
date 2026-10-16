/**
 * How wide label text is, in ems of the font it's drawn with. In a browser,
 * names are measured with the fonts the page gives the map's labels (each
 * theme's, a node type's own, a page's brand font), so a name fills its
 * node as far as it really reaches and never spills out of it. Where there's
 * no canvas to measure with (a server, tests), widths are estimated from the
 * kind of each character.
 */

import type { OrbitNode } from '../types.js';
import type { MapExtensions } from '../extensions.js';
import type { OrbitThemeToken } from '../themes.js';
import type { NodeRole } from './scene.js';
import { WIDE_CHARACTER, characterWidths, graphemes } from '../text-layout.js';

/** Text widths in one font. */
export interface TextMeasure {
  /** Equal keys measure alike: caches of fitted labels are kept by it. */
  readonly key: string;

  /** Whether widths in ems differ by font size (fonts with optical sizes); estimates don't. */
  readonly bySize: boolean;

  /** The width of `text` on one line at `fontSize` px, in ems. */
  ems(text: string, fontSize: number): number;

  /** The space between two words, in ems. */
  space(fontSize: number): number;

  /** The ellipsis a cut name ends with, in ems. */
  ellipsis(fontSize: number): number;

  /** How wide the font draws, as `font-stretch` (a percentage of its normal width). */
  readonly stretch: number;

  /**
   * The same font drawn narrower, for names that don't fit at its width,
   * or null when it has no narrower width (most fonts don't: only those
   * with a width axis or condensed faces do).
   */
  narrower(): TextMeasure | null;
}

/** The measures a map's labels are fitted with: names inside nodes, pills beside them, and the "+N" names keep clear of. */
export interface LabelMeasures {
  /** Equal keys measure alike. */
  readonly key: string;

  /** For a node's name inside it. */
  inside(role: NodeRole, node?: OrbitNode): TextMeasure;

  /** For a node's name on its pill. */
  pill(role: NodeRole, node?: OrbitNode): TextMeasure;

  /** For the "+N" a node shows for children that aren't drawn. */
  count(): TextMeasure;
}

/** Widths estimated from the kind of each character: wide ones (CJK, emoji) take an em, the rest `narrow`. */
class EstimatedMeasure implements TextMeasure {
  readonly key: string;
  readonly bySize = false;
  readonly stretch = 100;
  private readonly narrow: number;
  private readonly spaceWidth: number;
  private readonly ellipsisWidth: number;

  constructor(narrow: number, spaceWidth: number, ellipsisWidth: number) {
    this.narrow = narrow;
    this.spaceWidth = spaceWidth;
    this.ellipsisWidth = ellipsisWidth;
    this.key = `estimate ${narrow}`;
  }

  ems(text: string): number {
    // One character at a time, when a cut name is filled to its ellipsis.
    if (text.length === 1) {
      return WIDE_CHARACTER.test(text) ? 1 : this.narrow;
    }

    const { narrow, wide } = characterWidths(text);
    return narrow * this.narrow + wide;
  }

  space(): number {
    return this.spaceWidth;
  }

  ellipsis(): number {
    return this.ellipsisWidth;
  }

  narrower(): TextMeasure | null {
    return null;
  }
}

/** A name inside its node: semibold UI fonts average a little under 0.58 em a character. */
export const INSIDE_ESTIMATE: TextMeasure = new EstimatedMeasure(0.58, 0.3, 0.8);
/** A name on a pill: 6.4 px a character in its 11.5 px text. */
export const PILL_ESTIMATE: TextMeasure = new EstimatedMeasure(6.4 / 11.5, 0.3, 0.8);
/** A "+N": its plus sign and figures, in semibold text, take a little over two thirds of an em each. */
export const COUNT_ESTIMATE: TextMeasure = new EstimatedMeasure(0.7, 0.3, 0.8);

/** Estimates for every label, where nothing can be measured. */
export const ESTIMATED_LABELS: LabelMeasures = {
  key: 'estimate',
  inside: () => INSIDE_ESTIMATE,
  pill: () => PILL_ESTIMATE,
  count: () => COUNT_ESTIMATE,
};

type MeasuringContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * The two sizes text is measured at. Labels are drawn between them, and
 * fonts with optical sizes draw small text wider: widths at the sizes in
 * between are interpolated.
 */
const SMALL_SIZE = 9;
const LARGE_SIZE = 16;

/** What a label's font is, as the page computes it. */
export interface LabelFont {
  family: string;
  weight: string;
  style: string;

  /** `font-stretch`, as a percentage of the normal width. */
  stretch: number;

  /** Space after each character, in ems. */
  letterSpacing: number;
}

/** The canvas keyword for a width, as `font-stretch` percentages map to them. */
const stretchKeyword = (stretch: number): string => {
  const keywords: [number, string][] = [
    [50, 'ultra-condensed'], [62.5, 'extra-condensed'], [75, 'condensed'], [87.5, 'semi-condensed'], [100, 'normal'],
    [112.5, 'semi-expanded'], [125, 'expanded'], [150, 'extra-expanded'], [200, 'ultra-expanded'],
  ];
  let nearest = keywords[4];

  for (const keyword of keywords) {
    if (Math.abs(keyword[0] - stretch) < Math.abs(nearest[0] - stretch)) {
      nearest = keyword;
    }
  }

  return nearest[1];
};

/** The widths a name tries, narrowest last, when it doesn't fit at its font's own: semi-condensed, then condensed. */
const NARROWER_WIDTHS = [87.5, 75];
/** A narrower width counts only if it draws text at least this much narrower. */
const NOTICEABLY_NARROWER = 0.97;

/**
 * Text in scripts that draw each letter on its own (Latin, Greek, Cyrillic,
 * with digits, punctuation and spaces): its width is the sum of its
 * letters', give or take kerning, which only ever makes a word narrower.
 * Measuring letters instead of words takes a canvas call per letter of the
 * alphabet, not per name: a big map brings hundreds of new names into view
 * at a time.
 */
const LETTER_BY_LETTER = /^[\u0020-\u052F\u1E00-\u1FFF\u2000-\u206F\u20A0-\u20BF]*$/;

/** Text measured in a font with a canvas, at two sizes, interpolated between them. */
class CanvasMeasure implements TextMeasure {
  readonly key: string;
  readonly bySize = true;
  private readonly context: MeasuringContext;
  private readonly font: LabelFont;
  private readonly widths = new Map<string, [number, number]>();
  private readonly letters = new Map<string, [number, number]>();
  private narrowerMeasure: TextMeasure | null | undefined;

  constructor(context: MeasuringContext, font: LabelFont, key: string) {
    this.context = context;
    this.font = font;
    this.key = key;
  }

  ems(text: string, fontSize: number): number {
    let widths = this.widths.get(text);

    if (!widths) {
      widths = LETTER_BY_LETTER.test(text) ? this.sumOfLetters(text) : [this.measure(text, SMALL_SIZE), this.measure(text, LARGE_SIZE)];

      if (this.widths.size >= MEASURED_TEXTS_LIMIT) {
        this.widths.clear();
      }

      this.widths.set(text, widths);
    }

    const share = Math.min(1, Math.max(0, (fontSize - SMALL_SIZE) / (LARGE_SIZE - SMALL_SIZE)));
    return widths[0] + (widths[1] - widths[0]) * share;
  }

  space(fontSize: number): number {
    return this.ems(' ', fontSize);
  }

  ellipsis(fontSize: number): number {
    return this.ems('…', fontSize);
  }

  get stretch(): number {
    return this.font.stretch;
  }

  narrower(): TextMeasure | null {
    if (this.narrowerMeasure !== undefined) {
      return this.narrowerMeasure;
    }

    this.narrowerMeasure = null;
    const stretch = NARROWER_WIDTHS.find((width) => width < this.font.stretch);

    if (stretch !== undefined && 'fontStretch' in this.context) {
      const narrower = measureFor({ ...this.font, stretch });
      const sample = 'Orbit names';

      if (narrower && narrower.ems(sample, 13) < this.ems(sample, 13) * NOTICEABLY_NARROWER) {
        this.narrowerMeasure = narrower;
      }
    }

    return this.narrowerMeasure;
  }

  private sumOfLetters(text: string): [number, number] {
    let small = 0;
    let large = 0;

    for (const letter of text) {
      let widths = this.letters.get(letter);

      if (!widths) {
        widths = [this.measure(letter, SMALL_SIZE), this.measure(letter, LARGE_SIZE)];
        this.letters.set(letter, widths);
      }

      small += widths[0];
      large += widths[1];
    }

    return [small, large];
  }

  private measure(text: string, size: number): number {
    const { context, font } = this;
    context.font = `${font.style} ${font.weight} ${size}px ${font.family}`;

    if ('fontStretch' in context) {
      context.fontStretch = stretchKeyword(font.stretch) as CanvasFontStretch;
    }

    const spacing = font.letterSpacing === 0 ? 0 : font.letterSpacing * graphemes(text).length;
    return context.measureText(text).width / size + spacing;
  }
}

/** More texts than the largest maps have; past it, a font's measurements start over. */
const MEASURED_TEXTS_LIMIT = 50000;

let sharedContext: MeasuringContext | null | undefined;

/** A canvas to measure with, or null where there's none that measures (a server, a DOM without canvas). */
const measuringContext = (): MeasuringContext | null => {
  if (sharedContext !== undefined) {
    return sharedContext;
  }

  sharedContext = null;

  try {
    let context: MeasuringContext | null = null;

    if (typeof OffscreenCanvas === 'function') {
      context = new OffscreenCanvas(1, 1).getContext('2d');
    }

    if (!context && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      context = document.createElement('canvas').getContext('2d');
    }

    // A stand-in canvas (some test DOMs have one) measures nothing: estimates are better than zeros.
    if (context && typeof context.measureText === 'function') {
      context.font = '16px sans-serif';

      if (context.measureText('Orbit').width > 0) {
        sharedContext = context;
      }
    }
  } catch {
    sharedContext = null;
  }

  if (sharedContext) {
    watchFontLoads();
  }

  return sharedContext;
};

/** Measures by font, shared by every map that draws with the same one. */
const canvasMeasures = new Map<string, CanvasMeasure>();
/** Names the measures: their keys go into the cache key of every label fitted each frame, so they're short. */
let measureCount = 0;

/** The measure for a font, or null when nothing can measure it. */
export const measureFor = (font: LabelFont): TextMeasure | null => {
  const context = measuringContext();

  if (!context || !font.family) {
    return null;
  }

  const spec = `${font.style} ${font.weight} ${font.stretch}% ${font.letterSpacing} ${font.family}`;
  let measure = canvasMeasures.get(spec);

  if (!measure) {
    measureCount += 1;
    measure = new CanvasMeasure(context, font, `font ${measureCount}`);
    canvasMeasures.set(spec, measure);
  }

  return measure;
};

const resetListeners = new Set<() => void>();

/**
 * Calls `listener` whenever measurements start over: a font finished loading,
 * so text measured while the page drew it with a fallback measures anew.
 * Returns a function that stops listening.
 */
export const onMeasurementsReset = (listener: () => void): () => void => {
  resetListeners.add(listener);

  return () => {
    resetListeners.delete(listener);
  };
};

/** Forgets every measurement, and tells whoever keeps fits made from them. */
export const resetMeasurements = (): void => {
  canvasMeasures.clear();

  for (const listener of Array.from(resetListeners)) {
    listener();
  }
};

let watchingFonts = false;

/** Measures again when the page's fonts finish loading: until then a name may have been measured in a fallback font. */
const watchFontLoads = (): void => {
  if (watchingFonts || typeof document === 'undefined') {
    return;
  }

  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;

  if (!fonts || typeof fonts.addEventListener !== 'function') {
    return;
  }

  watchingFonts = true;
  fonts.addEventListener('loadingdone', () => resetMeasurements());
};

/** Font properties that set how wide text is, among a node type's tokens. */
const FONT_TOKENS: OrbitThemeToken[] = ['font-family', 'label-font', 'display-font', 'label-weight', 'display-weight', 'label-letter-spacing'];

/**
 * The fonts a map's labels are drawn with, read from the page: a hidden
 * label of each kind in the map's label layer, so the theme, the page's
 * own CSS and a node type's tokens all count. Read again when `refresh` is
 * called (the theme or the page may have changed), not on every frame.
 */
export class LabelFonts implements LabelMeasures {
  private readonly layer: HTMLElement;
  private readonly extensions: () => MapExtensions | undefined;

  /** A hidden box in the label layer holding a label of each kind, to read its font from. */
  private shelf: HTMLElement | null = null;

  private probes = new Map<string, HTMLElement>();

  /** By kind of label (and node type with a font of its own); null where nothing measures. */
  private measures = new Map<string, TextMeasure | null>();

  /** The sun's and other nodes' measures, for nodes without a type: looked up for every label on every frame. */
  private sunMeasure: TextMeasure | null | undefined;

  private nameMeasure: TextMeasure | null | undefined;

  /** The "+N"'s measure: looked up for every label on every frame. */
  private countMeasure: TextMeasure | null | undefined;

  private stale = true;
  private currentKey = 'estimate';

  /** A recheck waiting for the page to be idle (see `recheckWhenIdle`). */
  private recheck: { cancel: () => void } | null = null;

  constructor(layer: HTMLElement, extensions: () => MapExtensions | undefined) {
    this.layer = layer;
    this.extensions = extensions;
  }

  /** Equal keys measure alike: a change of font changes the key. */
  get key(): string {
    this.read();
    return this.currentKey;
  }

  /** The theme, the page or the fonts may have changed: read the fonts again before the next fit. */
  refresh(): void {
    this.stale = true;
  }

  inside(role: NodeRole, node?: OrbitNode): TextMeasure {
    return this.measure(role, node) ?? INSIDE_ESTIMATE;
  }

  pill(role: NodeRole, node?: OrbitNode): TextMeasure {
    return this.measure(role, node) ?? PILL_ESTIMATE;
  }

  count(): TextMeasure {
    if (this.stale) {
      this.read();
    }

    if (this.countMeasure === undefined) {
      const font = this.computedFont('count', 'orbit-count', undefined);
      this.countMeasure = font ? measureFor(font) : null;
    }

    return this.countMeasure ?? COUNT_ESTIMATE;
  }

  /**
   * Once the page is idle, reads the fonts again and calls `changed` if they
   * differ: a page may switch its fonts at any time (a class, a brand font).
   * Off the frames that draw, so reading doesn't make one late.
   */
  recheckWhenIdle(changed: () => void): void {
    if (this.recheck || measuringContext() === null) {
      return;
    }

    const run = () => {
      this.recheck = null;
      const before = this.key;
      this.refresh();

      if (this.key !== before) {
        changed();
      }
    };

    const idle = (globalThis as { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;

    if (typeof idle === 'function') {
      const handle = idle(run, { timeout: 2000 });
      this.recheck = { cancel: () => (globalThis as { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback?.(handle) };
    } else {
      const handle = setTimeout(run, 250);
      this.recheck = { cancel: () => clearTimeout(handle) };
    }
  }

  /** Takes the hidden labels out of the page. */
  destroy(): void {
    this.recheck?.cancel();
    this.recheck = null;
    this.shelf?.remove();
    this.shelf = null;
    this.probes.clear();
    this.measures.clear();
  }

  private read(): void {
    if (!this.stale) {
      return;
    }

    this.stale = false;
    this.measures.clear();
    this.sunMeasure = undefined;
    this.nameMeasure = undefined;
    this.countMeasure = undefined;
    const keys = [this.measure('planet'), this.measure('sun'), this.count()].map((measure) => measure?.key ?? 'estimate');
    this.currentKey = keys.join(' | ');
  }

  private measure(role: NodeRole, node?: OrbitNode): TextMeasure | null {
    if (this.stale) {
      this.read();
    }

    const type = node ? this.extensions()?.typeName(node) ?? node.type : undefined;

    if (!node || !type) {
      if (role === 'sun') {
        if (this.sunMeasure === undefined) {
          this.sunMeasure = this.measureOf('sun', role, undefined);
        }

        return this.sunMeasure;
      }

      if (this.nameMeasure === undefined) {
        this.nameMeasure = this.measureOf('name', role, undefined);
      }

      return this.nameMeasure;
    }

    // A node type may set its own font: measured on its own, or as untyped nodes are.
    const key = `${role === 'sun' ? 'sun' : 'name'} ${type.toLowerCase()}`;
    const known = this.measures.get(key);

    if (known !== undefined || this.measures.has(key)) {
      return known ?? null;
    }

    const tokens = this.extensions()?.nodeType(node)?.tokens;
    const ownFont = tokens !== undefined && FONT_TOKENS.some((token) => typeof tokens[token] === 'string' && tokens[token] !== '');
    const measure = ownFont ? this.measureOf(key, role, tokens) : this.measure(role);
    this.measures.set(key, measure);
    return measure;
  }

  private measureOf(key: string, role: NodeRole, tokens: Record<string, unknown> | undefined): TextMeasure | null {
    const font = this.computedFont(key, `orbit-label orbit-label--${role === 'sun' ? 'sun' : 'planet'}`, tokens);
    return font ? measureFor(font) : null;
  }

  /** The font of a hidden element of `className` (a label, or a "+N") in the label layer, with a node type's `tokens`. */
  private computedFont(key: string, className: string, tokens: Record<string, unknown> | undefined): LabelFont | null {
    if (typeof getComputedStyle !== 'function' || !this.layer.isConnected || measuringContext() === null) {
      return null;
    }

    let probe = this.probes.get(key);

    if (!probe) {
      const document = this.layer.ownerDocument;

      if (!this.shelf) {
        this.shelf = document.createElement('div');
        this.shelf.className = 'orbit__font-probes';
        this.shelf.style.display = 'none';
        this.shelf.setAttribute('aria-hidden', 'true');
        this.layer.appendChild(this.shelf);
      }

      probe = document.createElement('div');
      probe.className = className;

      for (const [token, value] of Object.entries(tokens ?? {})) {
        if (typeof value === 'string' && value !== '') {
          probe.style.setProperty(`--_orbit-${token}`, value);
        }
      }

      this.shelf.appendChild(probe);
      this.probes.set(key, probe);
    }

    const style = getComputedStyle(probe);
    const fontSize = Number.parseFloat(style.fontSize) || 13;
    const spacing = Number.parseFloat(style.letterSpacing);
    const stretch = Number.parseFloat(style.fontStretch);

    if (!style.fontFamily) {
      return null;
    }

    return {
      family: style.fontFamily,
      weight: style.fontWeight || '400',
      style: style.fontStyle || 'normal',
      stretch: Number.isFinite(stretch) ? stretch : 100,
      letterSpacing: Number.isFinite(spacing) ? spacing / fontSize : 0,
    };
  }
}
