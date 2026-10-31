import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { DiagnosticCollector } from '../src/core/diagnostics';
import { FORMAT_UPGRADES, SUPPORTED_SCHEMA_VERSION, upgradeFormat, writtenSchemaVersion, type FormatUpgrade } from '../src/core/format-upgrades';
import { createMapTools } from '../src/core/map-tools/tools';
import { registerNodeType, upgradeNodeTypes } from '../src/core/extensions';
import type { OrbitDocument, OrbitNode } from '../src/core/types';
import { mount, useMapSize } from './helpers/renderer';

useMapSize();

const codes = (document: OrbitDocument) => document.diagnostics?.map((diagnostic) => diagnostic.code) ?? [];

describe('format versions', () => {
  it('the newest version is the one the upgrades lead to', () => {
    expect(SUPPORTED_SCHEMA_VERSION).toBe(FORMAT_UPGRADES.length + 1);
  });

  it('a map for a newer version is reported as an error, and everything in it is kept through edits', () => {
    const text = '---\nschemaVersion: 2\nlayout: radial\n---\n# Plan\n## A <!-- orbit priority: P1, owner: Ana -->\n## B\n';
    const document = parseOrbit(text);
    expect(document.diagnostics?.find((diagnostic) => diagnostic.code === 'unsupported-schema-version')?.severity).toBe('error');
    const { renderer } = mount(text);
    renderer.updateNode('b', { text: 'Second' });
    expect(renderer.toMarkdown()).toBe(text.replace('## B', '## Second'));
  });

  it('an older map is upgraded as it\'s read, and saving writes only what the upgrade changed', () => {
    const text = '---\ntheme: night\n---\n# Plan\n## A <!-- orbit due: 2026-11-01 -->\n## B\n';
    const document = parseOrbit(text);
    const diagnostics = new DiagnosticCollector(false);
    // A format change that renames `due` to `deadline`.
    upgradeFormat(document, diagnostics, undefined, [{
      from: 1,
      upgrade: (upgraded) => {
        const visit = (node: OrbitNode): void => {
          if (node.attrs && 'due' in node.attrs) {
            node.attrs = { deadline: node.attrs.due };
          }

          node.children.forEach(visit);
        };

        visit(upgraded.root);
      },
    }]);
    expect(document.options.schemaVersion).toBe(2);
    expect(diagnostics.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['format-upgraded']);
    expect(serializeOrbitMarkdown(document)).toBe('---\ntheme: night\nschemaVersion: 2\n---\n# Plan\n## A <!-- orbit deadline: "2026-11-01" -->\n## B\n');
  });

  it('keys of other apps (or a newer Orbit) are kept, in both flavors', () => {
    const markdown = parseOrbit('---\ntitle: Trip\ncssclasses: [wide]\n---\n# Trip\n');
    expect(markdown.extra).toEqual({ cssclasses: ['wide'] });
    expect(serializeOrbitYAML(markdown)).toContain('cssclasses: [wide]');
    const yaml = parseOrbit('version: 3\ngenerator: sync\nnodes:\n  - text: A\n');
    expect(yaml.root.text).toBe('A');
    expect(serializeOrbitMarkdown(yaml)).toBe('---\nversion: 3\ngenerator: sync\n---\n\n# A\n');
  });
});

