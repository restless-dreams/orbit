import { describe, expect, it } from 'bun:test';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { parseOrbitYAML } from '../src/core/parser-yaml';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';

describe('serializer-yaml', () => {
  it('round-trip: parsing, serializing and parsing again gives the original tree', () => {
    const src = `title: Demo\nview: focus\nnodes:\n  - text: A\n    icon: 🚀\n    children:\n      - text: B\n        color: red\n        note: |\n          line one\n          line two`;
    const original = parseOrbitYAML(src);
    const out = serializeOrbitYAML(original);
    const reparsed = parseOrbitYAML(out);
    expect(reparsed.options.title).toBe(original.options.title);
    expect(reparsed.options.viewMode).toBe(original.options.viewMode);
    expect(reparsed.root.text).toBe(original.root.text);
    expect(reparsed.root.icon).toBe(original.root.icon);
    expect(reparsed.root.children[0].text).toBe(original.root.children[0].text);
    expect(reparsed.root.children[0].color).toBe(original.root.children[0].color);
    expect(reparsed.root.children[0].note).toBe(original.root.children[0].note);
  });

  it('emits explicit id only when set', () => {
    const src = `nodes:\n  - text: A\n    id: stable-001`;
    const out = serializeOrbitYAML(parseOrbitYAML(src));
    expect(out).toContain('id: stable-001');
  });

  it('never writes custom attributes under keys a node reads as structure', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: A\n  - text: B');
    doc.root.children[0].attrs = { children: [{ text: 'fake' }], text: 'override', kept: 1 };
    const out = serializeOrbitYAML(doc);
    expect(out).toContain('kept: 1');
    const reparsed = parseOrbitYAML(out);
    const node = reparsed.root.children[0];
    expect(node.text).toBe('A');
    expect(node.children).toEqual([]);
    expect(node.attrs).toEqual({ kept: 1 });
  });

  it('writes back what Orbit kept without reading: a caption with no picture, a note or note format it couldn\'t use', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: Root\n    children:\n      - text: A\n        caption: Our team\n      - text: B\n        note: [x, y]\n        noteFormat: html\n');
    expect(doc.root.children.map((child) => child.attrs)).toEqual([{ caption: 'Our team' }, { note: ['x', 'y'], noteFormat: 'html' }]);
    const reparsed = parseOrbitYAML(serializeOrbitYAML(doc));
    expect(reparsed.root.children.map((child) => child.attrs)).toEqual([{ caption: 'Our team' }, { note: ['x', 'y'], noteFormat: 'html' }]);
  });

  it('keeps a markdown caption with no picture when the map is converted to YAML', () => {
    const doc = parseOrbitMarkdown('# Root\n\n- A <!-- orbit caption: Our team -->\n');
    const reparsed = parseOrbitYAML(serializeOrbitYAML(doc));
    expect(reparsed.root.children[0].attrs).toEqual({ caption: 'Our team' });
  });
});
