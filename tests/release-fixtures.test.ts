import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as orbit from '../src/index';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { DiagnosticCollector } from '../src/core/diagnostics';
import { DOCUMENT_OPTION_KEYS } from '../src/core/document-options';
import { FORMAT_UPGRADES, SUPPORTED_SCHEMA_VERSION, upgradeFormat } from '../src/core/format-upgrades';
import { NODE_ATTRIBUTE_KEYS, filesValue, readFiles } from '../src/core/node-attributes';
import { detectVideoProvider } from '../src/core/media';
import type { OrbitDocument, OrbitNode } from '../src/core/types';
import { NODE_FIELDS, RELEASES, nodeFromRecord, recordDocument, releaseFixtures, type OrbitModule, type RecordedDocument, type RecordedNode, type RecordedRead } from '../scripts/release-fixtures';

/*
 * The maps each released version of Orbit wrote (see scripts/release-fixtures.ts
 * and tests/fixtures/releases/README.md). A version's folder is never changed
 * once it's released: what it wrote is what people's files hold. `kept/<version>`
 * is what a released version writes from today's sources, which say more than
 * it reads: written again whenever the sources change.
 */

const isFolder = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();
const kept = isFolder(join(RELEASES, 'kept')) ? readdirSync(join(RELEASES, 'kept')).filter((name) => isFolder(join(RELEASES, 'kept', name))).map((name) => `kept/${name}`) : [];
const versions = [...readdirSync(RELEASES).filter((name) => !['sources', 'kept'].includes(name) && isFolder(join(RELEASES, name))), ...kept].sort();
const fields = new Set<string>(NODE_FIELDS);

const readsOf = (version: string): Record<string, RecordedRead> => {
  return JSON.parse(readFileSync(join(RELEASES, version, 'reads.json'), 'utf8')) as Record<string, RecordedRead>;
};

const record = (document: OrbitDocument): RecordedDocument => {
  return recordDocument(document as unknown as ReturnType<OrbitModule['parseOrbit']>);
};

/**
 * The options' names before 0.4.0, which earlier versions recorded, by the
 * names they have now (docs/compatibility.md): the same options, as the
 * document writes them.
 */
const RENAMED_OPTIONS: Record<string, string> = { viewMode: 'view', orbitAnimation: 'animation', orbitSpeed: 'speed' };

/** A version's recorded options under the names this version gives them. */
const optionsNamedNow = (options: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(Object.entries(options).map(([key, value]) => [RENAMED_OPTIONS[key] ?? key, value]));
};

/**
 * Files a version from before them kept as an app's own attribute, as it
 * wrote them (an address alone, a file's fields Orbit doesn't read), read as
 * this version reads that attribute: the same files.
 */
const filesReadNow = (node: OrbitNode): void => {
  if (node.files !== undefined) {
    const files = readFiles(node.files);

    if (files) {
      node.files = files;
    } else {
      node.attrs = { ...node.attrs, files: node.files };
      delete node.files;
    }
  }

  node.children.forEach(filesReadNow);
};

/** What the version that wrote a file understood it to say, brought up to date by this version's format upgrades. */
const upgraded = (recorded: RecordedDocument): RecordedDocument => {
  const document = { root: nodeFromRecord(recorded.root, fields) as unknown as OrbitNode, options: optionsNamedNow(recorded.options), extra: { ...recorded.extra }, warnings: [] } as unknown as OrbitDocument;
  upgradeFormat(document, new DiagnosticCollector(false), undefined);
  filesReadNow(document.root);
  return record(document);
};

/**
 * A recorded map with each video's provider left out where its address
 * shows it: a media line's video takes its provider from its address, and a
 * `video` attribute without one keeps none, so the two flavors write the
 * same video differently.
 */
const withoutShownProviders = (recorded: RecordedDocument): RecordedDocument => {
  const visit = (node: RecordedNode): RecordedNode => {
    const video = node.attributes.video as { src?: string; provider?: string } | undefined;
    const attributes = { ...node.attributes };

    if (video?.src && video.provider && detectVideoProvider(video.src) === video.provider) {
      const shown = { ...video };
      delete shown.provider;
      attributes.video = shown;
    }

    return { ...node, attributes, children: node.children.map(visit) };
  };

  return { ...recorded, root: visit(recorded.root) };
};

const diagnosticsOf = (document: OrbitDocument): string[] => {
  return (document.diagnostics ?? []).map((diagnostic) => `${diagnostic.severity} ${diagnostic.code}`);
};

test('there are fixtures from every released version, and from this one', () => {
  expect(versions).toContain('0.1.0');
  expect(versions).toContain('next');
});

const writer = (version: string): string => {
  if (version === 'next') {
    return 'this version';
  }

  return version.startsWith('kept/') ? `Orbit ${version.slice('kept/'.length)} from today's sources` : `Orbit ${version}`;
};

