import { describe, expect, it } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { parseOrbitYAML } from '../src/core/parser-yaml';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import type { OrbitDocument, OrbitNode } from '../src/core/types';

const mdRoundTrip = (doc: OrbitDocument): OrbitDocument => {
  return parseOrbitMarkdown(serializeOrbitMarkdown(doc));
};

describe('markdown round-trip fidelity', () => {
  it('keeps emoji icons in titles and writes other icons as an attribute', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: Root\n    icon: 🚀\n    children:\n      - text: Star\n        icon: ★\n      - text: List item\n        icon: §\n        children: [Leaf]\n');
    const markdown = serializeOrbitMarkdown(doc);
    expect(markdown).toContain('# 🚀 Root');
    expect(markdown).toContain('icon: ★');
    const back = parseOrbitMarkdown(markdown);
    expect(back.root.icon).toBe('🚀');
    expect(back.root.children.map((child) => [child.text, child.icon])).toEqual([['Star', '★'], ['List item', '§']]);
    expect(back.diagnostics).toEqual([]);
  });

  it('preserves embeds via the contentType marker', () => {
    const doc = parseOrbitYAML(
      'nodes:\n  - text: Root\n    children:\n      - text: Child\n        embed: https://example.com/widget\n',
    );
    const back = mdRoundTrip(doc);
    expect(back.root.children[0].embed).toEqual({ src: 'https://example.com/widget' });
    expect(back.root.children[0].note).toBeUndefined();
  });

  it('preserves notes containing markdown structure (headings, lists)', () => {
    const doc = parseOrbitYAML(
      'nodes:\n  - text: Root\n    note: |\n      intro\n      ### looks like heading\n      - looks like a bullet\n',
    );
    const back = mdRoundTrip(doc);
    expect(back.root.children).toHaveLength(0);
    expect(back.root.note).toBe('intro\n### looks like heading\n- looks like a bullet');
  });

  it('preserves deep subtrees when a noted node also has list children (depth 7+)', () => {
    let yaml = 'nodes:\n';
    let indent = '  ';

    for (let d = 0; d <= 5; d++) {
      yaml += `${indent}- text: L${d}\n`;

      if (d === 5) {
        yaml += `${indent}  note: some note\n`;
      }

      yaml += `${indent}  children:\n`;
      indent += '    ';
    }

    yaml += `${indent}- text: L6-leaf\n`;

    const back = mdRoundTrip(parseOrbitYAML(yaml));
    let cur = back.root;

    for (let d = 1; d <= 6; d++) {
      expect(cur.children).toHaveLength(1);
      cur = cur.children[0];
    }

    expect(cur.text).toBe('L6-leaf');
    expect(cur.parent?.note).toBe('some note');
  });

  it('preserves video thumbnails and captions', () => {
    const doc = parseOrbitYAML(
      [
        'nodes:',
        '  - text: Root',
        '    video:',
        '      src: https://www.youtube.com/watch?v=abc123xyz',
        '      provider: youtube',
        '      thumbnail: thumb.jpg',
        '      caption: Launch recording',
      ].join('\n') + '\n',
    );
    const back = mdRoundTrip(doc);
    expect(back.root.video?.src).toBe('https://www.youtube.com/watch?v=abc123xyz');
    expect(back.root.video?.thumbnail).toBe('thumb.jpg');
    expect(back.root.video?.caption).toBe('Launch recording');
  });

  it('preserves image captions and alt text', () => {
    const doc = parseOrbitYAML(
      'nodes:\n  - text: Root\n    image:\n      src: photo.jpg\n      alt: A photo\n      caption: Taken at dawn\n',
    );
    const back = mdRoundTrip(doc);
    expect(back.root.image).toEqual({ src: 'photo.jpg', alt: 'A photo', caption: 'Taken at dawn' });
  });

  it('preserves video without a detectable provider via the contentType marker', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: Root\n    video: https://example.com/stream\n');
    const back = mdRoundTrip(doc);
    expect(back.root.video?.src).toBe('https://example.com/stream');
  });

  it('preserves notes and media on deep list items', () => {
    let yaml = 'nodes:\n';
    let indent = '  ';

    for (let d = 0; d <= 5; d++) {
      yaml += `${indent}- text: L${d}\n${indent}  children:\n`;
      indent += '    ';
    }

    yaml += `${indent}- text: Leaf\n`;
    yaml += `${indent}  note: |\n${indent}    leaf note line 1\n${indent}    ### not a heading\n`;
    yaml += `${indent}  image: leaf.png\n`;
    yaml += `${indent}  color: "#F5A3A8"\n`;

    const back = mdRoundTrip(parseOrbitYAML(yaml));
    let cur = back.root;

    for (let d = 1; d <= 6; d++) {
      cur = cur.children[0];
    }

    expect(cur.text).toBe('Leaf');
    expect(cur.note).toBe('leaf note line 1\n### not a heading');
    expect(cur.image).toEqual({ src: 'leaf.png' });
    expect(cur.color).toBe('#F5A3A8');
  });

  it('keeps an earlier image when a later media block is reclassified', () => {
    const doc = parseOrbitMarkdown(
      '# Root\n\n![first](a.png)\n\n![second](b.png)\n\n<!-- orbit contentType: video -->\n',
    );
    expect(doc.root.image).toEqual({ src: 'a.png', alt: 'first' });
    expect(doc.root.video?.src).toBe('b.png');
  });
});

