import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOrbit } from '../src/core/dispatch';
import { EXAMPLE_MAP } from '../bin/example';
import { buildWebPageScript } from '../scripts/build-web-page';
import type { OrbitNode } from '../src/core/types';
import { folderFiles, makeZip, ONE_PIXEL_PNG } from './helpers/zip';

/** Runs the command in its own process, as people and agents do, with `input` on stdin. */
const run = (argumentsList: string[], input = ''): { code: number; stdout: string; stderr: string } => {
  const result = Bun.spawnSync(['bun', 'bin/orbit.ts', ...argumentsList], {
    cwd: join(import.meta.dir, '..'),
    stdin: new TextEncoder().encode(input),
  });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
};

/** A node's content, without where it came from in the source. */
const shape = (node: OrbitNode): unknown => {
  const content: Record<string, unknown> = { ...node, children: node.children.map(shape) };
  delete content.source;
  return content;
};

const MISTAKES = '---\ntheme: dark\nrings: false\n---\n# Plan\n<!-- orbit colour: red -->\n## Build';

describe('orbit validate', () => {
  test('says OK with the size of a valid map', () => {
    expect(run(['validate', '-'], '# Plan\n## Research\n- Interviews\n## Build')).toEqual({
      code: 0,
      stdout: 'OK: 4 nodes, 3 levels, 0 warnings\n',
      stderr: '',
    });
  });

  test('lists every problem with its line and a suggested fix, then fails', () => {
    const { code, stdout, stderr } = run(['validate', '-'], MISTAKES);
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr.split('\n')).toEqual([
      '<stdin>:2: warning: Unknown theme "dark". Themes: paper, night, glass, glass-night, cosmos, blueprint, ink, contrast, flat, flat-night, material, material-night, liquid, liquid-night, auto. Did you mean "night"? [invalid-option-value]',
      '<stdin>:3: warning: Unknown frontmatter key "rings" (ignored). Did you mean "showRings"? [unknown-frontmatter-key]',
      '<stdin>:6: warning: Unknown attribute "colour", kept as a custom attribute. Did you mean "color"? [unknown-attribute]',
      'Not valid: fix the problems above (or pass --loose to accept the ones the map works around).',
      '',
    ]);
  });

  test('--loose accepts problems the map works around', () => {
    const { code, stdout } = run(['validate', '--loose', '-'], MISTAKES);
    expect(code).toBe(0);
    expect(stdout).toBe('OK: 2 nodes, 2 levels, 3 warnings\n');
  });

  test('--json prints a report an agent can read', () => {
    const { code, stdout } = run(['validate', '--json', '-'], MISTAKES);
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({ valid: false, flavor: 'markdown', root: 'Plan', nodes: 2, depth: 1 });
    expect(report.diagnostics.map((diagnostic: { code: string; line: number }) => [diagnostic.code, diagnostic.line])).toEqual([
      ['invalid-option-value', 2],
      ['unknown-frontmatter-key', 3],
      ['unknown-attribute', 6],
    ]);
    expect(JSON.parse(run(['validate', '--json', '-'], 'nodes:\n  - text: A').stdout)).toMatchObject({ valid: true, flavor: 'yaml', diagnostics: [] });
    expect(JSON.parse(run(['validate', '--json', 'missing.md']).stdout)).toMatchObject({ valid: false, error: expect.stringContaining('missing.md') });
  });

  test('--loose still fails on a map it can\'t read', () => {
    const { code, stderr } = run(['validate', '--loose', '-'], 'nodes:\n  - text: Root\n    children:\n      - text: A\n     - text: B\n');
    expect(code).toBe(1);
    expect(stderr).toContain('[invalid-yaml]');
    expect(stderr).toContain('--loose accepts only the problems the map works around');
  });

  test('--tree prints the map as Orbit reads it, with ids, as text or in the JSON', () => {
    const map = '# Launch\n## Research\nTo check:\n- Interviews\n## Build\n';
    expect(run(['validate', '--tree', '-'], map)).toEqual({
      code: 0,
      stdout: '- Launch  #launch\n  - Research  #research\n    - Interviews  #interviews\n  - Build  #build\nOK: 4 nodes, 3 levels, 0 warnings\n',
      stderr: '',
    });
    const report = JSON.parse(run(['validate', '--tree', '--json', '-'], map).stdout) as { tree: { id: string; children: { id: string }[] } };
    expect(report.tree.id).toBe('launch');
    expect(report.tree.children.map((child) => child.id)).toEqual(['research', 'build']);
  });

  test('reads .yaml and .yml files as YAML, whatever they start with', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orbit-validate-'));
    const file = join(directory, 'map.yaml');
    writeFileSync(file, 'root:\n  text: Launch\n');
    const { code, stderr } = run(['validate', file]);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown top-level key "root" (ignored). Did you mean "nodes"?');
    expect(JSON.parse(run(['validate', '--json', '--loose', file]).stdout).flavor).toBe('yaml');
    rmSync(directory, { recursive: true, force: true });
  });

  test('rejects unknown options', () => {
    expect(run(['validate', '--strict', '-'], '# A').code).toBe(2);
  });
});

