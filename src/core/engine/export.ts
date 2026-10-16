/**
 * Standalone SVG for a display. Every color is resolved to a plain value,
 * labels are SVG text and nothing depends on the page's stylesheet, so the
 * file looks the same in any viewer or editor.
 */

import type { Display, DisplayNode } from './display.js';
import { worldToScreen, type Viewport } from './camera.js';
import { mixOklab, parseColor, prefersLightText, resolveColor, splitAlpha, toHex } from './colors.js';
import { SHADE_STOPS, SHADOW_BLUR, drawsFlat, insideLabelLayout, nodeThumbnail, readShadeCircle, ringPath } from './views.js';
import { labelOrder, outsideLabelBox, planLabels, type PlannedLabel } from './labels.js';
import { hasMediaSource } from '../media.js';
import { statusTone } from '../ui/detail-sheet.js';
import type { MapExtensions } from '../extensions.js';
import type { OrbitWords } from '../languages.js';
import { wrapText } from '../text-layout.js';
import { patternLayers } from './surface-pattern.js';
import { ESTIMATED_LABELS, type LabelMeasures } from './text-measure.js';
import { guardUrl, resolveUrl } from '../url-guard.js';

export interface ExportOptions {
  viewport: Viewport;

  /** Concrete theme values, keyed by token name (`surface`, `color-1`, …). */
  tokens: Record<string, string>;

  showRings: boolean;
  title: string;

  /** The fill the page resolved for a node, when it is on screen. */
  fills?: (node: DisplayNode) => string;

  baseUrl?: string;

  /** Size the SVG to its container (100% wide and tall) instead of in pixels. */
  responsive?: boolean;

  /** Prefix for the SVG's ids; give each SVG inlined in one page its own. */
  idPrefix?: string;

  /** The map's node types and status words, for icons, status colors and type tokens. */
  extensions?: MapExtensions;

  /** Measures names in the fonts the map draws them with, so labels break as on the live map; by default, widths are estimated. */
  measures?: LabelMeasures;

  /** The map's words, for the name of an idea without text. Default: English. */
  words?: OrbitWords;
}

const ROLE_ORDER = { moon: 0, node: 1, planet: 1, sun: 2 } as const;
const FONT_SIZE = { sun: 16, planet: 13, node: 12, moon: 13 } as const;
const LINES = { sun: 3, planet: 2, node: 2, moon: 2 } as const;

/** Theme values read as plain colors, numbers and mixes. */
class ThemeReader {
  readonly tokens: Record<string, string>;

  constructor(tokens: Record<string, string>) {
    this.tokens = tokens;
  }

  value(name: string, fallback = ''): string {
    return this.tokens[name] ?? fallback;
  }

  color(value: string): string {
    return resolveColor(value, this.tokens);
  }

  token(name: string, fallback = '#000000'): string {
    return this.color(this.value(name, fallback));
  }

  number(name: string, fallback: number): number {
    const parsed = Number.parseFloat(this.value(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /** `color-mix(in oklab, own <tint>, <base token>)`, as the stylesheet mixes rims, shadows, rings and links. */
  tinted(own: string, base: string, tint: string): string {
    const ownColor = parseColor(this.color(own));
    const baseColor = parseColor(this.token(base));
    const amount = this.number(tint, 0) / 100;

    if (!ownColor || !baseColor) {
      return this.token(base);
    }

    return toHex(mixOklab(ownColor, baseColor, Math.min(1, Math.max(0, amount))));
  }
}

/**
 * `fill="#rrggbb" fill-opacity="…"`: the color's alpha times `opacity`, written
 * apart for design tools. A color Orbit can't read is written as given (SVG
 * takes any CSS color), escaped, since maps and themes can hold any text.
 */
const paint = (kind: 'fill' | 'stroke' | 'stop', color: string, opacity = 1): string => {
  const { color: value, opacity: alpha } = splitAlpha(color);
  const hex = escapeXml(value);
  const total = round(alpha * opacity);
  const name = kind === 'stop' ? 'stop-color' : kind;
  const opacityName = kind === 'stop' ? 'stop-opacity' : `${kind}-opacity`;
  return total < 1 || kind === 'stop' ? `${name}="${hex}" ${opacityName}="${total}"` : `${name}="${hex}"`;
};

const dashAttribute = (dash: string): string => {
  return dash.trim() === '' || dash.trim() === 'none' ? '' : ` stroke-dasharray="${escapeXml(dash.trim())}"`;
};

export const exportDisplay = (display: Display | null, options: ExportOptions): string => {
  const { viewport } = options;
  const theme = new ThemeReader(options.tokens);
  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);
  const prefix = escapeXml(options.idPrefix ?? 'orbit-export');
  const untitled = options.words?.text('untitled') ?? 'Untitled';
  const size = options.responsive ? 'width="100%" height="100%" preserveAspectRatio="xMidYMid meet"' : `width="${width}" height="${height}"`;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(options.title)}">`,
    `<title>${escapeXml(options.title)}</title>`,
  ];
  const definitions: string[] = [shadeGradient(`${prefix}-shade`, theme)];
  const body: string[] = [];
  // The surface color, and the theme's pattern over it: the wallpaper glass shows through, stars, a grid.
  const surface = theme.token('surface', 'transparent');
  const surfaceColor = parseColor(surface);

