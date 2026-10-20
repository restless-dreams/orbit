import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importFreeMind } from '../src/core/other-apps/freemind';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import type { OrbitNode } from '../src/core/types';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dir, 'fixtures/other-apps', name)));

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

describe('FreeMind maps', () => {
  const map = importFreeMind(fixture('freemind.mm')).maps[0];

  test('keep text, HTML titles and notes, links, folds, colors, icons and priorities', () => {
    expect(outline(map.document.root)).toEqual({
      text: 'Product launch',
      children: [
        {
          text: 'Research',
          icon: '💡',
          priority: 1,
          color: '#FFCC00',
          collapsed: true,
          children: [
            { text: 'Interviews', note: 'Talk to **five** customers.\n\n- Two from *retail*\n- Three from [wholesale](https://example.com/wholesale)' },
            { text: 'Survey', link: 'https://example.com/survey' },
          ],
        },
        {
          text: 'Build',
          icon: '✅',
          link: '#interviews',
          children: [
            { text: 'Line one line two' },
            { text: 'See the survey', link: '#survey' },
            { text: 'Specs' },
            { text: 'Press page', link: 'https://www.example.com/press' },
          ],
        },
        {
          text: 'Launch day',
          children: [{ text: 'Press kit', note: 'Logo files are in assets, named like_this.', noteFormat: 'plain' }],
        },
      ],
    });
  });

  test('say what they couldn\'t keep', () => {
    expect(map.warnings.map(({ code, count }) => [code, count])).toEqual([
      ['icons-not-kept', 1],
      ['local-links-not-kept', 1],
      ['formatting-not-kept', 1],
    ]);
    expect(map.warnings[1].message).toBe('One link (“../specs/launch.mm”) to files on the computer the map was made on was left out.');
  });
});

describe('Freeplane maps', () => {
  const map = importFreeMind(fixture('freeplane.mm')).maps[0];

  test('keep details, plain and markdown notes, attributes, emoji icons, progress, arrow labels and pictures', () => {
    expect(outline(map.document.root)).toEqual({
      text: 'Thesis',
      children: [
        {
          text: 'Chapter 1',
          icon: '📖',
          status: 'active',
          color: '#CCE5FF',
          note: 'Due in March\n\nRead **Smith 2020** first.\n\n- **Words:** 4500\n- **Reviewer:** Ana',
          children: [
            { text: 'Section 1.1', note: '→ [builds on](#chapter-2)' },
            { text: 'Figures' },
          ],
        },
        {
          text: 'Chapter 2',
          status: 'done',
          note: 'Done & dusted, see [section 1.1](#section-11).',
          children: [{ text: 'Free note' }],
        },
        { text: 'Secrets' },
        { text: 'Cover', image: { src: 'https://example.com/cover.png' } },
      ],
    });
  });

  test('leave the map\'s styles out, which are no part of the tree', () => {
    expect(JSON.stringify(map.document.root)).not.toContain('styles.root_node');
  });

  test('say what they couldn\'t keep', () => {
    expect(map.warnings.map(({ code, count }) => [code, count])).toEqual([
      ['links-in-notes', 1],
      ['icons-not-kept', 1],
      ['pictures-not-kept', 1],
      ['encrypted-branches-not-read', 1],
    ]);
  });
});

describe('every .mm', () => {
  test('reads back the same from the markdown Orbit writes for it', () => {
    for (const name of ['freemind.mm', 'freeplane.mm']) {
      const document = importFreeMind(fixture(name)).maps[0].document;
      const back = parseOrbit(serializeOrbitMarkdown(document));
      expect(back.diagnostics).toEqual([]);
      expect(outline(back.root)).toEqual(outline(document.root));
    }
  });

  test('FreeMind 0.8\'s HTML titles and notes in hooks', () => {
    const old = '<map version="0.8.1"><node TEXT="&lt;html&gt;&lt;b&gt;Old&lt;/b&gt; map&lt;/html&gt;"><hook NAME="accessories/plugins/NodeNote.properties"><text>A note from 2006</text></hook></node></map>';
    expect(outline(importFreeMind(old).maps[0].document.root)).toEqual({ text: 'Old map', note: 'A note from 2006' });
  });

  test('a link written without its "#" still points at the node', () => {
    const map = importFreeMind('<map><node TEXT="Root"><node TEXT="A" LINK="ID_2"/><node TEXT="B" ID="ID_2"/></node></map>').maps[0];
    expect(map.document.root.children[0].link).toBe('#b');
  });

  test('a link to a node that isn\'t there is left out, with a warning', () => {
    const map = importFreeMind('<map><node TEXT="Root" LINK="#ID_404"/></map>').maps[0];
    expect(map.document.root.link).toBeUndefined();
    expect(map.warnings.map((warning) => warning.code)).toEqual(['missing-link-targets']);
  });

  test('refuses what isn\'t a map', () => {
    expect(() => importFreeMind('<opml/>')).toThrow(/starts with <opml>, not <map>/);
    expect(() => importFreeMind('<map><node TEXT="a"></map>')).toThrow(/can read/);
  });
});
