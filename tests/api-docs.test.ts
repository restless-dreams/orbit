import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ELEMENT_OPTION_ATTRIBUTES } from '../src/core/auto-render';
import { NODE_ATTRIBUTE_KEYS } from '../src/core/node-attributes';
import { fieldsOf, methodsOf } from './helpers/declarations';

// The guide says it covers every option, event and method (README.md), and
// docs/api is generated from the types: these tests keep both true, so what
// a new option, event or method needs in the docs can't be forgotten.

const root = join(import.meta.dir, '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const guide = read('docs/guide.md');

/** The part of `text` under `heading`, up to the next heading of the same level or higher (outside code blocks). */
const section = (text: string, heading: string): string => {
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  let inCode = false;
  const body: string[] = [];

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('```')) {
      inCode = !inCode;
    }

    const match = /^(#+) /.exec(line);

    if (!inCode && match && match[1].length <= level) {
      break;
    }

    body.push(line);
  }

  return body.join('\n');
};

/** Each table in `text`, as its rows' cells, the header's included and the line under it left out. */
const tables = (text: string): string[][][] => {
  const found: string[][][] = [];
  let current: string[][] | null = null;

  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) {
      current = null;
      continue;
    }

    if (!current) {
      current = [];
      found.push(current);
    }

    if (!/^\|[\s|:-]+\|$/.test(line)) {
      current.push(line.slice(1, -1).split(' | ').map((cell) => cell.trim()));
    }
  }

  return found;
};

/** The table whose first header cell is `header`. */
const table = (text: string, header: string): string[][] => {
  const found = tables(text).find((rows) => rows[0]?.[0] === header);
  expect(found).toBeDefined();
  return found!.slice(1);
};

/** `text` without its code blocks. */
const prose = (text: string): string => text.replace(/^ *```[\s\S]*?^ *```$/gm, '');

/** The code in `text`'s code blocks. */
const examples = (text: string): string => [...text.matchAll(/^ *```[^\n]*\n([\s\S]*?)^ *```$/gm)].map((match) => match[1]).join('\n');

/** The code spans in `text`, outside its code blocks: `name`, or `` name `` and longer runs for one with backticks in it. */
const named = (text: string): string[] =>
  prose(text).split('\n').flatMap((line) => [...line.matchAll(/(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g)].map((match) => match[2].trim()));

/** The names a column of `rows` gives, each once, sorted. */
const column = (rows: string[][], index: number): string[] => [...new Set(rows.flatMap((row) => named(row[index] ?? '')))].sort();

describe('the guide', () => {
  test('names every renderer option in its options table, and nothing else', () => {
    expect(column(table(section(guide, '## Renderer options'), 'Option'), 0)).toEqual(fieldsOf('src/core/types.ts', 'OrbitRendererOptions'));
  });

  test('names every event in its events table, with its DOM event', () => {
    const rows = table(section(guide, '## Events'), 'Event');
    const events = fieldsOf('src/core/types.ts', 'OrbitEventMap');
    expect(column(rows, 0)).toEqual(events);
    expect(column(rows, 1)).toEqual([...events.map((name) => `orbit-${name}`), 'orbit-error'].sort());
  });

  test('says what each on… option is called with', () => {
    const callbacks = fieldsOf('src/core/types.ts', 'OrbitRendererOptions').filter((name) => /^on[A-Z]/.test(name));
    expect(column(table(section(guide, '## Events'), 'Option'), 0)).toEqual(callbacks);
  });

  test('names every method of the renderer', () => {
    // As `name`, `name(…)` or `renderer.name(…)`, or called in an example.
    const mentioned = (name: string): boolean =>
      named(guide).some((code) => new RegExp(`(^|\\.)${name}(\\(|$)`).test(code)) || new RegExp(`\\.${name}\\(`).test(examples(guide));
    expect(methodsOf('src/core/svg-renderer.ts', 'OrbitSVGRenderer').filter((name) => !mentioned(name))).toEqual([]);
  });

  test('names every option of renderToSVGString', () => {
    const options = section(guide, '## Server rendering and export').split('\n').find((line) => line.startsWith('Options: ')) ?? '';
    const missing = fieldsOf('src/core/render-to-svg.ts', 'OrbitSVGOptions').filter((name) => !named(options).includes(name));
    expect(missing).toEqual([]);
  });

  test('names every attribute of <orbit-map>', () => {
    const element = section(guide, '## Web component');
    const missing = ELEMENT_OPTION_ATTRIBUTES.filter((name) => name !== 'view-mode' && !named(element).includes(name));
    expect(missing).toEqual([]);
  });
});

describe('the editing guide', () => {
  test('names every attribute addNode and updateNode take', () => {
    const sentence = read('docs/editing.md').split('\n').find((line) => line.startsWith('Besides `text`, `addNode` and `updateNode` take')) ?? '';
    const missing = fieldsOf('src/core/types.ts', 'OrbitNodeInput').filter((name) => name !== 'text' && !named(sentence).includes(name));
    expect(missing).toEqual([]);
  });
});

describe('the skill', () => {
  test('names every attribute a map can set', () => {
    const attributes = read('skills/orbit/SKILL.md').split('\n').find((line) => line.startsWith('- Attributes go in')) ?? '';
    expect(NODE_ATTRIBUTE_KEYS.filter((name) => !named(attributes).includes(name))).toEqual([]);
  });
});

describe('docs/api', () => {
  /** Every file under `folder`, by its path inside it. */
  const files = (folder: string): Map<string, string> => {
    const paths = (readdirSync(folder, { recursive: true }) as string[]).filter((path) => path.endsWith('.md'));
    return new Map(paths.sort().map((path) => [path, readFileSync(join(folder, path), 'utf8')]));
  };

  test('is what TypeDoc writes from the types (run `bun run docs:api`)', () => {
    const out = mkdtempSync(join(tmpdir(), 'orbit-api-'));

    try {
      const typedoc = Bun.spawnSync({ cmd: [process.execPath, join(root, 'node_modules/typedoc/bin/typedoc'), '--out', out, '--logLevel', 'Error'], cwd: root });

      if (typedoc.exitCode !== 0) {
        throw new Error(`TypeDoc failed: ${typedoc.stderr.toString()}${typedoc.stdout.toString()}`);
      }

      const written = files(out);
      const committed = files(join(root, 'docs/api'));
      expect([...committed.keys()]).toEqual([...written.keys()]);
      const stale = [...written].filter(([path, content]) => committed.get(path) !== content).map(([path]) => path);
      expect(stale).toEqual([]);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
