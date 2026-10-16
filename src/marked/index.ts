/**
 * marked integration: turns ```orbit (or ~~~orbit) fences into map
 * placeholders that `hydrateOrbitBlocks()` brings to life in the browser.
 */

import { Marked, marked } from 'marked';
import type { MarkedExtension, RendererExtension, TokenizerExtension } from 'marked';
import { parseOrbit } from '../core/dispatch.js';
import { renderOrbitMarkdownBlocks } from '../core/auto-render.js';
import type { AutoRenderOptions } from '../core/auto-render.js';
import type { OrbitSVGRenderer } from '../core/svg-renderer.js';
import type { OrbitNode } from '../core/types.js';

interface OrbitToken {
  type: 'orbit';
  raw: string;
  text: string;
  settings: Record<string, string>;
}

// Options written after the language name: ```orbit height=480 theme=glass view=all
const SETTING_ATTRIBUTES: Record<string, string> = {
  height: 'data-height',
  theme: 'data-theme',
  view: 'data-view-mode',
  'view-mode': 'data-view-mode',
  'max-depth': 'data-max-depth',
  maxDepth: 'data-max-depth',
  palette: 'data-palette',
  animation: 'data-animation',
  interactive: 'data-interactive',
};

const FENCE_START = /^ {0,3}(?:`{3,}|~{3,})orbit(?=\s|$)/m;
const FENCE = /^ {0,3}(`{3,}|~{3,})orbit(?=\s|$)([^\n`]*)\n([\s\S]*?)(?:\n {0,3}\1[`~]*[ \t]*(?:\n+|$)|$)/;

/**
 * The marked extension, for `new Marked(orbitMarked())` or
 * `marked.use(orbitMarked())`.
 */
export const orbitMarked = (): MarkedExtension => {
  return { extensions: [createOrbitExtension()] };
};

/** The tokenizer and renderer that `orbitMarked()` wraps. */
export const createOrbitExtension = (): TokenizerExtension & RendererExtension => {
  return {
    name: 'orbit',
    level: 'block',
    start(source: string): number | undefined {
      const match = FENCE_START.exec(source);
      return match ? match.index : undefined;
    },
    tokenizer(source: string): OrbitToken | undefined {
      const match = FENCE.exec(source);

      if (!match) {
        return undefined;
      }

      return {
        type: 'orbit',
        raw: match[0],
        text: match[3],
        settings: parseSettings(match[2]),
      };
    },
    renderer(token): string {
      const orbitToken = token as unknown as OrbitToken;

      if (orbitToken.type !== 'orbit') {
        return '';
      }

      const attributes = [`class="orbit-mind-map"`, `data-orbit="${escapeHtml(orbitToken.text.trim())}"`];

      for (const [key, value] of Object.entries(orbitToken.settings)) {
        const attribute = SETTING_ATTRIBUTES[key];

        if (attribute) {
          attributes.push(`${attribute}="${escapeHtml(value)}"`);
        }
      }

      return `<div ${attributes.join(' ')}>${fallbackOutline(orbitToken.text)}</div>\n`;
    },
  };
};

let privateInstance: Marked | null = null;

/**
 * Renders markdown to HTML with orbit fences turned into placeholders. Uses
 * its own marked instance, so the global `marked` is left untouched.
 */
export const renderOrbitMarkdown = async (markdown: string): Promise<string> => {
  privateInstance ??= new Marked(orbitMarked());
  return privateInstance.parse(markdown);
};

const configuredInstances = new WeakSet<object>();

/**
 * Registers the extension on a marked instance (the global `marked` by
 * default) and returns it. Calling it again for the same instance is a no-op.
 */
export const configureMarked = <Instance extends { use: (...extensions: MarkedExtension[]) => unknown }>(
  instance: Instance = marked as unknown as Instance,
): Instance => {
  if (!configuredInstances.has(instance)) {
    instance.use(orbitMarked());
    configuredInstances.add(instance);
  }

  return instance;
};

/**
 * Turns every orbit placeholder under `root` (default: the whole document)
 * into a live map. Call it after inserting the rendered HTML.
 */
export const hydrateOrbitBlocks = (root?: ParentNode, options: AutoRenderOptions = {}): OrbitSVGRenderer[] => {
  return renderOrbitMarkdownBlocks(root, options);
};

const parseSettings = (infoString: string): Record<string, string> => {
  const settings: Record<string, string> = {};

  for (const match of infoString.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    settings[match[1]] = match[2] ?? match[3] ?? match[4];
  }

  return settings;
};

/** A nested list of the map, shown to readers without JavaScript and replaced when the map hydrates. */
const fallbackOutline = (source: string): string => {
  const { root } = parseOrbit(source);

  if (!root.text && root.children.length === 0) {
    return '';
  }

  return `<ul class="orbit-mind-map__outline">${outlineItem(root)}</ul>`;
};

const outlineItem = (node: OrbitNode): string => {
  const label = escapeHtml([node.icon, node.text].filter(Boolean).join(' '));
  const children = node.children.length > 0 ? `<ul>${node.children.map(outlineItem).join('')}</ul>` : '';
  return `<li>${label}${children}</li>`;
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};
