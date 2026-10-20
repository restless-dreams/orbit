import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { orbitFlavor, parseOrbit } from '../src/core/dispatch';
import { OrbitParseError, type OrbitDiagnostic } from '../src/core/diagnostics';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { renderToSVGString, MAX_SVG_EXPORT_SIZE } from '../src/core/render-to-svg';
import { exportWebPage } from '../src/core/web-page/page';
import { isOrbitThemePreset, themeNames } from '../src/core/themes';
import { THEME_SYNONYMS } from '../src/core/document-options';
import { didYouMean } from '../src/core/suggest';
import { OrbitWords } from '../src/core/languages';
import type { OrbitDocument, OrbitNode, OrbitThemePreset, ParsedOrbitDocument } from '../src/core/types';
import { detectImportFormat, importMap } from '../src/core/other-apps/import';
import { OrbitImportError } from '../src/core/other-apps/ideas';
import { exportOPML } from '../src/core/other-apps/opml';
import type { OrbitImport } from '../src/core/other-apps/reading';
import { parseOrbitYAML } from '../src/core/parser-yaml';
import { EXAMPLE_MAP } from './example';

const USAGE = `orbit: check, render and convert Orbit mind maps

Usage:
  orbit validate [--json] [--loose] [--tree] <file|->
                                               Check a map and list every problem, with its line
  orbit render [options] <file|->              Render a map to a standalone SVG
  orbit export --html [options] <file|->       One web page with Orbit, the map and its pictures inside,
                                               to explore it or present it in any browser, offline
  orbit convert --to <md|yaml|opml> [--out <file>] <file|->
                                               Convert between the markdown and YAML flavors and OPML, and
                                               bring in maps from other apps: OPML, FreeMind and Freeplane
                                               (.mm) and XMind (.xmind)
  orbit example [--yaml]                       Print a map with the main features, to copy
  orbit help                                   Show this message (so does --help after any command)
  orbit --version                              Print the version of Orbit

Validate options:
  --json                Print the result as JSON: valid, flavor, root, nodes, depth (the
                        levels below the root) and diagnostics
  --loose               Exit 0 even when there are problems the map can work around
  --tree                Print the map as Orbit reads it, a node a line with its #id
                        (with --json, as "tree"), to see what became a node and find ids

Render options:
  --out <file>          Write the SVG to a file instead of stdout
  --width <px>          Width of the drawing (default 1200)
  --height <px>         Height of the drawing (default 800)
  --theme <name>        paper, night, glass, glass-night, cosmos, blueprint, ink, contrast,
                        flat, flat-night, material, material-night, liquid, liquid-night,
                        or auto, which draws paper: a picture can't follow the reader's
                        light or dark mode (default: the document's, or paper)
  --view <focus|all>    focus draws the map as it opens, where only the node at the center
                        and its children have labels; all draws the whole map (default:
                        the document's, or focus)
  --focus <node-id>     The node at the center in focus mode (default: the root)
  --language <tag>      The language of the drawing's few words, such as an untitled
                        map's name: en or es (default: en)

Export options:
  --out <file>          Write the page to a file instead of stdout
  --title <text>        The page's title (default: the map's title, or its root's text)
  --theme, --view, --focus, --language
                        As for render; the page follows the reader's light or dark mode
                        with --theme auto, and speaks the language's words

Convert options:
  --to <md|yaml|opml>   The flavor or format to write
  --out <file>          Write to a file instead of stdout. An XMind workbook's pictures go
                        in media/ next to it, and its other sheets in <file>-2, -3 and on

Use "-" as the file to read from stdin. Output goes to stdout; problems go
to stderr as file:line: severity: message [code].

Exit codes: 0 when it worked (for validate, when the map is valid), 1 when the
map has problems or can't be read, and 2 for a mistake in the command itself.

The whole format and API, for people and coding agents: llms-full.txt in this
package, or https://cdn.jsdelivr.net/npm/@restless-dreams/orbit/llms-full.txt
`;

