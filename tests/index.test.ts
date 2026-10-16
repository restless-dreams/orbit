import { describe, expect, test } from 'bun:test';
import { parseOrbitMarkdown } from '../src/index';

describe('package root entry', () => {
  test('exports framework-agnostic core APIs', () => {
    const doc = parseOrbitMarkdown('# Root\n  - A');
    expect(doc.root.text).toBe('Root');
    expect(doc.root.children[0].text).toBe('A');
  });
});
