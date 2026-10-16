import { MapExtensions, type OrbitNodeType, type OrbitStatusStyle } from './extensions.js';
import type { OrbitDocument, OrbitNode, OrbitRendererTheme, OrbitThemePreset, ViewMode } from './types.js';
import { parseOrbit } from './dispatch.js';
import { documentToRendererOptions } from './document-options.js';
import { findNodeById } from './utils.js';
import { hasMediaSource } from './media.js';
import { expandTheme, mergeThemes, resolvePalette, resolveThemeTokens, themeName } from './themes.js';
import { assignNodeColors, buildFocusScene, buildOverviewScene } from './engine/scene.js';
import { sceneDisplay } from './engine/display.js';
import { escapeXml, exportDisplay } from './engine/export.js';
import { resolveColor } from './engine/colors.js';
import { OrbitWords, type OrbitStrings } from './languages.js';

/**
 * The largest width or height the exporter accepts: a million pixels, far
 * past any drawing. The label grid numbers its 64 px cells, and past about
 * 6 × 10⁹ px a side those numbers stop being exact; past about 6 × 10¹⁷ its
 * loops stop advancing and the export never finishes.
 */
export const MAX_SVG_EXPORT_SIZE = 1_000_000;

export interface RenderToSVGOptions {
  /** Width of the drawing, in pixels: positive, at most `MAX_SVG_EXPORT_SIZE`. Default 800. */
  width?: number;

  /** Height of the drawing, in pixels: positive, at most `MAX_SVG_EXPORT_SIZE`. Default 600. */
  height?: number;

  /** `focus` (default) or `all` for the overview. */
  viewMode?: ViewMode;

  /** The node at the center in focus mode, by id. Default: the root. */
  focus?: string;

  /** A theme name or an object of theme values. Default: the document's theme, or `paper`. */
  theme?: OrbitThemePreset | (string & {}) | OrbitRendererTheme;

  palette?: string[];
  maxDepth?: number;
  showRings?: boolean;

  /** The SVG's title and accessible name. Default: the document's title, or the root's text. */
  title?: string;

  /** The language of the few words the drawing has (an untitled idea, the empty map): a BCP 47 tag. Default: English. */
  language?: string;

  /** Words to change, over the language's. */
  strings?: Partial<OrbitStrings>;

  /** Resolves relative image URLs. */
  baseUrl?: string;

  /** Size the SVG to its container (100% wide and tall) instead of in pixels. */
  responsive?: boolean;

  /** Prefix for the SVG's ids; give each SVG inlined in one page its own. */
  idPrefix?: string;

  /** Node types by name, before the registered ones: their icons, colors and tokens. */
  nodeTypes?: Record<string, OrbitNodeType>;

  /** Status words and how they look, before the registered ones. */
  statuses?: Record<string, OrbitStatusStyle>;

  /** The type a node that names none is drawn as, for display only (see `RendererOptions.nodeTypeFor`). */
  nodeTypeFor?: (node: OrbitNode) => string | undefined;
}

/**
 * Renders a map to a standalone SVG string, without a browser: for files,
 * the command line, static sites and server rendering. It draws what the
 * renderer shows at rest, with the theme's colors resolved to plain values
 * and the labels as SVG text.
 *
 * @example
 * ```ts
 * import { renderToSVGString } from '@restless-dreams/orbit';
 *
 * const svg = renderToSVGString('# Launch\n## Research\n## Build', { width: 1200, height: 800, theme: 'cosmos' });
 * ```
 */
export const renderToSVGString = (input: string | OrbitDocument | OrbitNode, options: RenderToSVGOptions = {}): string => {
  const words = new OrbitWords(options.language, options.strings);
  const doc: OrbitDocument | null = typeof input === 'string' ? parseOrbit(input, { untitled: words.text('untitledMap') }) : isDocument(input) ? input : null;
  const tree = doc ? doc.root : (input as OrbitNode);
  const fromDocument = doc ? documentToRendererOptions(doc.options) : {};
  const viewport = { width: readSize(options.width, 800, 'width'), height: readSize(options.height, 600, 'height') };
  const theme = expandTheme(mergeThemes(fromDocument.theme, options.theme));
  const tokens: Record<string, string> = resolveThemeTokens(themeName(theme), typeof theme === 'object' ? theme : undefined);
  const title = options.title ?? fromDocument.ariaLabel ?? (tree.text || words.text('mindMap'));
  const extensions = new MapExtensions({ nodeTypes: options.nodeTypes, statuses: options.statuses, nodeTypeFor: options.nodeTypeFor });
  const exportOptions = {
    viewport,
    extensions,
    tokens,
    showRings: options.showRings ?? fromDocument.showRings ?? true,
    title,
    baseUrl: options.baseUrl ?? fromDocument.baseUrl,
    responsive: options.responsive,
    idPrefix: options.idPrefix,
    words,
  };

  if (isEmptyTree(tree)) {
    return emptyMap(exportOptions.title, words.text('emptyMap'), viewport, tokens, options.responsive);
  }

  const sceneOptions = {
    viewport,
    colors: assignNodeColors(tree, resolvePalette(options.palette ?? fromDocument.palette), (node) => extensions.color(node)),
    maxDepth: options.maxDepth ?? fromDocument.maxDepth,
  };
  const viewMode = options.viewMode ?? fromDocument.viewMode ?? 'focus';
  const focusId = options.focus && findNodeById(tree, options.focus) ? options.focus : tree.id;
  const scene = viewMode === 'all' ? buildOverviewScene(tree, sceneOptions) : buildFocusScene(tree, focusId, sceneOptions);
  return exportDisplay(sceneDisplay(scene, 0, scene.frame), exportOptions);
};

const isDocument = (input: OrbitDocument | OrbitNode): input is OrbitDocument => {
  return typeof (input as OrbitDocument).root === 'object' && (input as OrbitDocument).root !== null && !('children' in input);
};

const readSize = (value: number | undefined, fallback: number, name: 'width' | 'height'): number => {
  const size = value ?? fallback;

  if (!Number.isFinite(size) || size <= 0 || size > MAX_SVG_EXPORT_SIZE) {
    throw new Error(`RenderToSVGOptions.${name} must be a positive number no larger than ${MAX_SVG_EXPORT_SIZE}: got ${size}.`);
  }

  return size;
};

const isEmptyTree = (tree: OrbitNode): boolean => {
  return tree.text.trim() === '' && !tree.icon && tree.children.length === 0
    && !hasMediaSource(tree.image) && !hasMediaSource(tree.video) && !hasMediaSource(tree.embed);
};

const emptyMap = (title: string, message: string, viewport: { width: number; height: number }, tokens: Record<string, string>, responsive?: boolean): string => {
  const { width, height } = viewport;
  const size = responsive ? 'width="100%" height="100%"' : `width="${width}" height="${height}"`;
  const color = resolveColor(tokens['muted-text'] ?? '#5F6B7D', tokens);
  const font = escapeXml(tokens['font-family'] ?? 'sans-serif');
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`
    + `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="${font}" font-size="15" fill="${color}">${escapeXml(message)}</text></svg>`;
};
