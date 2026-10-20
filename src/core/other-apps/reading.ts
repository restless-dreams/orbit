/**
 * What reading another app's map gives back, and the first steps every
 * reader shares: a file's bytes as text, and its XML read, with problems
 * reported as `OrbitImportError`s.
 */

import type { OrbitDocument } from '../types.js';
import { OrbitImportError, type OrbitImportWarning } from './ideas.js';
import { decodeMarkup, MarkupError, parseXml, type MarkupElement } from './markup.js';

/** The other apps' formats Orbit reads. */
export type OrbitImportFormat = 'opml' | 'freemind' | 'xmind';

export interface OrbitImportOptions {
  /** The file's name: its extension tells the format, and a map with no single center is named after it. */
  name?: string;

  /** The file's format, when you know it. Default: from the name, then from what the file holds. */
  format?: OrbitImportFormat;

  /** The name of the center Orbit adds to a map with several top ideas and nothing to name it after. Default "Untitled map". */
  untitled?: string;
}

/** One map read from another app's file. */
export interface OrbitImportedMap {
  document: OrbitDocument;

  /** Pictures from inside the file, by the address the map gives them: `media/sunrise.png`. Save them next to the map. */
  media: Record<string, Uint8Array>;

  /** What the other app had that Orbit keeps another way, or couldn't keep. */
  warnings: OrbitImportWarning[];
}

/** What reading another app's file gives. */
export interface OrbitImport {
  format: OrbitImportFormat;

  /** The file's maps: one, or one for each sheet of an XMind workbook. */
  maps: OrbitImportedMap[];
}

/** An XML file's top element, which must be `rootName`; `what` names the file in errors ("an OPML file"). */
export const readXmlFile = (data: Uint8Array | string, rootName: string, what: string): MarkupElement => {
  const text = typeof data === 'string' ? data : decodeMarkup(data);
  let root: MarkupElement;

  try {
    root = parseXml(text);
  } catch (error) {
    if (error instanceof MarkupError) {
      throw new OrbitImportError('unreadable', `The file isn't ${what} Orbit can read: ${error.message}.`);
    }

    throw error;
  }

  if (root.localName !== rootName) {
    throw new OrbitImportError('unreadable', `The file isn't ${what}: it starts with <${root.name}>, not <${rootName}>.`);
  }

  return root;
};

/** A file's name without its folder or a map's extension: `notes/Trip.opml` is `Trip`. */
export const baseName = (name: string | undefined): string => {
  return (name ?? '').replace(/^.*[/\\]/, '').replace(/\.(opml|xml|mm|xmind|txt|md)$/i, '').trim();
};
