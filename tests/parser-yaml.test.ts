import { describe, expect, it } from 'bun:test';
import { parseOrbitYAML } from '../src/core/parser-yaml';

describe('parser-yaml', () => {
  it('reports problems in nodes on the lines they were written on', () => {
    const doc = parseOrbitYAML('title: Launch plan\nnodes:\n  - text: Launch\n    children:\n      - title: Research\n        colour: red\n      - text: Build\n        tags: web, mobile\n        items:\n          - App shell\n          - null\n');
    expect(doc.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.line])).toEqual([
      ['misnamed-node-key', 5],
      ['unknown-attribute', 6],
      ['misnamed-node-key', 9],
      ['ignored-node-entry', 11],
    ]);
    // Words separated by commas are several tags, as a list is.
    expect(doc.root.children[1].tags).toEqual(['web', 'mobile']);
  });

  it('says that nodes is a list when it\'s written as a map', () => {
    expect(parseOrbitYAML('nodes:\n  text: Launch\n').diagnostics[0]).toMatchObject({
      code: 'no-structure',
      message: '"nodes" must be a list: start the root on the line below it with "- text: …".',
    });
  });

  it('parses a small document', () => {
    const src = `title: Demo\nview: focus\nnodes:\n  - text: A\n    icon: 🚀\n    children:\n      - text: B\n        color: red`;
    const doc = parseOrbitYAML(src);
    expect(doc.options.title).toBe('Demo');
    expect(doc.options.viewMode).toBe('focus');
    expect(doc.root.text).toBe('A');
    expect(doc.root.icon).toBe('🚀');
    expect(doc.root.children[0].text).toBe('B');
    expect(doc.root.children[0].color).toBe('red');
  });

  it('preserves notes via | block', () => {
    const src = `nodes:\n  - text: A\n    note: |\n      line one\n      line two`;
    const doc = parseOrbitYAML(src);
    expect(doc.root.note).toBe('line one\nline two');
    expect(doc.root.noteFormat).toBe('markdown');
  });

  it('respects per-node noteFormat: plain', () => {
    const src = `nodes:\n  - text: A\n    note: 'raw'\n    noteFormat: plain`;
    const doc = parseOrbitYAML(src);
    expect(doc.root.noteFormat).toBe('plain');
  });

  it('normalizes scalar embed shorthand', () => {
    const src = `nodes:\n  - text: A\n    embed: https://acme.example/x`;
    const doc = parseOrbitYAML(src);
    expect(doc.root.embed).toEqual({ src: 'https://acme.example/x' });
  });

  it('normalizes object image with caption', () => {
    const src = `nodes:\n  - text: A\n    image:\n      src: ./d.png\n      alt: D\n      caption: c`;
    const doc = parseOrbitYAML(src);
    expect(doc.root.image).toEqual({ src: './d.png', alt: 'D', caption: 'c' });
  });

  it('several top-level nodes share a root named after the title, even in strict mode', () => {
    const doc = parseOrbitYAML(`title: Plan\nnodes:\n  - text: A\n  - text: B`, { strict: true });
    expect(doc.root.text).toBe('Plan');
    expect(doc.root.children.map((c) => c.text)).toEqual(['A', 'B']);
    expect(doc.diagnostics).toEqual([]);
  });

  it('several top-level nodes without a title share an untitled root', () => {
    const doc = parseOrbitYAML(`nodes:\n  - text: A\n  - text: B`);
    expect(doc.root.text).toBe('Untitled map');
    expect(doc.root.children.map((c) => c.text)).toEqual(['A', 'B']);
    expect(doc.diagnostics?.map((d) => d.code)).toEqual(['synthetic-root']);
  });

  it('schemaVersion 99 throws (strict)', () => {
    expect(() => parseOrbitYAML(`schemaVersion: 99\nnodes:\n  - text: A`, { strict: true })).toThrow(/version/i);
  });

  it('deduplicates generated and explicit node ids', () => {
    const doc = parseOrbitYAML(`nodes:
  - text: Root
    children:
      - text: Task
      - text: Task
      - text: Custom
        id: shared
      - text: Other
        id: shared`);
    expect(doc.root.children.map((child) => child.id)).toEqual(['task', 'task-2', 'shared', 'shared-2']);
  });

  it('reports a YAML problem on its line, once', () => {
    const source = 'nodes:\n  - text: Root\n    children:\n      - text: A\n      - text: [broken\n';
    const doc = parseOrbitYAML(source);
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'invalid-yaml', line: 5, message: 'Invalid YAML: Unterminated flow array' });
    expect(() => parseOrbitYAML(source, { strict: true })).toThrow('Invalid YAML: Unterminated flow array at line 5');
  });

  it('reports children that are not a list, and ignores them', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: A\n    children: notalist');
    expect(doc.root.children).toEqual([]);
    expect(doc.diagnostics?.map((d) => d.code)).toEqual(['invalid-attributes']);
    expect(doc.diagnostics?.[0].message).toContain('children must be a list of nodes');
    expect(() => parseOrbitYAML('nodes:\n  - text: A\n    children: notalist', { strict: true })).toThrow(/children must be a list/);
  });

  it('reports a text that is a list or a map', () => {
    const doc = parseOrbitYAML('nodes:\n  - text:\n      a: 1\n  - text: [x, y]');
    expect(doc.diagnostics?.filter((d) => d.code === 'invalid-attributes')).toHaveLength(2);
  });

  it('an empty caption is absent, not the string "null"', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: A\n    video: http://x.test/v.mp4\n    caption:');
    expect(doc.root.video).toEqual({ src: 'http://x.test/v.mp4' });
    const noMedia = parseOrbitYAML('nodes:\n  - text: A\n    caption:');
    expect(noMedia.root.attrs).toEqual({ caption: null });
  });
});
