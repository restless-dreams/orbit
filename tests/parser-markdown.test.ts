import { describe, expect, it } from 'bun:test';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';

describe('parser-markdown header trees', () => {
  it('h1 only', () => {
    const doc = parseOrbitMarkdown(`# Project`);
    expect(doc.root.text).toBe('Project');
    expect(doc.root.children).toEqual([]);
  });

  it('h1 with h2 children', () => {
    const doc = parseOrbitMarkdown(`# Project\n\n## Research\n## Build`);
    expect(doc.root.text).toBe('Project');
    expect(doc.root.children.map((c) => c.text)).toEqual(['Research', 'Build']);
  });

  it('nested h1, h2 and h3', () => {
    const doc = parseOrbitMarkdown(`# A\n\n## B\n\n### C`);
    expect(doc.root.children[0].children[0].text).toBe('C');
  });

  it('several h1 headings share a root named after the title, even in strict mode', () => {
    const doc = parseOrbitMarkdown(`---\ntitle: Sprint review\n---\n# Week 1\n- Plan\n# Week 2\n- Retro`, { strict: true });
    expect(doc.root.text).toBe('Sprint review');
    expect(doc.root.children.map((c) => c.text)).toEqual(['Week 1', 'Week 2']);
    expect(doc.root.children.map((c) => c.children.map((child) => child.text))).toEqual([['Plan'], ['Retro']]);
    expect(doc.diagnostics).toEqual([]);
  });

  it('several h1 headings without a title share an untitled root; each keeps its subheadings', () => {
    const doc = parseOrbitMarkdown(`# A\n# B\n## C`);
    expect(doc.root.text).toBe('Untitled map');
    expect(doc.root.children.map((c) => c.text)).toEqual(['A', 'B']);
    expect(doc.root.children[1].children.map((c) => c.text)).toEqual(['C']);
    expect(doc.diagnostics?.map((d) => d.code)).toEqual(['synthetic-root']);
  });

  it('an empty document gives an empty root', () => {
    const doc = parseOrbitMarkdown(``);
    expect(doc.root.text).toBe('');
  });

  it('deduplicates generated ids for repeated titles', () => {
    const doc = parseOrbitMarkdown(`# Root\n\n## Task\n\n### Detail\n\n## Task\n\n### Detail`);
    expect(doc.root.children.map((child) => child.id)).toEqual(['task', 'task-2']);
    expect(doc.root.children.map((child) => child.children[0].id)).toEqual(['detail', 'detail-2']);
  });

  it('deduplicates explicit ids from attribute blocks', () => {
    const doc = parseOrbitMarkdown(`# Root\n\n## A <!-- orbit id: shared -->\n## B <!-- orbit id: shared -->`);
    expect(doc.root.children.map((child) => child.id)).toEqual(['shared', 'shared-2']);
  });
});

describe('parser-markdown bullet lists as children', () => {
  it('list under a header becomes its children', () => {
    const doc = parseOrbitMarkdown(`# A\n- one\n- two`);
    expect(doc.root.children.map((c) => c.text)).toEqual(['one', 'two']);
  });

  it('nested lists go arbitrarily deep', () => {
    const doc = parseOrbitMarkdown(`# A\n- one\n  - one-a\n    - one-a-i\n- two`);
    expect(doc.root.children[0].text).toBe('one');
    expect(doc.root.children[0].children[0].text).toBe('one-a');
    expect(doc.root.children[0].children[0].children[0].text).toBe('one-a-i');
    expect(doc.root.children[1].text).toBe('two');
  });

  it('a list next to subheadings: both are children, in the order written', () => {
    const doc = parseOrbitMarkdown(`# A\n- one\n## B\n- two`);
    expect(doc.root.children.map((c) => c.text)).toEqual(['one', 'B']);
    expect(doc.root.children[1].children.map((c) => c.text)).toEqual(['two']);
    expect(doc.root.note).toBeUndefined();
  });

  it('a paragraph before a list is the note, and the list is still the children', () => {
    const doc = parseOrbitMarkdown(`# A\n\nSome paragraph.\n\n- one\n- two`);
    expect(doc.root.children.map((c) => c.text)).toEqual(['one', 'two']);
    expect(doc.root.note).toBe('Some paragraph.');
  });

  it('content after a children-list joins the note', () => {
    const doc = parseOrbitMarkdown(`# A\n- one\n- two\n\nSome footnote.`);
    expect(doc.root.children.map((c) => c.text)).toEqual(['one', 'two']);
    expect(doc.root.note ?? '').toContain('Some footnote.');
  });
});