/** This package's version, from its package.json: beside the built command's folder, or the source's. */
const packageVersion = (): string => {
  for (const path of ['../package.json', '../../package.json']) {
    try {
      const manifest = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { name?: string; version?: string };

      if (manifest.name === '@restless-dreams/orbit' && manifest.version) {
        return manifest.version;
      }
    } catch {
      // Not in this folder: the command runs from the other one.
    }
  }

  return 'unknown';
};

/** Whether a file is YAML by its name, whatever its first lines look like. */
const isYamlFile = (file: string): boolean => {
  return /\.ya?ml$/i.test(file);
};

/** A map from a file: YAML for .yaml and .yml files, otherwise the flavor its first lines say. */
const parseFile = (file: string, source: string, options: { strict?: boolean; untitled?: string } = {}): ParsedOrbitDocument => {
  return isYamlFile(file) ? parseOrbitYAML(source, options) : parseOrbit(source, options);
};

const readInput = (path: string): string => {
  return readFileSync(path === '-' ? 0 : path, 'utf8');
};

export const runCli = (argv: string[]): number => {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help' || command === '-h' || command === '--help' || rest.includes('--help') || rest.includes('-h')) {
    process.stdout.write(USAGE);
    return command === undefined ? 2 : 0;
  }

  if (command === '--version' || command === '-v' || command === 'version') {
    process.stdout.write(`${packageVersion()}\n`);
    return 0;
  }

  try {
    if (command === 'convert') {
      return convertCommand(rest.map((argument) => (argument === '-t' ? '--to' : argument)));
    }

    if (command === 'example') {
      const yaml = rest.includes('--yaml');

      if (rest.some((argument) => argument !== '--yaml')) {
        process.stderr.write(`orbit example: the only option is --yaml\n${USAGE}`);
        return 2;
      }

      process.stdout.write(yaml ? serializeOrbitYAML(parseOrbit(EXAMPLE_MAP)) : EXAMPLE_MAP);
      return 0;
    }

    if (command === 'export') {
      return exportCommand(rest);
    }

    if (command === 'render') {
      return renderCommand(rest);
    }

    if (command === 'validate') {
      return validateCommand(rest);
    }

    process.stderr.write(`orbit: unknown command "${command}"\n${USAGE}`);
    return 2;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
};

/** A command's `--name value` options among `names`, and its one file; or the exit code for a mistake in them. */
const readOptions = (command: string, argumentsList: string[], names: string[]): { values: Record<string, string>; file: string } | number => {
  const values: Record<string, string> = {};
  let file = '';

  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];
    const name = argument.startsWith('--') ? argument.slice(2) : '';

    if (names.includes(name)) {
      const value = argumentsList[++index];

      if (value === undefined) {
        process.stderr.write(`orbit ${command}: ${argument} needs a value\n`);
        return 2;
      }

      values[name] = value;
    } else if (argument === '-' || !argument.startsWith('--')) {
      file = argument;
    } else {
      process.stderr.write(`orbit ${command}: unknown option ${argument}\n${USAGE}`);
      return 2;
    }
  }

  if (!file) {
    process.stderr.write(`orbit ${command}: missing <file>\n${USAGE}`);
    return 2;
  }

  return { values, file };
};

/** The exit code for a --theme or --view that isn't one, or null when they're fine. */
const checkLook = (command: string, values: Record<string, string>): number | null => {
  if (values.theme !== undefined && !isOrbitThemePreset(values.theme)) {
    process.stderr.write(`orbit ${command}: unknown theme "${values.theme}". Themes: ${themeNames().join(', ')}.${didYouMean(values.theme, themeNames(), THEME_SYNONYMS)}\n`);
    return 2;
  }

  if (values.view !== undefined && values.view !== 'focus' && values.view !== 'all') {
    process.stderr.write(`orbit ${command}: --view must be focus or all\n`);
    return 2;
  }

  return null;
};

