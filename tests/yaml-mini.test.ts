import { describe, expect, it } from 'bun:test';
import { emitYaml, parseYaml } from '../src/core/yaml-mini';

describe('yaml-mini scalars', () => {
  it('plain string', () => {
    expect(parseYaml('foo: bar')).toEqual({ foo: 'bar' });
  });

  it('quoted string preserves whitespace and special chars', () => {
    expect(parseYaml('foo: "  bar : baz  "')).toEqual({ foo: '  bar : baz  ' });
  });

  it('single-quoted string', () => {
    expect(parseYaml("foo: 'hello world'")).toEqual({ foo: 'hello world' });
  });

  it('double-quoted string with escapes', () => {
    expect(parseYaml('foo: "a\\nb\\"c\\\\d"')).toEqual({ foo: 'a\nb"c\\d' });
  });

  it('integer', () => {
    expect(parseYaml('count: 42')).toEqual({ count: 42 });
  });

  it('float', () => {
    expect(parseYaml('ratio: 3.14')).toEqual({ ratio: 3.14 });
  });

  it('boolean true/false', () => {
    expect(parseYaml('a: true\nb: false')).toEqual({ a: true, b: false });
  });

  it('null', () => {
    expect(parseYaml('x: null')).toEqual({ x: null });
  });

  it("single-quoted string with '' escape", () => {
    expect(parseYaml("foo: 'it''s'")).toEqual({ foo: "it's" });
  });
});

describe('yaml-mini nested maps and lists', () => {
  it('nested map two levels deep', () => {
    const input = `
parent:
  child:
    grandchild: leaf
`.trim();
    expect(parseYaml(input)).toEqual({ parent: { child: { grandchild: 'leaf' } } });
  });

  it('block list of scalars', () => {
    const input = `tags:\n  - frontend\n  - backend\n  - api`;
    expect(parseYaml(input)).toEqual({ tags: ['frontend', 'backend', 'api'] });
  });

  it('block list of maps', () => {
    const input = `nodes:\n  - text: A\n    icon: 🚀\n  - text: B\n    icon: 🛠️`;
    expect(parseYaml(input)).toEqual({
      nodes: [{ text: 'A', icon: '🚀' }, { text: 'B', icon: '🛠️' }],
    });
  });

  it('mixed: list of maps with nested children', () => {
    const input = `nodes:\n  - text: A\n    children:\n      - text: A1\n      - text: A2`;
    expect(parseYaml(input)).toEqual({
      nodes: [{ text: 'A', children: [{ text: 'A1' }, { text: 'A2' }] }],
    });
  });

  it('does not collapse a sibling list item into the previous map', () => {
    const input = `nodes:\n  - text: A\n  - text: B`;
    expect(parseYaml(input)).toEqual({ nodes: [{ text: 'A' }, { text: 'B' }] });
  });
});

describe('yaml-mini flow scalars and block scalars', () => {
  it('flow-style array of strings', () => {
    expect(parseYaml('tags: [frontend, backend, api]')).toEqual({
      tags: ['frontend', 'backend', 'api'],
    });
  });

  it('flow-style with quoted entries', () => {
    expect(parseYaml('palette: ["#FFD93D", "#FF6B6B"]')).toEqual({
      palette: ['#FFD93D', '#FF6B6B'],
    });
  });

  it('flow-style empty array', () => {
    expect(parseYaml('tags: []')).toEqual({ tags: [] });
  });

  it('flow-style maps, nested in lists and maps', () => {
    expect(parseYaml('x: {a: 1}')).toEqual({ x: { a: 1 } });
    expect(parseYaml('x: {a: [1, 2], b: {c: "d, e"}}')).toEqual({ x: { a: [1, 2], b: { c: 'd, e' } } });
    expect(parseYaml('x: [{name: Ana}, {name: Ben}]')).toEqual({ x: [{ name: 'Ana' }, { name: 'Ben' }] });
  });

  it('an unclosed flow value is an error', () => {
    expect(() => parseYaml('x: [a, b')).toThrow(/Unterminated flow array/);
    expect(() => parseYaml('x: {a: 1')).toThrow(/Unterminated flow map/);
  });

  it('block scalar | preserves newlines', () => {
    const input = `note: |\n  line one\n  line two\n  line three`;
    expect(parseYaml(input)).toEqual({ note: 'line one\nline two\nline three' });
  });

  it('block scalar > folds newlines to spaces', () => {
    const input = `note: >\n  line one\n  line two`;
    expect(parseYaml(input)).toEqual({ note: 'line one line two' });
  });

  it('block scalar | inside a list-item map', () => {
    const input = `nodes:\n  - text: A\n    note: |\n      line one\n      line two`;
    expect(parseYaml(input)).toEqual({
      nodes: [{ text: 'A', note: 'line one\nline two' }],
    });
  });

  it('block scalar | as the first key on a bullet line', () => {
    const input = `nodes:\n  - note: |\n      x\n      y\n    text: A`;
    expect(parseYaml(input)).toEqual({
      nodes: [{ note: 'x\ny', text: 'A' }],
    });
  });

  it('folded > with blank line becomes paragraph break', () => {
    const input = `note: >\n  para one\n\n  para two`;
    expect(parseYaml(input)).toEqual({ note: 'para one\npara two' });
  });
});