describe('parser-markdown title parsing (emoji + link)', () => {
  it('leading emoji becomes icon', () => {
    const doc = parseOrbitMarkdown(`# 🚀 Project`);
    expect(doc.root.icon).toBe('🚀');
    expect(doc.root.text).toBe('Project');
  });

  it('trailing emoji is NOT extracted', () => {
    const doc = parseOrbitMarkdown(`# Project 🚀`);
    expect(doc.root.icon).toBeUndefined();
    expect(doc.root.text).toBe('Project 🚀');
  });

  it('multi-emoji cluster matched as single icon', () => {
    const doc = parseOrbitMarkdown(`# 🔢🔗 account_id`);
    expect(doc.root.icon).toBe('🔢🔗');
    expect(doc.root.text).toBe('account_id');
  });

  it('markdown link in title sets node.link', () => {
    const doc = parseOrbitMarkdown(`# [Project Site](https://example.com)`);
    expect(doc.root.link).toBe('https://example.com');
    expect(doc.root.text).toBe('Project Site');
  });

  it('a link destination with balanced parentheses is read whole', () => {
    const doc = parseOrbitMarkdown('# [Orbit film](https://en.wikipedia.org/wiki/Orbit_(film))');
    expect(doc.root.link).toBe('https://en.wikipedia.org/wiki/Orbit_(film)');
    expect(doc.root.text).toBe('Orbit film');
  });

  it('a title in parentheses that links to a destination in parentheses keeps both whole, in headings and list items', () => {
    const doc = parseOrbitMarkdown('# Films\n## [Orbit (film)](https://en.wikipedia.org/wiki/Orbit_(film))\n- [Orbit (film)](https://en.wikipedia.org/wiki/Orbit_(film))');
    const heading = doc.root.children[0];
    const item = heading.children[0];

    for (const node of [heading, item]) {
      expect(node.text).toBe('Orbit (film)');
      expect(node.link).toBe('https://en.wikipedia.org/wiki/Orbit_(film)');
    }
  });

  it('a title with more escapes than private-use codes still parses', () => {
    const doc = parseOrbitMarkdown(`# ${'\\`'.repeat(70000)}`);
    expect(doc.root.text.length).toBe(70000);
  });

  it('emoji + link combined', () => {
    const doc = parseOrbitMarkdown(`# 🚀 [Project Site](https://example.com)`);
    expect(doc.root.icon).toBe('🚀');
    expect(doc.root.link).toBe('https://example.com');
    expect(doc.root.text).toBe('Project Site');
  });

  it('emoji on list item', () => {
    const doc = parseOrbitMarkdown(`# A\n- 🔢 account_id`);
    expect(doc.root.children[0].icon).toBe('🔢');
    expect(doc.root.children[0].text).toBe('account_id');
  });

  it('text-style symbols (®, ©, ™) are NOT extracted as icons', () => {
    const docR = parseOrbitMarkdown(`# ® Registered`);
    expect(docR.root.icon).toBeUndefined();
    expect(docR.root.text).toBe('® Registered');

    const docC = parseOrbitMarkdown(`# © Acme Corp`);
    expect(docC.root.icon).toBeUndefined();
    expect(docC.root.text).toBe('© Acme Corp');
  });

  it('Extended_Pictographic with VS16 (e.g., ☀️) IS extracted as icon', () => {
    const doc = parseOrbitMarkdown(`# ☀️ Sunshine`);
    expect(doc.root.icon).toBe('☀️');
    expect(doc.root.text).toBe('Sunshine');
  });
});

describe('parser-markdown rich content (image/video/embed)', () => {
  it('image extracted from ![alt](url)', () => {
    const doc = parseOrbitMarkdown(`# A\n![hero](./hero.png)`);
    expect(doc.root.image).toEqual({ src: './hero.png', alt: 'hero' });
  });

  it('an image line\'s optional "title" is dropped from the src', () => {
    const doc = parseOrbitMarkdown('# A\n![hero](./hero.png "The title")');
    expect(doc.root.image).toEqual({ src: './hero.png', alt: 'hero' });
  });

  it('a video link\'s optional "title" is dropped from the src', () => {
    const doc = parseOrbitMarkdown('# A\n[Watch](https://youtu.be/abc "A demo")');
    expect(doc.root.video).toEqual({ src: 'https://youtu.be/abc', provider: 'youtube' });
  });

  it('video from [![thumb](t.jpg)](youtube url)', () => {
    const doc = parseOrbitMarkdown(`# A\n[![thumb](t.jpg)](https://youtu.be/abc)`);
    expect(doc.root.video?.src).toBe('https://youtu.be/abc');
    expect(doc.root.video?.provider).toBe('youtube');
    expect(doc.root.image).toBeUndefined();
  });

  it('video from plain youtube link', () => {
    const doc = parseOrbitMarkdown(`# A\n[Watch](https://www.youtube.com/watch?v=abc)`);
    expect(doc.root.video?.src).toContain('youtube.com');
    expect(doc.root.video?.provider).toBe('youtube');
  });

  it('video from .mp4 link', () => {
    const doc = parseOrbitMarkdown(`# A\n[Demo](./clip.mp4)`);
    expect(doc.root.video?.src).toBe('./clip.mp4');
    expect(doc.root.video?.provider).toBe('native');
  });

  it('embed from known provider link (vimeo)', () => {
    const doc = parseOrbitMarkdown(`# A\n[Watch](https://player.vimeo.com/video/123)`);
    expect(doc.root.video?.provider).toBe('vimeo');
  });

  it('plain link with unrecognized URL falls into note', () => {
    const doc = parseOrbitMarkdown(`# A\n[Read more](https://other.example/article)`);
    expect(doc.root.image).toBeUndefined();
    expect(doc.root.video).toBeUndefined();
    expect(doc.root.embed).toBeUndefined();
    expect(doc.root.note ?? '').toContain('Read more');
  });

  it('only the first image is consumed; second joins note', () => {
    const doc = parseOrbitMarkdown(`# A\n![one](a.png)\n![two](b.png)`);
    expect(doc.root.image?.src).toBe('a.png');
    expect(doc.root.note ?? '').toContain('![two]');
  });

  it('second wrapped video URL after node.video is set falls into the note (not silently lost)', () => {
    const doc = parseOrbitMarkdown(
      `# A\n[![t1](t1.jpg)](https://youtu.be/aaa)\n[![t2](t2.jpg)](https://youtu.be/bbb)`,
    );
    expect(doc.root.video?.src).toBe('https://youtu.be/aaa');
    expect(doc.root.image).toBeUndefined();
    expect(doc.root.note ?? '').toContain('youtu.be/bbb');
  });
});

describe('parser-markdown note collection', () => {
  it('multi-paragraph note preserved verbatim', () => {
    const src = `# A\n\nFirst paragraph.\n\nSecond paragraph.`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.note).toBe('First paragraph.\n\nSecond paragraph.');
    expect(doc.root.noteFormat).toBe('markdown');
  });

  it('code fence preserved in note', () => {
    const src = "# A\n\nIntro.\n\n```sql\nSELECT 1;\n```\n";
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.note).toContain('```sql');
    expect(doc.root.note).toContain('SELECT 1;');
  });

  it('image + caption-style following paragraph: image is image, paragraph is note', () => {
    const src = `# A\n![hero](./h.png)\n\nA short caption-ish paragraph.`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.image?.src).toBe('./h.png');
    expect(doc.root.note).toBe('A short caption-ish paragraph.');
  });
});

