import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { writeMarkdown } from '../src/core/markdown-writing';
import { documentSource } from '../src/core/document-source';
import { patchMarkdown } from '../src/core/source-patch';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import type { OrbitSVGRenderer } from '../src/core/svg-renderer';
import type { OrbitNode } from '../src/core/types';
import { noteCheckboxes, setNoteCheckbox } from '../src/core/ui/note-markdown';
import { mount, useMapSize } from './helpers/renderer';

useMapSize();

const FIXTURES = new URL('./fixtures/files/', import.meta.url);
const files = readdirSync(FIXTURES).filter((name) => name.endsWith('.md')).sort();
const read = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');

/** The map a renderer holds, in Orbit's own form: what a save has to read back as. */
const written = (renderer: OrbitSVGRenderer): string => {
  return writeMarkdown(renderer.getDocument()!);
};

/** What saving writes, and whether it kept the source (rather than writing the whole map in Orbit's own form). */
const save = (renderer: OrbitSVGRenderer): { text: string; patched: boolean } => {
  const document = renderer.getDocument()!;
  const source = documentSource(document);
  const patched = source ? patchMarkdown(document, source) : null;
  return { text: renderer.toMarkdown(), patched: patched !== null };
};

const preorder = (node: OrbitNode): OrbitNode[] => {
  return [node, ...node.children.flatMap(preorder)];
};

