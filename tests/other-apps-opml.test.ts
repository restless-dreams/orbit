import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportOPML, importOPML } from '../src/core/other-apps/opml';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import type { OrbitNode } from '../src/core/types';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dir, 'fixtures/other-apps', name)));

/** A node's content as a reader sees it, children included. */
const outline = (node: OrbitNode): unknown => {
  const content: Record<string, unknown> = { text: node.text };

  for (const key of ['icon', 'note', 'noteFormat', 'status', 'link', 'tags', 'collapsed', 'priority', 'color', 'image'] as const) {
    // A note is markdown unless it says otherwise, whether or not the parser wrote that down.
    if (node[key] !== undefined && !(key === 'noteFormat' && node[key] === 'markdown')) {
      content[key] = node[key];
    }
  }

  if (node.children.length > 0) {
    content.children = node.children.map(outline);
  }

  return content;
};

const read = (name: string) => {
  const result = importOPML(fixture(name), { name });
  expect(result.format).toBe('opml');
  expect(result.maps).toHaveLength(1);
  return result.maps[0];
};

describe('OPML from other apps', () => {
  test('OmniOutliner: notes, and checkboxes as statuses', () => {
    const map = read('omnioutliner.opml');
    expect(outline(map.document.root)).toEqual({
      text: 'Trip to Lisbon',
      note: 'Five days in May.\nFlights booked.',
      noteFormat: 'plain',
      children: [
        { text: 'Book flights', status: 'done' },
        { text: 'Find a hotel', status: 'active', note: 'Alfama or Baixa?' },
        { text: 'Pack', status: 'todo', children: [{ text: 'Passport' }, { text: 'Sunscreen' }] },
      ],
    });
    expect(map.warnings).toEqual([]);
  });

  test('Workflowy: formatting written as HTML, links in the text, and done items', () => {
    const map = read('workflowy.opml');
    expect(outline(map.document.root)).toEqual({
      text: 'Weekly review',
      children: [
        { text: 'Inbox zero #home', note: 'Clear the *whole* inbox.\n\nThen archive.' },
        { text: 'Call the bank', status: 'done' },
        { text: 'Read the article', link: 'https://example.com/article' },
        { text: 'Ideas @someday', children: [{ text: 'Learn the cello' }] },
      ],
    });
  });

  test('Dynalist: checkboxes, and a center named after the head when there are several outlines', () => {
    const map = read('dynalist.opml');
    expect(outline(map.document.root)).toEqual({
      text: 'Reading list',
      children: [
        { text: '**Books** to read', status: 'todo', note: 'Ask *Ana* for more', noteFormat: 'plain', children: [{ text: 'Dune', status: 'done' }, { text: 'Piranesi', status: 'todo' }] },
        { text: 'Articles' },
      ],
    });
  });

  test('MindNode: an emoji at the start of a title is its icon', () => {
    expect(outline(read('mindnode.opml').document.root)).toEqual({
      text: 'Garden',
      note: 'Spring planting plan',
      children: [{ text: 'Seeds', icon: '🌱', children: [{ text: 'Tomatoes' }, { text: 'Basil' }] }, { text: 'Tools' }],
    });
  });

  test('feed lists, in ISO-8859-1: each feed\'s site, description and categories', () => {
    expect(outline(read('feeds.opml').document.root)).toEqual({
      text: 'feeds',
      children: [
        { text: 'Café news', link: 'https://example.com/cafe/', note: 'Coffee, every morning.', tags: ['Food/Coffee', 'Morning'] },
        { text: 'Podcasts', link: 'https://example.com/podcasts.xml' },
        { text: 'Directory', link: 'https://example.com/more.opml' },
      ],
    });
  });

  test('a center named after the file, or untitled, when the head has no title', () => {
    const opml = '<opml version="2.0"><head/><body><outline text="A"/><outline text="B"/></body></opml>';
    expect(importOPML(opml, { name: 'Notes/My plan.opml' }).maps[0].document.root.text).toBe('My plan');
    expect(importOPML(opml, { untitled: 'Mapa sin título' }).maps[0].document.root.text).toBe('Mapa sin título');
    expect(importOPML(opml).maps[0].document.root.text).toBe('Untitled map');
  });

  test('ids as Orbit gives them, so the markdown written reads back the same', () => {
    for (const name of ['omnioutliner.opml', 'workflowy.opml', 'dynalist.opml', 'mindnode.opml', 'feeds.opml']) {
      const document = read(name).document;
      const back = parseOrbit(serializeOrbitMarkdown(document));
      expect(back.diagnostics).toEqual([]);
      expect(outline(back.root)).toEqual(outline(document.root));
    }
  });

  test('refuses what isn\'t OPML, or has nothing in it', () => {
    expect(() => importOPML('<rss version="2.0"/>')).toThrow(/starts with <rss>, not <opml>/);
    expect(() => importOPML('<opml version="2.0"><body/></opml>')).toThrow(/no outlines/);
    expect(() => importOPML('<opml><body><outline text="a"></body></opml>')).toThrow(/can read/);
  });

  test('a link to a file stays out, with a warning', () => {
    const map = importOPML('<opml><body><outline text="Specs" type="link" url="file:///Users/ana/specs.opml"/></body></opml>').maps[0];
    expect(map.document.root.link).toBeUndefined();
    expect(map.warnings.map((warning) => warning.code)).toEqual(['local-links-not-kept']);
  });
});

