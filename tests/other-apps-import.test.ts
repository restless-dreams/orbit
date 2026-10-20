import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectImportFormat, importMap, OrbitImportError } from '../src/index';
import { makeZip } from './helpers/zip';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dir, 'fixtures/other-apps', name)));

describe('telling formats apart', () => {
  test('by what the file holds, whatever its name says', () => {
    expect(detectImportFormat(fixture('omnioutliner.opml'))).toBe('opml');
    expect(detectImportFormat(fixture('freemind.mm'), 'download.bin')).toBe('freemind');
    expect(detectImportFormat(fixture('freeplane.mm'), 'wrong.opml')).toBe('freemind');
    expect(detectImportFormat(makeZip([{ name: 'content.json', data: '[]' }]), 'map.zip')).toBe('xmind');
    expect(detectImportFormat(makeZip([{ name: 'content.xml', data: '<xmap-content/>' }]))).toBe('xmind');
    expect(detectImportFormat('<?xml version="1.0"?>\n<!-- exported -->\n<!DOCTYPE opml>\n<opml version="1.0"/>')).toBe('opml');
    expect(detectImportFormat('﻿<xmap-content/>')).toBe('xmind');
  });

  test('by its name when the content doesn\'t say', () => {
    expect(detectImportFormat('', 'Trip.OPML')).toBe('opml');
    expect(detectImportFormat(new Uint8Array(), 'mind.mm')).toBe('freemind');
    expect(detectImportFormat(new Uint8Array([1, 2, 3]), 'Plan.xmind')).toBe('xmind');
  });

  test('none, for Orbit\'s own maps and anything else', () => {
    expect(detectImportFormat('# Plan\n## Research', 'plan.md')).toBeNull();
    expect(detectImportFormat('nodes:\n  - text: Plan', 'plan.yaml')).toBeNull();
    expect(detectImportFormat(makeZip([{ name: 'map.md', data: '# Plan' }]), 'plan.zip')).toBeNull();
    expect(detectImportFormat('<html><body>Hi</body></html>', 'page.html')).toBeNull();
    expect(detectImportFormat('anything', 'x.constructor')).toBeNull();
  });
});

describe('importMap', () => {
  test('reads each format', () => {
    expect(importMap(fixture('mindnode.opml')).maps[0].document.root.text).toBe('Garden');
    expect(importMap(fixture('freemind.mm'), { name: 'launch.mm' }).format).toBe('freemind');
    expect(importMap(new TextDecoder().decode(fixture('freeplane.mm'))).maps[0].document.root.text).toBe('Thesis');
  });

  test('follows the format it\'s told', () => {
    expect(() => importMap(fixture('mindnode.opml'), { format: 'freemind' })).toThrow(/not <map>/);
  });

  test('refuses a file in no format it reads, with a code to tell people why', () => {
    let error: unknown;

    try {
      importMap('# Just markdown', { name: 'notes.md' });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(OrbitImportError);
    expect((error as OrbitImportError).code).toBe('unknown-format');
    expect((error as OrbitImportError).message).toBe("notes.md isn't a map Orbit can bring in from another app: it reads OPML, FreeMind and Freeplane (.mm), and XMind (.xmind).");
  });
});
