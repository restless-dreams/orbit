import { describe, expect, it } from 'bun:test';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { parseOrbitYAML } from '../src/core/parser-yaml';
import type { OrbitNode } from '../src/core/types';
import { findIndexedLinkedNode, findLinkedNode, indexNodes } from '../src/core/node-links';

/** The tree as nested titles, for comparing structure at a glance. */
const outline = (node: OrbitNode): unknown => {
  return node.children.length === 0 ? node.text : { [node.text]: node.children.map(outline) };
};

const child = (node: OrbitNode, text: string): OrbitNode => {
  const found = node.children.find((candidate) => candidate.text === text);

  if (!found) {
    throw new Error(`No child "${text}" under "${node.text}"`);
  }

  return found;
};

describe('every heading and list item is a node', () => {
  it('a description before a list is the note; the items are still children', () => {
    const doc = parseOrbitMarkdown('# Launch plan\n## Research\nSix weeks of interviews.\n- Interviews\n- Survey\n## Build\n- App shell');
    expect(outline(doc.root)).toEqual({ 'Launch plan': [{ Research: ['Interviews', 'Survey'] }, { Build: ['App shell'] }] });
    expect(child(doc.root, 'Research').note).toBe('Six weeks of interviews.');
  });

  it('every list under a heading counts, with the text between them as the note', () => {
    const doc = parseOrbitMarkdown("# Plan\n## Research\n- Interviews\n- Survey\n\nIf there's time:\n- Usability tests");
    const research = child(doc.root, 'Research');
    expect(research.children.map((node) => node.text)).toEqual(['Interviews', 'Survey', 'Usability tests']);
    expect(research.note).toBe("If there's time:");
  });

  it('a list after a code block or a picture is children too', () => {
    const doc = parseOrbitMarkdown('# Plan\n## Setup\n```bash\nnpm install\n- not an item\n```\n- Step one\n\n![Diagram](diagram.png)\n- Step two\n![Screen](screen.png)');
    const setup = child(doc.root, 'Setup');
    expect(setup.children.map((node) => node.text)).toEqual(['Step one', 'Step two']);
    expect(setup.note).toContain('- not an item');
    // After a blank line the picture is the heading's; right under an item, the item's.
    expect(setup.image?.src).toBe('diagram.png');
    expect(child(setup, 'Step two').image?.src).toBe('screen.png');
  });

  it('text before the root heading belongs to the root', () => {
    const doc = parseOrbitMarkdown('An intro line.\n\n# Plan\n- One');
    expect(doc.root.text).toBe('Plan');
    expect(doc.root.note).toBe('An intro line.');
    expect(doc.root.children.map((node) => node.text)).toEqual(['One']);
  });

  it('several top-level list items share a root, like several top-level headings', () => {
    const doc = parseOrbitMarkdown('---\ntitle: Sprint\n---\n- Week 1\n- Week 2');
    expect(outline(doc.root)).toEqual({ Sprint: ['Week 1', 'Week 2'] });
    expect(doc.diagnostics).toEqual([]);
  });

  it('several top-level YAML nodes share a root too', () => {
    const doc = parseOrbitYAML('title: Sprint\nnodes:\n  - Week 1\n  - Week 2');
    expect(outline(doc.root)).toEqual({ Sprint: ['Week 1', 'Week 2'] });
  });
});

