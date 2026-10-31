import { describe, expect, test } from 'bun:test';
import { hasHyphenation, hyphenationPoints, registerHyphenation } from '../src/core/hyphenation/hyphenation';
import { insideLabelLayout } from '../src/core/engine/views';

/** A word with its hyphens where `language`'s patterns let it break. */
const broken = (word: string, language: string): string => {
  const characters = Array.from(word);
  const points = hyphenationPoints(characters, language) ?? [];
  return characters.map((character, index) => (points.includes(index) ? `-${character}` : character)).join('');
};

describe('hyphenation', () => {
  test('English words break where English does, never leaving fewer than two letters before or three after', () => {
    expect(broken('Photosynthesis', 'en')).toBe('Pho-to-syn-the-sis');
    expect(broken('Acquisitions', 'en')).toBe('Ac-qui-si-tions');
    expect(broken('Maintenance', 'en')).toBe('Main-te-nance');
    expect(broken('Chlorophyll', 'en')).toBe('Chloro-phyll');
    // "Branch-es" would leave two letters after the hyphen.
    expect(broken('Branches', 'en')).toBe('Branches');
    // The patterns' exceptions win: "present" never breaks.
    expect(broken('present', 'en-US')).toBe('present');
    expect(broken('associate', 'en-GB')).toBe('as-so-ciate');
  });

  test('Spanish words break by syllable, accents and all, whatever the region', () => {
    expect(broken('Fotosíntesis', 'es')).toBe('Fo-to-sín-te-sis');
    expect(broken('Notificaciones', 'es-MX')).toBe('No-ti-fi-ca-cio-nes');
    expect(broken('cigüeña', 'es-419')).toBe('ci-güe-ña');
    // Written with a combining accent, the word still breaks as it reads.
    expect(broken('Fotosíntesis'.normalize('NFD'), 'es')).toBe(broken('Fotosíntesis', 'es').normalize('NFD'));
  });

  test('a language without patterns has none, and another can add its own', () => {
    expect(hasHyphenation('de')).toBe(false);
    expect(hyphenationPoints(Array.from('Donaudampfschiff'), 'de')).toBeNull();
    const unregister = registerHyphenation('de', 'u1d f1s', { left: 2, right: 2 });

    try {
      expect(hasHyphenation('de-AT')).toBe(true);
      expect(broken('Donaudampfschiff', 'de')).toBe('Donau-dampf-schiff');
    } finally {
      unregister();
    }

    expect(hasHyphenation('de')).toBe(false);
  });

  test('a long name cut across lines breaks at a hyphenation point of its language', () => {
    const lines = (text: string, language: string) => insideLabelLayout('planet', 20, text, false, undefined, true, 0, language)?.lines ?? [];
    // A planet too small for "Photosynthesis" on one line: it breaks between syllables, in English…
    expect(lines('Photosynthesis', 'en').map((line) => line.replace('…', ''))).toSatisfy((shown: string[]) => /^(Pho|Photo|Photosyn|Photosynthe)-$/.test(shown[0]));
    // …and in Spanish.
    expect(lines('Notificaciones', 'es').map((line) => line.replace('…', ''))).toSatisfy((shown: string[]) => /^(No|Noti|Notifi|Notifica|Notificacio)-$/.test(shown[0]));
  });

  test('a long word breaks to keep its name larger, rather than shrink it whole, once the map is still', () => {
    const fit = (radius: number, text: string, still: boolean, language = 'en') => insideLabelLayout('planet', radius, text, false, undefined, still, 0, language);
    // While the map moves, the word shrinks to fit whole, as it always has: breaking it takes longer to fit.
    expect(fit(64, 'Electroencephalography', false)).toMatchObject({ fontSize: 9.5, lines: ['Electroencephalography'] });
    // Still, it breaks once, where English does, at the planet's own size.
    expect(fit(64, 'Electroencephalography', true)).toMatchObject({ fontSize: 13, lines: ['Electroen-', 'cephalography'] });
    // In Spanish too.
    expect(fit(42, 'Investigación', false, 'es')).toMatchObject({ fontSize: 10.5, lines: ['Investigación'] });
    expect(fit(42, 'Investigación', true, 'es')).toMatchObject({ fontSize: 13, lines: ['Investi-', 'gación'] });
  });

  test('a word stays whole when breaking it would show it only a little larger, and breaks once at most', () => {
    const fit = (radius: number, text: string, language = 'en') => insideLabelLayout('planet', radius, text, false, undefined, true, 0, language);
    // Whole at 11.5 px, it would show at 13 px broken: not worth the break.
    expect(fit(51, 'Photosynthesis')).toMatchObject({ fontSize: 11.5, lines: ['Photosynthesis'] });
    // A smaller planet breaks it in two, larger than its cut at the smallest size, but never in three.
    expect(fit(30, 'Investigación', 'es')).toMatchObject({ fontSize: 11.5, lines: ['Investi-', 'gación'] });
    // The overview's names stay whole, on their pills when they must.
    expect(insideLabelLayout('node', 40, 'Electroencephalography', false, undefined, true)).toEqual(insideLabelLayout('node', 40, 'Electroencephalography', false, undefined, false));
  });

  test('a long word that fits once broken breaks where its lines come out even, with no syllable alone', () => {
    const lines = (radius: number, text: string, language = 'en') => insideLabelLayout('planet', radius, text, false, undefined, true, 0, language)?.lines;
    // Not "Electroencephalogra- / phy" or "Counterrevolutionar- / ies", the last breaks that fit the first line.
    expect(lines(57, 'Electroencephalography')).toEqual(['Electroen-', 'cephalography']);
    expect(lines(57, 'Counterrevolutionaries')).toEqual(['Counterrevo-', 'lutionaries']);
    // Over three lines, the word's last two come out even: not "Anticonsti- / tucionalmen- / te".
    expect(lines(34, 'Anticonstitucionalmente', 'es')).toEqual(['Anticonsti-', 'tucional-', 'mente']);
    // A name with more after the word moves it along too: not "Photosynthe- / sis and / respiration".
    expect(lines(38, 'Photosynthesis and respiration')).toEqual(['Photo-', 'synthesis and', 'respiration']);
    // A name cut short anyway breaks as late as it can, to show the most of it.
    expect(lines(30, 'Electroencephalography')).toEqual(['Electroen-', 'cephalogr…']);
  });
});
