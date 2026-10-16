import { describe, test, expect } from 'bun:test';
import { findNodeById, getNodePath, slugify } from '../src/core/utils';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import type { OrbitNode } from '../src/core/types';

/** Build an OrbitNode tree from markdown header syntax. */
const parse = (md: string): OrbitNode => {
  return parseOrbitMarkdown(md).root;
};

describe('slugify', () => {
  test('lowercases and dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  test('strips non-alphanumeric', () => {
    expect(slugify("It's awesome!")).toBe('it-s-awesome');
  });

  test('falls back to "node" for empty input', () => {
    expect(slugify('!!!')).toBe('node');
  });
});

describe('findNodeById / getNodePath', () => {
  test('findNodeById returns the matching node', () => {
    const root = parse('# Root\n\n## A\n## B');
    const target = root.children[1];
    expect(findNodeById(root, target.id)?.text).toBe('B');
  });

  test('findNodeById returns null when missing', () => {
    const root = parse('# Root');
    expect(findNodeById(root, 'nope')).toBeNull();
  });

  test('getNodePath returns the chain from the root to the target', () => {
    const root = parse('# Root\n\n## A\n\n### Deep');
    const deep = root.children[0].children[0];
    const path = getNodePath(root, deep.id);
    expect(path.map((n) => n.text)).toEqual(['Root', 'A', 'Deep']);
  });

  test('getNodePath returns [] for missing id', () => {
    const root = parse('# Root');
    expect(getNodePath(root, 'nope')).toEqual([]);
  });
});