describe('orbit example', () => {
  test('prints a map that uses every feature and has no problems', () => {
    const { code, stdout } = run(['example']);
    expect(code).toBe(0);
    expect(stdout).toBe(EXAMPLE_MAP);
    const doc = parseOrbit(stdout, { strict: true });
    expect(doc.diagnostics).toEqual([]);
    const nodes: string[] = [];

    const visit = (node: typeof doc.root) => {
      nodes.push(node.text);
      node.children.forEach(visit);
    };

    visit(doc.root);
    expect(nodes).toHaveLength(22);
  });

  test('--yaml prints the same map in the YAML flavor', () => {
    const { code, stdout } = run(['example', '--yaml']);
    expect(code).toBe(0);
    expect(stdout.startsWith('title: Product roadmap\n')).toBe(true);
    expect(shape(parseOrbit(stdout, { strict: true }).root)).toEqual(shape(parseOrbit(EXAMPLE_MAP).root));
  });
});

describe('orbit convert from other apps', () => {
  const fixtures = join(import.meta.dir, 'fixtures/other-apps');

  test('reads OPML, FreeMind and Freeplane into orbit-md', () => {
    const opml = run(['convert', '--to', 'md', join(fixtures, 'mindnode.opml')]);
    expect(opml).toEqual({ code: 0, stdout: '# Garden\nSpring planting plan\n\n## 🌱 Seeds\n- Tomatoes\n- Basil\n\n## Tools\n', stderr: '' });

    const freemind = run(['convert', '--to', 'yaml', join(fixtures, 'freemind.mm')]);
    expect(freemind.code).toBe(0);
    expect(parseOrbit(freemind.stdout).root.text).toBe('Product launch');
    expect(freemind.stderr).toContain('freemind.mm: warning: One link (“../specs/launch.mm”) to files on the computer the map was made on was left out. [local-links-not-kept]');
  });

  test('writes OPML, from a map or from another app\'s', () => {
    const { code, stdout } = run(['convert', '--to', 'opml', '-'], '# Plan\n## Research <!-- orbit status: done -->\n');
    expect(code).toBe(0);
    expect(stdout).toContain('<outline text="Research" _status="checked" _complete="true"/>');
    expect(run(['convert', '--to', 'opml', join(fixtures, 'freeplane.mm')]).stdout).toContain('<outline text="📖 Chapter 1"');
  });

  test('writes every sheet of a workbook, and its pictures in media/, with --out', () => {
    const folder = mkdtempSync(join(tmpdir(), 'orbit-convert-'));

    try {
      const workbook = join(folder, 'Garden.xmind');
      writeFileSync(workbook, makeZip([
        ...folderFiles(join(fixtures, 'xmind-2020')),
        { name: 'resources/3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b.png', data: ONE_PIXEL_PNG, stored: true },
      ]));
      const out = join(folder, 'out', 'garden.md');
      mkdirSync(join(folder, 'out'));
      const { code, stderr } = run(['convert', '--to', 'md', '--out', out, workbook]);
      expect(code).toBe(0);
      expect(stderr).toContain('(sheet 1, Garden plan): warning: One floating topic (“Compost?”)');
      expect(readFileSync(out, 'utf8')).toStartWith('# Garden plan\n![](media/3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b.png)');
      expect(readFileSync(join(folder, 'out', 'garden-2.md'), 'utf8')).toBe('# Shopping\n\n## Hose\nTwenty meters\n');
      expect([...readFileSync(join(folder, 'out', 'media', '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b.png'))]).toEqual([...ONE_PIXEL_PNG]);

      const toStdout = run(['convert', '--to', 'md', workbook]);
      expect(toStdout.stdout).toStartWith('# Garden plan');
      expect(toStdout.stderr).toContain('the workbook has 2 sheets: this is the first. Write them all with --out.');
      expect(toStdout.stderr).toContain('one picture inside the file was left out: write the map with --out to save them in media/ next to it.');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test('a file it can\'t read exits 1 and says why', () => {
    const folder = mkdtempSync(join(tmpdir(), 'orbit-convert-'));

    try {
      const broken = join(folder, 'broken.xmind');
      writeFileSync(broken, makeZip([{ name: 'map.md', data: '# Not XMind' }]));
      const { code, stderr } = run(['convert', '--to', 'md', broken]);
      expect(code).toBe(1);
      expect(stderr).toContain("broken.xmind: error: The file is a zip archive, but not an XMind workbook: it has no content.json or content.xml. [unreadable]");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('orbit convert', () => {
  const MAP = '# Plan\n\n## Research <!-- orbit status: done -->\n- Interviews #users\n\n## Build\n';

  test('turns markdown into YAML that reads back as the same map', () => {
    const { code, stdout, stderr } = run(['convert', '--to', 'yaml', '-'], MAP);
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(stdout.startsWith('nodes:\n')).toBe(true);
    expect(shape(parseOrbit(stdout, { strict: true }).root)).toEqual(shape(parseOrbit(MAP).root));
  });

  test('turns YAML into markdown, with -t for short', () => {
    const yaml = run(['convert', '--to', 'yaml', '-'], MAP).stdout;
    const { code, stdout } = run(['convert', '-t', 'md', '-'], yaml);
    expect(code).toBe(0);
    expect(stdout).toBe(MAP);
  });

  test('says what is missing or wrong, and exits 2', () => {
    for (const argumentsList of [['convert', '-'], ['convert', '--to', 'json', '-'], ['convert', '--to', 'yaml']]) {
      const { code, stderr } = run(argumentsList, MAP);
      expect(code).toBe(2);
      expect(stderr).toContain('expected --to <md|yaml|opml> <file|->');
    }
  });

  test('rejects unknown options instead of reading them as the file', () => {
    const { code, stderr } = run(['convert', '--to', 'yaml', '--jsoon', '-'], MAP);
    expect(code).toBe(2);
    expect(stderr).toContain('unknown option --jsoon');
  });

  test('reports problems on stderr and still converts, keeping what it doesn\'t read', () => {
    const { code, stdout, stderr } = run(['convert', '--to', 'md', '-'], '---\nthemee: night\n---\n# Plan\n');
    expect(code).toBe(0);
    expect(stdout).toBe('---\nthemee: night\n---\n\n# Plan\n');
    expect(stderr).toContain('unknown-frontmatter-key');
  });

  test('a file that is not there exits 1', () => {
    const { code, stderr } = run(['convert', '--to', 'yaml', 'no-such-map.md']);
    expect(code).toBe(1);
    expect(stderr.startsWith('error:')).toBe(true);
  });
});

describe('orbit render', () => {
  const MAP = '# Plan\n## Research\n- Interviews\n## Build\n';

  test('draws a standalone SVG, 1200 by 800 unless asked otherwise', () => {
    const { code, stdout } = run(['render', '-'], MAP);
    expect(code).toBe(0);
    expect(stdout.startsWith('<svg')).toBe(true);
    expect(stdout).toContain('width="1200" height="800"');
    const small = run(['render', '--width', '600', '--height', '400', '--theme', 'night', '--view', 'all', '-'], MAP).stdout;
    expect(small).toContain('width="600" height="400"');
    expect(small.toLowerCase()).toContain('#0b1120');
  });

  test('--focus centers a node, and --out writes a file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orbit-render-'));
    const out = join(directory, 'map.svg');
    const { code, stdout } = run(['render', '--focus', 'research', '--out', out, '-'], MAP);
    expect(code).toBe(0);
    expect(stdout).toBe('');
    const svg = readFileSync(out, 'utf8');
    expect(svg).toContain('Interviews');
    expect(svg).not.toContain('>Build<');
    rmSync(directory, { recursive: true, force: true });
  });

  test('says which themes and ids there are, with the one probably meant', () => {
    const theme = run(['render', '--theme', 'dark', '-'], MAP);
    expect(theme.code).toBe(2);
    expect(theme.stderr).toContain('unknown theme "dark". Themes: paper, night,');
    expect(theme.stderr).toContain('Did you mean "night"?');
    const focus = run(['render', '--focus', 'reserch', '-'], MAP);
    expect(focus.code).toBe(2);
    expect(focus.stderr).toContain('no node has the id "reserch". Did you mean "research"?');
  });

  test('links pictures on this computer from where the SVG goes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orbit-render-'));
    mkdirSync(join(directory, 'maps'));
    writeFileSync(join(directory, 'maps', 'trip.md'), '# Trip\n## Summit\n![The view](photos/summit.jpg)\n');
    const out = join(directory, 'pictures', 'trip.svg');
    mkdirSync(join(directory, 'pictures'));
    expect(run(['render', join(directory, 'maps', 'trip.md'), '--out', out]).code).toBe(0);
    const svg = readFileSync(out, 'utf8');
    expect(svg).toContain('href="../maps/photos/summit.jpg"');
    expect(svg).not.toContain('file:');
    rmSync(directory, { recursive: true, force: true });
  });

  test("rejects values it can't use, and exits 2", () => {
    for (const argumentsList of [
      ['render', '--width', '-5', '-'],
      ['render', '--width', 'Infinity', '-'],
      ['render', '--height', '2000000', '-'],
      ['render', '--theme', 'neon', '-'],
      ['render', '--view', 'side', '-'],
      ['render', '--out'],
      ['render', '--colour', 'red', '-'],
      ['render'],
    ]) {
      expect(run(argumentsList, MAP).code).toBe(2);
    }
  });
});

describe('orbit export', () => {
  const root = join(import.meta.dir, '..');

  beforeAll(async () => {
    // The command takes Orbit's web page script from the build, which the tests may run before.
    if (!existsSync(join(root, 'dist/web-page.js'))) {
      mkdirSync(join(root, 'dist'), { recursive: true });
      writeFileSync(join(root, 'dist/web-page.js'), await buildWebPageScript());
    }
  });

  /** The data a page carries for its script. */
  const pageData = (html: string): { source: string; media: Record<string, string>; theme?: string } => {
    const json = /<script type="application\/json" id="orbit-page">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}';
    return JSON.parse(json) as { source: string; media: Record<string, string>; theme?: string };
  };

  test('--html writes one page with Orbit, the map and the pictures beside it inside', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orbit-export-'));
    mkdirSync(join(directory, 'photos'));
    // A JPEG's first bytes, not a picture from the repository: those are in Git LFS, which the unit tests run without.
    const summit = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    writeFileSync(join(directory, 'photos/summit.jpg'), summit);
    const map = '# Trip\n## Summit\n![The view](photos/summit.jpg)\nWe made it. ![Again](photos/summit.jpg)\n## Lake\n![The lake](photos/lake.jpg)\n';
    writeFileSync(join(directory, 'trip.md'), map);
    const { code, stdout, stderr } = run(['export', '--html', join(directory, 'trip.md'), '--out', join(directory, 'trip.html'), '--theme', 'night']);
    expect([code, stdout]).toEqual([0, '']);
    // A picture that isn't there stays a link, and the command says so.
    expect(stderr).toContain('photos/lake.jpg isn\'t there, so the page links to it as written');
    const html = readFileSync(join(directory, 'trip.html'), 'utf8');
    const data = pageData(html);
    expect(data.source).toBe(map);
    expect(data.theme).toBe('night');
    expect(Object.keys(data.media)).toEqual(['photos/summit.jpg']);
    expect(data.media['photos/summit.jpg']).toBe(`data:image/jpeg;base64,${summit.toString('base64')}`);
    expect(html).toContain('<title>Trip</title>');
    expect(html).toContain('id="orbit-script"');
    rmSync(directory, { recursive: true, force: true });
  });

  test('reads from stdin and writes the page to stdout', () => {
    const { code, stdout } = run(['export', '--html', '--title', 'Our plan', '--language', 'es', '-'], '# Plan\n## Research\n');
    expect(code).toBe(0);
    expect(stdout).toStartWith('<!doctype html>\n<html lang="es">');
    expect(stdout).toContain('<title>Our plan</title>');
    expect(pageData(stdout).source).toBe('# Plan\n## Research\n');
  });

  test('needs --html, and checks the theme, view and focus as render does', () => {
    expect(run(['export', '-'], '# Plan').code).toBe(2);
    const theme = run(['export', '--html', '--theme', 'dark', '-'], '# Plan');
    expect([theme.code, theme.stderr]).toEqual([2, expect.stringContaining('Did you mean "night"?')]);
    expect(run(['export', '--html', '--view', 'side', '-'], '# Plan').code).toBe(2);
    expect(run(['export', '--html', '--focus', 'nowhere', '-'], '# Plan\n## Research').code).toBe(2);
  });
});

describe('orbit help', () => {
  test('points at the docs for people and coding agents', () => {
    const { code, stdout } = run(['help']);
    expect(code).toBe(0);
    expect(stdout).toContain('orbit validate [--json] [--loose] [--tree] <file|->');
    expect(stdout).toContain('llms-full.txt');
    expect(stdout).toContain('Exit codes: 0');
  });

  test('--help after a command shows it too', () => {
    for (const command of ['validate', 'render', 'convert', 'example']) {
      const { code, stdout } = run([command, '--help']);
      expect(code).toBe(0);
      expect(stdout).toContain('orbit render [options] <file|->');
    }
  });

  test('--version prints the package\'s version', () => {
    const { version } = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8')) as { version: string };
    expect(run(['--version'])).toEqual({ code: 0, stdout: `${version}\n`, stderr: '' });
  });
});