/** The exit code for a --focus no node of the map has, or null when it's fine. */
const checkFocus = (command: string, values: Record<string, string>, doc: ParsedOrbitDocument): number | null => {
  if (values.focus !== undefined) {
    const ids = nodeIds(doc.root);

    if (!ids.includes(values.focus)) {
      process.stderr.write(`orbit ${command}: no node has the id "${values.focus}".${didYouMean(values.focus, ids)} Ids come from the nodes' text: "Q3 plan" is q3-plan.\n`);
      return 2;
    }
  }

  return null;
};

/** A map in the flavor or format `--to` names: md, yaml or opml. */
const writeAs = (to: string, doc: OrbitDocument): string => {
  if (to === 'opml') {
    return exportOPML(doc);
  }

  return /^(md|markdown)$/.test(to) ? serializeOrbitMarkdown(doc, { keepSource: false }) : serializeOrbitYAML(doc);
};

const convertCommand = (argumentsList: string[]): number => {
  const values: Record<string, string> = {};
  let file = '';

  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];

    if (argument === '--to' || argument === '--out') {
      values[argument.slice(2)] = argumentsList[++index] ?? '';
    } else if (argument.startsWith('-') && argument !== '-') {
      process.stderr.write(`orbit convert: unknown option ${argument}\n${USAGE}`);
      return 2;
    } else {
      file = argument;
    }
  }

  const to = values.to ?? '';

  if (!file || !/^(md|markdown|yaml|yml|opml)$/.test(to)) {
    process.stderr.write(`orbit convert: expected --to <md|yaml|opml> <file|->\n${USAGE}`);
    return 2;
  }

  const bytes = new Uint8Array(readFileSync(file === '-' ? 0 : file));
  const format = detectImportFormat(bytes, file === '-' ? undefined : basename(file));
  const name = file === '-' ? '<stdin>' : file;

  if (format === null) {
    const doc = parseFile(file, new TextDecoder().decode(bytes));
    printDiagnostics(file, doc.diagnostics ?? []);
    writeOutput(values.out, writeAs(to, doc));
    return 0;
  }

  let imported: OrbitImport;

  try {
    imported = importMap(bytes, { name: file === '-' ? undefined : basename(file), format });
  } catch (error) {
    if (error instanceof OrbitImportError) {
      process.stderr.write(`${name}: error: ${error.message} [${error.code}]\n`);
      return 1;
    }

    throw error;
  }

  const { maps } = imported;

  maps.forEach((map, index) => {
    const sheet = maps.length > 1 ? ` (sheet ${index + 1}, ${map.document.root.text || 'untitled'})` : '';

    for (const warning of map.warnings) {
      process.stderr.write(`${name}${sheet}: warning: ${warning.message} [${warning.code}]\n`);
    }
  });

  if (!values.out) {
    const pictures = maps.reduce((count, map) => count + Object.keys(map.media).length, 0);

    if (maps.length > 1) {
      process.stderr.write(`${name}: the workbook has ${maps.length} sheets: this is the first. Write them all with --out.\n`);
    }

    if (pictures > 0) {
      process.stderr.write(`${name}: ${pictures === 1 ? 'one picture' : `${pictures} pictures`} inside the file ${pictures === 1 ? 'was' : 'were'} left out: write the map with --out to save them in media/ next to it.\n`);
    }

    process.stdout.write(writeAs(to, maps[0].document));
    return 0;
  }

  const folder = dirname(values.out);
  const extension = extname(values.out);
  const stem = values.out.slice(0, values.out.length - extension.length);

  maps.forEach((map, index) => {
    // Every sheet's pictures share the one media folder: names that clash take the sheet's number.
    const renamed = new Map<string, string>();

    for (const [path, data] of Object.entries(map.media)) {
      let target = path;

      for (let suffix = 2; existsSync(join(folder, target)) && !sameBytes(join(folder, target), data); suffix++) {
        target = path.replace(/(\.[^.]+)$/, `-${index + 1}-${suffix}$1`);
      }

      mkdirSync(dirname(join(folder, target)), { recursive: true });
      writeFileSync(join(folder, target), data);
      renamed.set(path, target);
    }

    const out = index === 0 ? values.out as string : `${stem}-${index + 1}${extension}`;
    let text = writeAs(to, map.document);

    for (const [from, target] of renamed) {
      if (from !== target) {
        text = text.split(from).join(target);
      }
    }

    writeFileSync(out, text);
  });

  return 0;
};

