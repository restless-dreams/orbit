import { describe, expect, it } from 'bun:test';
import { useMapSize } from './helpers/renderer';
import { OrbitParseError, parseOrbit, parseOrbitMarkdown, parseOrbitYAML, renderOrbitMarkdownBlocks } from '../src/index';
import type { OrbitRenderErrorDetail } from '../src/index';
import { OrbitSVGRenderer } from '../src/core/svg-renderer';

useMapSize(400, 400);

const codes = (source: string): string[] => {
  return (parseOrbit(source).diagnostics ?? []).map((diagnostic) => diagnostic.code);
};

describe('forgiving by default, strict on request', () => {
  it('records an unknown frontmatter key with its line, and throws it in strict mode', () => {
    const source = '---\ntitle: Demo\nauthor: Diana\n---\n# A';
    const doc = parseOrbit(source);
    expect(doc.root.text).toBe('A');
    expect(doc.options.title).toBe('Demo');
    expect(doc.diagnostics).toEqual([
      { code: 'unknown-frontmatter-key', message: 'Unknown frontmatter key "author" (ignored).', line: 3, severity: 'warning' },
    ]);
    expect(doc.warnings).toEqual(['Line 3: Unknown frontmatter key "author" (ignored).']);

    let thrown: unknown;

    try {
      parseOrbit(source, { strict: true });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OrbitParseError);
    expect((thrown as OrbitParseError).code).toBe('unknown-frontmatter-key');
    expect((thrown as OrbitParseError).line).toBe(3);
  });

  it('gives several top-level headings a shared root, and says how to name it', () => {
    const doc = parseOrbit('# A\n## A1\n# B');
    expect(doc.root.text).toBe('Untitled map');
    expect(doc.root.children.map((child) => child.text)).toEqual(['A', 'B']);
    expect(doc.root.children[0].children.map((child) => child.text)).toEqual(['A1']);
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'synthetic-root', line: 1 });
  });

  it('reports lines in the original document, after the frontmatter', () => {
    const source = '---\ntitle: T\nview: all\n---\n# Root\n\n## Child\n<!-- orbit\ncolor: [unclosed\n-->';
    const doc = parseOrbit(source);
    expect(doc.root.children[0].text).toBe('Child');
    // The line with the problem, inside the comment that starts on line 8.
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'invalid-attributes', line: 9 });
  });
});

describe('source normalization', () => {
  it('applies frontmatter with Windows line endings', () => {
    const doc = parseOrbit('---\r\nview: all\r\n---\r\n# A\r\n## B\r\n## C');
    expect(doc.options.viewMode).toBe('all');
    expect(doc.root.children.map((child) => child.text)).toEqual(['B', 'C']);
  });

  it('applies frontmatter after a leading blank line or a byte-order mark', () => {
    expect(parseOrbit('\n\n---\nview: all\n---\n# A').options.viewMode).toBe('all');
    expect(parseOrbit('\uFEFF---\nview: all\n---\n# A').options.viewMode).toBe('all');
  });

  it('parses markdown indented inside a template literal or HTML', () => {
    const doc = parseOrbit(`
      # Project
      ## Research
        - Interviews
      ## Build
    `);
    expect(doc.root.text).toBe('Project');
    expect(doc.root.children.map((child) => child.text)).toEqual(['Research', 'Build']);
    expect(doc.root.children[0].children[0].text).toBe('Interviews');
  });

  it('unwraps ``` and ~~~ orbit fences', () => {
    expect(parseOrbit('```orbit\n# A\n## B\n```').root.children[0].text).toBe('B');
    expect(parseOrbit('~~~orbit\n# A\n## B\n~~~').root.children[0].text).toBe('B');
  });

  it('reads a first line like "Status: draft" as markdown, not YAML', () => {
    const doc = parseOrbit('Status: draft\n- A\n- B');
    expect(doc.root.text).toBe('Status: draft');
    expect(doc.root.children.map((child) => child.text)).toEqual(['A', 'B']);
  });
});