  if (surfaceColor && surfaceColor.alpha > 0) {
    body.push(`<rect width="${width}" height="${height}" ${paint('fill', surface)}/>`);
  }

  const pattern = patternLayers(theme.value('surface-pattern', 'none'), width, height, prefix, (value) => theme.color(value));
  definitions.push(...pattern.definitions);
  body.push(...pattern.layers);

  if (display) {
    const { camera } = display;
    const place = (node: { x: number; y: number }) => worldToScreen(camera, viewport, node);

    if (options.showRings) {
      const ringOpacity = theme.number('ring-opacity', 0.5);
      const ringWidth = theme.number('ring-width', 1.5);
      const ringDash = dashAttribute(theme.value('ring-dash', 'none'));

      for (const ring of display.rings) {
        if (ring.opacity <= 0.01) {
          continue;
        }

        const center = place({ x: ring.cx, y: ring.cy });
        const d = ringPath(ring.radius * camera.scale, ring.gaps);
        const stroke = theme.tinted(ring.color, 'ring-stroke', 'ring-tint');
        body.push(`<path d="${d}" transform="translate(${round(center.x)} ${round(center.y)}) rotate(${round(ring.rotation)})" fill="none" ${paint('stroke', stroke, ringOpacity)} stroke-width="${ringWidth}"${ringDash} stroke-linecap="round"/>`);
      }
    }

    const linkOpacity = theme.number('link-opacity', 0.5);
    const linkWidth = theme.number('link-width', 1.5);
    const linkDash = dashAttribute(theme.value('link-dash', 'none'));

    for (const link of display.links) {
      const from = display.nodes.get(link.fromId);
      const to = display.nodes.get(link.toId);

      if (!from || !to) {
        continue;
      }

      const start = place(from);
      const end = place(to);
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const fromRadius = from.radius * camera.scale;
      const toRadius = to.radius * camera.scale;

      if (length <= fromRadius + toRadius) {
        continue;
      }

      const unitX = (end.x - start.x) / length;
      const unitY = (end.y - start.y) / length;
      const stroke = theme.tinted(link.color, 'link-stroke', 'link-tint');
      body.push(`<line x1="${round(start.x + unitX * fromRadius)}" y1="${round(start.y + unitY * fromRadius)}" x2="${round(end.x - unitX * toRadius)}" y2="${round(end.y - unitY * toRadius)}" ${paint('stroke', stroke, linkOpacity)} stroke-width="${linkWidth}"${linkDash} stroke-linecap="round"/>`);
    }

    const nodes = Array.from(display.nodes.values())
      .filter((node) => node.opacity > 0.01 && node.radius > 0)
      .sort((left, right) => ROLE_ORDER[left.role] - ROLE_ORDER[right.role]);
    const fills = new Map<string, string>();
    const pictures = new Set<string>();
    // A node type's tokens win over the theme for its nodes.
    const typeThemes = new Map<string, ThemeReader>();

    const themeFor = (node: DisplayNode): ThemeReader => {
      const tokens = options.extensions?.nodeType(node.node)?.tokens;
      const type = options.extensions?.typeName(node.node) ?? node.node.type;

      if (!tokens || !type) {
        return theme;
      }

      const key = type.toLowerCase();
      let reader = typeThemes.get(key);

      if (!reader) {
        const own = Object.fromEntries(Object.entries(tokens).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''));
        reader = new ThemeReader({ ...options.tokens, ...own });
        typeThemes.set(key, reader);
      }

      return reader;
    };