describe('a YAML map for a newer version', () => {
  // Written as Orbit writes YAML, so a save that keeps everything changes nothing else.
  const text = 'schemaVersion: 2\nview: radial\ntitle: Launch\nnodes:\n  - text: Launch\n    children:\n      - text: Research\n        children:\n          by: Ana\n          notes: kept\n      - text: Build\n        children:\n          - text: Draft\n          - text: Test\n            children:\n              cases: 12\n';

  it('is saved as it was written, what this version can\'t read included', () => {
    const written = '# Planned in a newer Orbit\r\nschemaVersion: 2\r\nview: radial\r\nnodes:\r\n  - text: Plan\r\n    children: { by: Ana, notes: kept }\r\n';
    const document = parseOrbit(written);
    expect(document.diagnostics?.find((diagnostic) => diagnostic.code === 'unsupported-schema-version')?.severity).toBe('error');
    expect(serializeOrbitYAML(document)).toBe(written);
    expect(serializeOrbitYAML({ ...document, options: { ...document.options } })).toBe(written);
  });

  it('keeps everything through edits, writing only what they changed', () => {
    const { renderer } = mount(text);
    renderer.updateNode('build', { text: 'Ship' });
    expect(serializeOrbitYAML(renderer.getDocument()!)).toBe(text.replace('text: Build', 'text: Ship'));
  });

  it('an idea added, moved or removed leaves the others as written', () => {
    const { renderer } = mount(text);
    renderer.addNode('build', { text: 'Review' });
    expect(serializeOrbitYAML(renderer.getDocument()!)).toBe(`${text}          - text: Review\n`);
    renderer.removeNode('review');
    renderer.moveNode('test', 'build', 0);
    expect(serializeOrbitYAML(renderer.getDocument()!)).toBe(text.replace('          - text: Draft\n', '').replace('cases: 12\n', 'cases: 12\n          - text: Draft\n'));
  });

  it('refuses an idea added or moved under one whose ideas this version can\'t read, and stays as it was', () => {
    const { renderer } = mount(text);
    const tree = JSON.stringify(renderer.getDocument()!.root);
    const refusal = '"Research"\'s ideas are written in a newer version of the format, which this version of Orbit can\'t read: adding one would lose them, so the map is unchanged.';
    expect(() => renderer.addNode('research', { text: 'Interviews' })).toThrow(refusal);
    expect(() => renderer.moveNode('draft', 'research')).toThrow(refusal);
    expect(JSON.stringify(renderer.getDocument()!.root)).toBe(tree);
    expect(serializeOrbitYAML(renderer.getDocument()!)).toBe(text);
  });

  it('refuses a new value for what it couldn\'t read of an idea, in either flavor, but lets an idea go', () => {
    const written = 'schemaVersion: 2\nnodes:\n  - text: Plan\n    children:\n      - text: Build\n        status: [waiting, legal]\n      - text:\n          en: Ship\n          es: Enviar\n      - [later, maybe]\n';
    const { renderer } = mount(written);
    const [build, ship, later] = renderer.getDocument()!.root.children;
    expect(() => renderer.updateNode(build.id, { status: 'done' })).toThrow('"Build"\'s status is written in a newer version of the format');
    expect(() => renderer.updateNode(ship.id, { text: 'Launch' })).toThrow('text is written in a newer version of the format');
    expect(() => renderer.updateNode(later.id, { icon: '⏳' })).toThrow(`The idea #${later.id} is written in a newer version of the format`);
    expect(() => renderer.addNode(later.id, { text: 'Soon' })).toThrow(`The idea #${later.id} is written in a newer version of the format`);
    expect(serializeOrbitYAML(renderer.getDocument()!)).toBe(written);
    renderer.removeNode(later.id);
    expect(serializeOrbitYAML(renderer.getDocument()!)).toBe(written.replace('      - [later, maybe]\n', ''));
    const markdown = '---\nschemaVersion: 2\n---\n# Plan\n## A <!-- orbit status: [waiting, legal] -->\n';
    const mounted = mount(markdown).renderer;
    expect(() => mounted.updateNode('a', { status: 'done' })).toThrow('"A"\'s status is written in a newer version of the format');
    expect(mounted.toMarkdown()).toBe(markdown);
  });

  it('won\'t save a change made to the tree that would lose what this version can\'t read', () => {
    const document = parseOrbit(text);
    const research = document.root.children[0];
    research.children.push({ id: 'interviews', text: 'Interviews', level: 2, children: [] });
    expect(() => serializeOrbitYAML(document)).toThrow('"Research"\'s ideas are written in a newer version of the format, which this version of Orbit can\'t read: writing the ones added under it would lose them, so nothing was written.');
    research.children.pop();
    document.options.view = 'all';
    expect(() => serializeOrbitYAML(document)).toThrow('The map\'s view is written in a newer version of the format');
    delete document.options.view;
    expect(serializeOrbitYAML(document)).toBe(text);
  });

  it('drawn again from new text of the same map, saves as that text', () => {
    const { renderer } = mount(text);
    renderer.updateNode('build', { text: 'Ship' });
    // An editor beside the map, say, saving the edit with a comment of its own, and drawing that.
    const edited = `# Shipping soon\n${serializeOrbitYAML(renderer.getDocument()!)}`;
    const drawn = renderer.getDocument()!.root;
    renderer.render(parseOrbit(edited));
    expect(renderer.getDocument()!.root).toBe(drawn);
    expect(serializeOrbitYAML(renderer.getDocument()!)).toBe(edited);
  });

  it('a changed option is written in its place, the others as they were', () => {
    const document = parseOrbit(text);
    document.options.title = 'Launch plan';
    document.options.theme = 'night';
    expect(serializeOrbitYAML(document)).toBe(text.replace('title: Launch', 'title: Launch plan\ntheme: night'));
  });

  it('without a nodes list Orbit reads, is reported and kept too', () => {
    const written = 'schemaVersion: 2\ntitle: Trip\nideas:\n  - text: Packing\n';
    const document = parseOrbit(written);
    expect(codes(document)).toContain('unsupported-schema-version');
    expect(serializeOrbitYAML(document)).toBe(written);
    document.options.title = 'Summer trip';
    expect(serializeOrbitYAML(document)).toBe(written.replace('Trip', 'Summer trip'));
  });

  it('with several top-level ideas, keeps them top-level', () => {
    const written = 'schemaVersion: 2\ntitle: Week\nnodes:\n  - text: Monday\n    children:\n      at: 9\n  - text: Tuesday\n';
    const document = parseOrbit(written);
    expect(serializeOrbitYAML(document)).toBe(written);
    document.root.children[1].text = 'Wednesday';
    expect(serializeOrbitYAML(document)).toBe(written.replace('Tuesday', 'Wednesday\n    id: tuesday'));
    document.root.text = 'Busy week';
    expect(serializeOrbitYAML(document)).toBe('schemaVersion: 2\ntitle: Week\nnodes:\n  - text: Busy week\n    id: week\n    children:\n      - text: Monday\n        children:\n          at: 9\n      - text: Wednesday\n        id: tuesday\n');
  });

  it('writes a changed key in its place after the ideas, too', () => {
    const written = 'schemaVersion: 2\nnodes:\n  - text: Plan\n    children:\n      - text: Draft\n    status: todo\n    layout: spiral\ngenerator: sync\n';
    const document = parseOrbit(written);
    document.root.status = 'done';
    document.extra = { generator: 'sync 2' };
    expect(serializeOrbitYAML(document)).toBe(written.replace('todo', 'done').replace('sync', 'sync 2'));
  });

  it('writes an edit where it was read from: a synonym of text, a caption beside its picture, plain text', () => {
    const written = 'schemaVersion: 2\nnodes:\n  - title: Album\n    children:\n      - text: Beach\n        image: beach.jpg\n        caption: Sunset\n        frame: polaroid\n      - Harbor\n      - Hills\n';
    const document = parseOrbit(written);
    const [beach, harbor] = document.root.children;
    document.root.text = 'Summer album';
    beach.image!.caption = 'Sunrise';
    harbor.status = 'done';
    const saved = serializeOrbitYAML(document);
    expect(saved).toBe('schemaVersion: 2\nnodes:\n  - title: Summer album\n    id: album\n    children:\n      - text: Beach\n        image:\n          src: beach.jpg\n          caption: Sunrise\n        frame: polaroid\n      - text: Harbor\n        status: done\n      - Hills\n');
    expect(parseOrbit(saved).root.children[0].image?.caption).toBe('Sunrise');
  });
});

