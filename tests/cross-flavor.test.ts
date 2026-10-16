import { describe, expect, it } from 'bun:test';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { parseOrbitYAML } from '../src/core/parser-yaml';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import type { OrbitNode } from '../src/core/types';

const strip = (n: OrbitNode): unknown => {
  return {
    text: n.text,
    icon: n.icon,
    color: n.color,
    link: n.link,
    note: (n.note ?? '').trim(),
    image: n.image,
    video: n.video,
    embed: n.embed,
    children: n.children.map(strip),
  };
};

describe('cross-flavor round-trips', () => {
  const md = `# 🚀 Project\n\n## Research\n\n- one\n- two\n\n## Build\n`;

  it('markdown to YAML and back', () => {
    const a = parseOrbitMarkdown(md);
    const yaml = serializeOrbitYAML(a);
    const b = parseOrbitYAML(yaml);
    expect(strip(b.root)).toEqual(strip(a.root));
  });

  it('YAML to markdown and back', () => {
    const yaml = `nodes:\n  - text: Project\n    icon: 🚀\n    children:\n      - text: Research\n        children:\n          - text: one\n          - text: two\n      - text: Build`;
    const a = parseOrbitYAML(yaml);
    const out = serializeOrbitMarkdown(a);
    const b = parseOrbitMarkdown(out);
    expect(strip(b.root)).toEqual(strip(a.root));
  });
});