describe('content indented under a list item', () => {
  it('a paragraph, a picture, a quote and attributes belong to the item', () => {
    const doc = parseOrbitMarkdown([
      '# Plan',
      '- Backend',
      '- Frontend',
      '  Vite and React, behind the beta flag.',
      '  ![Moodboard](sunset.jpg)',
      '',
      '  > Ships in May.',
      '  <!-- orbit status: active -->',
      '  - App shell',
      '- Billing',
    ].join('\n'));
    expect(outline(doc.root)).toEqual({ Plan: ['Backend', { Frontend: ['App shell'] }, 'Billing'] });
    const frontend = child(doc.root, 'Frontend');
    expect(frontend.note).toBe('Vite and React, behind the beta flag.\n\nShips in May.');
    expect(frontend.image).toEqual({ src: 'sunset.jpg', alt: 'Moodboard' });
    expect(frontend.status).toBe('active');
    expect(doc.root.note).toBeUndefined();
  });

  it('a video link and a code block under an item are its video and note', () => {
    const doc = parseOrbitMarkdown('# Plan\n- Demo\n  [Walkthrough](https://www.youtube.com/watch?v=aqz-KE-bpKQ)\n  ```js\n  run();\n  ```\n- Next');
    const demo = child(doc.root, 'Demo');
    expect(demo.video?.provider).toBe('youtube');
    expect(demo.note).toBe('```js\nrun();\n```');
    expect(doc.root.children.map((node) => node.text)).toEqual(['Demo', 'Next']);
  });

  it('a line continuing an item without a blank line is its note; after a blank line it is the heading\'s', () => {
    const doc = parseOrbitMarkdown('# Plan\n- Frontend\nVite and React.\n- Backend\n\nClosing words.');
    expect(child(doc.root, 'Frontend').note).toBe('Vite and React.');
    expect(child(doc.root, 'Backend').note).toBeUndefined();
    expect(doc.root.note).toBe('Closing words.');
  });

  it('indentation with tabs nests like spaces', () => {
    const doc = parseOrbitMarkdown('# Plan\n- A\n\t- A1\n\t\t- A1x\n\n\t  Detail for A1');
    expect(outline(doc.root)).toEqual({ Plan: [{ A: [{ A1: ['A1x'] }] }] });
    expect(child(child(doc.root, 'A'), 'A1').note).toBe('Detail for A1');
  });

  it('a line of only a page break (form feed) or vertical tab is blank, and ends the list item', () => {
    for (const blank of ['\f', '\v', '  \f ']) {
      const doc = parseOrbitMarkdown(`# Map\n\n- Idea\n${blank}\nAfter the list`);
      expect(doc.root.note).toBe('After the list');
      expect(doc.root.children[0].note).toBeUndefined();
    }
  });

  it('a very deeply nested list parses to its full depth', () => {
    const depth = 1600;
    let source = '# Plan\n';

    for (let level = 0; level < depth; level += 1) {
      source += `${'  '.repeat(level)}- item ${level}\n`;
    }

    const doc = parseOrbitMarkdown(source);
    let node = doc.root;
    let parsed = 0;

    while (node.children.length === 1) {
      node = node.children[0];
      parsed += 1;
    }

    expect(parsed).toBe(depth);
    expect(node.text).toBe(`item ${depth - 1}`);
  });
});

describe('underlined headings', () => {
  it('a line underlined with = is a # heading, and with - a ## heading', () => {
    const doc = parseOrbitMarkdown('Launch plan\n===========\n\nResearch <!-- orbit status: done -->\n--------\n- Interviews');
    expect(outline(doc.root)).toEqual({ 'Launch plan': [{ Research: ['Interviews'] }] });
    expect(child(doc.root, 'Research').status).toBe('done');
  });

  it('a --- line after a blank line is a separator, not a heading', () => {
    const doc = parseOrbitMarkdown('# Plan\nA note.\n\n---\n\n- One');
    expect(doc.root.note).toBe('A note.');
    expect(doc.root.children.map((node) => node.text)).toEqual(['One']);
  });
});