describe('invalid content is reported instead of crashing', () => {
  it('skips a media attribute without a source', () => {
    const doc = parseOrbit('# A\n<!-- orbit\nimage:\n  alt: Missing src\n-->\n## B');
    expect(doc.root.image).toBeUndefined();
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'media-missing-source', line: 2 });
    expect(() => parseOrbit('# A\n<!-- orbit\nimage:\n  alt: x\n-->', { strict: true })).toThrow(OrbitParseError);
  });

  it('skips media without a source in YAML documents', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: A\n    video:\n      caption: no src');
    expect(doc.root.video).toBeUndefined();
    expect(doc.diagnostics?.[0].code).toBe('media-missing-source');
  });

  it('reports an unknown contentType and keeps the media', () => {
    const doc = parseOrbitMarkdown('# A\n![x](a.png)\n<!-- orbit contentType: picture -->');
    expect(doc.root.image).toEqual({ src: 'a.png', alt: 'x' });
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'unknown-content-type', line: 3 });
  });

  it('keeps parsing after an attribute block with invalid YAML', () => {
    const doc = parseOrbit('# A\n## B <!-- orbit color: [ -->\n## C');
    expect(doc.root.children.map((child) => child.text)).toEqual(['B', 'C']);
    expect(doc.diagnostics?.[0].code).toBe('invalid-attributes');
  });

  it('turns an empty document into an empty map', () => {
    const doc = parseOrbit('   \n\n');
    expect(doc.root).toMatchObject({ text: '', children: [] });
    expect(codes('   \n\n')).toEqual(['empty-document']);
    expect(() => parseOrbit('', { strict: true })).toThrow(OrbitParseError);
  });

  it('reads a YAML node\'s text and children under the names people reach for, and says to rename them', () => {
    const source = 'nodes:\n  - title: Launch\n    items:\n      - name: Research\n      - text: Build\n        label: Second phase\n';
    const doc = parseOrbit(source);
    expect(doc.root.text).toBe('Launch');
    expect(doc.root.children.map((node) => node.text)).toEqual(['Research', 'Build']);
    // With its text in "text", a node's "label" is its own attribute, as before.
    expect(doc.root.children[1].attrs).toEqual({ label: 'Second phase' });
    expect(doc.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message])).toEqual([
      ['misnamed-node-key', 'A node\'s text goes in "text", not "title": read as its text. Rename "title" to "text".'],
      ['misnamed-node-key', 'A node\'s children go in "children", not "items": read as its children. Rename "items" to "children".'],
      ['misnamed-node-key', 'A node\'s text goes in "text", not "name": read as its text. Rename "name" to "text".'],
      ['unknown-attribute', expect.stringContaining('"label"')],
    ]);
    expect(() => parseOrbit(source, { strict: true })).toThrow(OrbitParseError);
  });

  it('reports a YAML document that does not parse as an error', () => {
    const doc = parseOrbit('nodes:\n  - text: A\n    tags: [a, b');
    expect(doc.root.text).toBe('');
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'invalid-yaml', severity: 'error' });
  });
});

describe('rendering never breaks the page', () => {
  it('draws an error card for a broken map and still renders the others', () => {
    const container = document.createElement('div');
    container.innerHTML = [
      '<div class="orbit-mind-map" data-orbit="# First&#10;## A"></div>',
      '<div class="orbit-mind-map" data-orbit="nodes:&#10;  - text: A&#10;    tags: [a, b"></div>',
      '<div class="orbit-mind-map" data-orbit="# Third&#10;## C"></div>',
    ].join('');
    document.body.appendChild(container);
    const errors: OrbitRenderErrorDetail[] = [];

    container.addEventListener('orbit-error', (event) => {
      errors.push((event as CustomEvent<OrbitRenderErrorDetail>).detail);
    });

    const renderers = renderOrbitMarkdownBlocks(container);

    expect(renderers).toHaveLength(2);
    const [first, second, third] = Array.from(container.children);
    expect(first.querySelector('svg')).not.toBeNull();
    expect(second.querySelector('[role="alert"]')?.textContent).toContain('Invalid YAML');
    expect(third.querySelector('svg')).not.toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0].diagnostics[0].code).toBe('invalid-yaml');

    for (const renderer of renderers) {
      renderer.destroy();
    }

    container.remove();
  });

  it('renders a hand-built node whose image has no source', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const renderer = new OrbitSVGRenderer(host, { transitionDuration: 0 });
    const root = { id: 'a', text: 'A', level: 0, children: [], image: { alt: 'no src' } as unknown as { src: string } };
    expect(() => renderer.render(root)).not.toThrow();
    expect(host.querySelector('image')).toBeNull();
    renderer.destroy();
    host.remove();
  });

  it('shows an empty state for an empty map', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const renderer = new OrbitSVGRenderer(host, { transitionDuration: 0 });
    renderer.render(parseOrbit('').root);
    expect(host.querySelector('.orbit-empty')?.textContent).toContain('This map is empty');
    renderer.destroy();
    host.remove();
  });
});

