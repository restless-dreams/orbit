/**
 * Small color helpers: parse the colors CSS writes (by name, in hex, and the
 * color functions of CSS Color 4, as people write them and browsers report
 * them), mix in OKLab like CSS `color-mix(in oklab, …)`, measure WCAG
 * contrast to choose label colors, and resolve the map's theme tokens into
 * plain hex colors for exports that leave the page.
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

/** A color function's argument: a number with its unit, if any, or `none`. */
const ARGUMENT = new RegExp(String.raw`^(?:(${NUMBER})(%|deg|grad|rad|turn)?|none)$`);

/** A color function with what's inside its parentheses. */
const COLOR_FUNCTION = /^([a-z-]+)\(([^()]*)\)$/;

/** The functions that may also be written with commas, as CSS first wrote them: `rgb(255, 128, 0)`. */
const COMMA_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla']);

/** A number in a color function, and its unit: `%`, an angle's, `''` for none, or `none` for a missing component, which counts as 0. */
interface Argument {
  value: number;
  unit: string;
}

/**
 * Reads a CSS color: a name, hex, or `rgb()`, `hsl()`, `hwb()`, `lab()`,
 * `lch()`, `oklab()`, `oklch()` or `color()` in any of CSS's predefined
 * spaces (`srgb`, `srgb-linear`, `display-p3`, `a98-rgb`, `prophoto-rgb`,
 * `rec2020`, `xyz`, `xyz-d50`, `xyz-d65`), in sRGB. A color sRGB can't show
 * keeps channels outside 0–1, as CSS mixes it; it's shown clipped. `null`
 * for anything else, such as `var()`, `currentcolor` or a mix.
 */
export const parseColor = (input: string): Rgb | null => {
  const value = input.trim().toLowerCase();
  const named = namedColor(value);

  if (named) {
    return parseHex(named);
  }

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);

  if (hex) {
    return parseHex(hex[1]);
  }

  const call = COLOR_FUNCTION.exec(value);
  return call ? readColorFunction(call[1], call[2]) : null;
};

const readColorFunction = (name: string, inside: string): Rgb | null => {
  let words: string[];
  let alphaText: string | undefined;

  if (inside.includes(',')) {
    if (!COMMA_FUNCTIONS.has(name) || inside.includes('/')) {
      return null;
    }

    words = inside.split(',').map((word) => word.trim());
    alphaText = words.length === 4 ? words.pop() : undefined;
  } else {
    const [channels, alpha, ...more] = inside.split('/');

    if (more.length > 0) {
      return null;
    }

    words = channels.trim().split(/\s+/);
    alphaText = alpha?.trim();
  }

  const space = name === 'color' ? words.shift() : undefined;
  const parts = words.map(readArgument);
  const alpha = alphaText === undefined ? { value: 1, unit: '' } : readArgument(alphaText);
  const written = parts.length === 3 && alpha !== null && parts.every((part): part is Argument => part !== null);

  // Missing components (`none`) came with the syntax that has no commas.
  if (!written || (inside.includes(',') && [...parts, alpha].some((part) => part.unit === 'none')) || !isAmount(alpha)) {
    return null;
  }

  const color = colorChannels(name, space, parts);
  const opacity = alpha.unit === '%' ? alpha.value / 100 : alpha.value;
  return color && color.every(Number.isFinite) ? { red: color[0], green: color[1], blue: color[2], alpha: Math.min(1, Math.max(0, opacity)) } : null;
};

const readArgument = (text: string): Argument | null => {
  const match = ARGUMENT.exec(text);

  if (!match) {
    return null;
  }

  return match[1] === undefined ? { value: 0, unit: 'none' } : { value: Number(match[1]), unit: match[2] ?? '' };
};

/** Whether an argument is a number or a percentage, rather than an angle. */
const isAmount = (part: Argument): boolean => part.unit === '' || part.unit === '%' || part.unit === 'none';

/** An argument as a number, a percentage being of `whole`; NaN for an angle. */
const amount = (part: Argument, whole: number): number => {
  if (!isAmount(part)) {
    return Number.NaN;
  }

  return part.unit === '%' ? (part.value / 100) * whole : part.value;
};

/** Degrees in each unit a hue can have. */
const DEGREES = new Map([['', 1], ['none', 1], ['deg', 1], ['grad', 0.9], ['rad', 180 / Math.PI], ['turn', 360]]);

