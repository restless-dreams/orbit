import { describe, expect, test } from 'bun:test';
import { attributeOf, childElement, childElements, decodeMarkup, MarkupError, MAX_MARKUP_DEPTH, parseHtml, parseXml, textContent } from '../src/core/other-apps/markup';

describe('reading XML', () => {
  test('reads elements, attributes, text and CDATA', () => {
    const root = parseXml('<?xml version="1.0"?>\n<!-- a comment -->\n<map version="1.0.1"><node TEXT="A &amp; B" ID=\'one\'><![CDATA[<raw> & text]]></node><node/></map>');
    expect(root.name).toBe('map');
    expect(root.attributes.version).toBe('1.0.1');
    const [first, second] = childElements(root, 'node');
    expect(first.attributes).toEqual({ TEXT: 'A & B', ID: 'one' });
    expect(textContent(first)).toBe('<raw> & text');
    expect(second.children).toEqual([]);
  });

  test('reads character references, and leaves names XML never defined as written', () => {
    const root = parseXml('<a title="&#xe9;t&#233; &lt;3">&quot;&apos;&gt; &nbsp; &bogus; &#0; &#xD800;</a>');
    expect(root.attributes.title).toBe('été <3');
    expect(textContent(root)).toBe('"\'> &nbsp; &bogus; &#0; &#xD800;');
  });

  test('turns tabs and line breaks written in a value into spaces, but keeps the ones written as references', () => {
    const root = parseXml('<node TEXT="one\n\ttwo&#xa;three&#13;four"/>');
    expect(root.attributes.TEXT).toBe('one  two\nthree\rfour');
  });

  test('reads every line break in text as a line feed', () => {
    expect(textContent(parseXml('<a>one\r\ntwo\rthree</a>'))).toBe('one\ntwo\nthree');
  });

  test('skips a DOCTYPE without reading what it declares, so its entities never grow', () => {
    const laughs = '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;"><!ELEMENT lolz (#PCDATA)>]><lolz>&lol2;</lolz>';
    expect(textContent(parseXml(laughs))).toBe('&lol2;');
    expect(parseXml('<!DOCTYPE map SYSTEM "file:///etc/passwd"><map/>').name).toBe('map');
  });

  test('finds attributes and children by their names without prefixes', () => {
    const root = parseXml('<topic xmlns:xlink="x" xlink:href="https://example.com"><xhtml:img xhtml:src="a.png"/></topic>');
    expect(attributeOf(root, 'href')).toBe('https://example.com');
    expect(attributeOf(childElement(root, 'img')!, 'src')).toBe('a.png');
    expect(attributeOf(root, 'missing')).toBeUndefined();
  });

  test('refuses a file that isn\'t well-formed, with the line of the problem', () => {
    const cases: [string, RegExp, number][] = [
      ['<map>\n<node>\n</map>', /<\/map> doesn't match <node>/, 3],
      ['<map>\n<node/>', /is never closed/, 2],
      ['<map><node TEXT=bare/></map>', /has no quotes/, 1],
      ['<map>\n\n<!-- open', /comment that never ends/, 3],
      ['', /No element/, 1],
      ['<a/><b/>', /More than one top element/, 1],
      ['<map><node', /never closes/, 1],
      ['<map>< node/></map>', /starts no tag/, 1],
    ];

    for (const [xml, message, line] of cases) {
      let error: unknown;

      try {
        parseXml(xml);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(MarkupError);
      expect((error as MarkupError).message).toMatch(message);
      expect((error as MarkupError).line).toBe(line);
    }
  });

  test('refuses nesting deeper than its limit instead of running out of stack', () => {
    const deep = '<a>'.repeat(MAX_MARKUP_DEPTH + 5) + '</a>'.repeat(MAX_MARKUP_DEPTH + 5);
    expect(() => parseXml(deep)).toThrow(/nested more than/);
    const fine = '<a>'.repeat(MAX_MARKUP_DEPTH - 5) + '</a>'.repeat(MAX_MARKUP_DEPTH - 5);
    expect(parseXml(fine).name).toBe('a');
  });

  test('reads a large file quickly', () => {
    const nodes = Array.from({ length: 20000 }, (_, index) => `<node TEXT="Idea ${index}" ID="ID_${index}"><icon BUILTIN="idea"/></node>`).join('\n');
    const started = performance.now();
    const root = parseXml(`<map>${nodes}</map>`);
    expect(childElements(root, 'node')).toHaveLength(20000);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('reading HTML', () => {
  test('closes void elements and reads named characters', () => {
    const fragment = parseHtml('<div>one<br>two&nbsp;&eacute;&hellip;<img src="a.png"></div>');
    const div = childElement(fragment, 'div')!;
    expect(div.children.map((child) => (typeof child === 'string' ? child : child.localName))).toEqual(['one', 'br', 'two é…', 'img']);
  });

  test('forgives end tags that don\'t match and tags that never close', () => {
    const fragment = parseHtml('<p><b>bold<i>both</b> after</p></span><p>open');
    expect(textContent(fragment)).toBe('boldboth afteropen');
    expect(childElements(fragment, 'p')).toHaveLength(2);
  });

  test('leaves scripts and styles out', () => {
    expect(textContent(parseHtml('<p>Hi<script>alert(1)</script><style>p { color: red }</style> there</p>'))).toBe('Hi there');
  });

  test('reads a lone "<" as text, and lowercases names', () => {
    const fragment = parseHtml('<P>1 < 2</P>');
    expect(childElement(fragment, 'p')).toBeDefined();
    expect(textContent(fragment)).toBe('1 < 2');
  });
});

describe('decoding files', () => {
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

  test('reads UTF-8, with or without its byte order mark', () => {
    expect(decodeMarkup(encode('<a>café</a>'))).toBe('<a>café</a>');
    expect(decodeMarkup(Uint8Array.from([0xef, 0xbb, 0xbf, ...encode('<a>é</a>')]))).toBe('<a>é</a>');
  });

  test('reads UTF-16 in either byte order', () => {
    const littleEndian = Uint8Array.from([0xff, 0xfe, ...[...'<a>é</a>'].flatMap((character) => [character.charCodeAt(0), 0])]);
    expect(decodeMarkup(littleEndian)).toBe('<a>é</a>');
    const bigEndian = Uint8Array.from([0xfe, 0xff, ...[...'<a>é</a>'].flatMap((character) => [0, character.charCodeAt(0)])]);
    expect(decodeMarkup(bigEndian)).toBe('<a>é</a>');
    const withoutMark = Uint8Array.from([...'<a/>'].flatMap((character) => [character.charCodeAt(0), 0]));
    expect(decodeMarkup(withoutMark)).toBe('<a/>');
  });

  test('reads the encoding the declaration names', () => {
    const latin = Uint8Array.from([...encode('<?xml version="1.0" encoding="ISO-8859-1"?><a>caf'), 0xe9, ...encode('</a>')]);
    expect(decodeMarkup(latin)).toBe('<?xml version="1.0" encoding="ISO-8859-1"?><a>café</a>');
  });

  test('reads a file that isn\'t UTF-8 and names nothing as Windows-1252', () => {
    expect(decodeMarkup(Uint8Array.from([...encode('<a>caf'), 0xe9, 0x80, ...encode('</a>')]))).toBe('<a>café€</a>');
  });

  test('reads an encoding it doesn\'t know as UTF-8', () => {
    expect(decodeMarkup(encode('<?xml version="1.0" encoding="x-made-up"?><a>é</a>'))).toContain('<a>é</a>');
  });
});
