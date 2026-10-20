import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { importXMind } from '../src/core/other-apps/xmind';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import type { OrbitNode } from '../src/core/types';
import { folderFiles, makeZip, ONE_PIXEL_PNG, type ZipFile } from './helpers/zip';

const folder = (name: string): ZipFile[] => folderFiles(join(import.meta.dir, 'fixtures/other-apps', name));

const PLAN_PICTURE = 'resources/3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b.png';

/** An XMind 2020 workbook as XMind writes it: its content, its pictures and an attachment. */
const workbook2020 = (): Uint8Array => makeZip([
  ...folder('xmind-2020'),
  { name: 'resources/', data: '', stored: true },
  { name: PLAN_PICTURE, data: ONE_PIXEL_PNG, stored: true },
  { name: 'resources/0e2d4a1c5b6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b.xlsx', data: 'not really a spreadsheet' },
  { name: 'Thumbnails/thumbnail.png', data: ONE_PIXEL_PNG, stored: true },
]);

/** An XMind 8 workbook: content.xml with its styles, comments and attachments. */
const workbook8 = (): Uint8Array => makeZip([
  ...folder('xmind-8'),
  { name: 'attachments/screenshot.png', data: ONE_PIXEL_PNG, stored: true },
  { name: 'attachments/script.txt', data: 'Say hello' },
]);

const outline = (node: OrbitNode): unknown => {
  const content: Record<string, unknown> = { text: node.text };

  for (const key of ['icon', 'note', 'noteFormat', 'status', 'link', 'tags', 'collapsed', 'priority', 'color', 'image'] as const) {
    if (node[key] !== undefined && !(key === 'noteFormat' && node[key] === 'markdown')) {
      content[key] = node[key];
    }
  }

  if (node.children.length > 0) {
    content.children = node.children.map(outline);
  }

  return content;
};

describe('XMind 2020 and later', () => {
  const result = importXMind(workbook2020(), { name: 'Garden.xmind' });
  const [garden, shopping] = result.maps;

  test('reads content.json, not the warning XMind leaves in content.xml', () => {
    expect(result.format).toBe('xmind');
    expect(result.maps).toHaveLength(2);
    expect(garden.document.root.text).toBe('Garden plan');
    expect(outline(shopping.document.root)).toEqual({ text: 'Shopping', children: [{ text: 'Hose', note: 'Twenty meters' }] });
  });

  test('keeps topics with their notes, labels, markers, links, folds, colors and pictures', () => {
    expect(outline(garden.document.root)).toEqual({
      text: 'Garden plan',
      image: { src: 'media/3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b.png' },
      children: [
        {
          text: 'Raised beds',
          tags: ['outdoor', 'weekend'],
          priority: 1,
          status: 'active',
          note: 'Cedar **boards**\n\nThree beds\n\nPhase one',
          children: [
            { text: 'Soil mix', link: 'https://example.com/soil', note: '→ [feeds](#tomatoes)' },
            { text: 'Seeds', collapsed: true, children: [{ text: 'Tomatoes' }] },
            { text: 'Weekend job' },
          ],
        },
        { text: 'Tools and gloves', icon: '😄', color: '#2EBDFF', link: '#raised-beds', children: [{ text: 'Borrow from Ana' }] },
        { text: 'Budget', link: '#tools-and-gloves' },
        { text: 'Last year' },
        { text: '', children: [{ text: 'Under an empty topic' }] },
        { text: 'Compost?' },
      ],
    });
  });

  test('brings the pictures it uses, by the address the map gives them', () => {
    expect(Object.keys(garden.media)).toEqual(['media/3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b.png']);
    expect([...garden.media['media/3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b.png']]).toEqual([...ONE_PIXEL_PNG]);
    expect(shopping.media).toEqual({});
  });

  test('says where it put what has no place in a tree, and what it left out', () => {
    expect(garden.warnings.map(({ code, count }) => [code, count])).toEqual([
      ['floating-ideas-moved', 1],
      ['summaries-moved', 1],
      ['callouts-moved', 1],
      ['boundaries-in-notes', 1],
      ['links-in-notes', 1],
      ['missing-link-targets', 1],
      ['icons-not-kept', 1],
      ['attachments-not-kept', 1],
      ['local-links-not-kept', 1],
    ]);
    expect(garden.warnings.find((warning) => warning.code === 'floating-ideas-moved')?.message)
      .toBe('One floating topic (“Compost?”) had no place in the tree: it\'s now under the center.');
  });

  test('reads its content alone, as text, without pictures', () => {
    const content = folder('xmind-2020').find((file) => file.name === 'content.json')!.data;
    const map = importXMind(new TextDecoder().decode(content as Uint8Array)).maps[0];
    expect(map.document.root.image).toBeUndefined();
    expect(map.warnings.map((warning) => warning.code)).toContain('pictures-not-kept');
  });
});