/** A small seeded generator, so a failing sequence of edits can be run again. */
const random = (seed: number): () => number => {
  let state = seed;

  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

/** One edit an app makes on the map, picked at random. */
const edit = (renderer: OrbitSVGRenderer, next: () => number, step: number): string => {
  const root = renderer.getDocument()!.root;
  const nodes = preorder(root);
  const pick = <Item>(items: Item[]): Item => items[Math.floor(next() * items.length)];
  const node = pick(nodes);

  switch (Math.floor(next() * 8)) {
    case 0:
      renderer.addNode(node.id, { text: `Idea ${step}` }, Math.floor(next() * (node.children.length + 1)));
      return `add under ${node.id}`;
    case 1:
      renderer.updateNode(node.id, { text: `${node.text} (${step})` });
      return `rename ${node.id}`;
    case 2:
      renderer.updateNode(node.id, { status: pick(['done', 'todo', 'active', 'blocked', undefined]) });
      return `status of ${node.id}`;
    case 3:
      renderer.updateNode(node.id, { color: pick(['#E5484D', '#30A46C', undefined]), note: next() < 0.5 ? `A note, step ${step}.` : node.note });
      return `color and note of ${node.id}`;
    case 4: {
      const target = pick(nodes.filter((other) => other !== root));

      if (target) {
        renderer.removeNode(target.id);
        return `remove ${target.id}`;
      }

      return 'nothing to remove';
    }
    case 5: {
      const target = pick(nodes.filter((other) => noteCheckboxes(other.note ?? '').length > 0));

      if (!target) {
        return 'no box to check';
      }

      const box = pick(noteCheckboxes(target.note!));
      renderer.updateNode(target.id, { note: setNoteCheckbox(target.note!, box.line, !box.checked)! });
      return `check the box on line ${box.line} of ${target.id}'s note`;
    }
    default: {
      const moving = pick(nodes.filter((other) => other !== root));

      if (!moving) {
        return 'nothing to move';
      }

      const inside = new Set(preorder(moving));
      const parent = pick(nodes.filter((other) => !inside.has(other)));
      renderer.moveNode(moving.id, parent.id, Math.floor(next() * (parent.children.length + 1)));
      return `move ${moving.id} under ${parent.id}`;
    }
  }
};

describe('saving keeps the file as it was written', () => {
  for (const name of files) {
    it(`${name} comes back byte for byte without edits`, () => {
      const text = read(name);
      expect(serializeOrbitMarkdown(parseOrbit(text))).toBe(text);
      expect(mount(text).renderer.toMarkdown()).toBe(text);
    });
  }

  it('a blank line whose padding differs from the shared indent keeps its bytes', () => {
    const text = '  # Trip\n\t\n  A note.\n';
    expect(serializeOrbitMarkdown(parseOrbit(text))).toBe(text);
  });

  for (const name of files) {
    // Twelve rounds of edits on a long file: seconds here, minutes on a busy runner.
    it(`${name}: edits read back as the edited map, and keep the rest of the file`, () => {
      const text = read(name);

      for (let seed = 1; seed <= 12; seed += 1) {
        const { renderer } = mount(text);
        const next = random(seed * 7919 + name.length);
        const steps: string[] = [];

        for (let step = 1; step <= 1 + (seed % 4); step += 1) {
          steps.push(edit(renderer, next, step));
        }

        const saved = save(renderer);
        const context = `${name}, seed ${seed}: ${steps.join('; ')}`;
        expect(writeMarkdown(parseOrbit(saved.text)), context).toBe(written(renderer));
        expect(saved.patched, context).toBe(true);
        // Saved again with no edits, it doesn't change.
        expect(serializeOrbitMarkdown(parseOrbit(saved.text)), context).toBe(saved.text);
      }
    }, 300_000);
  }
});

describe('an edit changes only its own lines', () => {
  it('renaming an idea in an Obsidian note keeps its frontmatter and every other line', () => {
    const text = read('03-obsidian.md');
    const { renderer } = mount(text);
    const target = preorder(renderer.getDocument()!.root).find((node) => node.children.length === 0 && node.level > 1)!;
    renderer.updateNode(target.id, { text: 'Renamed idea' });
    const before = text.split('\n');
    const after = renderer.toMarkdown().split('\n');
    expect(after).toHaveLength(before.length);
    expect(after.filter((line, index) => line !== before[index])).toHaveLength(1);
    expect(after.join('\n')).toContain('tags:');
    expect(after.join('\n')).toContain('aliases:');
  });

  it('checking off an item changes only its checkbox, so its title keeps its markdown', () => {
    const { renderer } = mount('# Groceries\n- [ ] **Fresh** milk from `the corner shop`\n- [ ] Eggs\n');
    renderer.updateNode('fresh-milk-from-the-corner-shop', { status: 'done' });
    expect(renderer.toMarkdown()).toBe('# Groceries\n- [x] **Fresh** milk from `the corner shop`\n- [ ] Eggs\n');
  });

  it('checking a box in a note changes only its line, wherever the note is written', () => {
    const text = read('34-checklists-in-notes.md');
    const { renderer } = mount(text);

    const check = (id: string, line: number, checked: boolean): void => {
      const node = preorder(renderer.getDocument()!.root).find((candidate) => candidate.id === id)!;
      renderer.updateNode(id, { note: setNoteCheckbox(node.note!, line, checked)! });
    };

    check('trip-to-oaxaca', 2, true);
    check('trip-to-oaxaca', 5, false);
    check('packing', 1, false);
    check('day-trips', 5, true);
    const before = text.split('\n');
    const after = renderer.toMarkdown().split('\n');
    expect(after).toHaveLength(before.length);
    expect(after.map((line, index) => (line === before[index] ? null : `${before[index]} → ${line}`)).filter(Boolean)).toEqual([
      '> - [ ] Book the flights → > - [x] Book the flights',
      '>   - [X] The form → >   - [ ] The form',
      '> * [x] A hat <!-- the wide one --> → > * [ ] A hat <!-- the wide one -->',
      '  > > - [ ] Check the road first →   > > - [x] Check the road first',
    ]);
  });

  it('checking a box keeps a note Orbit wrote quoted, and the file\'s line endings', () => {
    const text = '# Map\r\n## Groceries\r\n> Shop on Friday.\r\n>\r\n> - [ ] Milk\r\n> - [ ] Eggs\r\n';
    const { renderer } = mount(text);
    const groceries = renderer.getDocument()!.root.children[0];
    renderer.updateNode('groceries', { note: setNoteCheckbox(groceries.note!, 3, true)! });
    expect(renderer.toMarkdown()).toBe(text.replace('> - [ ] Eggs', '> - [x] Eggs'));
  });

  it('a note that changes more than lines in place is written again whole, and reads back', () => {
    const { renderer } = mount('# Map\n## A\nFirst words.\n> - [ ] One\n');
    renderer.updateNode('a', { note: 'First words.\n\n- [ ] One\n- [ ] Two' });
    const saved = renderer.toMarkdown();
    expect(parseOrbit(saved).root.children[0].note).toBe('First words.\n\n- [ ] One\n- [ ] Two');
    expect(saved).toContain('> - [ ] Two');
  });

  it('a number changed among four short attributes stays on the idea\'s line', () => {
    const { renderer } = mount('# Groceries\n- Apples <!-- orbit type: goal, target: 5, current: 2, unit: apples -->\n- Eggs\n');
    const apples = renderer.getDocument()!.root.children[0];
    renderer.updateNode('apples', { attrs: { ...apples.attrs, current: 3 } });
    expect(renderer.toMarkdown()).toBe('# Groceries\n- Apples <!-- orbit type: goal, target: 5, current: 3, unit: apples -->\n- Eggs\n');
  });

  it('keeps other HTML comments, rules and the closing text of an idea whose note changed', () => {
    const { renderer } = mount('# Map\n\n## A\n<!-- TODO: check the numbers -->\n\nFirst words.\n\n---\n\n## B\n');
    renderer.updateNode('a', { note: 'New words.' });
    const saved = renderer.toMarkdown();
    expect(saved).toContain('<!-- TODO: check the numbers -->');
    expect(saved).toContain('---');
    expect(saved).toContain('New words.');
    expect(saved).not.toContain('First words.');
    expect(parseOrbit(saved).root.children[0].note).toBe('New words.');
  });

  it('a value Orbit can\'t read stays when the same idea changes otherwise', () => {
    const { renderer } = mount('# Map\n## A <!-- orbit status: [waiting, legal] -->\n');
    renderer.updateNode('a', { color: '#E5484D' });
    const saved = renderer.toMarkdown();
    expect(saved).toContain('status: [waiting, legal]');
    expect(saved).toContain('#E5484D');
    expect(parseOrbit(saved).diagnostics?.map((diagnostic) => diagnostic.code)).toContain('invalid-attributes');
  });

  it('fields of a picture Orbit doesn\'t read stay when the idea is renamed', () => {
    const { renderer } = mount('# Map\n## Trip\n<!-- orbit\nimage:\n  src: a.png\n  width: 640\n-->\n');
    renderer.updateNode('trip', { text: 'Lisbon' });
    expect(renderer.toMarkdown()).toBe('# Map\n## Lisbon\n<!-- orbit\nimage:\n  src: a.png\n  width: 640\n-->\n');
  });

  it('moving a heading above list items turns only it into an item', () => {
    const text = read('17-unknown-statuses.md');
    const { renderer } = mount(text);
    const root = renderer.getDocument()!.root;
    renderer.moveNode(root.children[root.children.length - 1].id, root.id, 0);
    const saved = renderer.toMarkdown();
    // Moved to the front, it keeps its color: its line says which of the palette's it is.
    expect(saved.split('\n')[1]).toBe('- [x] Heading checkbox <!-- orbit paletteColor: 6 -->');
    expect(saved).toContain('## Heading task');
    expect(saved).toContain('- [?] Question item');
  });

  it('link and footnote definitions stay at the end of the document', () => {
    const text = read('10-reference-links.md');
    const { renderer } = mount(text);
    const root = renderer.getDocument()!.root;
    renderer.removeNode(root.children[root.children.length - 1].id);
    renderer.addNode(root.id, { text: 'Podcasts' });
    const saved = renderer.toMarkdown();
    expect(saved.trimEnd().endsWith('[lfs]: https://www.inkandswitch.com/local-first/')).toBe(true);
    expect(saved.indexOf('## Podcasts')).toBeLessThan(saved.indexOf('[style]:'));
  });

  it('a map of only text keeps its text when it gets its first idea', () => {
    const { renderer } = mount('Just a thought about the garden.\n\nAnd another one.\n');
    renderer.addNode(renderer.getDocument()!.root.id, { text: 'Tomatoes' });
    const saved = renderer.toMarkdown();
    expect(saved).toContain('Just a thought about the garden.\n\nAnd another one.');
    const reread = parseOrbit(saved);
    expect(reread.root.note).toContain('And another one.');
    expect(reread.root.children.map((child) => child.text)).toEqual(['Tomatoes']);
  });

  it('an idea without a name yet reads back', () => {
    const { renderer } = mount('# Map\n## A\n');
    renderer.addNode('map', { text: '', image: { src: 'photo.png' } });
    const reread = parseOrbit(renderer.toMarkdown());
    expect(reread.root.children.map((child) => child.text)).toEqual(['A', '']);
    expect(reread.root.children[1].image?.src).toBe('photo.png');
  });

  it('keeps line endings and a byte-order mark', () => {
    const { renderer } = mount('\uFEFF# Map\r\n## A\r\n## B\r\n');
    renderer.updateNode('a', { text: 'First' });
    expect(renderer.toMarkdown()).toBe('\uFEFF# Map\r\n## First\r\n## B\r\n');
  });

  it('a copy of the document with other options saves from the same source', () => {
    const text = read('03-obsidian.md');
    const document = parseOrbit(text);
    const saved = serializeOrbitMarkdown({ ...document, options: { ...document.options, theme: 'night' } });
    const before = text.split('\n');
    const after = saved.split('\n');
    // One line more, the theme in the frontmatter; every other line as it was.
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((line) => !before.includes(line))).toEqual(['theme: night']);
  });

  it('a map drawn again with other options, as an app picking a style does, keeps the file', () => {
    const text = read('03-obsidian.md');
    const { renderer } = mount(text);
    const current = renderer.getDocument()!;
    renderer.render({ ...current, options: { ...current.options, theme: 'liquid' } });
    expect(renderer.toMarkdown().split('\n').filter((line) => !text.split('\n').includes(line))).toEqual(['theme: liquid']);
  });

  it('keys Orbit doesn\'t read are saved when they change, and the rest of the frontmatter stays as written', () => {
    const text = '---\ntitle: Trip\ntheme: cosmos   # the night look\nauthor: someone\ntags:\n  - travel\n---\n\n# Trip\n- [ ] Book flights\n';
    const document = parseOrbit(text);
    expect(document.extra).toEqual({ author: 'someone', tags: ['travel'] });
    const added = serializeOrbitMarkdown({ ...document, extra: { ...document.extra, progressRings: false } });
    expect(added).toBe(text.replace('  - travel\n', '  - travel\nprogressRings: false\n'));
    const read = parseOrbit(added);
    expect(read.extra).toEqual({ author: 'someone', tags: ['travel'], progressRings: false });
    const changed = serializeOrbitMarkdown({ ...read, extra: { ...read.extra, author: 'someone else' } });
    expect(changed).toBe(added.replace('author: someone\n', 'author: someone else\n'));
    const rest: Record<string, unknown> = { ...read.extra };
    delete rest.progressRings;
    expect(serializeOrbitMarkdown({ ...read, extra: rest })).toBe(text);
  });

  it('a frontmatter left empty goes, with the blank line after it', () => {
    const text = '# Trip\n\n- [ ] Book flights\n';
    const added = serializeOrbitMarkdown({ ...parseOrbit(text), extra: { progressRings: false } });
    expect(added).toBe(`---\nprogressRings: false\n---\n\n${text}`);
    expect(serializeOrbitMarkdown({ ...parseOrbit(added), extra: {} })).toBe(text);
    const themed = serializeOrbitMarkdown({ ...parseOrbit(text), options: { theme: 'cosmos' } });
    expect(serializeOrbitMarkdown({ ...parseOrbit(themed), options: {} })).toBe(text);
  });

  it('a quoted frontmatter key is found and changed, not duplicated', () => {
    const text = '---\n"my key": old\ntitle: Trip\n---\n\n# Trip\n';
    const document = parseOrbit(text);
    const changed = serializeOrbitMarkdown({ ...document, extra: { 'my key': 'new' } });
    expect(changed).toBe('---\nmy key: new\ntitle: Trip\n---\n\n# Trip\n');
    expect(parseOrbit(changed).extra).toEqual({ 'my key': 'new' });
    expect(serializeOrbitMarkdown({ ...document, extra: {} })).toBe('---\ntitle: Trip\n---\n\n# Trip\n');
  });

  it('a document without extra keys of its own keeps the ones its file has', () => {
    const text = '---\ntitle: Trip\naliases: [Holiday]\ntags:\n  - travel\n---\n\n# Trip\n- [ ] Book flights\n';
    const document = parseOrbit(text);
    // Built from the tree and options alone, as an app keeping only those would: no key another app wrote goes.
    expect(serializeOrbitMarkdown({ root: document.root, options: document.options, warnings: [] })).toBe(text);
    expect(serializeOrbitMarkdown({ ...document, extra: undefined })).toBe(text);
    const { renderer } = mount(text);
    const current = renderer.getDocument()!;
    renderer.render({ root: current.root, options: current.options, warnings: [] });
    renderer.updateNode('book-flights', { status: 'done' });
    expect(renderer.toMarkdown()).toBe(text.replace('- [ ] Book flights', '- [x] Book flights'));
  });

  it('a map drawn again with a key of the app\'s own in its frontmatter saves it', () => {
    const { renderer } = mount('# Trip\n- [ ] Book flights\n');
    const current = renderer.getDocument()!;
    renderer.render({ ...current, extra: { ...current.extra, progressRings: false } });
    expect(renderer.toMarkdown()).toBe('---\nprogressRings: false\n---\n\n# Trip\n- [ ] Book flights\n');
    expect(renderer.getDocument()!.extra).toEqual({ progressRings: false });
  });

  it('the map drawn again as it is, with other keys Orbit doesn\'t read, as undo does, saves those keys', () => {
    const text = '# Trip\n- [ ] Book flights\n';
    const { renderer } = mount(text);
    renderer.render(parseOrbit(`---\nprogressRings: false\n---\n\n${text}`));
    expect(renderer.getDocument()!.extra).toEqual({ progressRings: false });
    renderer.render(parseOrbit(text));
    expect(renderer.getDocument()!.extra).toBeUndefined();
    expect(renderer.toMarkdown()).toBe(text);
  });

  it('writes the whole map in Orbit\'s own form when asked to', () => {
    const document = parseOrbit('# Map\n### Deep\n');
    expect(serializeOrbitMarkdown(document, { keepSource: false })).toBe('# Map\n\n## Deep\n');
  });
});