describe('the version a map is written with', () => {
  const fresh = (): OrbitDocument => ({ root: { id: 'plan', text: 'Plan', level: 0, children: [] }, options: {}, warnings: [] });

  it('is left out while the format is at its first version, and written once it\'s past it', () => {
    // A map made in code, which no parser upgraded: once the format is past 1, it must say its version.
    expect(serializeOrbitMarkdown(fresh()).includes('schemaVersion')).toBe(SUPPORTED_SCHEMA_VERSION > 1);
    expect(serializeOrbitYAML(fresh()).includes('schemaVersion')).toBe(SUPPORTED_SCHEMA_VERSION > 1);
    expect(writtenSchemaVersion({}, [])).toBeUndefined();
    expect(writtenSchemaVersion({}, [{ from: 1, upgrade: () => {} }])).toBe(2);
    // A document's own version is written as it is: a newer one's, or one an app set.
    expect(writtenSchemaVersion({ schemaVersion: 3 }, [{ from: 1, upgrade: () => {} }])).toBe(3);
  });
});

// The first real change to the format, rehearsed: a step from 1 to 2 that
// renames the `due` attribute to `deadline`, run through the parsers, the
// writers and the renderer as a real one would be, then taken away again
// to read what it wrote as an older Orbit does.
describe('a change of the format, rehearsed', () => {
  const renameDue: FormatUpgrade = {
    from: 1,
    upgrade: (document) => {
      const visit = (node: OrbitNode): void => {
        if (node.attrs && 'due' in node.attrs) {
          const { due, ...rest } = node.attrs;
          node.attrs = { ...rest, deadline: due };
        }

        node.children.forEach(visit);
      };

      visit(document.root);
    },
  };

  beforeEach(() => {
    FORMAT_UPGRADES.push(renameDue);
  });

  afterEach(() => {
    FORMAT_UPGRADES.splice(FORMAT_UPGRADES.indexOf(renameDue), 1);
  });

  const asAnOlderOrbit = <Result>(read: () => Result): Result => {
    FORMAT_UPGRADES.splice(FORMAT_UPGRADES.indexOf(renameDue), 1);

    try {
      return read();
    } finally {
      FORMAT_UPGRADES.push(renameDue);
    }
  };

  it('an older map is upgraded as it\'s read, and saved as version 2, with or without frontmatter', () => {
    const withFrontmatter = parseOrbit('---\ntheme: night\n---\n# Plan\n## A <!-- orbit due: 2026-11-01 -->\n## B\n');
    expect(codes(withFrontmatter)).toEqual(['format-upgraded']);
    expect(serializeOrbitMarkdown(withFrontmatter)).toBe('---\ntheme: night\nschemaVersion: 2\n---\n# Plan\n## A <!-- orbit deadline: "2026-11-01" -->\n## B\n');
    const without = parseOrbit('# Plan\n## A\n## B\n');
    const saved = serializeOrbitMarkdown(without);
    expect(saved).toContain('schemaVersion: 2');
    expect(saved.endsWith('# Plan\n## A\n## B\n')).toBe(true);
    expect(serializeOrbitYAML(without)).toContain('schemaVersion: 2');
  });

  it('a map made in code is written as version 2, in both flavors', () => {
    const document: OrbitDocument = { root: { id: 'plan', text: 'Plan', level: 0, children: [{ id: 'a', text: 'A', level: 1, children: [], attrs: { deadline: 'soon' } }] }, options: {}, warnings: [] };

    for (const written of [serializeOrbitMarkdown(document), serializeOrbitYAML(document)]) {
      expect(written).toContain('schemaVersion: 2');
      const reread = parseOrbit(written);
      // Read back as what it is, not as version 1 to upgrade again.
      expect(codes(reread)).toEqual([]);
      expect(reread.root.children[0].attrs).toEqual({ deadline: 'soon' });
    }
  });

  it('what it saves reads back without being upgraded again, and saves the same', () => {
    const saved = serializeOrbitMarkdown(parseOrbit('# Plan\n## A <!-- orbit due: 2026-11-01 -->\n'));
    const reread = parseOrbit(saved);
    expect(codes(reread)).toEqual([]);
    expect(serializeOrbitMarkdown(reread)).toBe(saved);
  });

  it('an older Orbit opens what it saved as newer: reported, kept, and not edited on the map', () => {
    const saved = serializeOrbitMarkdown(parseOrbit('# Plan\n## A <!-- orbit due: 2026-11-01 -->\n## B\n'));
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      asAnOlderOrbit(() => {
        expect(codes(parseOrbit(saved))).toEqual(['unsupported-schema-version']);
        const { host, renderer } = mount(saved, { editable: true });
        expect(renderer.getDocument()?.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(['unsupported-schema-version']);
        // No + in the orbit, and one warning that says why.
        expect(host.querySelector('[data-orbit-add]')?.getAttribute('aria-hidden') ?? 'true').toBe('true');
        renderer.setOptions({ editable: true });
        expect(warn.mock.calls.filter(([message]) => String(message).includes('not edited on the map'))).toHaveLength(1);
        // The page can still change it, and everything it says is kept.
        renderer.updateNode('b', { text: 'Second' });
        expect(renderer.toMarkdown()).toBe(saved.replace('## B', '## Second'));
        // A language model asked to change it is told it can't.
        expect(createMapTools(renderer).run('add_nodes', { parent_id: 'plan', outline: '- C' }).ok).toBe(false);
      });
    } finally {
      warn.mockRestore();
    }
  });
});