describe('XMind 8', () => {
  const result = importXMind(workbook8());
  const [talk] = result.maps;

  test('reads content.xml with its styles, comments, notes, labels, markers and pictures', () => {
    expect(result.maps).toHaveLength(1);
    expect(outline(talk.document.root)).toEqual({
      text: 'Conference talk',
      icon: '⭐',
      children: [
        { text: 'Opening', link: 'https://example.com/slides', color: '#FFD966', tags: ['intro'], note: 'Start with a story\n\nKeep it short' },
        {
          text: 'Demo',
          icon: '❓',
          status: 'done',
          priority: 2,
          collapsed: true,
          note: 'ana: Rehearse twice',
          children: [{ text: 'Screenshot', image: { src: 'media/screenshot.png' } }, { text: 'script.txt' }],
        },
        { text: 'Questions', link: '#opening', note: '→ [refers back](#demo)' },
        { text: 'Bring water' },
      ],
    });
    expect(Object.keys(talk.media)).toEqual(['media/screenshot.png']);
  });

  test('refuses a workbook protected with a password', () => {
    const files = folder('xmind-8').map((file) => (file.name === 'META-INF/manifest.xml'
      ? { ...file, data: '<manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0"><file-entry full-path="content.xml" media-type="text/xml"><encryption-data checksum-type="MD5" checksum="x"/></file-entry></manifest>' }
      : file));
    expect(() => importXMind(makeZip(files))).toThrow(/protected with a password/);
  });
});

describe('every workbook', () => {
  test('reads back the same from the markdown Orbit writes for it', () => {
    for (const workbook of [workbook2020(), workbook8()]) {
      for (const map of importXMind(workbook).maps) {
        const back = parseOrbit(serializeOrbitMarkdown(map.document));
        expect(back.diagnostics).toEqual([]);
        expect(outline(back.root)).toEqual(outline(map.document.root));
      }
    }
  });

  test('refuses an archive that isn\'t one, a damaged one, and one without sheets', () => {
    expect(() => importXMind(makeZip([{ name: 'map.md', data: '# Not XMind' }]))).toThrow(/not an XMind workbook/);
    expect(() => importXMind(makeZip([{ name: 'content.json', data: '{"not": "sheets"}' }]))).toThrow(/isn't a list of sheets/);
    expect(() => importXMind(makeZip([{ name: 'content.json', data: '[{"title": "no topic"}]' }]))).toThrow(/no sheet with a topic/);
    expect(() => importXMind(makeZip([{ name: 'content.json', data: '[{' }]))).toThrow(/can't be read/);
    const damaged = workbook2020();
    damaged[100] ^= 0xff;
    expect(() => importXMind(damaged)).toThrow(/can't be read|damaged/);
  });

  test('stops at a sheet nested deeper than any map goes', () => {
    let topic: Record<string, unknown> = { id: 'leaf', title: 'Leaf' };

    for (let depth = 0; depth < 600; depth++) {
      topic = { id: `topic-${depth}`, title: `Level ${depth}`, children: { attached: [topic] } };
    }

    expect(() => importXMind(JSON.stringify([{ id: 'sheet', rootTopic: topic }]))).toThrow(/levels deep/);
  });
});
