import type { OrbitDocument } from './types.js';
import { documentSource } from './document-source.js';
import { writeMarkdown } from './markdown-writing.js';
import { patchMarkdown } from './source-patch.js';

export interface OrbitSerializeOptions {
  /**
   * Keep the source's own lines for everything an edit didn't change (the
   * default, for a document parsed from markdown): its formatting, and the
   * text Orbit doesn't read, such as other HTML comments or frontmatter
   * keys of other apps. `false` writes the whole map in Orbit's own form.
   */
  keepSource?: boolean;
}

/** @deprecated Use `OrbitSerializeOptions`: this name goes in Orbit 1.0. */
export type SerializeOptions = OrbitSerializeOptions;

/**
 * A map as orbit-md. A document parsed from markdown comes back as it was
 * written, with only what changed since rewritten, so maps written by hand
 * or by other apps keep their formatting and everything Orbit doesn't read.
 * Other documents (built in code, or read from YAML) are written in Orbit's
 * own form: headings for the root and its children, lists below them.
 */
export const serializeOrbitMarkdown = (doc: OrbitDocument, options: OrbitSerializeOptions = {}): string => {
  const source = options.keepSource === false ? undefined : documentSource(doc);

  if (source) {
    const patched = patchMarkdown(doc, source);

    if (patched !== null) {
      return patched;
    }
  }

  return writeMarkdown(doc);
};