describe('an icon stays where its file has it', () => {
  // Each form an icon is written in, and what a rename and a new icon write.
  const FORMS = [
    { file: '# Trip\n## 🌿 Food\n## Museums\n', renamed: '# Trip\n## 🌿 Meals\n## Museums\n', newIcon: '# Trip\n## 🍽️ Food\n## Museums\n' },
    { file: '# Trip\n## Food <!-- orbit icon: 🌿 -->\n## Museums\n', renamed: '# Trip\n## Meals <!-- orbit icon: 🌿 -->\n## Museums\n', newIcon: '# Trip\n## Food <!-- orbit icon: 🍽️ -->\n## Museums\n' },
    // A changed comment is written in Orbit's form: a short one on the idea's line.
    { file: '# Trip\n## Food\n<!-- orbit icon: 🌿 -->\n## Museums\n', renamed: '# Trip\n## Meals\n<!-- orbit icon: 🌿 -->\n## Museums\n', newIcon: '# Trip\n## Food <!-- orbit icon: 🍽️ -->\n## Museums\n' },
    { file: '# Trip\n## Food\n<!-- orbit\nicon: 🌿\ncolor: "#E5484D"\n-->\n## Museums\n', renamed: '# Trip\n## Meals\n<!-- orbit\nicon: 🌿\ncolor: "#E5484D"\n-->\n## Museums\n' },
    { file: '# Trip\n- 🌿 Food\n- Museums\n', renamed: '# Trip\n- 🌿 Meals\n- Museums\n' },
    { file: '# Trip\n- Food <!-- orbit icon: 🌿 -->\n- Museums\n', renamed: '# Trip\n- Meals <!-- orbit icon: 🌿 -->\n- Museums\n' },
  ];

  it('a renamed idea keeps its icon once, before its title or in its comment, as the file had it', () => {
    for (const form of FORMS) {
      const { renderer } = mount(form.file);
      renderer.updateNode('food', { text: 'Meals' });
      const saved = renderer.toMarkdown();
      expect(saved).toBe(form.renamed);
      expect(saved.match(/🌿/gu)).toHaveLength(1);
      expect(parseOrbit(saved).root.children[0]).toMatchObject({ text: 'Meals', icon: '🌿' });
    }
  });

  it('a new icon goes in a comment when the old one was in one, and before the title when it was there', () => {
    for (const form of FORMS.filter((each) => each.newIcon)) {
      const { renderer } = mount(form.file);
      renderer.updateNode('food', { icon: '🍽️' });
      expect(renderer.toMarkdown()).toBe(form.newIcon!);
    }
  });

  it('an idea saved with its icon twice, before this fix, reads with one, and loses the extra one when it\'s renamed', () => {
    const doubled = '# Trip\n## 🌿 Meals <!-- orbit icon: 🌿 -->\n## Museums\n';
    expect(parseOrbit(doubled).root.children[0]).toMatchObject({ text: 'Meals', icon: '🌿' });
    const { renderer } = mount(doubled);
    // An edit elsewhere leaves it as it is.
    renderer.updateNode('museums', { status: 'done' });
    expect(renderer.toMarkdown()).toBe('# Trip\n## 🌿 Meals <!-- orbit icon: 🌿 -->\n## Museums <!-- orbit status: done -->\n');
    renderer.updateNode('meals', { text: 'Dinner' });
    expect(renderer.toMarkdown()).toBe('# Trip\n## Dinner <!-- orbit icon: 🌿 -->\n## Museums <!-- orbit status: done -->\n');
  });

  it('written whole, in Orbit\'s own form, an icon goes before its title', () => {
    const { renderer } = mount('# Trip\n## Food <!-- orbit icon: 🌿 -->\n');
    renderer.updateNode('food', { text: 'Meals' });
    expect(serializeOrbitMarkdown(renderer.getDocument()!, { keepSource: false })).toBe('# Trip\n\n## 🌿 Meals\n');
  });
});

