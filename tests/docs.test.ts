import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOrbit } from '../src/core/dispatch';
import { DIAGNOSTIC_CODES } from '../src/core/diagnostics';
import { DOCUMENT_OPTION_KEYS } from '../src/core/document-options';
import { NODE_ATTRIBUTE_KEYS } from '../src/core/node-attributes';
import { statusTone } from '../src/core/ui/detail-sheet';
import { isAddressOrAnchor, linksIn, llmsFiles } from '../scripts/build-llms';
import { EXAMPLE_MAP } from '../bin/example';
import { OrbitWords } from '../src/core/languages';
import { isOrbitThemePreset, themeNames } from '../src/core/themes';

// The format reference is what people and coding agents write maps from:
// these tests keep it true to the parser.

const format = readFileSync(join(import.meta.dir, '../docs/format.md'), 'utf8');

/** The section of the reference under a heading, up to the next heading of the same level or higher (outside code blocks). */
const section = (heading: string): string => {
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  const lines = format.split('\n');
  const start = lines.indexOf(heading);
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

/** The first column of every table row in `text`, without backticks. */
const firstColumn = (text: string): string[] => {
  return text
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.split('|')[1].trim().replace(/`/g, ''));
};

/** The codes the parsers record as notes, which never make a map invalid. */
const noteCodes = (): string[] => {
  const codes = new Set<string>();
  const folder = join(import.meta.dir, '../src/core');

  for (const name of readdirSync(folder, { recursive: true }) as string[]) {
    if (name.endsWith('.ts')) {
      for (const match of readFileSync(join(folder, name), 'utf8').matchAll(/\.note\(\s*'([a-z-]+)'/g)) {
        codes.add(match[1]);
      }
    }
  }

  return [...codes].sort();
};

describe('the format reference', () => {
  test('every example parses without a problem', () => {
    const examples = [...format.matchAll(/```(markdown|yaml)\n([\s\S]*?)```/g)].map((match) => match[2]);
    expect(examples.length).toBeGreaterThanOrEqual(4);

    for (const example of examples) {
      const doc = parseOrbit(example, { strict: true });
      // Fragments without a top heading get a made-up root, and say so.
      expect(doc.diagnostics?.filter((diagnostic) => diagnostic.code !== 'synthetic-root')).toEqual([]);
    }
  });

  test('lists every attribute', () => {
    expect(firstColumn(section('### Attributes')).sort()).toEqual([...NODE_ATTRIBUTE_KEYS, 'contentType'].sort());
  });

  test('lists every document option', () => {
    expect(firstColumn(section('## Document options')).sort()).toEqual([...DOCUMENT_OPTION_KEYS].sort());
  });

  test('names the diagnostics that only note something', () => {
    const sentence = section('## Checking a map').split('\n').find((line) => line.includes('only note something')) ?? '';
    const named = [...sentence.matchAll(/`([a-z-]+)`/g)].map((match) => match[1]).filter((code) => (DIAGNOSTIC_CODES as readonly string[]).includes(code));
    expect(named.sort()).toEqual(noteCodes());
  });

  test('lists every diagnostic code', () => {
    expect(firstColumn(section('## Checking a map')).sort()).toEqual([...DIAGNOSTIC_CODES].sort());
  });

  test('gives the words each status dot reads', () => {
    const rows = section('### Statuses').split('\n').filter((line) => /^\| (active|done|blocked|todo) /.test(line));
    expect(rows).toHaveLength(4);

    for (const row of rows) {
      const tone = row.split('|')[1].trim().split(' ')[0];
      const words = [...row.split('|')[2].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      expect(words.length).toBeGreaterThan(2);

      for (const word of words) {
        expect(`${word}: ${statusTone(word)}`).toBe(`${word}: ${tone}`);
      }
    }
  });
});

const root = join(import.meta.dir, '..');
const readFile = (path: string) => readFileSync(join(root, path), 'utf8');

/** Markdown examples in a file: every ```markdown block. */
const markdownExamples = (content: string): string[] => {
  return [...content.matchAll(/```markdown\n([\s\S]*?)```/g)].map((match) => match[1]);
};

/** The theme names on the line that starts with "Themes:", each in backticks. */
const listedThemes = (content: string): string[] => {
  const line = content.split('\n').find((text) => /^(- )?Themes: /.test(text)) ?? '';
  return [...line.matchAll(/`([\w-]+)`/g)].map((match) => match[1]);
};

describe('the files coding agents read', () => {
  test('are up to date with the docs (run `bun run docs:llms`)', () => {
    for (const [path, content] of Object.entries(llmsFiles())) {
      expect(`${path}: ${readFile(path) === content ? 'current' : 'out of date'}`).toBe(`${path}: current`);
    }
  });

  test('llms.txt links to files that exist', () => {
    const links = [...readFile('llms.txt').matchAll(/\(https:\/\/github\.com\/restless-dreams\/orbit\/blob\/main\/([^)]+)\)/g)].map((match) => match[1]);
    expect(links.length).toBeGreaterThan(5);

    for (const link of links) {
      expect(() => readFile(link)).not.toThrow();
    }
  });

  test('the skill is in the Agent Skills format every agent reads', () => {
    const skill = readFile('skills/orbit/SKILL.md');
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? '';
    const fields = new Map(frontmatter.split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
    // Codex, Claude Code and Kimi Code all need these two, and read other fields differently.
    expect([...fields.keys()]).toEqual(['name', 'description']);
    // As https://agentskills.io/specification has it: the folder's name, in lowercase letters, digits and single hyphens.
    expect(fields.get('name')).toBe('orbit');
    expect(fields.get('name')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const description = fields.get('description') ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).toContain('Use when');
    expect(description).not.toMatch(/[<>]/);
    // Agents read the whole SKILL.md when they use the skill, so the detail lives in references/.
    expect(skill.split('\n').length).toBeLessThan(500);
  });

  test('the skill links only to its own references', () => {
    const links = linksIn(readFile('skills/orbit/SKILL.md'));
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      expect(link).toMatch(/^references\/[\w-]+\.md$/);
      expect(() => readFile(`skills/orbit/${link}`)).not.toThrow();
    }
  });

  test('the skill\'s references link only to each other or to full addresses', () => {
    const folder = 'skills/orbit/references';

    for (const name of readdirSync(join(root, folder))) {
      for (const link of linksIn(readFile(`${folder}/${name}`)).filter((target) => !isAddressOrAnchor(target))) {
        expect(`${name} → ${link}: ${readdirSync(join(root, folder)).includes(link.split('#')[0]) ? 'beside it' : 'missing'}`).toBe(`${name} → ${link}: beside it`);
      }
    }
  });

  test('llms.txt and the skill name every theme', () => {
    const themes = themeNames().filter(isOrbitThemePreset).sort();

    for (const path of ['llms.txt', 'skills/orbit/SKILL.md']) {
      expect(`${path}: ${listedThemes(readFile(path)).sort().join(', ')}`).toBe(`${path}: ${themes.join(', ')}`);
    }
  });

  test('the README\'s example map parses without a problem', () => {
    const examples = markdownExamples(readFile('README.md'));
    expect(examples.length).toBeGreaterThan(0);

    for (const example of examples) {
      expect(parseOrbit(example, { strict: true }).diagnostics).toEqual([]);
    }
  });

  test('the skill\'s examples parse without a problem', () => {
    const examples = markdownExamples(readFile('skills/orbit/SKILL.md'));
    expect(examples.length).toBeGreaterThan(0);

    for (const example of examples) {
      expect(parseOrbit(example, { strict: true }).diagnostics).toEqual([]);
    }
  });

  test('the coding agents guide shows what validate prints for the example map with a typo in a link', () => {
    const documented = /```json\n([\s\S]*?)```/.exec(readFile('docs/agents.md'))?.[1] ?? '';
    const withTypo = EXAMPLE_MAP.replace('(#search-index)', '(#search-indx)');
    expect(withTypo).not.toBe(EXAMPLE_MAP);
    const result = Bun.spawnSync(['bun', 'bin/orbit.ts', 'validate', '--json', '-'], { cwd: root, stdin: new TextEncoder().encode(withTypo) });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe(documented);
  });
});

describe('the languages guide', () => {
  test('lists every word Orbit says, in English and Spanish, as the languages have them', () => {
    const guide = readFileSync(join(import.meta.dir, '../docs/languages.md'), 'utf8');
    const rows = guide.split('\n').filter((line) => /^\| `\w+` \|/.test(line));
    const table = (language: string) => (new OrbitWords(language) as unknown as { table: Record<string, string | Record<string, string>> }).table;
    const show = (value: string | Record<string, string>) => (typeof value === 'string'
      ? value
      : Object.entries(value).map(([category, text]) => `${category}: ${text}`).join('; ')).replace(/\|/g, '\\|');
    const english = table('en');
    const spanish = table('es');
    expect(rows).toEqual(Object.keys(english).map((key) => `| \`${key}\` | ${show(english[key])} | ${show(spanish[key])} |`));
  });
});
