/**
 * The maps a version of Orbit writes, kept in tests/fixtures/releases so
 * every later version is tested against them (tests/release-fixtures.test.ts):
 * each must still be read without errors, written back exactly, and
 * understood the same way, after any format upgrades.
 *
 * A version reads the hand-written maps in `sources/`, writes them in its own
 * form, as markdown and as YAML, and saves `trip.md` edited through its
 * renderer with the source kept, the way an app saves. `reads.json` records
 * how that version read each file back.
 *
 *   bun scripts/release-fixtures.ts                      this checkout, into releases/next
 *   bun scripts/release-fixtures.ts --version 0.2.0      this checkout, into releases/0.2.0, when releasing it
 *   bun scripts/release-fixtures.ts --orbit <path to a build's dist/index.js> --version 0.1.0
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where the fixtures live: `sources/`, and a folder per version. */
export const RELEASES = join(import.meta.dir, '..', 'tests', 'fixtures', 'releases');

/** The part of Orbit's public API the fixtures are made with, in every version. */
export interface OrbitModule {
  parseOrbit: (text: string) => Record<string, unknown> & { root: FixtureNode; options: Record<string, unknown>; extra?: Record<string, unknown>; diagnostics?: { code: string; severity: string }[] };
  serializeOrbitMarkdown: (document: unknown, options?: { keepSource?: boolean }) => string;
  serializeOrbitYAML: (document: unknown) => string;
  OrbitSVGRenderer: RendererClass;
}

interface RendererClass {
  new (host: HTMLElement, options: Record<string, unknown>): Renderer;
  prototype: { readContainerSize: () => { width: number; height: number } };
  unmount: (host: HTMLElement) => void;
}

interface Renderer {
  render: (document: unknown) => void;
  addNode: (parentId: string, input: Record<string, unknown>, index?: number) => unknown;
  updateNode: (id: string, changes: Record<string, unknown>) => unknown;
  removeNode: (id: string) => unknown;
  moveNode: (id: string, parentId: string, index?: number) => unknown;
  toMarkdown: () => string;
}

/** A node as the parsers produce it, in any version: only what a fixture records is read. */
export interface FixtureNode {
  id: string;
  text: string;
  children: FixtureNode[];
  attrs?: Record<string, unknown>;
  [field: string]: unknown;
}

/** A node's own fields, besides `id`, `text`, `attrs` and `children`, in the versions so far. */
export const NODE_FIELDS = [
  'icon', 'color', 'paletteColor', 'status', 'priority', 'tags', 'collapsed', 'type', 'typeVersion', 'link', 'note', 'noteFormat', 'image', 'video', 'embed',
] as const;

/** A node as a fixture records it: everything it says, its own fields and custom attributes together. */
export interface RecordedNode {
  id: string;
  text: string;
  attributes: Record<string, unknown>;
  children: RecordedNode[];
}

export interface RecordedDocument {
  options: Record<string, unknown>;
  extra: Record<string, unknown>;
  root: RecordedNode;
}

/** How a version read one of its files back: its diagnostics (severity and code) and what the map says. */
export interface RecordedRead {
  diagnostics: string[];
  document: RecordedDocument;
}

/** A plain copy with keys in order and nothing undefined, so records compare and diff cleanly. */
const plain = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(plain);
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, entry]) => [key, plain(entry)]);
    return Object.fromEntries(entries);
  }

  return value;
};

/**
 * What a node says, the same whichever version read it: an attribute a
 * version knows is a field of its own, and one it doesn't is kept in
 * `attrs`, so the two are recorded together.
 */
export const recordNode = (node: FixtureNode): RecordedNode => {
  const attributes: Record<string, unknown> = { ...(node.attrs ?? {}) };

  for (const field of NODE_FIELDS) {
    if (node[field] !== undefined) {
      attributes[field] = node[field];
    }
  }

  return { id: node.id, text: node.text, attributes: plain(attributes) as Record<string, unknown>, children: node.children.map(recordNode) };
};

export const recordDocument = (document: ReturnType<OrbitModule['parseOrbit']>): RecordedDocument => {
  return {
    options: plain(document.options) as Record<string, unknown>,
    extra: plain(document.extra ?? {}) as Record<string, unknown>,
    root: recordNode(document.root),
  };
};

