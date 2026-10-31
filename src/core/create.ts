import { OrbitSVGRenderer } from './svg-renderer.js';
import { parseOrbit } from './dispatch.js';
import { reportParseDiagnostics } from './diagnostics.js';
import { wordsFor } from './languages.js';
import type { OrbitDocument, OrbitNode, OrbitRendererOptions } from './types.js';

/** What `createOrbitMap` takes: the renderer's options, and `strict`. */
export interface OrbitMapOptions extends OrbitRendererOptions {
  /** Throw on the first problem in the source instead of working around it. */
  strict?: boolean;
}

/** @deprecated Use `OrbitMapOptions`: this name goes in Orbit 1.0. */
export type CreateOrbitMapOptions = OrbitMapOptions;

/**
 * Draws a map into `target` in one call: markdown or YAML source, a parsed
 * document or a node tree. Returns the renderer, to listen for events
 * (`renderer.on('focus-change', …)`), draw new versions (`renderer.render(source)`)
 * and clean up (`renderer.destroy()`).
 *
 * The map fills `target`, so give it a height.
 *
 * @example
 * ```ts
 * import { createOrbitMap } from '@restless-dreams/orbit';
 *
 * const map = createOrbitMap(document.querySelector('#map')!, '# Launch\n## Research\n## Build', { theme: 'auto' });
 * map.on('focus-change', ({ node }) => console.log(node.text));
 * ```
 */
export const createOrbitMap = (
  target: HTMLElement,
  source: string | OrbitDocument | OrbitNode,
  options: OrbitMapOptions = {},
): OrbitSVGRenderer => {
  const { strict, ...rendererOptions } = options;
  let input: OrbitDocument | OrbitNode;

  // Source is read before anything is drawn: when strict reading throws, `target` is left as it was, a map in it too.
  if (typeof source === 'string') {
    const doc = parseOrbit(source, { strict, untitled: wordsFor(rendererOptions.language, target, rendererOptions.strings).text('untitledMap') });
    reportParseDiagnostics(doc);
    input = doc;
  } else {
    input = source;
  }

  const renderer = new OrbitSVGRenderer(target, rendererOptions);
  renderer.render(input);
  return renderer;
};
