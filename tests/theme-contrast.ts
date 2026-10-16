/**
 * Contrast checks for theme tokens, shared by the theme tests: what a label
 * is drawn on, worked out the way the stylesheet paints a node, and the
 * lowest contrast any label gets.
 */
import { SHADES } from '../src/core/engine/scene';
import { SHADE_STOPS, readShadeCircle } from '../src/core/engine/views';
import { contrastRatio, mixOklab, parseColor, prefersLightText, type Rgb } from '../src/core/engine/colors';
import type { OrbitThemeTokens } from '../src/core/themes';

const PALETTE = ['color-root', 'color-1', 'color-2', 'color-3', 'color-4', 'color-5', 'color-6', 'color-7'] as const;

export const color = (value: string): Rgb => {
  const parsed = parseColor(value);

  if (!parsed) {
    throw new Error(`Not a color: ${value}`);
  }

  return parsed;
};

/** `front`, at `opacity` times its own alpha, over an opaque `back`. */
export const over = (front: Rgb, opacity: number, back: Rgb): Rgb => {
  const alpha = front.alpha * opacity;
  const blend = (top: number, bottom: number) => top * alpha + bottom * (1 - alpha);
  return { red: blend(front.red, back.red), green: blend(front.green, back.green), blue: blend(front.blue, back.blue), alpha: 1 };
};

/** The layers of a CSS background, split at the commas between them. */
const layers = (background: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < background.length; index += 1) {
    const character = background[index];
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;

    if (character === ',' && depth === 0) {
      parts.push(background.slice(start, index).trim());
      start = index + 1;
    }
  }

  return [...parts, background.slice(start).trim()];
};

/**
 * What can show behind a translucent node or the page's text: the surface,
 * alone and under each color of its pattern (except pinpoint stars). Light
 * themes with a transparent surface are checked on a white page.
 */
export const backdrops = (tokens: OrbitThemeTokens): Rgb[] => {
  const surface = tokens.surface === 'transparent' ? color('#FFFFFF') : color(tokens.surface);
  const pattern = layers(tokens['surface-pattern'])
    .filter((layer) => !/^radial-gradient\([\d.]+px/.test(layer))
    .flatMap((layer) => layer.match(/rgba?\([^)]*\)/g) ?? []);
  return [surface, ...pattern.map((value) => over(color(value), 1, surface))];
};

/** The sphere shading at a point of a unit node, as the gradient in `createDefinitions` paints it. */
const shadingAt = (tokens: OrbitThemeTokens, x: number, y: number): Rgb => {
  const highlight = color(tokens['node-highlight']);
  const terminator = color(tokens['node-terminator']);

  const stops: Rgb[] = SHADE_STOPS.map(({ part }) => {
    switch (part) {
      case 'highlight':
        return highlight;
      case 'highlight-fade':
        return { ...highlight, alpha: highlight.alpha * 0.2 };
      case 'terminator-start':
        return { ...terminator, alpha: 0 };
      case 'terminator':
        return terminator;
      default:
        return color(tokens['node-shading']);
    }
  });

  // The theme's circle is in fractions of the node's box; the point is in node radii, from -1 to 1.
  const circle = readShadeCircle(tokens['node-shade-circle']);
  const offset = Math.min(1, Math.hypot(x - (circle.x * 2 - 1), y - (circle.y * 2 - 1)) / (circle.radius * 2));
  const index = SHADE_STOPS.findIndex((stop) => stop.offset >= offset);

  if (index <= 0) {
    return stops[0];
  }

  const from = SHADE_STOPS[index - 1].offset;
  const share = (offset - from) / (SHADE_STOPS[index].offset - from);
  const lerp = (start: number, end: number) => start + (end - start) * share;
  const [start, end] = [stops[index - 1], stops[index]];
  return { red: lerp(start.red, end.red), green: lerp(start.green, end.green), blue: lerp(start.blue, end.blue), alpha: lerp(start.alpha, end.alpha) };
};

/** Points a label inside a node covers, in node radii from its center. */
const LABEL_AREA = [-0.6, -0.3, 0, 0.3, 0.6].flatMap((x) => [-0.35, 0, 0.35].map((y) => ({ x, y })));

/** Every color a node can have in this theme: each palette color, and the shades its descendants take. */
const nodeColors = (tokens: OrbitThemeTokens): string[] => {
  return PALETTE.flatMap((token, index) => {
    const base = tokens[token];

    if (index === 0) {
      return [base];
    }

    return SHADES.map(([amount, toward]) => {
      const shade = amount === 100 ? color(base) : mixOklab(color(base), color(tokens[`shade-${toward}`]), amount / 100);
      return `rgba(${shade.red * 255}, ${shade.green * 255}, ${shade.blue * 255}, ${shade.alpha})`;
    });
  });
};

/** How a node of each role is drawn: its fill opacity and the dark text its label may use. */
const ROLES = [
  { role: 'planet', opacity: 'node-fill-opacity', darkText: 'node-text' },
  { role: 'moon', opacity: 'moon-opacity', darkText: 'node-text' },
  // Any node becomes the sun when it is focused.
  { role: 'sun', opacity: 'node-fill-opacity', darkText: 'root-text' },
] as const;

/** The lowest contrast between a label and what is behind it, over every node color, role, backdrop and point of the label. */
export const worstLabelContrast = (tokens: OrbitThemeTokens): { ratio: number; where: string } => {
  let worst = { ratio: Infinity, where: '' };

  for (const nodeColor of nodeColors(tokens)) {
    for (const { role, opacity, darkText } of ROLES) {
      const light = tokens['node-text-inverse'];
      const dark = tokens[darkText];
      // The renderer chooses from the node's own color, whatever shows through it.
      const text = color(prefersLightText(nodeColor, light, dark) ? light : dark);

      for (const backdrop of backdrops(tokens)) {
        const fill = over(color(nodeColor), Number(tokens[opacity]), backdrop);

        for (const point of LABEL_AREA) {
          const seen = over(shadingAt(tokens, point.x, point.y), 1, fill);
          const ratio = contrastRatio(seen, text);

          if (ratio < worst.ratio) {
            worst = { ratio, where: `${role} colored ${nodeColor} at ${point.x}, ${point.y}` };
          }
        }
      }
    }
  }

  return worst;
};