describe('yaml-mini emitter', () => {
  it('round-trips a nested document', () => {
    const input = `title: Roadmap\nnodes:\n  - text: A\n    icon: 🚀\n    children:\n      - text: A1\n        tags:\n          - frontend\n          - api\n        note: |\n          line one\n          line two`;
    const tree = parseYaml(input);
    const out = emitYaml(tree);
    expect(parseYaml(out)).toEqual(tree);
  });

  it('emits scalars without unnecessary quotes', () => {
    expect(emitYaml({ a: 'simple', b: 42, c: true })).toContain('a: simple');
  });

  it('quotes strings that contain a colon', () => {
    expect(emitYaml({ url: 'https://example.com' })).toContain('url: "https://example.com"');
  });

  it('emits block scalar | for multi-line strings', () => {
    expect(emitYaml({ note: 'line one\nline two' })).toContain('note: |');
  });

  it('round-trips a string element with a comma in a flow array', () => {
    const tree = { tags: ['hello,world', 'ok'] };
    const out = emitYaml(tree);
    expect(parseYaml(out)).toEqual(tree);
  });

  it('reads back every string as the same string', () => {
    const tricky = [
      '.5', '-.5', '5.', '1e3', '+1', '0x1F', '0o17', '1_000', '.inf', '-.Inf', '.NaN', 'NaN',
      'null', 'Null', '~', 'true', 'TRUE', 'False', 'yes', 'No', 'on', 'OFF', 'y', 'n',
      '-', '- item', '? key', '#hash', 'a #b', 'a: b', 'a:b', '!tag', '&anchor', '*alias', '|', '>', '@at', '`tick`', '%x',
      ' padded', 'padded ', 'tab\there', 'é', '研究', '😀', '"', "'", '\\', 'back\\slash', 'plain words',
    ];

    for (const value of tricky) {
      const out = emitYaml({ text: value, list: [value] });
      expect(parseYaml(out)).toEqual({ text: value, list: [value] });
    }
  });

  it('quotes words and numbers other YAML readers take for something else', () => {
    for (const value of ['yes', 'On', 'NO', '1e3', '0x1F', '.inf', '+1']) {
      expect(emitYaml({ text: value })).toBe(`text: ${JSON.stringify(value)}\n`);
    }

    expect(emitYaml({ text: 'yesterday' })).toBe('text: yesterday\n');
  });

  it('reads exponent numbers as numbers', () => {
    expect(parseYaml('big: 1e+21\nsmall: 1e-7\nplain: 1.5E2')).toEqual({ big: 1e21, small: 1e-7, plain: 150 });
    expect(parseYaml(emitYaml({ big: 1e21 }))).toEqual({ big: 1e21 });
  });

  it('quotes keys that would not read back as themselves', () => {
    const tree = { 'a: b': 1, ' key': 2, 'padded ': 3, '- item': 4, '': 5, 'a"b': 6 };
    expect(parseYaml(emitYaml(tree))).toEqual(tree);
  });

  it('quotes a list item map whose first key needs quotes', () => {
    const tree = { list: [{ '- x': 1, y: 2 }] };
    expect(parseYaml(emitYaml(tree))).toEqual(tree);
  });

  it('emits empty maps and lists as flow values', () => {
    const tree = { empty: {}, list: [{ b: [] }, { b: {} }] };
    expect(parseYaml(emitYaml(tree))).toEqual(tree);
  });

  it('quotes a multiline value whose line would close frontmatter', () => {
    const tree = { note: 'line one\n---\nline three' };
    expect(emitYaml(tree)).not.toContain('|\n');
    expect(parseYaml(emitYaml(tree))).toEqual(tree);
  });
});