describe('hidden comments', () => {
  useMapSize(600, 400);

  it('stay in the file, and a renamed idea keeps the ones at the end of its title', () => {
    const text = '# Plan\n## Research <!-- TODO: check dates --> <!-- orbit status: active -->\n## Build\n';
    const { renderer } = mount(text);
    expect(renderer.toMarkdown()).toBe(text);
    renderer.updateNode('research', { text: 'Discovery' });
    expect(renderer.toMarkdown()).toBe('# Plan\n## Discovery <!-- TODO: check dates --> <!-- orbit status: active -->\n## Build\n');
  });
});

describe('a copy of a map', () => {
  const text = '# Trip <!-- a comment of my own -->\n\nA [link][guide].\n\n## Food\n<!-- orbit image: { src: food.jpg, width: 640 } -->\n\n## Places\n\n[guide]: https://example.com\n';

  it('made from its text saves as the original does, edited or not', () => {
    const original = parseOrbitMarkdown(text);
    const copy = parseOrbitMarkdown(serializeOrbitMarkdown(original));
    expect(serializeOrbitMarkdown(copy)).toBe(text);

    for (const document of [original, copy]) {
      document.root.children[1].text = 'Sights';
    }

    expect(serializeOrbitMarkdown(copy)).toBe(serializeOrbitMarkdown(original));
    expect(serializeOrbitMarkdown(copy)).toContain('<!-- a comment of my own -->');
  });

  it('made from its tree saves in Orbit\'s own form, as format.md says', () => {
    const plain = '# Trip <!-- a comment of my own -->\n\n## Food <!-- orbit status: done -->\n\n## Places\n';
    const document = parseOrbitMarkdown(plain);
    expect(serializeOrbitMarkdown(structuredClone(document))).toBe(serializeOrbitMarkdown(document, { keepSource: false }));
    // A copy of the document object shares its tree, and saves from its source.
    expect(serializeOrbitMarkdown({ ...document, options: { ...document.options } })).toBe(plain);
  });
});