describe('parser-markdown header attribute blocks', () => {
  it('block form with multiple typed fields', () => {
    const src = `# A\n<!-- orbit\ncolor: "#FF6B6B"\nstatus: active\npriority: 1\ntags: [frontend, sprint-3]\n-->\n`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.color).toBe('#FF6B6B');
    expect(doc.root.status).toBe('active');
    expect(doc.root.priority).toBe(1);
    expect(doc.root.tags).toEqual(['frontend', 'sprint-3']);
  });

  it('inline single-attr form', () => {
    const doc = parseOrbitMarkdown(`# A <!-- orbit color: "#FF6B6B" -->`);
    expect(doc.root.color).toBe('#FF6B6B');
  });

  it('custom keys land in attrs', () => {
    const doc = parseOrbitMarkdown(`# A\n<!-- orbit\ncategory: engineering\n-->\n`);
    expect((doc.root.attrs as Record<string, unknown>).category).toBe('engineering');
    expect((doc.root.attrs as Record<string, unknown>).color).toBeUndefined();
  });

  it('comment without orbit token is ignored', () => {
    const doc = parseOrbitMarkdown(`# A\n<!-- some other comment -->`);
    expect(doc.root.color).toBeUndefined();
    expect(doc.root.attrs).toBeUndefined();
  });

  it('inline form with comma-separated attributes applies each', () => {
    const doc = parseOrbitMarkdown(`# A <!-- orbit color: red, status: active -->`);
    expect(doc.root.color).toBe('red');
    expect(doc.root.status).toBe('active');
    expect(doc.diagnostics).toEqual([]);
  });

  it('inline form with array value (single attr) is allowed', () => {
    const doc = parseOrbitMarkdown(`# A <!-- orbit tags: [frontend, sprint-3] -->`);
    expect(doc.root.tags).toEqual(['frontend', 'sprint-3']);
  });

  it('inline form with quoted string containing comma is allowed', () => {
    const doc = parseOrbitMarkdown(`# A <!-- orbit color: "red, pink" -->`);
    expect(doc.root.color).toBe('red, pink');
  });
});

