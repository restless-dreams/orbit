/**
 * Small color helpers: parse the formats browsers report for computed
 * colors and the colors CSS knows by name, mix in OKLab like CSS
 * `color-mix(in oklab, …)`, measure WCAG contrast to choose label colors,
 * and resolve the map's theme tokens into plain hex colors for exports that
 * leave the page.
 */

/** sRGB channels and alpha, each 0–1. */
export interface Rgb {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/**
 * The colors CSS knows by name (CSS Color 4), each with its hex digits, so
 * a map's `tomato` or a palette's `navy` exports as the color the live map
 * draws. Pairs separated by white space.
 */
const COLOR_NAMES = `
transparent 00000000
aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc
bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a
burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50
cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b
darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b
darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000
darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f
darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969
dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 forestgreen 228b22
fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 gray 808080
green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c
indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00
lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2
lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 lightsalmon ffa07a
lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899
lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff
maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db
mediumseagreen 3cb371 mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc
mediumvioletred c71585 midnightblue 191970 mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5
navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000 olivedrab 6b8e23 orange ffa500
orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee
palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd
powderblue b0e0e6 purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1
saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d
silver c0c0c0 skyblue 87ceeb slateblue 6a5acd slategray 708090 slategrey 708090 snow fffafa
springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8 tomato ff6347
turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00
yellowgreen 9acd32
`;

let namedColors: Map<string, string> | undefined;

/** The hex digits of a color CSS knows by `name` (lowercase), if it is one. */
const namedColor = (name: string): string | undefined => {
  if (!namedColors) {
    const words = COLOR_NAMES.trim().split(/\s+/);
    namedColors = new Map();

    for (let index = 0; index + 1 < words.length; index += 2) {
      namedColors.set(words[index], words[index + 1]);
    }
  }

  return namedColors.get(name);
};

/**
 * A CSS number: signed, with or without digits before the point, with an
 * exponent. Browsers report a mixed node's fill as `oklab(0.73 -0.089 0.027)`,
 * and people write `rgba(0, 0, 0, .5)`. Malformed text like `1.2.3` or
 * `1-2` doesn't match, so it never becomes a NaN channel.
 */
const NUMBER = String.raw`[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?`;
const RGB = new RegExp(String.raw`^rgba?\(\s*(${NUMBER})(%?)[\s,]+(${NUMBER})(%?)[\s,]+(${NUMBER})(%?)(?:\s*[,/]\s*(${NUMBER})(%?))?\s*\)$`);
const SRGB = new RegExp(String.raw`^color\(srgb\s+(${NUMBER})\s+(${NUMBER})\s+(${NUMBER})(?:\s*\/\s*(${NUMBER})(%?))?\s*\)$`);
const OKLAB = new RegExp(String.raw`^oklab\(\s*(${NUMBER})(%?)\s+(${NUMBER})\s+(${NUMBER})(?:\s*\/\s*(${NUMBER})(%?))?\s*\)$`);
const OKLCH = new RegExp(String.raw`^oklch\(\s*(${NUMBER})(%?)\s+(${NUMBER})\s+(${NUMBER})(?:deg)?(?:\s*\/\s*(${NUMBER})(%?))?\s*\)$`);

export const parseColor = (input: string): Rgb | null => {
  const value = input.trim().toLowerCase();
  const named = namedColor(value);

  if (named) {
    return parseHex(named);
  }

  let match = /^#([0-9a-f]{3,8})$/.exec(value);

  if (match) {
    return parseHex(match[1]);
  }

  match = RGB.exec(value);

  if (match) {
    // A channel is out of 255, or out of 100 when written as a percentage.
    const channel = (amount: string, percent: string) => Number(amount) / (percent === '%' ? 100 : 255);
    return {
      red: channel(match[1], match[2]),
      green: channel(match[3], match[4]),
      blue: channel(match[5], match[6]),
      alpha: readAlpha(match[7], match[8]),
    };
  }

  match = SRGB.exec(value);

  if (match) {
    return { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]), alpha: readAlpha(match[4], match[5]) };
  }

  match = OKLAB.exec(value);

  if (match) {
    const lightness = Number(match[1]) / (match[2] === '%' ? 100 : 1);
    return fromOklab(lightness, Number(match[3]), Number(match[4]), readAlpha(match[5], match[6]));
  }

  match = OKLCH.exec(value);

  if (match) {
    const lightness = Number(match[1]) / (match[2] === '%' ? 100 : 1);
    const chroma = Number(match[3]);
    const hue = (Number(match[4]) * Math.PI) / 180;
    return fromOklab(lightness, chroma * Math.cos(hue), chroma * Math.sin(hue), readAlpha(match[5], match[6]));
  }

  return null;
};

