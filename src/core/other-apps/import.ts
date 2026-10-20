/**
 * Maps from other apps: OPML from outliners and most mind map apps,
 * FreeMind and Freeplane's `.mm`, and XMind's `.xmind`. `importMap` tells
 * the format from the file's name or what it holds and reads it into Orbit
 * maps, with the pictures inside the file and warnings for what Orbit keeps
 * another way or couldn't keep.
 */

import { importFreeMind } from './freemind.js';
import { OrbitImportError } from './ideas.js';
import { decodeMarkup } from './markup.js';
import { importOPML } from './opml.js';
import type { OrbitImport, OrbitImportFormat, OrbitImportOptions } from './reading.js';
import { importXMind } from './xmind.js';
import { isZip, ZipArchive } from './zip.js';

const EXTENSIONS: Record<string, OrbitImportFormat> = { opml: 'opml', mm: 'freemind', xmind: 'xmind' };

/**
 * The format of another app's map, from what the file holds, then from its
 * name; null when it's none Orbit reads. Orbit's own markdown and YAML, and
 * its zips, are null too: read those with `parseOrbit`.
 */
export const detectImportFormat = (data: Uint8Array | string, name?: string): OrbitImportFormat | null => {
  const extension = /\.([A-Za-z0-9]+)$/.exec(name ?? '')?.[1].toLowerCase() ?? '';
  return formatInside(data) ?? (Object.prototype.hasOwnProperty.call(EXTENSIONS, extension) ? EXTENSIONS[extension] : null);
};

/** The format a file's content shows: an XMind archive, or XML whose top element is OPML's, FreeMind's or XMind's. */
const formatInside = (data: Uint8Array | string): OrbitImportFormat | null => {
  if (typeof data !== 'string' && isZip(data)) {
    try {
      const archive = new ZipArchive(data);
      return archive.has('content.json') || archive.has('content.xml') ? 'xmind' : null;
    } catch {
      return null;
    }
  }

  const text = typeof data === 'string' ? data.slice(0, 4096) : decodeMarkup(data.subarray(0, 4096));
  const root = /^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*<([A-Za-z_][\w.:-]*)/.exec(text.replace(/^\ufeff/, ''))?.[1];
  const formats: Record<string, OrbitImportFormat> = { opml: 'opml', map: 'freemind', 'xmap-content': 'xmind' };
  return root && Object.prototype.hasOwnProperty.call(formats, root) ? formats[root] : null;
};

/**
 * Another app's map as Orbit maps: OPML, FreeMind and Freeplane, or XMind.
 * Pass the file's bytes (its text works for OPML and `.mm`) and its name.
 * Throws an `OrbitImportError` for a file it can't read: one in no format it
 * knows (`unknown-format`), a damaged one (`unreadable`), one with no ideas
 * (`empty`), an XMind workbook with a password (`password-protected`), or one
 * past its limits (`too-large`).
 *
 * ```ts
 * const { maps } = importMap(bytes, { name: 'Trip.xmind' });
 * const markdown = serializeOrbitMarkdown(maps[0].document);
 * ```
 */
export const importMap = (data: Uint8Array | string, options: OrbitImportOptions = {}): OrbitImport => {
  const format = options.format ?? detectImportFormat(data, options.name);

  switch (format) {
    case 'opml':
      return importOPML(data, options);
    case 'freemind':
      return importFreeMind(data, options);
    case 'xmind':
      return importXMind(data, options);
    default:
      throw new OrbitImportError('unknown-format', `${options.name ? `${options.name} isn't` : "The file isn't"} a map Orbit can bring in from another app: it reads OPML, FreeMind and Freeplane (.mm), and XMind (.xmind).`);
  }
};