describe('parser-markdown list-item attribute blocks', () => {
  it('inline single-attr on a list item', () => {
    const doc = parseOrbitMarkdown(`# A\n- 🔢 account_id <!-- orbit color: "#FF6B6B" -->`);
    expect(doc.root.children[0].color).toBe('#FF6B6B');
    expect(doc.root.children[0].text).toBe('account_id');
    expect(doc.root.children[0].icon).toBe('🔢');
  });

  it('indented block form on a list item', () => {
    const src = `# A\n- account_id\n  <!-- orbit\n  color: "#FF6B6B"\n  status: active\n  -->`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.children[0].color).toBe('#FF6B6B');
    expect(doc.root.children[0].status).toBe('active');
  });

  it('inline list-item with array value (single attr) works', () => {
    const doc = parseOrbitMarkdown(`# A\n- foo <!-- orbit tags: [a, b] -->`);
    expect(doc.root.children[0].tags).toEqual(['a', 'b']);
  });

  it('escaped quotes inside an inline value do not hide the next attribute', () => {
    const doc = parseOrbitMarkdown('# A\n- foo <!-- orbit a: "a\\"b", b: 2 -->');
    expect(doc.root.children[0].attrs).toEqual({ a: 'a"b', b: 2 });
  });
});

describe('parser-markdown content overrides', () => {
  it('contentType: embed reclassifies an unrecognized link', () => {
    const src = `# A\n[Watch on Acme](https://acme.example/p/1)\n<!-- orbit contentType: embed -->`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.embed?.src).toBe('https://acme.example/p/1');
  });

  it('contentType: none keeps the link in the note', () => {
    const src = `# A\n[Watch](https://youtu.be/abc)\n<!-- orbit contentType: none -->`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.video).toBeUndefined();
    expect(doc.root.note ?? '').toContain('youtu.be');
  });

  it('direct embed: scalar shorthand sets node.embed', () => {
    const src = `# A\n<!-- orbit\nembed: https://acme.example/x\n-->\n`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.embed).toEqual({ src: 'https://acme.example/x' });
    expect((doc.root.attrs as Record<string, unknown> | undefined)?.embed).toBeUndefined();
  });

  it('direct image: object form preserves alt and caption', () => {
    const src = `# A\n<!-- orbit\nimage:\n  src: ./d.png\n  alt: Diagram\n  caption: Sync flow\n-->\n`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.image).toEqual({ src: './d.png', alt: 'Diagram', caption: 'Sync flow' });
  });

  it('caption attr merges into existing image', () => {
    const src = `# A\n![Diagram](./d.png)\n<!-- orbit caption: Sync flow -->`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.image).toEqual({ src: './d.png', alt: 'Diagram', caption: 'Sync flow' });
  });

  it('a caption under a media line describes that media', () => {
    const src = [
      '# A',
      '[video](https://youtu.be/abcdefghijk)',
      '<!-- orbit caption: The talk -->',
      '[embed](https://example.com/slides)',
      '<!-- orbit',
      'contentType: embed',
      'caption: The slides',
      '-->',
      '![Map](map.png)',
      '<!-- orbit caption: Where it was -->',
    ].join('\n');
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.video?.caption).toBe('The talk');
    expect(doc.root.embed?.caption).toBe('The slides');
    expect(doc.root.image?.caption).toBe('Where it was');
  });

  it('a caption next to the one media its block sets describes it', () => {
    const src = `# A\n[video](https://youtu.be/abcdefghijk)\n\n<!-- orbit\nembed: https://example.com/slides\ncaption: The slides\n-->`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.embed?.caption).toBe('The slides');
    expect(doc.root.video?.caption).toBeUndefined();
  });

  it('a caption anywhere else describes the video, then the embed, then the image', () => {
    const src = `# A\n![Map](map.png)\n[video](https://youtu.be/abcdefghijk)\n\nA paragraph.\n\n<!-- orbit caption: First -->`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.root.video?.caption).toBe('First');
    expect(doc.root.image?.caption).toBeUndefined();
  });

  it('caption with no media warns and is ignored', () => {
    const doc = parseOrbitMarkdown(`# A\n<!-- orbit caption: orphan -->\n`, { strict: false });
    expect(doc.warnings.some((w) => /caption/i.test(w))).toBe(true);
    expect(doc.root.image).toBeUndefined();
  });
});

