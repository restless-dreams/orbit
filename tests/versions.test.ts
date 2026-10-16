import { afterEach, describe, expect, it } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { DiagnosticCollector } from '../src/core/diagnostics';
import { FORMAT_UPGRADES, SUPPORTED_SCHEMA_VERSION, upgradeFormat } from '../src/core/format-upgrades';
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