describe('titles', () => {
  it('bold, italics, code and strikethrough show without their symbols', () => {
    const doc = parseOrbitMarkdown('# Plan\n- **Frontend**\n- `api` service\n- *Docs* and _guides_\n- ~~Old idea~~\n- `a*b*` stays as written\n- snake_case_name');
    expect(doc.root.children.map((node) => node.text)).toEqual([
      'Frontend',
      'api service',
      'Docs and guides',
      'Old idea',
      'a*b* stays as written',
      'snake_case_name',
    ]);
    expect(doc.root.children[0].id).toBe('frontend');
  });

  it('a link anywhere in a title is the node\'s link; the first one wins', () => {
    const doc = parseOrbitMarkdown('# Plan\n- Launch [plan](https://example.com/plan) and [notes](https://example.com/notes)\n- [🚀 Liftoff](https://example.com/liftoff)');
    expect(doc.root.children[0]).toMatchObject({ text: 'Launch plan and notes', link: 'https://example.com/plan' });
    expect(doc.root.children[1]).toMatchObject({ text: 'Liftoff', icon: '🚀', link: 'https://example.com/liftoff' });
  });

  it('hashtags at the end of a title are tags; others stay text', () => {
    const doc = parseOrbitMarkdown('# Plan\n- Offline sync #frontend #sprint-3\n- C# rewrite\n- Fix issue #42\n- #design review\n- #solo\n- Sync #web <!-- orbit tags: [mobile] -->');
    expect(doc.root.children.map((node) => [node.text, node.tags])).toEqual([
      ['Offline sync', ['frontend', 'sprint-3']],
      ['C# rewrite', undefined],
      ['Fix issue #42', undefined],
      ['#design review', undefined],
      ['#solo', undefined],
      ['Sync', ['web', 'mobile']],
    ]);
  });

  it('[ ], [x] and [/] set todo, done and active, on list items and headings', () => {
    const doc = parseOrbitMarkdown('# Plan\n## [/] Build\n- [x] Research\n- [/] Design\n- [ ] Launch');
    expect(child(doc.root, 'Build').status).toBe('active');
    expect(child(doc.root, 'Build').children.map((node) => [node.text, node.status])).toEqual([
      ['Research', 'done'],
      ['Design', 'active'],
      ['Launch', 'todo'],
    ]);
  });

  it('a backslash keeps a character literal', () => {
    const doc = parseOrbitMarkdown('# Plan\n- \\*not bold\\*\n- ship \\#notatag\n- \\[x] not a task\n- back\\\\slash');
    expect(doc.root.children.map((node) => [node.text, node.tags, node.status])).toEqual([
      ['*not bold*', undefined, undefined],
      ['ship #notatag', undefined, undefined],
      ['[x] not a task', undefined, undefined],
      ['back\\slash', undefined, undefined],
    ]);
  });
});

describe('HTML comments', () => {
  it('are hidden from titles and ids, as markdown hides them', () => {
    const doc = parseOrbitMarkdown('# Plan\n## Research <!-- TODO: check dates -->\n- Interviews <!-- ask Ana --> #discovery\n## Build <!-- one --> <!-- orbit status: active -->\n');
    const [research, build] = doc.root.children;
    expect([research.text, research.id]).toEqual(['Research', 'research']);
    expect(research.children[0]).toMatchObject({ text: 'Interviews', id: 'interviews', tags: ['discovery'] });
    expect([build.text, build.status]).toEqual(['Build', 'active']);
    expect(doc.diagnostics).toEqual([]);
  });

  it('starting with orbit in any case, or orbit and a colon, set attributes', () => {
    const doc = parseOrbitMarkdown('# Plan\n## A <!-- Orbit status: done -->\n## B <!-- orbit: priority: 2 -->\n## C\n<!-- ORBIT\ncolor: "#C6B4F2"\n-->\n');
    const [a, b, c] = doc.root.children;
    expect([a.status, b.priority, c.color]).toEqual(['done', 2, '#C6B4F2']);
  });

  it('a comment that reads like attributes without orbit sets nothing, and says how to write it', () => {
    const doc = parseOrbitMarkdown('# Plan\n## Research <!-- status: done -->\n## Build\n<!-- color: red -->\n<!-- TODO: dates -->\n');
    expect(doc.root.children.map((node) => [node.text, node.status, node.color])).toEqual([['Research', undefined, undefined], ['Build', undefined, undefined]]);
    expect(doc.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.line, diagnostic.message])).toEqual([
      ['comment-without-orbit', 2, 'This comment is hidden, so it sets nothing: to set "status", write <!-- orbit status: done -->.'],
      ['comment-without-orbit', 4, 'This comment is hidden, so it sets nothing: to set "color", write <!-- orbit color: red -->.'],
    ]);
  });

  it('a title keeps a comment written with a backslash, as its text', () => {
    expect(parseOrbitMarkdown('# Plan\n## Use \\<!-- in HTML -->').root.children[0].text).toBe('Use <!-- in HTML -->');
  });
});

