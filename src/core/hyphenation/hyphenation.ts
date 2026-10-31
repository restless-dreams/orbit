/**
 * Where words break across lines with a hyphen, by Frank Liang's algorithm,
 * as TeX does it: a language's patterns say, between each pair of letters,
 * whether a hyphen may go there. English and Spanish come built in, and
 * `registerHyphenation` adds another language's, such as its patterns from
 * the hyph-utf8 package (https://www.hyphenation.org/tex).
 */

import { ENGLISH_EXCEPTIONS, ENGLISH_PATTERNS } from './english.js';
import { SPANISH_PATTERNS } from './spanish.js';

/** A language's patterns and exceptions, as written: white space between them. */
interface HyphenationSource {
  patterns: string;
  exceptions?: string;

  /** The fewest letters a break leaves before its hyphen, as the language's typesetting has it… */
  left: number;

  /** …and after it. */
  right: number;
}

/** A language's patterns, read: the values between and around each pattern's letters, by its letters. */
interface ReadPatterns {
  values: Map<string, number[]>;

  /** The most letters a pattern has, dots included. */
  longest: number;

  /** Words broken where their own hyphens say, by the word. */
  exceptions: Map<string, number[]>;

  left: number;
  right: number;
}

// The fewest letters each side of a break, as hyph-utf8 gives them for typesetting each language.
const sources = new Map<string, HyphenationSource>([
  ['en', { patterns: ENGLISH_PATTERNS, exceptions: ENGLISH_EXCEPTIONS, left: 2, right: 3 }],
  ['es', { patterns: SPANISH_PATTERNS, left: 2, right: 2 }],
]);

/** Patterns read the first time a word in their language breaks. */
const read = new Map<string, ReadPatterns>();

/** A language tag's language alone, in lowercase: "es-MX" is "es". */
const baseLanguage = (language: string): string => {
  return language.trim().toLowerCase().split(/[-_]/)[0];
};

/** A letter as patterns write it: one character, composed, lowercase. */
const patternLetter = (character: string): string => {
  return character.normalize('NFC').toLowerCase();
};

const readPatterns = (source: HyphenationSource): ReadPatterns => {
  const values = new Map<string, number[]>();
  let longest = 0;

  for (const pattern of source.patterns.split(/\s+/)) {
    if (!pattern) {
      continue;
    }

    let letters = '';
    let count = 0;
    const between: number[] = [0];

    for (const character of pattern) {
      if (character >= '0' && character <= '9') {
        between[between.length - 1] = Number(character);
      } else {
        letters += character;
        count += 1;
        between.push(0);
      }
    }

    values.set(letters, between);
    longest = Math.max(longest, count);
  }

  const exceptions = new Map<string, number[]>();

  for (const word of source.exceptions?.split(/\s+/) ?? []) {
    if (!word) {
      continue;
    }

    const points: number[] = [];
    let count = 0;

    for (const character of word) {
      if (character === '-') {
        points.push(count);
      } else {
        count += 1;
      }
    }

    exceptions.set(word.replaceAll('-', ''), points);
  }

  return { values, longest, exceptions, left: source.left, right: source.right };
};

const patternsFor = (language: string): ReadPatterns | null => {
  const base = baseLanguage(language);
  let patterns = read.get(base);

  if (!patterns) {
    const source = sources.get(base);

    if (!source) {
      return null;
    }

    patterns = readPatterns(source);
    read.set(base, patterns);
  }

  return patterns;
};

/** Whether words in `language` break where its patterns say (see `hyphenationPoints`). */
export const hasHyphenation = (language: string): boolean => {
  return sources.has(baseLanguage(language));
};

/**
 * Where a word made of `characters` (graphemes) may break with a hyphen in
 * `language`: how many characters come before each break, in order, each
 * leaving at least as many letters on either side as the language's
 * typesetting does. Empty for a word its patterns don't break, and null for
 * a language without patterns.
 */
export const hyphenationPoints = (characters: readonly string[], language: string): number[] | null => {
  const patterns = patternsFor(language);

  if (!patterns) {
    return null;
  }

  const letters = characters.map(patternLetter);
  const exception = patterns.exceptions.get(letters.join(''));

  if (exception) {
    return exception.filter((count) => count >= patterns.left && letters.length - count >= patterns.right);
  }

  // The word between dots, which patterns use for its start and end; a score for every gap, past each end too.
  const marked = ['.', ...letters, '.'];
  const scores = new Array<number>(marked.length + 1).fill(0);

  for (let start = 0; start < marked.length; start += 1) {
    let piece = '';

    for (let end = start; end < Math.min(marked.length, start + patterns.longest); end += 1) {
      piece += marked[end];
      const between = patterns.values.get(piece);

      if (between) {
        between.forEach((value, index) => {
          scores[start + index] = Math.max(scores[start + index], value);
        });
      }
    }
  }

  // An odd score lets a hyphen in: before the word's character `count`, which is `marked[count + 1]`.
  const points: number[] = [];

  for (let count = patterns.left; count <= letters.length - patterns.right; count += 1) {
    if (scores[count + 1] % 2 === 1) {
      points.push(count);
    }
  }

  return points;
};

/**
 * Adds a language's hyphenation `patterns`, and words its patterns would
 * break wrongly with their hyphens where they go (`exceptions`), both
 * separated by white space, as the hyph-utf8 package's `.pat.txt` and
 * `.hyp.txt` files have them, with the fewest letters a break leaves before
 * and after its hyphen (`left` and `right`, 2 and 3 unless given). They
 * replace the language's own, built in or added before. Returns a function
 * that takes them out again.
 */
export const registerHyphenation = (language: string, patterns: string, options: { exceptions?: string; left?: number; right?: number } = {}): () => void => {
  const base = baseLanguage(language);
  const before = sources.get(base);
  const source = { patterns, exceptions: options.exceptions, left: Math.max(1, options.left ?? 2), right: Math.max(1, options.right ?? 3) };
  sources.set(base, source);
  read.delete(base);

  return () => {
    if (sources.get(base) !== source) {
      return;
    }

    if (before) {
      sources.set(base, before);
    } else {
      sources.delete(base);
    }

    read.delete(base);
  };
};
