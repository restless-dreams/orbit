import { describe, expect, it } from 'bun:test';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';

describe('serializer-markdown', () => {
  it('round-trip headers + lists', () => {
    const src = `# 🚀 Project\n\n## Research\n\n- one\n- two\n\n## Build\n`;
    const out = serializeOrbitMarkdown(parseOrbitMarkdown(src));
    const reparsed = parseOrbitMarkdown(out);
    expect(reparsed.root.icon).toBe('🚀');
    expect(reparsed.root.text).toBe('Project');
    expect(reparsed.root.children.map((c) => c.text)).toEqual(['Research', 'Build']);
    expect(reparsed.root.children[0].children.map((c) => c.text)).toEqual(['one', 'two']);
  });

  it('round-trip with image, note, and color attribute', () => {
    const src = `# A\n![Diagram](./d.png)\n<!-- orbit\ncolor: "#FF6B6B"\n-->\n\nSome note text.\n`;
    const tree = parseOrbitMarkdown(src);
    const out = serializeOrbitMarkdown(tree);
    const reparsed = parseOrbitMarkdown(out);
    expect(reparsed.root.image?.src).toBe('./d.png');
    expect(reparsed.root.color).toBe('#FF6B6B');
    expect(reparsed.root.note).toContain('Some note text.');
  });

  it('round-trip with deep tree using bullet lists', () => {
    const src = `# A\n\n## B\n\n- l1\n  - l2\n    - l3\n      - l4\n        - l5\n          - l6`;
    const out = serializeOrbitMarkdown(parseOrbitMarkdown(src));
    const reparsed = parseOrbitMarkdown(out);
    let n = reparsed.root.children[0];

    for (const expected of ['l1', 'l2', 'l3', 'l4', 'l5', 'l6']) {
      n = n.children[0];
      expect(n.text).toBe(expected);
    }
  });
});

describe('maps in Orbit\'s own form read like hand-written orbit-md', () => {
  const HANDWRITTEN = `# 🌿 Photosynthesis
How plants turn light, water and air into sugar.

## ☀️ Light reactions <!-- orbit status: done -->
In the thylakoid membranes: light splits water and charges ATP and NADPH.
- [x] Photosystem II
- [x] Electron transport chain
  The bridge between the two photosystems.
- [/] ATP synthase #enzyme

## 🔄 Calvin cycle <!-- orbit color: "#E8A33D", priority: 2 -->
- [x] Carbon fixation #rubisco
- [ ] Regeneration of RuBP
  - Three ATP per turn
    ![The cycle](media/cycle.png)
  - [Khan Academy](https://www.khanacademy.org)
`;

  it('comes back unchanged', () => {
    expect(serializeOrbitMarkdown(parseOrbitMarkdown(HANDWRITTEN))).toBe(HANDWRITTEN);
  });

  it('writes the root and its children as headings, and deeper levels as lists', () => {
    const doc = parseOrbitMarkdown('# Root\n## A\n### B\n#### C');
    expect(serializeOrbitMarkdown(doc, { keepSource: false })).toBe('# Root\n\n## A\n- B\n  - C\n');
  });

  it('keeps attributes it can\'t write inline in a comment of their own', () => {
    const doc = parseOrbitMarkdown('# Root\n## A\n- B <!-- orbit tags: [two words, more] -->');
    const out = serializeOrbitMarkdown(doc, { keepSource: false });
    expect(out).toContain('- B\n  <!-- orbit\n  tags: [two words, more]\n  -->\n');
    expect(parseOrbitMarkdown(out).root.children[0].children[0].tags).toEqual(['two words', 'more']);
  });

  it('keeps more than three attributes on the line while the comment stays short', () => {
    const doc = parseOrbitMarkdown('# Root\n## A\n- Apples\n  <!-- orbit\n  type: goal\n  target: 5\n  current: 2\n  unit: apples\n  -->');
    const out = serializeOrbitMarkdown(doc, { keepSource: false });
    expect(out).toContain('- Apples <!-- orbit type: goal, target: 5, current: 2, unit: apples -->\n');
    expect(parseOrbitMarkdown(out).root.children[0].children[0].attrs).toEqual({ target: 5, current: 2, unit: 'apples' });
  });

  it('writes a long comment of more than three attributes as a block, and up to three on the line however long', () => {
    const many = parseOrbitMarkdown('# Root\n## A\n- B <!-- orbit priority: 2, owner: "Someone with a long name", reviewer: "Another long name", team: "A third" -->');
    expect(serializeOrbitMarkdown(many, { keepSource: false })).toContain('- B\n  <!-- orbit\n');
    const three = parseOrbitMarkdown('# Root\n## A\n- B <!-- orbit owner: "Someone with a long name", reviewer: "Another long name", team: "A third long name" -->');
    expect(serializeOrbitMarkdown(three, { keepSource: false })).toContain('- B <!-- orbit owner: Someone with a long name, reviewer: Another long name, team: A third long name -->\n');
  });

  it('quotes a note only when its lines would read as nodes', () => {
    const doc = parseOrbitMarkdown('# Root\n## A\n> - not a child\n> ```\n- B\n  Plain words.');
    const out = serializeOrbitMarkdown(doc, { keepSource: false });
    expect(out).toContain('## A\n> - not a child\n> ```\n');
    expect(out).toContain('- B\n  Plain words.\n');
  });
});