describe('an attribute block right under a list item, without its indent', () => {
  it('sets the heading\'s attributes, and a note says so', () => {
    const doc = parseOrbitMarkdown('# Plan\n## Build\n- Frontend\n  - Shell\n<!-- orbit status: active -->\n');
    expect(doc.root.children[0].status).toBe('active');
    expect(doc.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.line, diagnostic.message])).toEqual([
      ['attributes-after-list', 5, 'This attribute block sets "Build"\'s attributes: it isn\'t indented under "Shell" above it. Indent it to set "Shell"\'s.'],
    ]);
  });

  it('after a blank line, right after the heading, or indented, is as written: no note', () => {
    for (const source of [
      '# Plan\n## Build\n- Frontend\n\n<!-- orbit status: active -->\n',
      '# Plan\n## Build\n<!-- orbit status: active -->\n- Frontend\n',
      '# Plan\n## Build\n- Frontend\n  <!-- orbit status: active -->\n',
    ]) {
      expect(parseOrbitMarkdown(source).diagnostics).toEqual([]);
    }
  });
});

describe('links between nodes', () => {
  it('a #id link in a note or a title points at a node; nothing is reported', () => {
    const doc = parseOrbitMarkdown('# Plan\n## Build\nStarts when [Research](#research) is done.\n## [See the research](#research)\n## Research');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.root.children[1].link).toBe('#research');
  });

  it('a link to a node that does not exist is reported, with the id it probably meant', () => {
    const doc = parseOrbitMarkdown('# Plan\n## Build\nAfter [research](#reserch).\n## Research');
    expect(doc.diagnostics).toEqual([
      { code: 'unknown-link-target', message: '"Build" links to #reserch, but no node has that id. Did you mean #research?', line: 3, severity: 'warning' },
    ]);
    expect(() => parseOrbitMarkdown('# Plan\n## Build <!-- orbit link: "#nowhere" -->', { strict: true })).toThrow(/#nowhere/);
  });

  it('YAML links between nodes are checked too, on the line of the link or note', () => {
    const doc = parseOrbitYAML('nodes:\n  - text: Plan\n    children:\n      - text: Build\n        link: "#lunch"\n      - text: Launch\n        note: After [the review](#reveiw).\n      - Review');
    expect(doc.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.line])).toEqual([['unknown-link-target', 5], ['unknown-link-target', 7]]);
  });

  it('a link in a note is reported on its own line, and says how ids are made when none is close', () => {
    const doc = parseOrbitMarkdown('# Plan\n## Build\nFirst, the shell.\n\nThen [the index](#nothing-like-it).\n## Research');
    expect(doc.diagnostics).toEqual([{
      code: 'unknown-link-target',
      message: '"Build" links to #nothing-like-it, but no node has that id. Ids come from the nodes\' text: "Q3 plan" is #q3-plan.',
      line: 5,
      severity: 'warning',
    }]);
  });

  it('a plain note\'s #id mentions are not links, and not reported', () => {
    const doc = parseOrbitMarkdown('# Plan\n## Build\n<!-- orbit\nnoteFormat: plain\n-->\n\nSee [this](#nowhere) and [that](#alsonowhere).');
    expect(doc.root.children[0].noteFormat).toBe('plain');
    expect(doc.diagnostics).toEqual([]);
  });

  it('links find the same node by id lookup as by searching the tree', () => {
    const root = parseOrbitMarkdown('# Plan\n## Research <!-- orbit id: "twin" -->\n## Build\n### Twin <!-- orbit id: "twin" -->\n## Café crème').root;
    const nodes = indexNodes(root);

    for (const href of ['#twin', '#Research', '#-research-', '#cafe-creme', '#Caf%C3%A9%20cr%C3%A8me', '#%E0%A4%A', '#nowhere', 'research']) {
      expect({ href, found: findIndexedLinkedNode(nodes, href)?.text ?? null }).toEqual({ href, found: findLinkedNode(root, href)?.text ?? null });
    }

    // Repeated ids find the first node in the tree, the way a search from the top does.
    expect(findIndexedLinkedNode(nodes, '#twin')?.text).toBe('Research');
  });
});
