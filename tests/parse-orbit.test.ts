import { describe, expect, it } from 'bun:test';
import { parseOrbit, serializeOrbitMarkdown } from '../src/core';

describe('parseOrbit auto-detect', () => {
  it('a # heading reads as markdown', () => {
    const doc = parseOrbit(`# A`);
    expect(doc.root.text).toBe('A');
  });

  it('--- frontmatter reads as markdown', () => {
    const doc = parseOrbit(`---\nview: focus\n---\n# A`);
    expect(doc.options.viewMode).toBe('focus');
  });

  it('--- with flavor: yaml routes to YAML', () => {
    const src = `---\nflavor: yaml\n---\nnodes:\n  - text: B`;
    const doc = parseOrbit(src);
    expect(doc.root.text).toBe('B');
  });

  it('a top-level nodes: reads as YAML', () => {
    const doc = parseOrbit(`nodes:\n  - text: A`);
    expect(doc.root.text).toBe('A');
  });

  it('a top-level title: reads as YAML', () => {
    const doc = parseOrbit(`title: D\nnodes:\n  - text: A`);
    expect(doc.options.title).toBe('D');
  });

  it('a note line that starts with nodes: keeps a markdown map markdown', () => {
    const doc = parseOrbit(`# Graph theory\nnodes: the points of a graph\n\n## Basics\n- Vertices\n- Edges\n`);
    expect(doc.root.text).toBe('Graph theory');
    expect(doc.root.note).toBe('nodes: the points of a graph');
    expect(doc.root.children[0].children.map((child) => child.text)).toEqual(['Vertices', 'Edges']);
    expect(doc.diagnostics).toEqual([]);
  });

  it('markdown that starts with "title: …" and has no nodes list stays markdown', () => {
    const doc = parseOrbit(`title: a weekly plan\n\n# Week 42\n- Monday\n- Tuesday\n`);
    expect(doc.root.text).toBe('Week 42');
    expect(doc.root.children.map((child) => child.text)).toEqual(['Monday', 'Tuesday']);
  });

  it('a YAML map with a mistake below its first line is still read as YAML, and reported', () => {
    const doc = parseOrbit(`title: D\nnodes:\n  - text: A\n   bad: indentation`);
    expect(doc.diagnostics?.[0]?.code).toBe('invalid-yaml');
  });

  it('input without structure is reported, and throws in strict mode', () => {
    const doc = parseOrbit(`!@#$ no headers here`);
    expect(doc.root.children).toEqual([]);
    expect(doc.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(['no-structure']);
    expect(() => parseOrbit(`!@#$ no headers here`, { strict: true })).toThrow(/heading/i);
  });

  it('a first line that only starts like a nodes key stays markdown', () => {
    const doc = parseOrbit('nodes: the points of a graph\n\n- Vertices');
    expect(doc.root.text).toBe('nodes: the points of a graph');
    expect(doc.root.children.map((child) => child.text)).toEqual(['Vertices']);
    expect(doc.diagnostics).toEqual([]);
  });

  it('an empty ```orbit fence keeps both fences through a save', () => {
    const doc = parseOrbit('```orbit\n```');
    expect(serializeOrbitMarkdown(doc)).toBe('```orbit\n\n```');
  });

  it('a ```orbital fence is not unwrapped', () => {
    const doc = parseOrbit('```orbital\n# Not unwrapped\n```');
    expect(doc.root.text).not.toBe('Not unwrapped');
  });

  it('a fence with display options is unwrapped, and a save keeps its opening line', () => {
    const source = '```orbit height=480 theme=glass view=all\n# Map\n\n- Idea\n```\n';
    const doc = parseOrbit(source);
    expect(doc.root.text).toBe('Map');
    expect(doc.root.children.map((child) => child.text)).toEqual(['Idea']);
    expect(serializeOrbitMarkdown(doc)).toBe(source);
    // The body repeats words of the info string: positions, not a search, find it.
    const repeated = parseOrbit('```orbit # Map\n# Map\n```');
    expect(repeated.root.text).toBe('Map');
    expect(serializeOrbitMarkdown(repeated)).toBe('```orbit # Map\n# Map\n```');
  });

  it('a fence with Windows line endings or indented in a page saves back byte for byte', () => {
    for (const source of ['```orbit height=480\r\n# Map\r\n\r\n- Idea\r\n```\r\n', '  ```orbit view=all\n  # Map\n  - Idea\n  ```\n']) {
      const doc = parseOrbit(source);
      expect(doc.root.children.map((child) => child.text)).toEqual(['Idea']);
      expect(serializeOrbitMarkdown(doc)).toBe(source);
    }
  });

  it('a fence closed by the other kind of fence is not unwrapped', () => {
    const doc = parseOrbit('```orbit\n# Not unwrapped\n~~~');
    expect(doc.root.text).not.toBe('Not unwrapped');
  });
});
