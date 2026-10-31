/**
 * The format's versions. A document says which version it's written for
 * with `schemaVersion` (none means 1). When the format changes, the change
 * goes here with a step that brings older documents up to date, and
 * `SUPPORTED_SCHEMA_VERSION` goes up: documents are upgraded as they're
 * read, and the next save writes them in the new format, changing only
 * what the upgrade changed. From then on every map Orbit writes says its
 * version (`writtenSchemaVersion`), documents made in code included, so a
 * map written for the new version never reads back as an older one.
 *
 * A document written for a newer version than this one is read as well as
 * it can be, and reported (`unsupported-schema-version`, an error), so apps
 * can open it without editing it: everything it says is kept on save, but
 * what this version doesn't know of it isn't understood.
 */

import type { OrbitDocument, OrbitDocumentOptions, OrbitNode } from './types.js';
import type { DiagnosticCollector } from './diagnostics.js';

/** A change to the format: how a document written for version `from` becomes one for `from + 1`. */
export interface FormatUpgrade {
  from: number;

  /** Changes the document in place: its options, and its nodes' fields. */
  upgrade: (document: OrbitDocument) => void;
}

/**
 * The format's changes, oldest first. Empty while the format is at its
 * first version; tests check it ends at `SUPPORTED_SCHEMA_VERSION`.
 */
export const FORMAT_UPGRADES: FormatUpgrade[] = [];

/** The newest `schemaVersion` this version of Orbit reads and writes. */
export const SUPPORTED_SCHEMA_VERSION = 1;

/** The version `upgrades` bring documents to: the newest this version of Orbit reads and writes. */
export const currentSchemaVersion = (upgrades: readonly FormatUpgrade[] = FORMAT_UPGRADES): number => {
  return Math.max(SUPPORTED_SCHEMA_VERSION, ...upgrades.map((step) => step.from + 1));
};

/** Whether a document is written for a newer version of the format than this one reads (see `upgradeFormat`). */
export const isNewerFormat = (options: OrbitDocumentOptions, upgrades: readonly FormatUpgrade[] = FORMAT_UPGRADES): boolean => {
  return (options.schemaVersion ?? 1) > currentSchemaVersion(upgrades);
};

/**
 * The error for an edit, or a save, that would lose part of a map written
 * for a newer version of the format, part this version can't read: `what`
 * is written so, and `loss` is what the change would do to it.
 */
export const newerFormatError = (what: string, loss: string, saving = false): Error => {
  return new Error(`${what} written in a newer version of the format, which this version of Orbit can't read: ${loss}, so ${saving ? 'nothing was written' : 'the map is unchanged'}. Change it in a newer Orbit.`);
};

/** An idea as such an error names it: by its text, or by its id when it has none. */
export const ideaName = (node: OrbitNode): string => {
  return node.text.trim() === '' ? `The idea #${node.id}` : `"${node.text}"`;
};

/**
 * The `schemaVersion` a document is written with: its own, or the current
 * one once the format is past its first version. A document made in code
 * has none, and written without one it would read back as version 1, to be
 * upgraded again and edited by older versions that can't read it.
 */
export const writtenSchemaVersion = (options: OrbitDocumentOptions, upgrades: readonly FormatUpgrade[] = FORMAT_UPGRADES): number | undefined => {
  const current = currentSchemaVersion(upgrades);
  return options.schemaVersion ?? (current > 1 ? current : undefined);
};

/** `options` as a document is written with them: with the `schemaVersion` it's written for (see `writtenSchemaVersion`). */
export const optionsToWrite = (options: OrbitDocumentOptions): OrbitDocumentOptions => {
  const schemaVersion = writtenSchemaVersion(options);
  return schemaVersion === options.schemaVersion ? options : { ...options, schemaVersion };
};

/**
 * Upgrades a document written for an older version of the format, one step
 * at a time, and says so. A document for a newer version is reported.
 */
export const upgradeFormat = (document: OrbitDocument, diagnostics: DiagnosticCollector, line: number | undefined, upgrades: readonly FormatUpgrade[] = FORMAT_UPGRADES): void => {
  const written = document.options.schemaVersion ?? 1;
  const supported = currentSchemaVersion(upgrades);

  if (written > supported) {
    diagnostics.recover(
      'unsupported-schema-version',
      `This map is written for version ${written} of the format, and this version of Orbit reads up to ${supported}. Everything in it is kept, but open it with a newer Orbit to change it.`,
      line,
      'error',
    );
    return;
  }

  let version = written;

  for (const step of upgrades) {
    if (step.from === version) {
      step.upgrade(document);
      version += 1;
    }
  }

  if (version !== written) {
    document.options.schemaVersion = version;
    diagnostics.note('format-upgraded', `Upgraded from version ${written} of the format to ${version}; saving writes it as version ${version}.`, line);
  }
};