describe('yaml-mini reads the YAML other apps write', () => {
  it('a list at its key\'s own indentation, as Obsidian writes tags', () => {
    expect(parseYaml('tags:\n- travel\n- lisbon\ntitle: Trip')).toEqual({ tags: ['travel', 'lisbon'], title: 'Trip' });
    expect(parseYaml('items:\n- name: a\n  v: 1\n- name: b\n  v: 2')).toEqual({ items: [{ name: 'a', v: 1 }, { name: 'b', v: 2 }] });
  });

  it('comments after values, but a value that starts with # is text', () => {
    expect(parseYaml('title: "Trip"  # working title\nowner: Ana  # for now')).toEqual({ title: 'Trip', owner: 'Ana' });
    expect(parseYaml('color: #FF6B6B\nlink: https://a.example/#top')).toEqual({ color: '#FF6B6B', link: 'https://a.example/#top' });
    expect(parseYaml("note: it's fine # really")).toEqual({ note: "it's fine" });
  });

  it('plain and quoted strings over several lines', () => {
    expect(parseYaml('summary: A long\n  summary here\ntheme: night')).toEqual({ summary: 'A long summary here', theme: 'night' });
    expect(parseYaml('summary: "A long\n  quoted one"')).toEqual({ summary: 'A long quoted one' });
    expect(parseYaml('tags: [a,\n  b]')).toEqual({ tags: ['a', 'b'] });
  });

  it('a key that looks indented under a value is still a mistake', () => {
    expect(() => parseYaml('title: A\n  theme: night')).toThrow(/Unexpected indentation/);
  });

  it('anchors, aliases and merge keys', () => {
    const input = 'base: &base\n  color: red\n  size: 1\nother:\n  <<: *base\n  size: 2\ncopy: *base\nlist:\n  - &one first\n  - *one';
    expect(parseYaml(input)).toEqual({
      base: { color: 'red', size: 1 },
      other: { size: 2, color: 'red' },
      copy: { color: 'red', size: 1 },
      list: ['first', 'first'],
    });
    expect(() => parseYaml('x: *missing')).toThrow(/Unknown alias/);
  });

  it('quoted keys, a tab after the colon, and document markers', () => {
    expect(parseYaml('"my key": 1\ntitle:\tT')).toEqual({ 'my key': 1, title: 'T' });
    expect(parseYaml('---\ntitle: T\n...')).toEqual({ title: 'T' });
  });

  it('merges keys named like built-in object members, __proto__ included', () => {
    const value = parseYaml('base: &base\n  constructor: kept\n  toString: kept too\n  __proto__: 5\nchild:\n  <<: *base\n  own: 1\n') as Record<string, Record<string, unknown>>;
    expect(Object.keys(value.child).sort()).toEqual(['__proto__', 'constructor', 'own', 'toString']);
    expect(value.child.constructor as unknown).toBe('kept');
    expect(Object.getPrototypeOf(value.child)).toBe(Object.prototype);
  });

  it('keeps __proto__ as an own key without changing the prototype', () => {
    const map = parseYaml('__proto__:\n  x: 2') as Record<string, unknown>;
    expect(Object.keys(map)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(map)).toBe(Object.prototype);
    expect(map.__proto__).toEqual({ x: 2 });
    const item = (parseYaml('- __proto__: 5') as Record<string, unknown>[])[0];
    expect(Object.keys(item)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(item)).toBe(Object.prototype);
    const flow = parseYaml('a: {__proto__: 5}') as Record<string, Record<string, unknown>>;
    expect(Object.keys(flow.a)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(flow.a)).toBe(Object.prototype);
  });
});
