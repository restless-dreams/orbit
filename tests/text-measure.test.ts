import { describe, expect, test } from 'bun:test';
import { COUNT_ESTIMATE, ESTIMATED_LABELS, INSIDE_ESTIMATE, LabelFonts, PILL_ESTIMATE, onMeasurementsReset, resetMeasurements, type TextMeasure } from '../src/core/engine/text-measure';
import { insideLabelLayout, labelPlacement, measureCount } from '../src/core/engine/views';
import { pillTextWidth } from '../src/core/engine/labels';
import { graphemes, wrapText } from '../src/core/text-layout';

/**
 * A font whose every character but the space is `width` ems wide, a little
 * wider below 12 px, as fonts with optical sizes draw small text.
 */
const uniformFont = (key: string, width: number, spaceWidth = 0.25, narrower: TextMeasure | null = null, stretch = 100): TextMeasure & { width: number } => {
  return {
    key,
    bySize: true,
    stretch,
    width,
    ems(text: string, fontSize: number) {
      const characters = graphemes(text);
      const spaces = characters.filter((character) => character === ' ').length;
      return (characters.length - spaces) * (this.width + (fontSize < 12 ? 0.02 : 0)) + spaces * spaceWidth;
    },
    space: () => spaceWidth,
    ellipsis: () => 0.7,
    narrower: () => narrower,
  };
};

describe('estimated widths', () => {
  test('count wide characters (CJK, emoji) as an em and the rest as a little over half', () => {
    expect(INSIDE_ESTIMATE.ems('Hello', 13)).toBeCloseTo(5 * 0.58, 10);
    expect(INSIDE_ESTIMATE.ems('研究', 13)).toBe(2);
    // An emoji drawn as one picture counts once, however many code points make it.
    expect(INSIDE_ESTIMATE.ems('👨‍👩‍👧', 13)).toBe(1);
    expect(INSIDE_ESTIMATE.bySize).toBe(false);
  });

  test('are what labels are fitted with where nothing measures, as in these tests', () => {
    expect(ESTIMATED_LABELS.inside('planet')).toBe(INSIDE_ESTIMATE);
    expect(ESTIMATED_LABELS.pill('sun')).toBe(PILL_ESTIMATE);
    expect(ESTIMATED_LABELS.count()).toBe(COUNT_ESTIMATE);
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    const fonts = new LabelFonts(layer, () => undefined);
    expect(fonts.inside('planet')).toBe(INSIDE_ESTIMATE);
    expect(fonts.pill('moon')).toBe(PILL_ESTIMATE);
    expect(fonts.count()).toBe(COUNT_ESTIMATE);
    fonts.destroy();
    layer.remove();
  });
});

describe('measured widths', () => {
  test('let a narrow font show a name whole and larger where the estimate would cut it', () => {
    const narrow = uniformFont('narrow', 0.42);
    const estimated = insideLabelLayout('planet', 34, 'Customer interviews and usability tests');
    const measured = insideLabelLayout('planet', 34, 'Customer interviews and usability tests', false, narrow);
    expect(estimated?.truncated ?? true).toBe(true);
    expect(measured).toMatchObject({ truncated: false });
    expect(measured!.lines.join(' ')).toBe('Customer interviews and usability tests');
  });

  test('keep a wide font inside its node: every line fits the circle where it sits', () => {
    const wide = uniformFont('wide', 0.7);

    for (const radius of [24, 32, 48, 64, 90]) {
      const layout = insideLabelLayout('planet', radius, 'Presupuesto de marketing para el lanzamiento', false, wide);

      if (!layout) {
        continue;
      }

      const lineHeight = layout.fontSize * 1.22;
      const top = -(layout.lines.length * lineHeight) / 2;
      const room = radius - Math.max(2, radius * 0.05);

      layout.lines.forEach((line, index) => {
        const y = top + (index + 0.5) * lineHeight;
        const chord = 2 * Math.sqrt(room * room - y * y);
        expect(wide.ems(line, layout.fontSize) * layout.fontSize).toBeLessThanOrEqual(chord + 1e-6);
      });
    }
  });

  test('fits are kept apart by font: the same name in two fonts fits each its own way', () => {
    const narrow = uniformFont('narrow-2', 0.4);
    const wide = uniformFont('wide-2', 0.75);
    const inNarrow = insideLabelLayout('planet', 40, 'Social media calendar', false, narrow);
    const inWide = insideLabelLayout('planet', 40, 'Social media calendar', false, wide);
    expect(inNarrow).not.toEqual(inWide);
    expect(inNarrow!.fontSize).toBeGreaterThanOrEqual(inWide?.fontSize ?? 0);
  });

  test('size a "+N" by its font: the plus sign and its figures, all as wide as a 0, and its padding', () => {
    const font = uniformFont('count', 0.6);
    // Text under 12 px is measured a little wider in this font, as fonts with optical sizes draw it.
    expect(measureCount(7, font)).toBeCloseTo(12 + 2 * 0.62 * 10.5, 10);
    expect(measureCount(12, font)).toBeCloseTo(12 + 3 * 0.62 * 10.5, 10);
    expect(measureCount(140, font)).toBeCloseTo(12 + 4 * 0.62 * 10.5, 10);
    expect(measureCount(7)).toBeCloseTo(12 + 2 * 0.7 * 10.5, 10);
  });

  test('size pills by the font too', () => {
    const font = uniformFont('pill', 0.5);
    expect(pillTextWidth('abcd', 1, font)).toBeCloseTo(4 * 0.52 * 11.5, 10);
    expect(pillTextWidth('abcd', 1)).toBeCloseTo(4 * 6.4, 10);
  });

  test('wrap exported text by the font when one measures it', () => {
    const wide = uniformFont('wrap', 1.1);
    expect(wrapText('one two three', 60, 12, 3, wide).lines).toEqual(['one', 'two', 'thr…']);
    expect(wrapText('one two three', 60, 12, 3).lines).toEqual(['one two', 'three']);
  });

  test('start over when a font finishes loading', () => {
    const font = uniformFont('loading', 0.5);
    const before = insideLabelLayout('planet', 30, 'Weekly sync notes', false, font);
    font.width = 0.9;
    // Measured once, the fit is kept…
    expect(insideLabelLayout('planet', 30, 'Weekly sync notes', false, font)).toEqual(before);
    let told = 0;

    const stop = onMeasurementsReset(() => {
      told += 1;
    });

    // …until measurements start over, when every map hears it and fits again.
    resetMeasurements();
    stop();
    expect(told).toBe(1);
    expect(insideLabelLayout('planet', 30, 'Weekly sync notes', false, font)).not.toEqual(before);
  });
});

