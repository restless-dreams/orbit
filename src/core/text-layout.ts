/**
 * Text broken into pieces and wrapped, for labels in exported SVGs and for
 * planning where labels go. Without a font to measure with, widths are
 * estimates from the kind of each character: CJK, kana, Hangul and emoji
 * are about as wide as the font is tall, and other letters a little over
 * half that.
 */

import type { TextMeasure } from './engine/text-measure.js';

export interface TextLayout {
  lines: string[];
  truncated: boolean;
  lineHeight: number;
  totalHeight: number;
}

/** Average width of a narrow character, in ems. */
export const NARROW_EMS = 0.55;

/**
 * Characters about as wide as the font is tall: Hangul jamo, CJK (radicals
 * and punctuation through ideographs, kana, bopomofo and Yi), Hangul
 * syllables, CJK compatibility and full-width forms, the ideographs past
 * U+20000, and emoji.
 */
export const WIDE_CHARACTER = /[\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]|\p{Extended_Pictographic}/u;

/** Scripts written without spaces, which may break between any two of their characters. */
const BREAKS_ANYWHERE = /[⺀-〾ぁ-㏿㐀-䶿一-鿿가-힣豈-﫿＀-｠\u{20000}-\u{3FFFD}]/u;

/**
 * Text in Latin-1 and plain spaces only: one character is one grapheme, none
 * of them wide or breaking anywhere. Most names are, and they skip the
 * segmenter, which is slow to call for each of a big map's names.
 */
const PLAIN = /^[\x20-\x7e\xa0-\xff\u2000-\u200a]*$/;

let segmenter: Intl.Segmenter | null | undefined;

/** The characters of `text` as people see them, so an emoji with its modifiers stays whole. */
export const graphemes = (text: string): string[] => {
  if (PLAIN.test(text)) {
    return text.split('');
  }

  if (segmenter === undefined) {
    segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  }

  return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
};

/** How many narrow and wide characters `text` has. */
export const characterWidths = (text: string): { narrow: number; wide: number } => {
  if (PLAIN.test(text)) {
    return { narrow: text.length, wide: 0 };
  }

  let wide = 0;
  const all = graphemes(text);

  for (const character of all) {
    if (WIDE_CHARACTER.test(character)) {
      wide += 1;
    }
  }

  return { narrow: all.length - wide, wide };
};

/** Estimated width of `text`, in ems. */
export const textEms = (text: string): number => {
  const { narrow, wide } = characterWidths(text);
  return narrow * NARROW_EMS + wide;
};

const estimatedEms = textEms;

/** A piece of text that stays on one line, and whether a space comes before it. */
export interface TextUnit {
  text: string;
  spaced: boolean;
}

/** Spaces a line may break at: every kind but the no-break ones, which keep their neighbors together. */
export const BREAKING_SPACE = /[^\S\u00a0\u202f\ufeff]+/u;

/**
 * Where a word may break besides between CJK characters: after an
 * underscore, slash or hyphen, after a dot or colon a letter follows, and
 * between a lowercase and an uppercase letter. Identifiers such as
 * `contact_tec_mail_address_key`, `docs/format.md` or `startedAt` then wrap
 * where they read, instead of being cut short.
 */
const WORD_BREAK = /(?<=[_/\\-])(?=.)|(?<=[.:])(?=\p{L})|(?<=\p{Ll})(?=\p{Lu})/u;

/** A word cut where it may break onto another line. */
export const wordPieces = (word: string): string[] => {
  return word.split(WORD_BREAK).filter(Boolean);
};

/**
 * Where text may break: between words, inside long words where they read
 * (`wordPieces`), and between the characters of scripts written without spaces.
 */
export const breakUnits = (text: string): TextUnit[] => {
  const units: TextUnit[] = [];

  for (const [index, word] of text.split(BREAKING_SPACE).filter(Boolean).entries()) {
    let run = '';
    let first = true;

    const push = (piece: string) => {
      units.push({ text: piece, spaced: first && index > 0 });
      first = false;
    };

    for (const piece of wordPieces(word)) {
      if (PLAIN.test(piece)) {
        push(piece);
        continue;
      }

      for (const character of graphemes(piece)) {
        if (BREAKS_ANYWHERE.test(character)) {
          if (run) {
            push(run);
            run = '';
          }

          push(character);
        } else {
          run += character;
        }
      }

      if (run) {
        push(run);
        run = '';
      }
    }
  }

  return units;
};

/** Joins units back into text, with their spaces. */
export const joinUnits = (units: TextUnit[]): string => {
  return units.map((unit, index) => (index > 0 && unit.spaced ? ` ${unit.text}` : unit.text)).join('');
};

/** As much of `text` as fits in `maxEms` with an ellipsis after it, cut between characters. */
const truncate = (text: string, maxEms: number, ems: (value: string) => number): string => {
  let kept = '';

  for (const character of graphemes(text)) {
    if (ems(`${kept}${character}…`) > maxEms) {
      break;
    }

    kept += character;
  }

  return `${kept.trimEnd()}…`;
};

/**
 * Wraps text into at most `maxLines` lines of `maxWidth` pixels, ending with
 * an ellipsis when cut. Widths are estimates, unless `measure` measures them
 * in the font the text is drawn with.
 */
export const wrapText = (
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines = 3,
  measure?: Pick<TextMeasure, 'ems'>,
): TextLayout => {
  const textEms = measure ? (value: string) => measure.ems(value, fontSize) : estimatedEms;
  // Room for at least three narrow characters, however small the space.
  const maxEms = Math.max(3 * NARROW_EMS, maxWidth / fontSize);
  const lineHeight = fontSize * 1.3;

  const lines: string[] = [];
  let current: TextUnit[] = [];

  for (const unit of breakUnits(text)) {
    const candidate = joinUnits([...current, unit]);

    if (current.length === 0 || textEms(candidate) <= maxEms) {
      current.push(unit);

      if (current.length === 1 && textEms(unit.text) > maxEms) {
        lines.push(truncate(unit.text, maxEms, textEms));
        current = [];
      }

      continue;
    }

    lines.push(joinUnits(current));
    current = [{ ...unit, spaced: false }];

    if (textEms(unit.text) > maxEms) {
      lines.push(truncate(unit.text, maxEms, textEms));
      current = [];
    }
  }

  if (current.length > 0) {
    lines.push(joinUnits(current));
  }

  const truncated = lines.length > maxLines;
  const resultLines = lines.slice(0, maxLines);

  if (truncated && resultLines.length === maxLines) {
    const last = resultLines[maxLines - 1];

    if (!last.endsWith('…')) {
      resultLines[maxLines - 1] = textEms(`${last}…`) <= maxEms ? `${last}…` : truncate(last, maxEms, textEms);
    }
  }

  return {
    lines: resultLines,
    truncated,
    lineHeight,
    totalHeight: resultLines.length * lineHeight,
  };
};