/** Whether a file holds exactly these bytes. */
const sameBytes = (path: string, data: Uint8Array): boolean => {
  return Buffer.from(readFileSync(path)).equals(Buffer.from(data));
};

/** Writes text to a file, or to stdout without one. */
const writeOutput = (out: string | undefined, text: string): void => {
  if (out) {
    writeFileSync(out, text);
  } else {
    process.stdout.write(text);
  }
};

const renderCommand = (argumentsList: string[]): number => {
  const read = readOptions('render', argumentsList, ['out', 'width', 'height', 'theme', 'view', 'focus', 'language']);

  if (typeof read === 'number') {
    return read;
  }

  const { values, file } = read;
  const width = values.width === undefined ? 1200 : Number(values.width);
  const height = values.height === undefined ? 800 : Number(values.height);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > MAX_SVG_EXPORT_SIZE || height > MAX_SVG_EXPORT_SIZE) {
    process.stderr.write(`orbit render: --width and --height must be positive numbers no larger than ${MAX_SVG_EXPORT_SIZE}\n`);
    return 2;
  }

  const look = checkLook('render', values);

  if (look !== null) {
    return look;
  }

  const words = new OrbitWords(values.language);
  const doc = parseFile(file, readInput(file), { untitled: words.text('untitledMap') });
  printDiagnostics(file, doc.diagnostics);
  const focus = checkFocus('render', values, doc);

  if (focus !== null) {
    return focus;
  }

  const svg = renderToSVGString(doc, {
    width,
    height,
    language: values.language,
    theme: values.theme as OrbitThemePreset | undefined,
    viewMode: values.view as 'focus' | 'all' | undefined,
    focus: values.focus,
    // Relative images are next to the map file, unless the document says otherwise.
    baseUrl: baseUrlFor(doc.options.baseUrl, file),
  });
  // Pictures on this computer are linked from where the SVG goes, so it can move with them.
  const portable = relativeFileLinks(svg, values.out ? resolve(dirname(values.out)) : process.cwd());

  if (values.out) {
    writeFileSync(values.out, portable + '\n');
  } else {
    process.stdout.write(portable + '\n');
  }

  return 0;
};

const exportCommand = (argumentsList: string[]): number => {
  if (!argumentsList.includes('--html')) {
    process.stderr.write(`orbit export: say what to export the map as: --html, one web page with the map inside\n${USAGE}`);
    return 2;
  }

  const read = readOptions('export', argumentsList.filter((argument) => argument !== '--html'), ['out', 'title', 'theme', 'view', 'focus', 'language']);

  if (typeof read === 'number') {
    return read;
  }

  const { values, file } = read;
  const look = checkLook('export', values);

  if (look !== null) {
    return look;
  }

  const words = new OrbitWords(values.language);
  const source = readInput(file);
  const doc = parseFile(file, source, { untitled: words.text('untitledMap') });
  printDiagnostics(file, doc.diagnostics);
  const focus = checkFocus('export', values, doc);

  if (focus !== null) {
    return focus;
  }

  const script = webPageScript();

  if (script === null) {
    process.stderr.write("orbit export: Orbit's web page script (dist/web-page.js) is missing: build Orbit first (bun run build)\n");
    return 1;
  }

  const html = exportWebPage(isYamlFile(file) ? doc : source, {
    script,
    title: values.title,
    theme: values.theme,
    viewMode: values.view as 'focus' | 'all' | undefined,
    focus: values.focus,
    language: values.language,
    media: localPictures(doc, file),
  });

  if (values.out) {
    writeFileSync(values.out, html);
  } else {
    process.stdout.write(html);
  }

  return 0;
};