describe('line breaks', () => {
  test('balance a name over its lines, so it follows the circle instead of crowding the first line', () => {
    const font = uniformFont('balance', 0.55);

    // Two lines of the same width: "Lanzamiento en / México" would leave the second nearly empty.
    for (const radius of [36, 40, 44]) {
      const layout = insideLabelLayout('planet', radius, 'Lanzamiento en México', false, font);

      if (layout && layout.lines.length === 2) {
        expect(layout.lines).toEqual(['Lanzamiento', 'en México']);
      }
    }

    // However many lines, the fullest line is no fuller than filling them in order would leave it.
    for (const name of ['Plan the launch of the new app', 'Presupuesto de marketing para el lanzamiento', 'Social media calendar for the spring']) {
      for (const radius of [30, 40, 52, 64]) {
        const layout = insideLabelLayout('planet', radius, name, false, font);

        if (!layout || layout.truncated) {
          continue;
        }

        expect(layout.lines.join(' ')).toBe(name);
        const fullest = (lines: string[]) => Math.max(...lines.map((line) => font.ems(line, layout.fontSize)));
        const greedy = wrapText(name, layout.width, layout.fontSize, layout.lines.length, font).lines;
        expect(fullest(layout.lines)).toBeLessThanOrEqual(fullest(greedy) + 1e-9);
      }
    }
  });

  test('draw a name in a narrower width of its font when that shows it whole, and only then', () => {
    const condensed = uniformFont('flex-condensed', 0.47, 0.22, null, 75);
    const semiCondensed = uniformFont('flex-semi-condensed', 0.53, 0.24, condensed, 87.5);
    const flex = uniformFont('flex', 0.6, 0.25, semiCondensed);
    const plain = uniformFont('plain', 0.6, 0.25);
    const name = 'Pricing and plans for teams and schools';
    // Without a width axis, the name is cut short…
    expect(insideLabelLayout('planet', 36, name, false, plain)).toMatchObject({ truncated: true });
    // …with one, it shows whole, as wide as it can still be.
    const narrow = insideLabelLayout('planet', 36, name, false, flex);
    expect(narrow).toMatchObject({ truncated: false });
    expect([87.5, 75]).toContain(narrow!.stretch ?? 100);
    expect(narrow!.lines.join(' ')).toBe(name);
    // A name that fits at the font's own width keeps it.
    expect(insideLabelLayout('planet', 36, 'Pricing', false, flex)?.stretch).toBeUndefined();
  });

  test('place labels with the measure the map gives', () => {
    const font = uniformFont('placement', 0.3);
    expect(labelPlacement('planet', 16, 'Pricing', false)).toBe('hidden');
    expect(labelPlacement('planet', 16, 'Pricing', false, false, font)).toBe('inside');
  });
});