    const hasShadow = (node: DisplayNode) => node.role !== 'node'
      && !drawsFlat(node, node.radius * camera.scale)
      && themeFor(node).number(node.role === 'sun' ? 'sun-shadow-opacity' : 'node-shadow-opacity', 0) > 0;

    if (nodes.some(hasShadow)) {
      for (const [id, blur] of [[`${prefix}-shadow`, SHADOW_BLUR.planet], [`${prefix}-sun-shadow`, SHADOW_BLUR.sun]] as const) {
        definitions.push(`<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${blur}"/></filter>`);
      }
    }

    nodes.forEach((node, index) => {
      const nodeTheme = themeFor(node);
      const center = place(node);
      const radius = node.radius * camera.scale;
      const resolved = options.fills?.(node);
      const own = resolved ? nodeTheme.color(resolved) : nodeTheme.color(node.color);
      fills.set(node.id, own);
      const isSun = node.role === 'sun';
      const fillOpacity = nodeTheme.number('node-fill-opacity', 1);
      const strokeWidth = nodeTheme.number('node-stroke-width', 1.5);

      if (hasShadow(node)) {
        const shadow = nodeTheme.tinted(own, 'node-shadow', 'node-shadow-tint');
        const opacity = nodeTheme.number(isSun ? 'sun-shadow-opacity' : 'node-shadow-opacity', 0);
        const scale = radius * nodeTheme.number(isSun ? 'sun-shadow-size' : 'node-shadow-size', 1);
        const offset = radius * nodeTheme.number('node-shadow-offset', 0);
        // A unit circle, scaled like the live map's, so one blur fits every size.
        body.push(`<circle r="1" transform="translate(${round(center.x)} ${round(center.y + offset)}) scale(${round(scale, 3)})" ${paint('fill', shadow, opacity)} filter="url(#${prefix}-${isSun ? 'sun-shadow' : 'shadow'})"/>`);
      }

      if (isSun) {
        body.push(...halo(center, radius, own, nodeTheme));
      }

      const circle = `cx="${round(center.x)}" cy="${round(center.y)}" r="${round(radius)}"`;
      body.push(`<circle ${circle} ${paint('fill', own, node.role === 'moon' ? nodeTheme.number('moon-opacity', fillOpacity) : fillOpacity)}/>`);
      const thumbnail = nodeThumbnail(node.node);
      const source = thumbnail ? guardUrl(thumbnail, 'image') : null;

      if (source) {
        pictures.add(node.id);
        const clip = `${prefix}-clip-${index}`;
        definitions.push(`<clipPath id="${clip}"><circle ${circle}/></clipPath>`);
        body.push(`<image href="${escapeXml(resolveUrl(source, options.baseUrl))}" x="${round(center.x - radius)}" y="${round(center.y - radius)}" width="${round(radius * 2)}" height="${round(radius * 2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"/>`);
      }

      const rim = nodeTheme.tinted(own, 'node-stroke', 'node-stroke-tint');
      // A crowded orbit's rims grow with their planets, as on the live map.
      const rimWidth = node.crowded ? strokeWidth * 0.04 * radius : node.role === 'moon' ? strokeWidth * 0.7 : strokeWidth;
      body.push(`<circle ${circle} fill="url(#${prefix}-shade)" ${paint('stroke', rim)} stroke-width="${round(rimWidth)}"/>`);
      body.push(...badges(node, center, radius, nodeTheme, options.extensions));
    });

    const iconOf = (entry: DisplayNode) => (options.extensions ? options.extensions.icon(entry.node) : entry.node.icon);
    const measures = options.measures ?? ESTIMATED_LABELS;
    const planned = planLabels(display, labelOrder(nodes), {
      viewport,
      hasImage: (entry) => pictures.has(entry.id),
      hasIcon: (entry) => Boolean(iconOf(entry)),
      // A picture fills the node: its icon goes on the pill, as on the live map.
      pillIcon: (entry) => (pictures.has(entry.id) ? iconOf(entry) : undefined),
      measures,
    });

