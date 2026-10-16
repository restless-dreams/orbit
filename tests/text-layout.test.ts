import { describe, test, expect } from 'bun:test';
import { breakUnits, characterWidths, graphemes, joinUnits, textEms, wrapText } from '../src/core/text-layout';
import { pillTextWidth } from '../src/core/engine/labels';

/** A lone half of a surrogate pair: a character cut in two. */
const BROKEN_CHARACTER = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe('wrapText', () => {
  test('returns one line when text fits', () => {
    const layout = wrapText('Hello', 200, 12);
    expect(layout.lines).toEqual(['Hello']);
    expect(layout.truncated).toBe(false);
  });

  test('wraps onto multiple lines', () => {
    const layout = wrapText('one two three four five six', 40, 12);
    expect(layout.lines.length).toBeGreaterThan(1);
  });

  test('truncates beyond maxLines with ellipsis', () => {
    const layout = wrapText('one two three four five six seven eight nine ten', 30, 12, 2);
    expect(layout.truncated).toBe(true);
    expect(layout.lines).toHaveLength(2);
    expect(layout.lines[1].endsWith('…')).toBe(true);
  });

  test('truncates a long single word that exceeds line width', () => {
    const layout = wrapText('supercalifragilisticexpialidocious', 30, 12);
    expect(layout.lines[0].endsWith('…')).toBe(true);
  });

  test('handles empty input', () => {
    const layout = wrapText('', 100, 12);
    expect(layout.lines).toEqual([]);
    expect(layout.totalHeight).toBe(0);
  });
});

describe('text in any script', () => {
  test('Latin text wraps as it always has', () => {
    expect(wrapText('one two three four five six', 40, 12).lines).toEqual(['one', 'two', 'three…']);
  });

  test('CJK text wraps between its characters, and is measured as wide', () => {
    const layout = wrapText('研究开发计划与市场调研', 60, 12);
    expect(layout.lines).toEqual(['研究开发计', '划与市场调', '研']);

    for (const line of layout.lines) {
      expect(textEms(line) * 12).toBeLessThanOrEqual(60);
    }

    expect(wrapText('Orbit 研究开发计划', 60, 12).lines).toEqual(['Orbit 研', '究开发计划']);
  });

  test('cuts never split an emoji', () => {
    for (const text of ['🚀🚀🚀🚀🚀🚀🚀🚀', '👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧', 'ab🚀🚀🚀🚀🚀🚀']) {
      const layout = wrapText(text, 30, 12, 1);
      expect(layout.lines[0].endsWith('…')).toBe(true);
      expect(BROKEN_CHARACTER.test(layout.lines.join(''))).toBe(false);
    }

    expect(wrapText('👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧', 30, 12, 1).lines[0]).toBe('👨‍👩‍👧…');
  });

  test('Latin text counts a character per grapheme; emoji keep their modifiers', () => {
    expect(graphemes('naïve\u200acafé')).toEqual(['n', 'a', 'ï', 'v', 'e', '\u200a', 'c', 'a', 'f', 'é']);
    expect(characterWidths('contact_\u200aid')).toEqual({ narrow: 11, wide: 0 });
    expect(graphemes('ok 👍🏽')).toEqual(['o', 'k', ' ', '👍🏽']);
    expect(breakUnits('mail_pieces 研究').map((unit) => unit.text)).toEqual(['mail_', 'pieces', '研', '究']);
  });

  test('widths: narrow characters are a little over half an em, CJK and emoji a whole one', () => {
    expect(textEms('Hello')).toBeCloseTo(2.75);
    expect(textEms('研究')).toBe(2);
    expect(textEms('🚀')).toBe(1);
    expect(textEms('👨‍👩‍👧')).toBe(1);
  });

  test('pills: CJK is measured wide and can break onto two lines', () => {
    expect(pillTextWidth('Launch', 1)).toBeCloseTo(38.4);
    expect(pillTextWidth('研究开发', 1)).toBe(46);
    expect(pillTextWidth('研究开发', 2)).toBe(23);
    expect(pillTextWidth('Night markets', 2)).toBeCloseTo(44.8);
  });
});

describe('where long words break', () => {
  const pieces = (value: string) => breakUnits(value).map((unit) => `${unit.spaced ? ' ' : ''}${unit.text}`);

  test('identifiers break after underscores, slashes and hyphens, and between camelCase words', () => {
    expect(pieces('contact_tec_mail_address_key')).toEqual(['contact_', 'tec_', 'mail_', 'address_', 'key']);
    expect(pieces('docs/format-guide')).toEqual(['docs/', 'format-', 'guide']);
    expect(pieces('startedAt')).toEqual(['started', 'At']);
  });

  test('dots and colons break only before a letter, so numbers stay whole', () => {
    expect(pieces('format.md version 3.5')).toEqual(['format.', 'md', ' version', ' 3.5']);
  });

  test('a no-break space keeps its neighbors together', () => {
    expect(pieces('🔢\u00a0status code')).toEqual(['🔢\u00a0status', ' code']);
  });

  test('joining the pieces gives the text back', () => {
    for (const value of ['contact_tec_mail_address_key', 'docs/format-guide', 'startedAt and more', '研究 plan_b']) {
      expect(joinUnits(breakUnits(value))).toBe(value);
    }
  });

  test('wrapped identifiers break where they read', () => {
    expect(wrapText('contact_tec_mail_address_key', 64, 10, 4).lines).toEqual(['contact_', 'tec_mail_', 'address_key']);
  });
});