/** Orbit's web page script: beside the built command's folder, or in the build beside the source's. */
const webPageScript = (): string | null => {
  for (const path of ['../web-page.js', '../dist/web-page.js']) {
    try {
      return readFileSync(new URL(path, import.meta.url), 'utf8');
    } catch {
      // Not in this folder: the command runs from the other one.
    }
  }

  return null;
};

/** The types of pictures a web page can take inside it, by extension. */
const PICTURE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

/**
 * The pictures on this computer that the map shows (its nodes' pictures,
 * videos' thumbnails and pictures in notes), as data URLs by the address the
 * map gives them, to go inside the page. Pictures on the web stay links.
 */
const localPictures = (doc: ParsedOrbitDocument, file: string): Record<string, string> => {
  const base = baseUrlFor(doc.options.baseUrl, file) ?? pathToFileURL(`${process.cwd()}/`).href;
  const addresses = new Set<string>();

  const visit = (node: OrbitNode) => {
    if (node.image?.src) {
      addresses.add(node.image.src);
    }

    if (node.video?.thumbnail) {
      addresses.add(node.video.thumbnail);
    }

    if (node.note && node.noteFormat !== 'plain') {
      for (const match of node.note.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
        addresses.add(match[1]);
      }
    }

    node.children.forEach(visit);
  };

  visit(doc.root);
  const media: Record<string, string> = {};

  for (const address of addresses) {
    let url: URL;

    try {
      url = new URL(address, base);
    } catch {
      continue;
    }

    const type = PICTURE_TYPES[extname(url.pathname).toLowerCase()];

    if (url.protocol !== 'file:' || type === undefined) {
      continue;
    }

    try {
      media[address] = `data:${type};base64,${readFileSync(url).toString('base64')}`;
    } catch {
      process.stderr.write(`${file}: ${address} isn't there, so the page links to it as written\n`);
    }
  }

  return media;
};

/** Every node's id, in document order. */
const nodeIds = (node: OrbitNode): string[] => {
  return [node.id, ...node.children.flatMap(nodeIds)];
};

/** The SVG with each link to a file on this computer written as a path from `folder`, where the SVG is going. */
const relativeFileLinks = (svg: string, folder: string): string => {
  return svg.replace(/(href=")(file:\/\/[^"]+)(")/g, (_match, start: string, address: string, end: string) => {
    const path = relative(folder, fileURLToPath(address.replace(/&amp;/g, '&')));
    const link = path.split(sep).map(encodeURIComponent).join('/') || '.';
    return `${start}${link.replace(/&/g, '&amp;')}${end}`;
  });
};

/**
 * Where the map's relative media live: the document's baseUrl, or the map
 * file's own directory. A relative baseUrl sits next to the map file (or the
 * working directory, for a map read from stdin); one starting with `//` is on
 * the web, so it's read over https, as a browser would.
 */
const baseUrlFor = (documentBaseUrl: string | undefined, file: string): string | undefined => {
  const directory = file === '-' ? pathToFileURL(`${process.cwd()}/`) : pathToFileURL(`${resolve(dirname(file))}/`);

  if (documentBaseUrl === undefined) {
    return file === '-' ? undefined : directory.href;
  }

  try {
    return new URL(documentBaseUrl.startsWith('//') ? `https:${documentBaseUrl}` : documentBaseUrl, directory).href;
  } catch {
    throw new Error(`baseUrl "${documentBaseUrl}" is not an address`);
  }
};

/** What `orbit validate --json` prints. */
interface ValidationReport {
  valid: boolean;
  flavor: 'markdown' | 'yaml';
  root: string;
  nodes: number;
  depth: number;
  diagnostics: OrbitDiagnostic[];

  /** With --tree: the map as Orbit reads it. */
  tree?: TreeNode;
}

/** A node as --tree shows it: its id, its text and its children. */
interface TreeNode {
  id: string;
  text: string;
  children: TreeNode[];
}

const treeOf = (node: OrbitNode): TreeNode => {
  return { id: node.id, text: node.text, children: node.children.map(treeOf) };
};

