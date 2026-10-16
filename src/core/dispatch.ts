import type { OrbitDocument, ParsedOrbitDocument } from './types.js';
import type { ParseOptions } from './parser-markdown.js';
import { parseOrbitMarkdown } from './parser-markdown.js';
import { parseOrbitYAML } from './parser-yaml.js';
import { parseYaml } from './yaml-mini.js';
import { DOCUMENT_OPTION_KEYS } from './document-options.js';
import { findFrontmatter, firstContentLineIndex, normalizeSource, sharedIndentation } from './source.js';
import { documentSource, encodingOf } from './document-source.js';

/**
 * Parses an orbit document in either flavor. Markdown is the default; a
 * document is read as YAML when its first line is a top-level YAML key
 * (`nodes:`, `title:`, `view:`, …), it has a top-level `nodes:` list, or its
 * frontmatter says `flavor: yaml`. A fenced ```orbit block is unwrapped first.
 *
 * Problems the parser can work around are listed in `diagnostics` (each with
 * a `code`, `line`, `severity` and a message that says how to fix it); pass
 * `{ strict: true }` to throw an `OrbitParseError` on the first one instead.
 *
 * @example
 * ```ts
 * import { parseOrbit } from '@restless-dreams/orbit';
 *
 * const { root, diagnostics } = parseOrbit('# Launch\n## Research <!-- orbit status: active -->');
 * for (const problem of diagnostics ?? []) console.warn(`line ${problem.line}: ${problem.message}`);
 * ```
 */
export const parseOrbit = (input: string, options: ParseOptions = {}): ParsedOrbitDocument => {
  const unfenced = stripOrbitFence(input);
  const source = normalizeSource(unfenced);
  const lines = source.split('\n');

  if (chooseFlavor(source, lines) === 'markdown') {
    const document = parseOrbitMarkdown(source, options);
    keepEncoding(document, input, unfenced);
    return document;
  }

  const frontmatter = findFrontmatter(lines);

  if (frontmatter) {
    // The frontmatter keys join the YAML document. Blanking the fences keeps
    // every line where it was, so diagnostics point at the right line.
    const yamlLines = [...lines];
    yamlLines[frontmatter.openIndex] = '';
    yamlLines[frontmatter.closeIndex] = '';
    return parseOrbitYAML(yamlLines.join('\n'), options);
  }

  return parseOrbitYAML(source, options);
};

/** The flavor `parseOrbit` reads a document as: `markdown` or `yaml`. */
export const orbitFlavor = (input: string): 'markdown' | 'yaml' => {
  const source = normalizeSource(stripOrbitFence(input));
  return chooseFlavor(source, source.split('\n'));
};

/**
 * YAML when the document is a YAML map of a map: its first line is
 * `nodes:`, or it reads as YAML with a `nodes:` list, or it starts with one
 * of the map's options and reads as YAML. Markdown with headings, lists or
 * paragraphs doesn't read as a YAML map, so a note that starts with
 * "nodes:" or "title:" never turns a markdown map into a YAML one.
 */
const chooseFlavor = (source: string, lines: string[]): 'markdown' | 'yaml' => {
  const frontmatter = findFrontmatter(lines);

  if (frontmatter) {
    return frontmatterFlavor(frontmatter.yaml) === 'yaml' ? 'yaml' : 'markdown';
  }

  const firstIndex = firstContentLineIndex(lines);

  if (firstIndex === -1) {
    return 'markdown';
  }

  const first = lines[firstIndex];

  // A plausible YAML `nodes` key: nothing after the colon (a list below), or
  // a flow value or comment. Prose like "nodes: the points of a graph" stays markdown.
  if (/^nodes\s*:\s*(?:$|[#[{])/.test(first)) {
    return 'yaml';
  }

  const startsWithOption = isOptionLine(first);

  if (!startsWithOption && !/^nodes\s*:/m.test(source)) {
    return 'markdown';
  }

  let value: unknown;

  try {
    value = parseYaml(source);
  } catch {
    // Not YAML at all: markdown, unless it starts like a YAML map with a mistake further down.
    return startsWithOption && /^nodes\s*:/m.test(source) ? 'yaml' : 'markdown';
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'markdown';
  }

  return Array.isArray((value as Record<string, unknown>).nodes) || startsWithOption ? 'yaml' : 'markdown';
};

/** A first line like `title: …` or `theme: …`: one of a map's options. */
const isOptionLine = (line: string): boolean => {
  const match = /^([A-Za-z][\w-]*)\s*:(\s|$)/.exec(line);
  return match !== null && DOCUMENT_OPTION_KEYS.has(match[1]);
};

/**
 * Notes how the text was written before it was normalized (line endings, a
 * byte-order mark, shared indentation, a ```` ```orbit ```` fence around
 * it), so saving writes it back the same way.
 */
const keepEncoding = (document: OrbitDocument, input: string, unfenced: string): void => {
  const source = documentSource(document);

  if (!source) {
    return;
  }

  const plain = (text: string) => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const fence = unfenced === input ? null : ORBIT_FENCE.exec(input);
  let before: string[] = [];
  let after: string[] = [];

  if (fence) {
    // The body starts on the line after the opening fence: indexOf can't be
    // trusted (an empty body, or one repeated in the fence's info string).
    const bodyStart = fence[1].length;
    before = plain(input.slice(0, bodyStart)).split('\n').slice(0, -1);
    const rest = plain(input.slice(bodyStart + fence[3].length));
    // A body of its own lines ends with a line break before the closing fence.
    after = rest.startsWith('\n') || rest === '' ? rest.split('\n').slice(1) : rest.split('\n');
  }

  source.encoding = { ...encodingOf(input), indentation: sharedIndentation(plain(unfenced)), before, after };
};

/**
 * A document wrapped in a ```` ```orbit ```` fence: the opening line, the
 * fence's kind, the body, then a closing fence of the same kind, indented or
 * not. The info string is `orbit`, alone or followed by display options after
 * a space (```` ```orbit height=480 ````), so ```` ```orbital ```` stays
 * markdown. The body ends before the closing line's break, `\r\n` included.
 */
const ORBIT_FENCE = /^(\s*(```|~~~)orbit(?:[^\S\n][^\n]*)?\n)([\s\S]*?)(?:\r?\n)?[^\S\n]*\2\s*$/;

const stripOrbitFence = (input: string): string => {
  const match = ORBIT_FENCE.exec(input);
  return match ? match[3] : input;
};

const frontmatterFlavor = (yaml: string): string | undefined => {
  try {
    const frontmatter = parseYaml(yaml) as Record<string, unknown> | null;
    return frontmatter && typeof frontmatter.flavor === 'string' ? frontmatter.flavor : undefined;
  } catch {
    return undefined;
  }
};