for (const version of versions) {
  describe(`maps written by ${writer(version)}`, () => {
    const reads = readsOf(version);

    for (const [name, recorded] of Object.entries(reads)) {
      const text = readFileSync(join(RELEASES, version, name), 'utf8');

      test(`${name} reads without errors, as it was written`, () => {
        const document = parseOrbit(text);
        expect(diagnosticsOf(document).filter((diagnostic) => diagnostic.startsWith('error'))).toEqual([]);
        expect(diagnosticsOf(document)).toEqual(recorded.diagnostics);
        expect(record(document)).toEqual(upgraded(recorded.document));
      });

      test(`${name} writes back exactly, and the same in Orbit's own forms`, () => {
        const document = parseOrbit(text);

        if (name.endsWith('.md')) {
          expect(serializeOrbitMarkdown(document)).toBe(text);
        }

        const read = withoutShownProviders(record(document));
        expect(withoutShownProviders(record(parseOrbit(serializeOrbitMarkdown(document, { keepSource: false }))))).toEqual(read);
        expect(withoutShownProviders(record(parseOrbit(serializeOrbitYAML(document))))).toEqual(read);
      });
    }
  });
}

/** Each idea's date, by its id, as a version read a map back. */
const datesOf = (recorded: RecordedNode, dates: Record<string, unknown> = {}): Record<string, unknown> => {
  if (recorded.attributes.due !== undefined) {
    dates[recorded.id] = recorded.attributes.due;
  }

  for (const child of recorded.children) {
    datesOf(child, dates);
  }

  return dates;
};

/** Each idea's files, by its id, as this version reads a map's text: every field of each, those it doesn't read too. */
const filesIn = (text: string): Record<string, unknown> => {
  const found: Record<string, unknown> = {};

  const visit = (node: OrbitNode): void => {
    if (node.files) {
      found[node.id] = filesValue(node.files);
    }

    node.children.forEach(visit);
  };

  visit(parseOrbit(text).root);
  return found;
};

describe('released versions keep what later ones added', () => {
  test('there is a released version run on today’s sources', () => {
    expect(kept).toContain('kept/0.4.0');
  });

  for (const folder of kept) {
    // Dates came after 0.4.0, which keeps `due` as an attribute of an app's own: renamed, checked off, colored, moved, noted, and in its YAML.
    test(`${writer(folder)} keeps every idea’s date, through its own edits too`, () => {
      const theirs = readsOf(folder);
      const ours = readsOf('next');

      for (const name of Object.keys(ours)) {
        const dates = datesOf(ours[name].document.root);
        expect(Object.keys(dates).length).toBeGreaterThan(0);
        expect({ name, dates: datesOf(theirs[name].document.root) }).toEqual({ name, dates });
      }
    });

    // Files came after 0.4.0 too: it keeps `files` as an app's own attribute, each file with every field it says.
    test(`${writer(folder)} keeps every idea’s files, and all each one says, through its own edits too`, () => {
      for (const name of Object.keys(readsOf('next')).filter((file) => file !== 'reads.json')) {
        const files = filesIn(readFileSync(join(RELEASES, 'next', name), 'utf8'));
        expect(Object.keys(files).length).toBeGreaterThan(0);
        expect({ name, files: filesIn(readFileSync(join(RELEASES, folder, name), 'utf8')) }).toEqual({ name, files });
      }
    });
  }
});

test('this version writes exactly what `next` holds (run scripts/release-fixtures.ts after a change to how maps are written)', () => {
  const written = releaseFixtures(orbit as unknown as OrbitModule);
  const folder = join(RELEASES, 'next');
  expect(readdirSync(folder).sort()).toEqual(Object.keys(written).sort());

  for (const [name, content] of Object.entries(written)) {
    expect({ name, content: readFileSync(join(folder, name), 'utf8') }).toEqual({ name, content });
  }
});

test('the fixtures hold every version of the format, from the first to the newest', () => {
  const written = new Set(versions.flatMap((version) => Object.values(readsOf(version)).map((read) => Number(read.document.options.schemaVersion ?? 1))));

  for (let schemaVersion = 1; schemaVersion <= SUPPORTED_SCHEMA_VERSION; schemaVersion += 1) {
    expect({ schemaVersion, written: written.has(schemaVersion) }).toEqual({ schemaVersion, written: true });
  }

  // Each newer version comes with the step that brings the one before it up to date.
  expect(FORMAT_UPGRADES.map((step) => step.from)).toEqual(Array.from({ length: SUPPORTED_SCHEMA_VERSION - 1 }, (_, index) => index + 1));
});

test('the sources use every attribute and document option, so the fixtures cover them', () => {
  const sources = readdirSync(join(RELEASES, 'sources')).map((name) => readFileSync(join(RELEASES, 'sources', name), 'utf8')).join('\n');

  for (const key of [...NODE_ATTRIBUTE_KEYS, 'contentType', ...DOCUMENT_OPTION_KEYS]) {
    expect({ key, used: new RegExp(`(^|[\\s{,])${key}:`, 'm').test(sources) }).toEqual({ key, used: true });
  }

  // A node's own fields as the fixtures record them are this version's attributes.
  expect([...fields].filter((field) => field !== 'typeVersion').sort()).toEqual(NODE_ATTRIBUTE_KEYS.filter((key) => !['caption', 'id'].includes(key)).sort());
});