/** An argument as a hue, in degrees; NaN for a percentage. */
const hue = (part: Argument): number => part.value * (DEGREES.get(part.unit) ?? Number.NaN);

/** A color function's sRGB channels, or `null` for a function or space it isn't. */
const colorChannels = (name: string, space: string | undefined, [first, second, third]: Argument[]): number[] | null => {
  switch (name) {
    case 'rgb':
    case 'rgba': {
      // A channel is out of 255, or out of 100 when written as a percentage.
      const channel = (part: Argument) => (part.unit === '%' ? part.value / 100 : amount(part, 255) / 255);
      return [channel(first), channel(second), channel(third)];
    }
    case 'hsl':
    case 'hsla':
      return fromHsl(hue(first), amount(second, 100) / 100, amount(third, 100) / 100);
    case 'hwb':
      return fromHwb(hue(first), amount(second, 100) / 100, amount(third, 100) / 100);
    case 'lab':
      return fromLab(amount(first, 100), amount(second, 125), amount(third, 125));
    case 'lch': {
      const angle = (hue(third) * Math.PI) / 180;
      const chroma = amount(second, 150);
      return fromLab(amount(first, 100), chroma * Math.cos(angle), chroma * Math.sin(angle));
    }
    case 'oklab': {
      const color = fromOklab(amount(first, 1), amount(second, 0.4), amount(third, 0.4), 1);
      return [color.red, color.green, color.blue];
    }
    case 'oklch': {
      const angle = (hue(third) * Math.PI) / 180;
      const chroma = amount(second, 0.4);
      const color = fromOklab(amount(first, 1), chroma * Math.cos(angle), chroma * Math.sin(angle), 1);
      return [color.red, color.green, color.blue];
    }
    case 'color':
      return space === undefined ? null : fromSpace(space, [amount(first, 1), amount(second, 1), amount(third, 1)]);
    default:
      return null;
  }
};

/** HSL in sRGB, as CSS Color 4 converts it: `saturation` and `lightness` from 0 to 1. */
const fromHsl = (degrees: number, saturation: number, lightness: number): number[] => {
  const turn = ((degrees % 360) + 360) % 360;
  const light = Math.min(1, Math.max(0, lightness));
  const reach = Math.min(1, Math.max(0, saturation)) * Math.min(light, 1 - light);

  const channel = (offset: number) => {
    const step = (offset + turn / 30) % 12;
    return light - reach * Math.max(-1, Math.min(step - 3, 9 - step, 1));
  };

  return [channel(0), channel(8), channel(4)];
};

/** HWB in sRGB: the pure hue, with `whiteness` and `blackness` (0 to 1) mixed in; a gray when they add up to 1 or more. */
const fromHwb = (degrees: number, whiteness: number, blackness: number): number[] => {
  const white = Math.max(0, whiteness);
  const black = Math.max(0, blackness);

  if (white + black >= 1) {
    const gray = white / (white + black);
    return [gray, gray, gray];
  }

  return fromHsl(degrees, 1, 0.5).map((channel) => channel * (1 - white - black) + white);
};

type Matrix = readonly [readonly number[], readonly number[], readonly number[]];

const multiply = (matrix: Matrix, vector: number[]): number[] => {
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
};

// The matrices and white points of CSS Color 4's sample code.
const XYZ_TO_LINEAR_SRGB: Matrix = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

/** From D50's white, which CIE Lab and ProPhoto use, to D65's (Bradford). */
const D50_TO_D65: Matrix = [
  [0.955473421488075, -0.02309845494876471, 0.06325924320057072],
  [-0.0283697093338637, 1.0099953980813041, 0.021041441191917323],
  [0.012314014864481998, -0.020507649298898964, 1.330365926242124],
];

const D50_WHITE = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585];

/**
 * The spaces `color()` names: how each turns its channels into linear
 * light, and its matrix to XYZ, under D65's white or D50's.
 */