describe('node type versions', () => {
  const unregister: (() => void)[] = [];

  afterEach(() => {
    unregister.splice(0).forEach((remove) => remove());
  });

  it('a type\'s version is read and written with it', () => {
    const document = parseOrbit('# Map\n## A <!-- orbit type: task@2 -->\n## B <!-- orbit type: task@1 -->\n## C <!-- orbit type: task -->\n');
    expect(document.root.children.map((node) => [node.type, node.typeVersion])).toEqual([['task', 2], ['task', 1], ['task', undefined]]);
    expect(serializeOrbitMarkdown(document, { keepSource: false })).toContain('## A <!-- orbit type: task@2 -->');
    expect(serializeOrbitYAML(document)).toContain('type: "task@2"');
  });

  it('a map brings older nodes up to date when it\'s drawn, and saving writes only them', () => {
    unregister.push(registerNodeType('task', {
      version: 2,
      upgrade: (node, from) => {
        if (from < 2 && node.attrs?.assignee !== undefined) {
          const { assignee, ...rest } = node.attrs;
          node.attrs = { ...rest, owner: assignee };
        }
      },
    }));
    const text = '# Map\n## Write <!-- orbit type: task, assignee: Ana -->\n## Test <!-- orbit type: task@2, owner: Ben -->\n## Ship <!-- orbit type: task@3, lead: Chen -->\n## Notes\n';
    const { renderer } = mount(text);
    const [write, test, ship] = renderer.getDocument()!.root.children;
    expect(write).toMatchObject({ typeVersion: 2, attrs: { owner: 'Ana' } });
    expect(test.attrs).toEqual({ owner: 'Ben' });
    // Written for a newer version of the type: left as it is.
    expect(ship).toMatchObject({ typeVersion: 3, attrs: { lead: 'Chen' } });
    expect(renderer.toMarkdown()).toBe(text.replace('type: task, assignee: Ana', 'type: task@2, owner: Ana'));
  });

  it('a node written for a newer version of its type is drawn as a plain idea, and keeps its type', () => {
    const render = (shown: OrbitNode, element: HTMLElement) => {
      element.textContent = `ring of ${shown.text}`;
    };

    unregister.push(registerNodeType('ring', { render, icon: '⭕' }));
    const text = '# Map\n## Done <!-- orbit type: ring, share: 50 -->\n## Later <!-- orbit type: ring@2, shares: [50, 80] -->\n';
    const { host, renderer } = mount(text);
    // The type it knows draws its node, label outside…
    expect(host.querySelector('.orbit-node-content[data-orbit-for="done"]')?.textContent).toBe('ring of Done');
    expect(host.querySelector('.orbit-label[data-orbit-for="done"]')?.classList.contains('orbit-label--outside')).toBe(true);
    expect(host.querySelector('[data-orbit-node-id="done"]')?.getAttribute('data-orbit-type')).toBe('ring');
    // …but a node written for a newer version of it is a plain idea: its name inside, nothing drawn, no type's icon.
    expect(host.querySelector('.orbit-node-content[data-orbit-for="later"]')).toBeNull();
    expect(host.querySelector('.orbit-label[data-orbit-for="later"]')?.classList.contains('orbit-label--outside')).toBe(false);
    expect(host.querySelector('[data-orbit-node-id="later"]')?.hasAttribute('data-orbit-type')).toBe(false);
    expect(host.querySelector('.orbit-label[data-orbit-for="later"]')?.textContent).not.toContain('⭕');
    // It keeps what it was written with.
    expect(renderer.toMarkdown()).toBe(text);
  });

  it('a type that knows the newer version draws it', () => {
    unregister.push(registerNodeType('ring', { version: 2, render: (shown, element) => { element.textContent = shown.text; } }));
    const { host } = mount('# Map\n## Later <!-- orbit type: ring@2 -->\n');
    expect(host.querySelector('.orbit-node-content[data-orbit-for="later"]')?.textContent).toBe('Later');
  });

  it('documents read without a map can be upgraded too', () => {
    const document = parseOrbit('# Map\n## Old <!-- orbit type: card, size: big -->\n');
    const upgraded = upgradeNodeTypes(document.root, {
      card: { version: 2, upgrade: (node) => { node.attrs = { width: node.attrs?.size === 'big' ? 2 : 1 }; } },
    });
    expect(upgraded).toBe(1);
    expect(serializeOrbitMarkdown(document)).toBe('# Map\n## Old <!-- orbit type: card@2, width: 2 -->\n');
  });

  it('an upgrade that throws leaves its node as it was', () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      const document = parseOrbit('# Map\n## A <!-- orbit type: broken, size: 3 -->\n');
      upgradeNodeTypes(document.root, { broken: { version: 2, upgrade: () => { throw new Error('nope'); } } });
      expect(document.root.children[0]).toMatchObject({ type: 'broken', attrs: { size: 3 } });
      expect(document.root.children[0].typeVersion).toBeUndefined();
      expect(errors).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });
});

