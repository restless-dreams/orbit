/**
 * The format's versions. A document says which version it's written for
 * with `schemaVersion` (none means 1). When the format changes, the change
 * goes here with a step that brings older documents up to date, and
 * `SUPPORTED_SCHEMA_VERSION` goes up: documents are upgraded as they're
 * read, and the next save writes them in the new format, changing only
 * what the upgrade changed.
 *
 * A document written for a newer version than this one is read as well as
 * it can be, and reported (`unsupported-schema-version`, an error), so apps
 * can open it without editing it: everything it says is kept on save, but
 * what this version doesn't know of it isn't understood.
 */

import type { OrbitDocument } from './types.js';
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

/**
 * Upgrades a document written for an older version of the format, one step
 * at a time, and says so. A document for a newer version is reported.
 */
export const upgradeFormat = (document: OrbitDocument, diagnostics: DiagnosticCollector, line: number | undefined, upgrades: readonly FormatUpgrade[] = FORMAT_UPGRADES): void => {
  const written = document.options.schemaVersion ?? 1;
  const supported = Math.max(SUPPORTED_SCHEMA_VERSION, ...upgrades.map((step) => step.from + 1));

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