    for (const plan of planned) {
      body.push(...exportLabel(plan, fills.get(plan.entry.id) ?? '#ffffff', themeFor(plan.entry), iconOf(plan.entry), measures, untitled));
    }
  }

  parts.push(`<defs>${definitions.join('')}</defs>`, ...body, '</svg>');
  return parts.join('');
};

/** The sphere shading, with the stops the stylesheet colors from the theme. */
const shadeGradient = (id: string, theme: ThemeReader): string => {
  const highlight = theme.token('node-highlight', 'rgba(255, 255, 255, 0.5)');
  const terminator = theme.token('node-terminator', 'rgba(0, 0, 0, 0)');
  const shading = theme.token('node-shading', 'rgba(0, 0, 0, 0.12)');

  const stops = SHADE_STOPS.map(({ offset, part }) => {
    switch (part) {
      case 'highlight':
        return `<stop offset="${offset}" ${paint('stop', highlight)}/>`;
      case 'highlight-fade':
        return `<stop offset="${offset}" ${paint('stop', highlight, 0.2)}/>`;
      case 'terminator-start':
        return `<stop offset="${offset}" ${paint('stop', terminator, 0)}/>`;
      case 'terminator':
        return `<stop offset="${offset}" ${paint('stop', terminator)}/>`;
      default:
        return `<stop offset="${offset}" ${paint('stop', shading)}/>`;
    }
  });

  const circle = readShadeCircle(theme.value('node-shade-circle', ''));
  return `<radialGradient id="${id}" cx="${circle.x}" cy="${circle.y}" r="${circle.radius}">${stops.join('')}</radialGradient>`;
};

/** The ring the theme draws around the sun, if any. */
const halo = (center: { x: number; y: number }, radius: number, own: string, theme: ThemeReader): string[] => {
  const opacity = theme.number('sun-halo-opacity', 0);
  const width = theme.number('sun-halo-width', 0);

  if (opacity <= 0 || width <= 0) {
    return [];
  }

  const stroke = theme.tinted(own, 'sun-halo', 'sun-halo-tint');
  const dash = dashAttribute(theme.value('sun-halo-dash', 'none'));
  return [`<circle cx="${round(center.x)}" cy="${round(center.y)}" r="${round(radius * theme.number('sun-halo-size', 1.15))}" fill="none" ${paint('stroke', stroke, opacity)} stroke-width="${width}"${dash}/>`];
};

/** Status dot, content marker and video badge, placed as on the live map. */
const badges = (node: DisplayNode, center: { x: number; y: number }, radius: number, theme: ThemeReader, extensions?: MapExtensions): string[] => {
  const parts: string[] = [];
  const stroke = paint('stroke', theme.token('badge-stroke', '#ffffff'));
  const isSun = node.role === 'sun';

  if (node.node.status && radius > 6) {
    const offset = (isSun ? 0.68 : 0.72) * radius;
    const look = extensions?.status(node.node.status) ?? { tone: statusTone(node.node.status) };
    const color = look.color ?? theme.token(`status-${look.tone}`, '#94a3b8');
    parts.push(`<circle cx="${round(center.x + offset)}" cy="${round(center.y - offset)}" r="${round((isSun ? 0.11 : 0.17) * radius)}" ${paint('fill', color)} ${stroke} stroke-width="${round((isSun ? 0.025 : 0.04) * radius)}"/>`);
  }

  // The focused node's buttons offer its content, so it has no marker or badge.
  if (isSun || radius <= 8) {
    return parts;
  }

  if (hasMediaSource(node.node.video)) {
    const x = center.x + 0.62 * radius;
    const y = center.y + 0.62 * radius;
    const size = 0.3 * radius;
    parts.push(`<circle cx="${round(x)}" cy="${round(y)}" r="${round(size)}" fill="#0f172a" fill-opacity="0.62"/>`);
    parts.push(`<path d="M${round(x - 0.32 * size)} ${round(y - 0.48 * size)} L${round(x + 0.52 * size)} ${round(y)} L${round(x - 0.32 * size)} ${round(y + 0.48 * size)} Z" fill="#ffffff"/>`);
  } else if (node.node.note || hasMediaSource(node.node.image) || hasMediaSource(node.node.embed) || node.node.link || extensions?.nodeType(node.node)?.details) {
    parts.push(`<circle cx="${round(center.x + 0.72 * radius)}" cy="${round(center.y + 0.72 * radius)}" r="${round(0.13 * radius)}" ${paint('fill', theme.token('note-indicator', '#1b2333'))} ${stroke} stroke-width="${round(0.04 * radius)}"/>`);
  }

  return parts;
};