describe('values Orbit can\'t read are kept as written', () => {
  it('in attributes Orbit has: a list for a status, a word for a priority', () => {
    const document = parseOrbit('# Map\n## A\n<!-- orbit\nstatus: [waiting, legal]\npriority: high\ncollapsed: auto\n-->\n');
    const node = document.root.children[0];
    expect(node.status).toBeUndefined();
    expect(node.attrs).toEqual({ status: ['waiting', 'legal'], priority: 'high', collapsed: 'auto' });
    expect(codes(document).filter((code) => code === 'invalid-attributes')).toHaveLength(3);
    const written = serializeOrbitMarkdown(document, { keepSource: false });
    expect(parseOrbit(written).root.children[0].attrs).toEqual(node.attrs);
  });

  it('a value set since replaces the one Orbit couldn\'t read', () => {
    const { renderer } = mount('# Map\n## A <!-- orbit status: [waiting, legal] -->\n');
    renderer.updateNode('a', { status: 'done' });
    expect(parseOrbit(renderer.toMarkdown()).root.children[0].status).toBe('done');
  });

  it('a picture or video keeps the fields Orbit doesn\'t read', () => {
    const document = parseOrbit('nodes:\n  - text: A\n    image:\n      src: a.png\n      width: 640\n    video:\n      src: https://loom.com/share/x\n      provider: loom\n');
    const markdown = serializeOrbitMarkdown(document);
    const reread = parseOrbit(markdown).root;
    expect(serializeOrbitYAML(parseOrbit(markdown))).toContain('width: 640');
    expect(serializeOrbitYAML(parseOrbit(markdown))).toContain('provider: loom');
    expect(reread.video?.provider).toBeUndefined();
  });

  it('a YAML id written as a number', () => {
    expect(parseOrbit('nodes:\n  - text: A\n    id: 42\n').root.id).toBe('42');
  });
});
