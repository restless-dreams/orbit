/**
 * A theme's `surface-pattern` (CSS backgrounds) drawn as SVG, so exported
 * pictures keep the wallpaper glass shows through, a starfield or a grid.
 * Reads the kinds of layers Orbit's own themes use: radial gradients of one
 * color fading out, `linear-gradient` lines tiled by a size, and tiled
 * images. A layer of any other kind is left out of the picture.
 */

import { splitAlpha } from './colors.js';

export interface PatternLayers {
  /** `<defs>` entries the layers use. */
  definitions: string[];

  /** One full-size rectangle per layer, bottom layer first. */
  layers: string[];
}

/**
 * The layers of `pattern` for a picture `width` × `height`, with ids made
 * from `prefix`. `color` resolves a theme color to a plain value.
 */
export const patternLayers = (pattern: string, width: number, height: number, prefix: string, color: (value: string) => string): PatternLayers => {
  const definitions: string[] = [];
  const layers: string[] = [];

  // CSS draws the first layer on top: SVG paints in order, so they go last first.
  splitLayers(pattern).reverse().forEach((layer, index) => {
    const id = `${prefix}-surface-${index}`;
    const drawn = radialLayer(layer, width, height, id, color) ?? lineLayer(layer, id, color) ?? imageLayer(layer, id);

    if (drawn) {
      definitions.push(drawn);
      layers.push(`<rect width="${width}" height="${height}" fill="url(#${id})"/>`);
    }
  });

  return { definitions, layers };
};

/** The layers of a CSS background list, split at the commas between them. */
export const splitLayers = (value: string): string[] => {
  const layers: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (quote) {
      quote = character === quote ? '' : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  layers.push(value.slice(start).trim());
  return layers.filter((layer) => layer !== '' && layer !== 'none');
};

/** The arguments inside `name(…)`, split at their top-level commas. */
const argumentsOf = (layer: string, name: string): string[] | null => {
  const open = layer.indexOf(`${name}(`);

  if (open !== 0) {
    return null;
  }

  let depth = 0;

  for (let index = name.length; index < layer.length; index += 1) {
    if (layer[index] === '(') {
      depth += 1;
    } else if (layer[index] === ')') {
      depth -= 1;

      if (depth === 0) {
        return splitLayers(layer.slice(name.length + 1, index));
      }
    }
  }

  return null;
};

/** `radial-gradient(70% 55% at 12% 14%, <color>, transparent 70%)`: an ellipse of one color fading out. */
const radialLayer = (layer: string, width: number, height: number, id: string, color: (value: string) => string): string | null => {
  const parts = argumentsOf(layer, 'radial-gradient');

  if (!parts || parts.length < 3) {
    return null;
  }

  const shape = /^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+at\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(parts[0]);

  if (!shape) {
    return null;
  }

  const [radiusX, radiusY, x, y] = shape.slice(1).map(Number);

  const stops = parts.slice(1).map((part, index, all) => {
    const match = /^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(part)!;
    const offset = match[2] !== undefined ? Number(match[2]) / 100 : index / (all.length - 1);
    return { color: match[1].trim(), offset };
  });

  // Faded to `transparent`, a stop keeps the color it fades from, so the edge doesn't go grey.
  const solid = stops.find((stop) => stop.color !== 'transparent')?.color ?? 'transparent';
  const centerX = (x / 100) * width;
  const centerY = (y / 100) * height;
  const rx = (radiusX / 100) * width;
  const ry = (radiusY / 100) * height;

  if (rx <= 0 || ry <= 0) {
    return null;
  }

  const stopElements = stops.map((stop) => {
    const { color: value, opacity } = stop.color === 'transparent' ? { color: splitAlpha(color(solid)).color, opacity: 0 } : splitAlpha(color(stop.color));
    return `<stop offset="${round(stop.offset)}" stop-color="${escapeXml(value)}" stop-opacity="${round(opacity)}"/>`;
  });

  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${round(centerX)}" cy="${round(centerY)}" r="${round(rx)}" gradientTransform="translate(${round(centerX)} ${round(centerY)}) scale(1 ${round(ry / rx)}) translate(${round(-centerX)} ${round(-centerY)})">${stopElements.join('')}</radialGradient>`;
};

/** `linear-gradient([90deg, ]<color> 1px, transparent 1px) 0 0 / 120px 120px`: a line along each tile's top (or left) edge. */
const lineLayer = (layer: string, id: string, color: (value: string) => string): string | null => {
  const parts = argumentsOf(layer, 'linear-gradient');
  const tile = /\)\s*0\s+0\s*\/\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s*$/.exec(layer);

  if (!parts || !tile) {
    return null;
  }

  const vertical = parts[0] === '90deg';
  const stops = vertical ? parts.slice(1) : parts;
  const line = /^(.*?)\s+(\d+(?:\.\d+)?)px$/.exec(stops[0] ?? '');

  if (!line || stops.length !== 2 || !/^transparent\s/.test(stops[1])) {
    return null;
  }

  const [tileWidth, tileHeight] = [Number(tile[1]), Number(tile[2])];
  const thickness = Number(line[2]);
  const { color: value, opacity } = splitAlpha(color(line[1].trim()));
  const rect = vertical ? `width="${thickness}" height="${tileHeight}"` : `width="${tileWidth}" height="${thickness}"`;
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${tileWidth}" height="${tileHeight}"><rect ${rect} fill="${escapeXml(value)}" fill-opacity="${round(opacity)}"/></pattern>`;
};

/** `url("data:image/svg+xml,…") 0 0 / 640px 640px`: an image tiled at its size. */
const imageLayer = (layer: string, id: string): string | null => {
  // The image's own markup may hold the other kind of quote: the URL ends at its closing quote and `)`.
  const match = /^url\((["']?)(data:image\/.+?)\1\)\s*0\s+0\s*\/\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px$/s.exec(layer);

  if (!match) {
    return null;
  }

  const [source, tileWidth, tileHeight] = [match[2], match[3], match[4]];
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${tileWidth}" height="${tileHeight}"><image href="${escapeXml(source)}" width="${tileWidth}" height="${tileHeight}"/></pattern>`;
};

const round = (value: number): number => {
  return Math.round(value * 1000) / 1000;
};

const escapeXml = (text: string): string => {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};