/** A recorded node as a node again, with `fields` (the attributes the reading version knows) as fields and the rest in `attrs`. */
export const nodeFromRecord = (recorded: RecordedNode, fields: ReadonlySet<string>, level = 0): FixtureNode => {
  const node: FixtureNode = { id: recorded.id, text: recorded.text, level, children: [] };
  const attrs: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(recorded.attributes)) {
    if (fields.has(key)) {
      node[key] = value;
    } else {
      attrs[key] = value;
    }
  }

  if (Object.keys(attrs).length > 0) {
    node.attrs = attrs;
  }

  node.children = recorded.children.map((child) => nodeFromRecord(child, fields, level + 1));
  return node;
};

const readSources = (): Record<string, string> => {
  const folder = join(RELEASES, 'sources');
  return Object.fromEntries(readdirSync(folder).sort().map((name) => [name, readFileSync(join(folder, name), 'utf8')]));
};

/** `trip.md` edited the way people edit a map in an app, saved with the source kept. */
const editTrip = (orbit: OrbitModule, source: string): string => {
  const prototype = orbit.OrbitSVGRenderer.prototype;
  const readContainerSize = prototype.readContainerSize;
  prototype.readContainerSize = () => ({ width: 600, height: 400 });
  const host = document.createElement('div');
  document.body.appendChild(host);

  try {
    const renderer = new orbit.OrbitSVGRenderer(host, { transitionDuration: 0 });
    renderer.render(orbit.parseOrbit(source));
    renderer.addNode('food', { text: 'Night markets', icon: '🏮' });
    renderer.updateNode('museums', { text: 'Galleries' });
    renderer.updateNode('beaches', { status: 'done' });
    renderer.updateNode('music', { color: '#E5484D', tags: ['evening'] });
    renderer.updateNode('tascas', { note: 'Book a table for eight.' });
    renderer.moveNode('fado-in-alfama', 'markets');
    renderer.removeNode('maat');
    renderer.addNode('weekend-in-lisbon', { text: 'Parks' }, 1);
    renderer.moveNode('markets', 'weekend-in-lisbon', 0);
    return renderer.toMarkdown();
  } finally {
    host.remove();
    orbit.OrbitSVGRenderer.unmount(host);
    prototype.readContainerSize = readContainerSize;
  }
};

/** Every file a version's fixtures hold, by name, `reads.json` included. */
export const releaseFixtures = (orbit: OrbitModule, sources: Record<string, string> = readSources()): Record<string, string> => {
  const markdown = orbit.parseOrbit(sources['everything.md']);
  const yaml = orbit.parseOrbit(sources['everything.yaml']);
  const files: Record<string, string> = {
    'everything.md': orbit.serializeOrbitMarkdown(markdown, { keepSource: false }),
    'everything.yaml': orbit.serializeOrbitYAML(markdown),
    'everything-from-yaml.md': orbit.serializeOrbitMarkdown(yaml, { keepSource: false }),
    'everything-from-yaml.yaml': orbit.serializeOrbitYAML(yaml),
    'trip.md': editTrip(orbit, sources['trip.md']),
  };
  const reads: Record<string, RecordedRead> = {};

  for (const [name, text] of Object.entries(files)) {
    const document = orbit.parseOrbit(text);
    reads[name] = {
      diagnostics: (document.diagnostics ?? []).map((diagnostic) => `${diagnostic.severity} ${diagnostic.code}`),
      document: recordDocument(document),
    };
  }

  return { ...files, 'reads.json': `${JSON.stringify(reads, null, 2)}\n` };
};

const option = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

if (import.meta.main) {
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator');
  GlobalRegistrator.register({ url: 'http://localhost', settings: { disableIframePageLoading: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const orbitPath = option('orbit');
  let orbit: OrbitModule;

  if (orbitPath) {
    orbit = await import(orbitPath) as OrbitModule;
  } else {
    // This checkout's own source, its stylesheets compiled as in the build.
    const { plugin } = await import('bun');
    const { sassPlugin } = await import('./sass-plugin');
    plugin(sassPlugin);
    orbit = await import('../src/index') as unknown as OrbitModule;
  }

  const folder = join(RELEASES, option('version') ?? 'next');
  mkdirSync(folder, { recursive: true });

  for (const [name, content] of Object.entries(releaseFixtures(orbit))) {
    writeFileSync(join(folder, name), content);
  }

  console.log(`Wrote ${folder}`);
  await GlobalRegistrator.unregister();
}