/** The tree as lines: each node's text and #id, indented under its parent. */
const treeLines = (node: TreeNode, depth = 0): string[] => {
  return [`${'  '.repeat(depth)}- ${node.text}  #${node.id}`, ...node.children.flatMap((child) => treeLines(child, depth + 1))];
};

const validateCommand = (argumentsList: string[]): number => {
  const json = argumentsList.includes('--json');
  const tree = argumentsList.includes('--tree');
  const loose = argumentsList.includes('--loose');
  const unknown = argumentsList.find((argument) => argument.startsWith('--') && argument !== '--json' && argument !== '--loose' && argument !== '--tree');
  const files = argumentsList.filter((argument) => argument === '-' || !argument.startsWith('--'));

  if (unknown || files.length !== 1) {
    process.stderr.write(`orbit validate: ${unknown ? `unknown option ${unknown}` : 'expected one <file|->'}\n${USAGE}`);
    return 2;
  }

  const [file] = files;
  let source: string;

  try {
    source = readInput(file);
  } catch (error) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ valid: false, error: (error as Error).message }, null, 2)}\n`);
      return 1;
    }

    throw error;
  }

  // Every problem at once, so they can all be fixed in one pass; strict mode
  // decides whether the map is valid.
  const doc = parseFile(file, source);
  let failure: OrbitParseError | null = null;

  if (!loose) {
    try {
      parseFile(file, source, { strict: true });
    } catch (error) {
      if (!(error instanceof OrbitParseError)) {
        throw error;
      }

      failure = error;
    }
  }

  // --loose accepts what the map works around, never what it can't read.
  const unreadable = (doc.diagnostics ?? []).some((diagnostic) => diagnostic.severity === 'error');
  const report: ValidationReport = {
    valid: failure === null && !unreadable,
    flavor: isYamlFile(file) ? 'yaml' : orbitFlavor(source),
    root: doc.root.text,
    nodes: countNodes(doc.root),
    depth: depthOf(doc.root),
    diagnostics: doc.diagnostics,
    ...(tree ? { tree: treeOf(doc.root) } : {}),
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.valid ? 0 : 1;
  }

  if (report.tree) {
    process.stdout.write(`${treeLines(report.tree).join('\n')}\n`);
  }

  printDiagnostics(file, report.diagnostics);

  if (!report.valid) {
    process.stderr.write(loose
      ? `Not valid: fix the errors above (--loose accepts only the problems the map works around).\n`
      : `Not valid: fix the problems above (or pass --loose to accept the ones the map works around).\n`);
    return 1;
  }

  const warnings = report.diagnostics.length;
  process.stdout.write(`OK: ${plural(report.nodes, 'node')}, ${plural(report.depth + 1, 'level')}, ${plural(warnings, 'warning')}\n`);
  return 0;
};

/** Problems as file:line: severity: message [code], the form editors and agents read. */
const printDiagnostics = (file: string, diagnostics: OrbitDiagnostic[]): void => {
  const name = file === '-' ? '<stdin>' : file;

  for (const diagnostic of diagnostics) {
    const place = diagnostic.line === undefined ? name : `${name}:${diagnostic.line}`;
    process.stderr.write(`${place}: ${diagnostic.severity}: ${diagnostic.message} [${diagnostic.code}]\n`);
  }
};

const plural = (count: number, word: string): string => {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
};

const countNodes = (node: OrbitNode): number => {
  return node.children.reduce((count, child) => count + countNodes(child), 1);
};

/** Levels below the root: 0 for a root alone. */
const depthOf = (node: OrbitNode): number => {
  return node.children.reduce((deepest, child) => Math.max(deepest, depthOf(child) + 1), 0);
};

// Run only when invoked as the orbit executable (not when imported by tests).
if (typeof process !== 'undefined' && process.argv[1] && /^orbit(\.[cm]?[jt]s)?$/.test(basename(process.argv[1]))) {
  process.exitCode = runCli(process.argv.slice(2));
}