describe('blockquote notes (markdown flavor)', () => {
  it('parses blockquotes as notes', () => {
    const doc = parseOrbitMarkdown('# Root\n\n> a quoted note\n> second line\n');
    expect(doc.root.note).toBe('a quoted note\nsecond line');
  });

  it('keeps a list after a blockquote note eligible as children', () => {
    const doc = parseOrbitMarkdown('# Root\n\n> the note\n\n- child a\n- child b\n');
    expect(doc.root.note).toBe('the note');
    expect(doc.root.children.map((c) => c.text)).toEqual(['child a', 'child b']);
  });

  it('a list after a plain paragraph is children; a quoted list stays in the note', () => {
    const doc = parseOrbitMarkdown('# Root\n\nplain prose\n\n- a child\n\n> - not a child\n');
    expect(doc.root.children.map((child) => child.text)).toEqual(['a child']);
    expect(doc.root.note).toBe('plain prose\n\n- not a child');
  });

  it('parses indented blockquotes under list items as item notes', () => {
    const doc = parseOrbitMarkdown('# Root\n\n- Task A\n  > detail for A\n  > more detail\n- Task B\n');
    expect(doc.root.children[0].note).toBe('detail for A\nmore detail');
    expect(doc.root.children[1].note).toBeUndefined();
  });
});

describe('yaml round-trip fidelity', () => {
  const yamlRoundTrip = (doc: OrbitDocument): OrbitDocument => {
    return parseOrbitYAML(serializeOrbitYAML(doc));
  };

  it('survives notes whose first line has leading whitespace', () => {
    const node: OrbitNode = { id: 'r', text: 'Root', level: 0, children: [], note: '  indented first\nplain second' };
    const back = yamlRoundTrip({ root: node, options: {}, warnings: [] });
    expect(back.root.note).toBe('  indented first\nplain second');
  });

  it('accepts scalar strings as child shorthand', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: Root\n    children: [Task A, Task B]\n');
    expect(doc.root.children.map((c) => c.text)).toEqual(['Task A', 'Task B']);
    expect(doc.root.children.map((c) => c.id)).toEqual(['task-a', 'task-b']);
  });
});

describe('fence dispatch', () => {
  it('accepts fenced source with a trailing newline', () => {
    const doc = parseOrbit('```orbit\n# Root\n## A\n```\n');
    expect(doc.root.children).toHaveLength(1);
  });
});

describe('noteFormat preservation', () => {
  it('an explicit noteFormat: plain survives a markdown round-trip on header nodes', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: Root\n    note: raw text\n    noteFormat: plain\n');
    const back = parseOrbitMarkdown(serializeOrbitMarkdown(doc));
    expect(back.root.note).toBe('raw text');
    expect(back.root.noteFormat).toBe('plain');
  });
});