const SPACES = new Map<string, { linear: (channel: number) => number; toXyz: Matrix; d50?: true }>(Object.entries({
  'display-p3': {
    linear: (channel) => toLinear(channel),
    toXyz: [
      [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
      [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
      [0, 0.04511338185890264, 1.043944368900976],
    ],
  },
  'a98-rgb': {
    linear: (channel) => Math.sign(channel) * Math.abs(channel) ** (563 / 256),
    toXyz: [
      [0.5766690429101305, 0.1855582379065463, 0.1882286462349947],
      [0.29734497525053605, 0.6273635662554661, 0.07529145849399788],
      [0.02703136138641234, 0.07068885253582723, 0.9913375368376388],
    ],
  },
  'prophoto-rgb': {
    linear: (channel) => (Math.abs(channel) <= 16 / 512 ? channel / 16 : Math.sign(channel) * Math.abs(channel) ** 1.8),
    toXyz: [
      [0.7977666449006423, 0.13518129740053308, 0.0313477341283922],
      [0.2880748288194013, 0.711835234241873, 0.00008993693872564],
      [0, 0, 0.8251046025104602],
    ],
    d50: true,
  },
  rec2020: {
    linear: (channel) => {
      const alpha = 1.09929682680944;
      const beta = 0.018053968510807;
      return Math.abs(channel) < beta * 4.5 ? channel / 4.5 : Math.sign(channel) * ((Math.abs(channel) + alpha - 1) / alpha) ** (1 / 0.45);
    },
    toXyz: [
      [0.6369580483012914, 0.14461690358620832, 0.1688809751641721],
      [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
      [0, 0.028072693049087428, 1.060985057710791],
    ],
  },
}));

/** A `color()` in sRGB, or `null` for a space CSS doesn't have. */
const fromSpace = (space: string, channels: number[]): number[] | null => {
  if (space === 'srgb') {
    return channels;
  }

  if (space === 'srgb-linear') {
    return channels.map(fromLinear);
  }

  if (space === 'xyz' || space === 'xyz-d65' || space === 'xyz-d50') {
    return fromXyz(space === 'xyz-d50' ? multiply(D50_TO_D65, channels) : channels);
  }

  const defined = SPACES.get(space);

  if (!defined) {
    return null;
  }

  const xyz = multiply(defined.toXyz, channels.map(defined.linear));
  return fromXyz(defined.d50 ? multiply(D50_TO_D65, xyz) : xyz);
};

/** XYZ under D65's white in sRGB. */
const fromXyz = (xyz: number[]): number[] => multiply(XYZ_TO_LINEAR_SRGB, xyz).map(fromLinear);

/** CIE Lab (D50) in sRGB. */
const fromLab = (lightness: number, a: number, b: number): number[] => {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const middle = (lightness + 16) / 116;
  const first = a / 500 + middle;
  const last = middle - b / 200;
  const x = first ** 3 > epsilon ? first ** 3 : (116 * first - 16) / kappa;
  const y = lightness > kappa * epsilon ? middle ** 3 : lightness / kappa;
  const z = last ** 3 > epsilon ? last ** 3 : (116 * last - 16) / kappa;
  return fromXyz(multiply(D50_TO_D65, [x * D50_WHITE[0], y, z * D50_WHITE[2]]));
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

export const toHex = (color: Rgb): string => {
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0');
  const alpha = color.alpha < 1 ? channel(color.alpha) : '';
  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}${alpha}`;
};

/** An sRGB channel in linear light; one below 0, from a color sRGB can't show, mirrors one above. */
const toLinear = (channel: number): number => {
  const size = Math.abs(channel);
  return size <= 0.04045 ? channel / 12.92 : Math.sign(channel) * ((size + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (channel: number): number => {
  const size = Math.abs(channel);
  return size <= 0.0031308 ? channel * 12.92 : Math.sign(channel) * (1.055 * size ** (1 / 2.4) - 0.055);
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

/** A channel as it's shown: a color sRGB can't show is clipped to it. */
const shown = (channel: number): number => Math.min(1, Math.max(0, channel));

/** WCAG relative luminance (0–1) of a color's sRGB channels, as they're shown, ignoring alpha. */
export const relativeLuminance = (color: Rgb): number => {
  return 0.2126 * toLinear(shown(color.red)) + 0.7152 * toLinear(shown(color.green)) + 0.0722 * toLinear(shown(color.blue));
};

/** `front` painted over an opaque `back`, as browsers blend them: what shows where a translucent color is drawn. */
export const over = (front: Rgb, back: Rgb): Rgb => {
  const alpha = shown(front.alpha);
  const blend = (top: number, bottom: number) => shown(top) * alpha + shown(bottom) * (1 - alpha);
  return { red: blend(front.red, back.red), green: blend(front.green, back.green), blue: blend(front.blue, back.blue), alpha: 1 };
};

/**
 * What a map is drawn on, opaque: the theme's `surface`, and where it shows
 * through, the page the theme is made for, white under dark `text` and
 * black under light text. A translucent node is seen over it.
 */
export const backdropColor = (tokens: Record<string, string>): Rgb => {
  const text = parseColor(resolveColor(tokens.text ?? '', tokens));
  const page = text && relativeLuminance(text) >= 0.18 ? { red: 0, green: 0, blue: 0, alpha: 1 } : { red: 1, green: 1, blue: 1, alpha: 1 };
  const surface = parseColor(resolveColor(tokens.surface ?? 'transparent', tokens));
  return surface ? over(surface, page) : page;
};

/** WCAG contrast ratio (1–21) between two opaque colors. */
export const contrastRatio = (first: Rgb, second: Rgb): number => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Whether `lightText` reads better than `darkText` on `fill`: the one with
 * more contrast wins, a tie going to the light text. A translucent fill is
 * seen over `backdrop` (`backdropColor`), when given. When the text colors
 * can't be parsed, light text goes on fills darker than mid-gray.
 */
export const prefersLightText = (fill: string, lightText: string, darkText: string, backdrop?: Rgb): boolean => {
  const parsed = parseColor(fill);

  if (!parsed) {
    return false;
  }

  const background = backdrop && parsed.alpha < 1 ? over(parsed, backdrop) : parsed;

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
 * read, such as a page's own `var(--brand)`, it's returned with the tokens
 * it names written out, so it doesn't depend on the page's stylesheet.
 */
export const resolveColor = (value: string, tokens: Record<string, string>): string => resolveMixes(value, tokens, MIX_DEPTH);

/**
 * How many mixes deep a color is read: Orbit puts one around a sibling's
 * color and a theme's own tokens, and the colors people write rarely nest
 * more than two. Each level reads all of what's inside it again, so a color
 * nested 12,000 deep took ten seconds, and a theme token that names itself
 * overflowed the stack. A mix nested deeper is returned as written, with its
 * tokens written out.
 */
export const MIX_DEPTH = 8;

const resolveMixes = (value: string, tokens: Record<string, string>, depth: number): string => {
  const substituted = value.replace(/var\(--_?orbit-([a-z0-9-]+)(?:\s*,\s*([^()]+))?\)/gi, (whole, token: string, fallback?: string) => {
    return tokens[token] ?? fallback?.trim() ?? whole;
  });

  const mix = depth > 0 ? readMix(substituted.trim()) : null;

  if (mix) {
    const first = parseColor(resolveMixes(mix.first, tokens, depth - 1));
    const second = parseColor(resolveMixes(mix.second, tokens, depth - 1));

    if (first && second && mix.share !== null) {
      const mixed = mixOklab(first, second, mix.share);
      return toHex({ ...mixed, alpha: mixed.alpha * mix.alpha });
    }

    return substituted;
  }

  const parsed = parseColor(substituted);
  return parsed ? toHex(parsed) : substituted;
};

const MIX = /^color-mix\(\s*in\s+oklab\s*,(.*)\)$/i;
const MIX_AMOUNT = new RegExp(String.raw`\s(${NUMBER})%$`);

/**
 * The two colors of a `color-mix(in oklab, …)`, each perhaps with a
 * percentage, and how much of the first the mix has (`null` when the
 * percentages can't be), as CSS reads them: the first's 50% without either,
 * and an alpha of what they add up to when that's under 100%.
 */
const readMix = (value: string): { first: string; second: string; share: number | null; alpha: number } | null => {
  const inside = MIX.exec(value)?.[1];
  const parts = inside === undefined ? [] : topLevelParts(inside);

  if (parts.length !== 2) {
    return null;
  }

  const [first, second] = parts.map((part) => {
    const amount = MIX_AMOUNT.exec(part);
    return amount ? { color: part.slice(0, amount.index).trim(), amount: Number(amount[1]) / 100 } : { color: part, amount: undefined };
  });

  const firstAmount = first.amount ?? (second.amount === undefined ? 0.5 : 1 - second.amount);
  const secondAmount = second.amount ?? 1 - firstAmount;
  const total = firstAmount + secondAmount;
  const fair = [firstAmount, secondAmount].every((share) => share >= 0 && share <= 1) && total > 0;
  return { first: first.color, second: second.color, share: fair ? firstAmount / total : null, alpha: Math.min(1, total) };
};

/** `value` split at the commas outside its parentheses, each part trimmed. */
const topLevelParts = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;

    if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts;
};