const parseHex = (digits: string): Rgb | null => {
  const expanded = digits.length === 3 || digits.length === 4
    ? digits.split('').map((digit) => digit + digit).join('')
    : digits;

  if (expanded.length !== 6 && expanded.length !== 8) {
    return null;
  }

  const channel = (index: number) => parseInt(expanded.slice(index, index + 2), 16) / 255;
  return { red: channel(0), green: channel(2), blue: channel(4), alpha: expanded.length === 8 ? channel(6) : 1 };
};

const readAlpha = (value: string | undefined, percent: string | undefined): number => {
  if (value === undefined) {
    return 1;
  }

  return Number(value) / (percent === '%' ? 100 : 1);
};

export const toHex = (color: Rgb): string => {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0');
  const alpha = color.alpha < 1 ? channel(color.alpha) : '';
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}${alpha}`;
};

const toLinear = (channel: number): number => {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (channel: number): number => {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
};

const toOklab = (color: Rgb): [number, number, number] => {
  const red = toLinear(color.red);
  const green = toLinear(color.green);
  const blue = toLinear(color.blue);
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short,
  ];
};

/** An OKLab color's linear-light sRGB channels, unclamped: outside 0–1 when sRGB can't show it. */
const oklabToLinear = (lightness: number, a: number, b: number): [number, number, number] => {
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
};

const fromOklab = (lightness: number, a: number, b: number, alpha: number): Rgb => {
  const [red, green, blue] = oklabToLinear(lightness, a, b);
  return { red: fromLinear(red), green: fromLinear(green), blue: fromLinear(blue), alpha };
};

/** A color's OKLCH coordinates: lightness (0–1), chroma and hue in degrees. */
export interface Oklch {
  lightness: number;
  chroma: number;
  hue: number;
}

export const toOklch = (color: Rgb): Oklch => {
  const [lightness, a, b] = toOklab(color);
  const chroma = Math.hypot(a, b);
  const hue = chroma < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { lightness, chroma, hue };
};

/**
 * The relative luminance of a Material tone, which is CIELAB's L*: tone 0 is
 * black, 50 a middle gray and 100 white. Two tones 50 apart always have at
 * least 4.5:1 contrast, which is how Material keeps text readable.
 */
const toneLuminance = (tone: number): number => {
  return tone > 8 ? ((tone + 16) / 116) ** 3 : tone / 903.2962962962963;
};

/** Luminance and whether sRGB can show the OKLCH color. */
const measureOklch = (lightness: number, chroma: number, hue: number): { luminance: number; shown: boolean } => {
  const angle = (hue * Math.PI) / 180;
  const channels = oklabToLinear(lightness, chroma * Math.cos(angle), chroma * Math.sin(angle));
  const [red, green, blue] = channels;
  return {
    luminance: 0.2126 * red + 0.7152 * green + 0.0722 * blue,
    shown: channels.every((channel) => channel >= -1e-5 && channel <= 1 + 1e-5),
  };
};

/** The OKLab lightness that gives a color of this chroma and hue the luminance asked for. */
const lightnessFor = (luminance: number, chroma: number, hue: number): number => {
  let low = 0;
  let high = 1;

  for (let step = 0; step < 32; step += 1) {
    const middle = (low + high) / 2;

    if (measureOklch(middle, chroma, hue).luminance < luminance) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
};

/**
 * A color of `hue` (OKLCH degrees) at a Material tone: as much of `chroma` as
 * sRGB can show at that luminance, so every hue at one tone has the same
 * contrast with every other tone.
 */
export const toneColor = (hue: number, chroma: number, tone: number): Rgb => {
  const luminance = toneLuminance(Math.min(100, Math.max(0, tone)));
  const fits = (candidate: number) => measureOklch(lightnessFor(luminance, candidate, hue), candidate, hue).shown;
  let shown = chroma;

  if (!fits(chroma)) {
    let low = 0;
    let high = chroma;

    for (let step = 0; step < 20; step += 1) {
      const middle = (low + high) / 2;

      if (fits(middle)) {
        low = middle;
      } else {
        high = middle;
      }
    }

    shown = low;
  }

  const lightness = lightnessFor(luminance, shown, hue);
  const angle = (hue * Math.PI) / 180;
  const color = fromOklab(lightness, shown * Math.cos(angle), shown * Math.sin(angle), 1);
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  return { red: clamp(color.red), green: clamp(color.green), blue: clamp(color.blue), alpha: 1 };
};

/** `color-mix(in oklab, first amount, second)` with `amount` from 0 to 1. */
export const mixOklab = (first: Rgb, second: Rgb, amount: number): Rgb => {
  const [firstLightness, firstA, firstB] = toOklab(first);
  const [secondLightness, secondA, secondB] = toOklab(second);
  const mix = (from: number, to: number) => from * amount + to * (1 - amount);
  return fromOklab(
    mix(firstLightness, secondLightness),
    mix(firstA, secondA),
    mix(firstB, secondB),
    mix(first.alpha, second.alpha),
  );
};

/** WCAG relative luminance (0–1) of a color's sRGB channels, ignoring alpha. */
export const relativeLuminance = (color: Rgb): number => {
  return 0.2126 * toLinear(color.red) + 0.7152 * toLinear(color.green) + 0.0722 * toLinear(color.blue);
};

/** WCAG contrast ratio (1–21) between two opaque colors. */
export const contrastRatio = (first: Rgb, second: Rgb): number => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Whether `lightText` reads better than `darkText` on `fill`: the one with
 * more contrast wins, a tie going to the light text. When the text colors
 * can't be parsed, light text goes on fills darker than mid-gray.
 */
export const prefersLightText = (fill: string, lightText: string, darkText: string): boolean => {
  const background = parseColor(fill);

  if (!background) {
    return false;
  }

  const light = parseColor(lightText);
  const dark = parseColor(darkText);

  if (!light || !dark) {
    return relativeLuminance(background) < 0.18;
  }

  return contrastRatio(background, light) >= contrastRatio(background, dark);
};

/** A color as an opaque hex value and an opacity, for SVG attributes that design tools read. */
export const splitAlpha = (color: string): { color: string; opacity: number } => {
  const parsed = parseColor(color);

  if (!parsed) {
    return { color, opacity: 1 };
  }

  return { color: toHex({ ...parsed, alpha: 1 }), opacity: Math.round(parsed.alpha * 1000) / 1000 };
};

/**
 * Resolves `var(--_orbit-token)` references and `color-mix(in oklab, …)`
 * into a hex color using concrete token values. When part of it can't be
 * read, such as an `hsl()` color, it's returned with the tokens it names
 * written out, so it doesn't depend on the page's stylesheet.
 */
export const resolveColor = (value: string, tokens: Record<string, string>): string => {
  const substituted = value.replace(/var\(--_?orbit-([a-z0-9-]+)(?:\s*,\s*([^()]+))?\)/gi, (whole, token: string, fallback?: string) => {
    return tokens[token] ?? fallback?.trim() ?? whole;
  });

  const mix = /^color-mix\(\s*in\s+oklab\s*,\s*(.+?)\s+(\d*\.\d+|\d+)%\s*,\s*(.+?)\s*\)$/i.exec(substituted.trim());

  if (mix) {
    const first = parseColor(resolveColor(mix[1], tokens));
    const second = parseColor(resolveColor(mix[3], tokens));

    if (first && second) {
      return toHex(mixOklab(first, second, Number(mix[2]) / 100));
    }

    return substituted;
  }

  const parsed = parseColor(substituted);
  return parsed ? toHex(parsed) : substituted;
};