describe('problems say how to fix them', () => {
  const messages = (source: string) => (parseOrbit(source).diagnostics ?? []).map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`);

  it('suggests the frontmatter key a misspelled or misremembered one means', () => {
    expect(messages('---\nrings: false\nmaxdepth: 2\nviewMode: all\n---\n# A')).toEqual([
      'unknown-frontmatter-key: Unknown frontmatter key "rings" (ignored). Did you mean "showRings"?',
      'unknown-frontmatter-key: Unknown frontmatter key "maxdepth" (ignored). Did you mean "maxDepth"?',
      'unknown-frontmatter-key: Unknown frontmatter key "viewMode" (ignored). Did you mean "view"?',
    ]);
    expect(messages('title: Plan\nnodez:\n  - text: A')[0]).toBe('unknown-yaml-key: Unknown top-level key "nodez" (ignored). Did you mean "nodes"?');
  });

  it('explains frontmatter values it can\'t use', () => {
    const doc = parseOrbit('---\ntheme: dark\nview: overview\nheight: tall\nshowRings: maybe\n---\n# A');
    expect(doc.diagnostics?.map((diagnostic) => [diagnostic.code, diagnostic.line, diagnostic.message])).toEqual([
      ['invalid-option-value', 2, 'Unknown theme "dark". Themes: paper, night, glass, glass-night, cosmos, blueprint, ink, contrast, flat, flat-night, material, material-night, liquid, liquid-night, auto. Did you mean "night"?'],
      ['invalid-option-value', 3, 'view must be "focus" or "all" (the overview), got "overview". Did you mean "all"?'],
      ['invalid-option-value', 4, 'height must be a number above 0, got "tall".'],
      ['invalid-option-value', 5, 'showRings must be true or false, got "maybe".'],
    ]);
    expect(doc.options.viewMode).toBeUndefined();
    expect(doc.options.height).toBeUndefined();
    expect(() => parseOrbit('---\ntheme: dark\n---\n# A', { strict: true })).toThrow(OrbitParseError);
    expect(messages('---\nflavor: xml\n---\n# A')).toEqual(['invalid-option-value: flavor must be "markdown" or "yaml", got "xml".']);
  });

  it('reads flags and palettes the way people write them', () => {
    const { options } = parseOrbit('---\nshowRings: no\nanimation: yes\npalette: "#111, #222"\n---\n# A');
    expect(options).toMatchObject({ showRings: false, orbitAnimation: true, palette: ['#111', '#222'] });
  });

  it('notes an attribute that looks misspelled, and keeps it as a custom attribute', () => {
    const doc = parseOrbit('# A\n<!-- orbit\ncolour: red\nstauts: done\nowner: Ana\n-->');
    expect(doc.diagnostics?.map((diagnostic) => diagnostic.message)).toEqual([
      'Unknown attribute "colour", kept as a custom attribute. Did you mean "color"?',
      'Unknown attribute "stauts", kept as a custom attribute. Did you mean "status"?',
    ]);
    expect(doc.root.attrs).toEqual({ colour: 'red', stauts: 'done', owner: 'Ana' });
    // A note, never fatal: custom attributes are allowed.
    expect(() => parseOrbit('# A\n<!-- orbit colour: red -->', { strict: true })).not.toThrow();
  });

  it('reads comma-separated inline attributes as several', () => {
    const doc = parseOrbit('# A <!-- orbit status: active, priority: 1 -->\n- B <!-- orbit tags: [x, y] -->');
    expect(doc.root).toMatchObject({ status: 'active', priority: 1 });
    expect(doc.root.children[0].tags).toEqual(['x', 'y']);
    expect(doc.diagnostics).toEqual([]);
    expect(parseOrbit('# A <!-- orbit status: active, priority: 1 -->', { strict: true }).root.priority).toBe(1);
    // A comma inside a value is just a comma.
    expect(parseOrbit('# A <!-- orbit status: "waiting, then active" -->').root.status).toBe('waiting, then active');
  });

  it('points YAML nodes at "text" and "children"', () => {
    const doc = parseOrbit('nodes:\n  - title: Plan\n    items: [A, B]');
    expect(doc.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'A node\'s text goes in "text", not "title": read as its text. Rename "title" to "text".',
      'A node\'s children go in "children", not "items": read as its children. Rename "items" to "children".',
    ]);
    expect([doc.root.text, ...doc.root.children.map((node) => node.text)]).toEqual(['Plan', 'A', 'B']);
  });

  it('takes an icon from an attribute in either flavor', () => {
    expect(parseOrbit('# Launch\n<!-- orbit icon: 🚀 -->').root.icon).toBe('🚀');
    expect(parseOrbit('nodes:\n  - text: Launch\n    icon: 🚀').root.icon).toBe('🚀');
    // The attribute wins over an emoji at the start of the heading.
    expect(parseOrbit('# 🛠 Build\n<!-- orbit icon: ★ -->').root).toMatchObject({ text: 'Build', icon: '★' });
  });
});