describe('OPML from Orbit', () => {
  const MAP = `---
title: Launch plan
---
# 🚀 Launch
The plan for **May**.

## Research <!-- orbit status: done -->
- Interviews #customers #q2
  > Five so far.
  > Two more next week.
- [Survey](https://example.com/survey)

## Build <!-- orbit status: active -->
- [ ] Frontend
- Backend <!-- orbit status: blocked -->
- [See the research](#research)

## Ship <!-- orbit status: shipped, priority: 1 -->
`;

  test('writes the root as the one top outline, with notes, statuses, links and tags', () => {
    expect(exportOPML(MAP)).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Launch plan</title>
  </head>
  <body>
    <outline text="🚀 Launch" _note="The plan for **May**." _noteFormat="markdown">
      <outline text="Research" _status="checked" _complete="true">
        <outline text="Interviews" _note="Five so far.&#10;Two more next week." _noteFormat="markdown" category="customers,q2"/>
        <outline text="Survey" type="link" url="https://example.com/survey"/>
      </outline>
      <outline text="Build" _status="indeterminate">
        <outline text="Frontend" _status="unchecked"/>
        <outline text="Backend" _status="blocked"/>
        <outline text="See the research" type="link" url="#research"/>
      </outline>
      <outline text="Ship" _status="shipped" _complete="true"/>
    </outline>
  </body>
</opml>
`);
  });

  test('reads back as the same map: text, icons, notes, statuses, links, tags and the tree', () => {
    const original = parseOrbit(MAP);
    const back = importOPML(exportOPML(original)).maps[0];
    expect(back.warnings).toEqual([]);
    const withoutPriority = (node: unknown): unknown => JSON.parse(JSON.stringify(node, (key, value) => (key === 'priority' ? undefined : value)));
    expect(outline(back.document.root)).toEqual(withoutPriority(outline(original.root)));
  });

  test('escapes what XML needs escaped, and keeps line breaks in notes', () => {
    const opml = exportOPML('# A & B <c>\nLine "one"\n\tTabbed');
    expect(opml).toContain('<title>A &amp; B &lt;c&gt;</title>');
    expect(opml).toContain('text="A &amp; B &lt;c&gt;"');
    const back = importOPML(opml).maps[0].document.root;
    expect(back.text).toBe('A & B <c>');
    expect(back.note).toBe(parseOrbit('# A & B <c>\nLine "one"\n\tTabbed').root.note);
  });

  test('every map in the format fixtures reads back with the same tree, text, notes, statuses and links', () => {
    const folder = join(import.meta.dir, 'fixtures/files');

    for (const name of readdirSync(folder).filter((file) => /\.(md|ya?ml)$/.test(file))) {
      const original = parseOrbit(readFileSync(join(folder, name), 'utf8'));
      const back = importOPML(exportOPML(original)).maps[0].document;
      const essentials = (node: OrbitNode): unknown => ({
        text: node.text,
        icon: node.icon,
        note: node.note?.trim() || undefined,
        status: node.status,
        link: node.link,
        children: node.children.map(essentials),
      });
      expect([name, essentials(back.root)]).toEqual([name, essentials(original.root)]);
    }
  });
});