describe('parser-markdown problems in YAML', () => {
  it('a frontmatter problem is reported on its line', () => {
    const doc = parseOrbitMarkdown('---\ntitle: Plan\ntheme: [night\n---\n# Root');
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'invalid-frontmatter', line: 3, message: 'Invalid frontmatter YAML: Unterminated flow array' });
  });

  it('an attribute block problem is reported on its line', () => {
    const doc = parseOrbitMarkdown('# Root\n## A\n<!-- orbit\nstatus: done\ntags: [one\n-->');
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'invalid-attributes', line: 5 });
    expect(doc.diagnostics?.[0].message).toBe('Invalid YAML in attribute block: Unterminated flow array');
  });

  it('an inline attribute problem names the reason, not a line of the pair', () => {
    const doc = parseOrbitMarkdown('# Root\n- A <!-- orbit a: "unterminated, b: 2 -->');
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'invalid-attributes', line: 2 });
    expect(doc.diagnostics?.[0].message).toBe('Invalid YAML in attribute block: Unterminated string');
  });
});

describe('parser-markdown rules that look like frontmatter', () => {
  it('a map between two --- rules is a map, not empty frontmatter', () => {
    const doc = parseOrbitMarkdown('---\n\n# Title\n## A\n- One\n---\n');
    expect(doc.root.text).toBe('Title');
    expect(doc.root.children.map((child) => child.text)).toEqual(['A']);
    expect(doc.diagnostics).toEqual([]);
  });

  it('a list between two --- rules is a map too', () => {
    const doc = parseOrbitMarkdown('---\n- Groceries\n  - Milk\n---');
    expect(doc.root.text).toBe('Groceries');
    expect(doc.root.children.map((child) => child.text)).toEqual(['Milk']);
  });

  it('frontmatter with only commented-out options stays frontmatter', () => {
    const doc = parseOrbitMarkdown('---\n# theme: night\n---\n# My map\n## A');
    expect(doc.root.text).toBe('My map');
    expect(doc.options).toEqual({});
  });

  it('frontmatter that never closes is reported', () => {
    const doc = parseOrbitMarkdown('---\ntitle: Plan\n# Map\n## A');
    expect(doc.root.text).toBe('Map');
    expect(doc.diagnostics?.[0]).toMatchObject({ code: 'invalid-frontmatter', line: 1 });
    expect(() => parseOrbitMarkdown('---\ntitle: Plan\n# Map', { strict: true })).toThrow('no closing "---"');
  });
});

describe('parser-markdown document frontmatter', () => {
  it('frontmatter sets renderer options', () => {
    const src = `---\nview: focus\npalette: ["#FFD93D", "#FF6B6B"]\nshowRings: false\nbaseUrl: /assets/\n---\n# A`;
    const doc = parseOrbitMarkdown(src);
    expect(doc.options.viewMode).toBe('focus');
    expect(doc.options.palette).toEqual(['#FFD93D', '#FF6B6B']);
    expect(doc.options.showRings).toBe(false);
    expect(doc.options.baseUrl).toBe('/assets/');
  });

  it('schemaVersion: 1 parses cleanly', () => {
    const doc = parseOrbitMarkdown(`---\nschemaVersion: 1\n---\n# A`);
    expect(doc.options.schemaVersion).toBe(1);
  });

  it('empty title, className or baseUrl stay absent', () => {
    const doc = parseOrbitMarkdown('---\ntitle:\nclassName:\nbaseUrl:\n---\n# A');
    expect(doc.options).toEqual({});
  });

  it('schemaVersion higher than supported throws (strict)', () => {
    expect(() => parseOrbitMarkdown(`---\nschemaVersion: 99\n---\n# A`, { strict: true }))
      .toThrow(/schemaVersion|version/i);
  });

  it('schemaVersion higher in non-strict warns', () => {
    const doc = parseOrbitMarkdown(`---\nschemaVersion: 99\n---\n# A`, { strict: false });
    expect(doc.warnings.some((w) => /schemaVersion|version/i.test(w))).toBe(true);
  });

  it('warns about an unknown frontmatter key and ignores it', () => {
    const doc = parseOrbitMarkdown(`---\nrings: false\n---\n# A`, { strict: false });
    expect(doc.options.showRings).toBeUndefined();
    expect(doc.warnings.some((w) => /unknown.*rings|rings.*unknown/i.test(w))).toBe(true);
  });
});