describe('values markdown could misread', () => {
  const roundTrip = (markdown: string): string => {
    return serializeOrbitMarkdown(parseOrbitMarkdown(markdown));
  };

  it('a "-->" in an attribute is escaped, so the comment stays closed', () => {
    const doc = parseOrbitMarkdown('# Root\n## Plan\n<!-- orbit\nwarning: "ends --\\u003e here"\nstatus: blocked\n-->');
    expect(doc.root.children[0].attrs?.warning).toBe('ends --> here');
    const saved = serializeOrbitMarkdown(doc);
    expect(saved).toContain('warning: "ends --\\u003e here"');
    expect(parseOrbitMarkdown(saved).root.children[0]).toMatchObject({ status: 'blocked', attrs: { warning: 'ends --> here' } });
  });

  it("a linked title's own brackets are escaped", () => {
    const saved = roundTrip('# Root\n## [Fix \\[x\\] later](https://example.com)');
    expect(saved).toContain('## [Fix \\[x\\] later](https://example.com)');
    expect(parseOrbitMarkdown(saved).root.children[0]).toMatchObject({ text: 'Fix [x] later', link: 'https://example.com' });
  });

  it('a link with spaces, parentheses or quotes is kept as an attribute', () => {
    const saved = roundTrip('# Root\n## Film <!-- orbit link: "https://en.wikipedia.org/wiki/Orbit_(film)" -->\n## Notes <!-- orbit link: my notes.html -->');
    expect(saved).toContain('## Film <!-- orbit link: "https://en.wikipedia.org/wiki/Orbit_(film)" -->');
    const children = parseOrbitMarkdown(saved).root.children;
    expect(children.map((child) => child.link)).toEqual(['https://en.wikipedia.org/wiki/Orbit_(film)', 'my notes.html']);
  });

  it('a picture whose path or alt text a line could not hold is kept as an attribute', () => {
    const saved = roundTrip('# Root\n## Trip\n<!-- orbit\nimage:\n  src: photos/my photo (1).jpg\n  alt: The [best] view\n-->');
    expect(saved).not.toContain('![');
    expect(parseOrbitMarkdown(saved).root.children[0].image).toEqual({ src: 'photos/my photo (1).jpg', alt: 'The [best] view' });
  });

  it('quotes inline values YAML would read as something else', () => {
    const doc = parseOrbitMarkdown('# Root\n## A');
    doc.root.children[0].attrs = { tilde: '~', half: '.5', anchor: '&a', block: '>', alias: '*a' };
    const saved = serializeOrbitMarkdown(doc, { keepSource: false });
    expect(saved).toContain('<!-- orbit tilde: "~", half: ".5", anchor: "&a", block: ">", alias: "*a" -->');
    expect(parseOrbitMarkdown(saved).root.children[0].attrs).toEqual(doc.root.children[0].attrs);
  });

  it('quotes an inline value with a bracket or brace, which would hide the comma after it', () => {
    const doc = parseOrbitMarkdown('# Root\n## A');
    doc.root.children[0].attrs = { unit: 'a[b', target: 5, label: 'x}y', step: 1 };
    const saved = serializeOrbitMarkdown(doc, { keepSource: false });
    expect(saved).toContain('<!-- orbit unit: "a[b", target: 5, label: "x}y", step: 1 -->');
    expect(parseOrbitMarkdown(saved).root.children[0].attrs).toEqual({ unit: 'a[b', target: 5, label: 'x}y', step: 1 });
  });

  it('reads back every short value written on the line, whatever its punctuation', () => {
    const alphabet = Array.from('ab Z09-_.,:;!?#&*@%^$~`|/\\<>[]{}()\'"+=éß🚀');
    let seed = 7;

    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const failures: string[] = [];

    for (let index = 0; index < 2000; index += 1) {
      const length = 1 + Math.floor(random() * 10);
      const value = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      const doc = parseOrbitMarkdown('# Root\n## A');
      doc.root.children[0].attrs = { unit: value, target: 5 };
      const read = parseOrbitMarkdown(serializeOrbitMarkdown(doc, { keepSource: false })).root.children[0].attrs;

      if (JSON.stringify(read) !== JSON.stringify({ unit: value, target: 5 })) {
        failures.push(value);
      }
    }

    expect(failures).toEqual([]);
  });

  it('round-trips an inline value with a quote of its own', () => {
    const doc = parseOrbitMarkdown('# Root\n## A');
    doc.root.children[0].attrs = { a: 'a"b', b: 2 };
    const saved = serializeOrbitMarkdown(doc, { keepSource: false });
    expect(parseOrbitMarkdown(saved).root.children[0].attrs).toEqual({ a: 'a"b', b: 2 });
  });

  it('writes an attribute whose key would break the inline form as a block', () => {
    const doc = parseOrbitMarkdown('# Root\n## A');
    doc.root.children[0].attrs = { 'a, b': 1, c: 2 };
    const saved = serializeOrbitMarkdown(doc, { keepSource: false });
    expect(saved).toContain('<!-- orbit\n');
    expect(parseOrbitMarkdown(saved).root.children[0].attrs).toEqual({ 'a, b': 1, c: 2 });
  });

  it('a video provider that contradicts the address is kept as an attribute', () => {
    const doc = parseOrbitMarkdown('# Root\n## A');
    doc.root.children[0].video = { src: 'https://youtu.be/abc', provider: 'vimeo' };
    const saved = serializeOrbitMarkdown(doc, { keepSource: false });
    expect(saved).not.toContain('[video]');
    expect(parseOrbitMarkdown(saved).root.children[0].video).toEqual({ src: 'https://youtu.be/abc', provider: 'vimeo' });
    const plain = parseOrbitMarkdown('# Root\n## A\n[video](https://youtu.be/abc)');
    expect(serializeOrbitMarkdown(plain, { keepSource: false })).toContain('[video](https://youtu.be/abc)');
  });
});