const exportLabel = (plan: PlannedLabel, fill: string, theme: ThemeReader, icon: string | undefined, measures: LabelMeasures, untitled: string): string[] => {
  const { entry, x, y, screenRadius } = plan;
  const text = entry.node.text || untitled;
  const isSun = entry.role === 'sun';
  const font = escapeXml(theme.value(isSun ? 'display-font' : 'label-font', theme.value('font-family', 'sans-serif')));
  const weight = escapeXml(theme.value(isSun ? 'display-weight' : 'label-weight', isSun ? '650' : '600'));
  const letterSpacing = theme.value('label-letter-spacing', '0').trim();
  const spacing = letterSpacing === '0' || letterSpacing === '' || letterSpacing === 'normal' ? '' : ` letter-spacing="${escapeXml(letterSpacing)}"`;
  const opacity = plan.opacity >= 0.999 ? '' : ` opacity="${round(plan.opacity)}"`;
  const inside = plan.placement === 'inside' ? insideLabelLayout(entry.role, screenRadius, text, Boolean(icon), measures.inside(entry.role, entry.node)) : null;

  if (plan.placement === 'outside') {
    const fontSize = 11.5;
    const lineCount = plan.lines;
    const pill = measures.pill(entry.role, entry.node);
    // The pill's own text: the name, after the node's icon when a picture fills the node.
    const pillText = plan.text || untitled;
    const box = outsideLabelBox(pillText, { x, y }, screenRadius, plan.direction, isSun ? 280 : 160, plan.offset, lineCount, pill);
    const width = box.right - box.left;
    const pillLines = wrapText(pillText, width - 12, fontSize, lineCount, pill).lines;
    const middle = (box.top + box.bottom) / 2;
    const height = lineCount === 1 ? 20 : 34;
    const lineHeight = 14;
    const firstBaseline = middle - ((pillLines.length - 1) * lineHeight) / 2 + fontSize * 0.36;
    const spans = pillLines
      .map((line, index) => `<tspan x="${round((box.left + box.right) / 2)}" y="${round(firstBaseline + index * lineHeight)}">${escapeXml(line)}</tspan>`)
      .join('');
    return [
      `<g${opacity}>`,
      `<rect x="${round(box.left)}" y="${round(middle - height / 2)}" width="${round(width)}" height="${height}" rx="10" ${paint('fill', theme.token('control-background', '#ffffff'))}/>`,
      `<text text-anchor="middle" font-family="${font}" font-size="${fontSize}" font-weight="${weight}"${spacing} ${paint('fill', theme.token('control-text', '#1b2333'))}>${spans}</text>`,
      '</g>',
    ];
  }

  const fontSize = inside?.fontSize ?? FONT_SIZE[entry.role];
  // The lines the live map shows; a label that doesn't fit falls back to wrapping at the usual width.
  const textLines = inside?.lines ?? wrapText(text, screenRadius * 1.68, fontSize, LINES[entry.role], measures.inside(entry.role, entry.node)).lines;
  const lines = icon && (inside?.icon ?? true) ? [icon, ...textLines] : textLines;
  const lineHeight = fontSize * 1.22;
  const lightText = theme.token('node-text-inverse', '#ffffff');
  const darkText = theme.token(isSun ? 'root-text' : 'node-text', '#1b2333');
  const textColor = prefersLightText(fill, lightText, darkText) ? lightText : darkText;
  const firstBaseline = y - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
  const spans = lines
    .map((line, index) => `<tspan x="${round(x)}" y="${round(firstBaseline + index * lineHeight)}">${escapeXml(line)}</tspan>`)
    .join('');
  // A name drawn narrower to fit, as on the live map.
  const stretch = inside?.stretch ? ` font-stretch="${inside.stretch}%"` : '';
  return [`<text text-anchor="middle" font-family="${font}" font-size="${fontSize}" font-weight="${weight}"${stretch}${spacing} ${paint('fill', textColor)}${opacity}>${spans}</text>`];
};

export const escapeXml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
