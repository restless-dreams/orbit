/**
 * Tiny YAML subset parser + emitter for Orbit, with no dependencies.
 * Reads what maps and the frontmatter of other apps (Obsidian, static site
 * generators) write: maps, block lists (indented under their key or not),
 * flow lists and maps (`[a, b]`, `{name: Ana}`), strings, numbers,
 * booleans and null, block scalars (`|` literal, `>` folded), plain and
 * quoted strings over several lines, comments, anchors, aliases and merge
 * keys (`&base`, `*base`, `<<: *base`). Not read: tags (`!!str`) and
 * complex keys (`? key`).
 *
 * One leniency on purpose: a value that starts with `#` is text, not a
 * comment, so `color: #FF6B6B` reads as the color people mean.
 */

export class YamlMiniError extends Error {
  /** 1-based line of the problem in the text given to the parser. */
  line: number;

  /** The problem, without where it is. */
  reason: string;

  constructor(reason: string, line: number) {
    super(`${reason} at line ${line}`);
    this.name = 'YamlMiniError';
    this.line = line;
    this.reason = reason;
  }
}

export type YamlValue = string | number | boolean | null | YamlValue[] | { [k: string]: YamlValue };

/** Values named with `&name` while a document is read, for `*name` to repeat. */
let anchors = new Map<string, YamlValue>();

/** Where each key of a block map was written: 1-based lines of the text given to the parser. */
const keyLines = new WeakMap<object, Map<string, number>>();
/** Where each item of a block list starts. */
const itemLines = new WeakMap<object, number[]>();

const noteKeyLine = (map: object, key: string, line: number): void => {
  let lines = keyLines.get(map);

  if (!lines) {
    lines = new Map();
    keyLines.set(map, lines);
  }

  lines.set(key, line);
};

/**
 * The line `key` was written on in a map the last `parseYaml` read, or the
 * map's first key's line without one: for problems that point at a node of
 * a YAML document. Flow maps (`{ … }`) have none.
 */
export const yamlLineOf = (map: object, key?: string): number | undefined => {
  const lines = keyLines.get(map);

  if (!lines) {
    return undefined;
  }

  return key === undefined ? lines.values().next().value : lines.get(key);
};

/** The line item `index` of a block list starts on. */
export const yamlItemLine = (list: object, index: number): number | undefined => {
  return itemLines.get(list)?.[index];
};

export const parseYaml = (input: string): YamlValue => {
  const lines = normalizeInput(input);
  const previous = anchors;
  anchors = new Map();

  try {
    const [value] = parseBlock(lines, 0, 0);
    return value;
  } finally {
    anchors = previous;
  }
};

/** Lines, without a document's `---` start and `...` end markers. */
const normalizeInput = (input: string): string[] => {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));

  if (first !== -1 && /^---\s*$/.test(lines[first])) {
    lines[first] = '';
  }

  let last = lines.length - 1;

  while (last >= 0 && lines[last].trim() === '') {
    last--;
  }

  if (last !== -1 && /^\.\.\.\s*$/.test(lines[last])) {
    lines[last] = '';
  }

  return lines;
};

const parseBlock = (lines: string[], start: number, indent: number): [YamlValue, number] => {
  // Detect: is this block a list (lines start with `- `) or a map?
  const firstContent = nextContentLine(lines, start);

  if (firstContent !== -1) {
    const raw = lines[firstContent];
    const lineIndent = leadingSpaces(raw);

    if (lineIndent === indent && isListItem(raw, indent)) {
      return parseList(lines, start, indent);
    }
  }

  return parseMap(lines, start, indent);
};

/** Whether the line is a list item at `indent`: `- value`, or a lone `-`. */
const isListItem = (raw: string, indent: number): boolean => {
  return raw.slice(indent, indent + 2) === '- ' || raw.slice(indent).trimEnd() === '-';
};

/** A key as written: unquoted, when it's quoted. */
const readKey = (key: string, line: number): string => {
  return key.startsWith('"') || key.startsWith("'") ? String(parseScalar(key, line)) : key;
};

/**
 * Sets `obj[key]`, even when `key` is `__proto__`: a plain assignment would
 * then change the object's prototype and lose the key, so it becomes an own
 * enumerable data property.
 */
export const assignKey = (obj: Record<string, unknown>, key: string, value: unknown): void => {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    obj[key] = value;
  }
};

const parseMap = (lines: string[], start: number, indent: number): [Record<string, YamlValue>, number] => {
  const obj: Record<string, YamlValue> = {};
  const merged: YamlValue[] = [];
  let i = start;

  while (i < lines.length) {
    const raw = lines[i];

    if (raw.trim() === '' || raw.trimStart().startsWith('#')) {
      i++;
      continue;
    }

    const lineIndent = leadingSpaces(raw);

    if (lineIndent < indent) {
      break;
    }

    if (lineIndent > indent) {
      throw new YamlMiniError('Unexpected indentation', i + 1);
    }

    // A list item here belongs to the key above it (`tags:` then `- a`), which has read it already.
    if (isListItem(raw, indent)) {
      throw new YamlMiniError('Expected "key: value"', i + 1);
    }

    const content = raw.slice(indent);
    const colonIdx = findUnquotedColon(content);

    if (colonIdx < 0) {
      throw new YamlMiniError('Expected "key: value"', i + 1);
    }

    const key = readKey(content.slice(0, colonIdx).trim(), i + 1);
    const rest = content.slice(colonIdx + 1).trim();

    const { value, nextIndex } = parseValueForKey(rest, lines, i, indent);

    if (key === '<<') {
      merged.push(value);
    } else {
      assignKey(obj, key, value);
      noteKeyLine(obj, key, i + 1);
    }

    i = nextIndex;
  }

  // `<<: *base` adds the keys of `base` this map doesn't set itself (its own
  // keys only: `in` would also see `constructor` and `toString` on every object).
  for (const source of merged.flatMap((value) => (Array.isArray(value) ? value : [value]))) {
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      for (const [key, value] of Object.entries(source)) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) {
          assignKey(obj, key, value);
        }
      }
    }
  }

  return [obj, i];
};

const parseList = (lines: string[], start: number, indent: number): [YamlValue[], number] => {
  const list: YamlValue[] = [];
  const starts: number[] = [];
  itemLines.set(list, starts);
  let i = start;

  while (i < lines.length) {
    const raw = lines[i];

    if (raw.trim() === '' || raw.trimStart().startsWith('#')) {
      i++;
      continue;
    }

    const lineIndent = leadingSpaces(raw);

    if (lineIndent < indent) {
      break;
    }

    if (lineIndent > indent || !isListItem(raw, indent)) {
      break;
    }

    const itemContent = raw.slice(indent + 2);
    const colonIdx = findUnquotedColon(itemContent);
    const startsValue = /^[&*"'[{|>]/.test(itemContent.trim());
    starts.push(i + 1);

    if (colonIdx >= 0 && !startsValue) {
      const itemMap: Record<string, YamlValue> = {};
      const key = readKey(itemContent.slice(0, colonIdx).trim(), i + 1);
      const rest = itemContent.slice(colonIdx + 1).trim();
      const { value: firstVal, nextIndex: firstNext } = parseValueForKey(rest, lines, i, indent + 2);
      assignKey(itemMap, key, firstVal);
      noteKeyLine(itemMap, key, i + 1);
      i = firstNext;

      while (i < lines.length) {
        const r2 = lines[i];

        if (r2.trim() === '' || r2.trimStart().startsWith('#')) {
          i++;
          continue;
        }

        const ind2 = leadingSpaces(r2);

        if (ind2 !== indent + 2) {
          break;
        }

        const c2 = r2.slice(indent + 2);

        if (isListItem(c2, 0)) {
          break;
        } // next list item, not a continuation key

        const k2idx = findUnquotedColon(c2);

        if (k2idx < 0) {
          throw new YamlMiniError('Expected "key: value"', i + 1);
        }

        const key2 = readKey(c2.slice(0, k2idx).trim(), i + 1);
        const rest2 = c2.slice(k2idx + 1).trim();
        const { value: contVal, nextIndex: contNext } = parseValueForKey(rest2, lines, i, indent + 2);
        assignKey(itemMap, key2, contVal);
        noteKeyLine(itemMap, key2, i + 1);
        i = contNext;
      }

      list.push(itemMap);
    } else {
      // A scalar, flow value, anchor, alias or block scalar item.
      const { value, nextIndex } = parseValueForKey(itemContent.trim(), lines, i, indent);
      list.push(value);
      i = nextIndex;
    }
  }

  return [list, i];
};

/** A value with its trailing comment taken off: ` # …` outside quotes and brackets, but not at the start. */
const stripComment = (text: string): string => {
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quote) {
      if (c === '\\' && quote === '"') {
        i++;
      } else if (c === quote) {
        if (quote === "'" && text[i + 1] === "'") {
          i++;
        } else {
          quote = null;
        }
      }

      continue;
    }

    // A quote only opens a quoted value at its start or inside a flow value: "it's" is plain text.
    if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:]/.test(text[i - 1]))) {
      quote = c;
    } else if (c === '#' && i > 0 && /\s/.test(text[i - 1])) {
      return text.slice(0, i).trimEnd();
    }
  }

  return text;
};

const parseValueForKey = (
  written: string,
  lines: string[],
  i: number,
  parentIndent: number,
): { value: YamlValue; nextIndex: number } => {
  let rest = stripComment(written);
  // `&name value`: remembered for `*name`.
  const anchor = /^&([^\s,[\]{}]+)\s*/.exec(rest);

  if (anchor) {
    rest = rest.slice(anchor[0].length);
    const parsed = parseValueForKey(rest, lines, i, parentIndent);
    anchors.set(anchor[1], parsed.value);
    return parsed;
  }

  const alias = /^\*([^\s,[\]{}]+)$/.exec(rest);

  if (alias) {
    return { value: aliasValue(alias[1], i + 1), nextIndex: i + 1 };
  }

  if (rest === '|' || rest === '>' || /^[|>][-+]?\d?$/.test(rest)) {
    const fold = rest.startsWith('>');
    // Inside a block scalar there are no YAML comments: a first line like
    // "### heading" is content and must anchor the child indent.
    const childIndent = detectChildIndent(lines, i + 1, parentIndent, false);

    if (childIndent === null) {
      return { value: '', nextIndex: i + 1 };
    }

    const collected: string[] = [];
    let j = i + 1;

    while (j < lines.length) {
      const r = lines[j];

      if (r.trim() === '') {
        collected.push('');
        j++;
        continue;
      }

      const ind = leadingSpaces(r);

      if (ind < childIndent) {
        break;
      }

      collected.push(r.slice(childIndent));
      j++;
    }

    while (collected.length && collected[collected.length - 1] === '') {
      collected.pop();
    }

    if (fold) {
      return { value: foldLines(collected), nextIndex: j };
    }

    return { value: collected.join('\n'), nextIndex: j };
  }

  if (rest === '') {
    // A list right under its key, at the key's own indentation: `tags:` then `- a`.
    const next = nextContentLine(lines, i + 1);

    if (next !== -1 && leadingSpaces(lines[next]) === parentIndent && isListItem(lines[next], parentIndent)) {
      const [val, nextIndex] = parseList(lines, i + 1, parentIndent);
      return { value: val, nextIndex };
    }

    const childIndent = detectChildIndent(lines, i + 1, parentIndent);

    if (childIndent === null) {
      return { value: null, nextIndex: i + 1 };
    }

    const [val, nextLine] = parseBlock(lines, i + 1, childIndent);
    return { value: val, nextIndex: nextLine };
  }

  // A quoted string, or a flow list or map, may go on over the next lines.
  const opening = rest[0];

  if ((opening === '"' || opening === "'" || opening === '[' || opening === '{') && !closes(rest)) {
    let joined = rest;
    let j = i + 1;

    while (j < lines.length && !closes(joined)) {
      const line = lines[j].trim();
      joined += opening === '"' || opening === "'" ? (line === '' ? '\n' : ` ${line}`) : ` ${line}`;
      j++;
    }

    return { value: parseScalar(stripComment(joined.replace(/ \n /g, '\n')), i + 1), nextIndex: j };
  }

  // A plain value may go on over lines indented under its key.
  const continuation: string[] = [];
  let j = i + 1;

  while (j < lines.length) {
    const line = lines[j];

    if (line.trim() === '') {
      continuation.push('');
      j++;
      continue;
    }

    if (leadingSpaces(line) <= parentIndent || line.trimStart().startsWith('#')) {
      break;
    }

    if (findUnquotedColon(line.trim()) >= 0 || isListItem(line, leadingSpaces(line))) {
      throw new YamlMiniError('Unexpected indentation', j + 1);
    }

    continuation.push(stripComment(line.trim()));
    j++;
  }

  while (continuation.length && continuation[continuation.length - 1] === '') {
    continuation.pop();
    j--;
  }

  if (continuation.length > 0) {
    // Trailing blank lines belong to what follows, so they're read again.
    while (j > i + 1 && lines[j - 1].trim() === '') {
      j--;
    }

    return { value: foldLines([rest, ...continuation]), nextIndex: j };
  }

  return { value: parseScalar(rest, i + 1), nextIndex: i + 1 };
};

/** Folded lines: a line break between paragraphs, a space within one. */
const foldLines = (collected: string[]): string => {
  let out = '';
  let prevBlank = false;

  for (let k = 0; k < collected.length; k++) {
    const line = collected[k];

    if (line === '') {
      prevBlank = true;
      continue;
    }

    if (k === 0) {
      out = line;
    } else if (prevBlank) {
      out += '\n' + line;
    } else {
      out += ' ' + line;
    }

    prevBlank = false;
  }

  return out;
};

/** Whether a quoted string or flow value is closed: its quotes and brackets end in the text. */
const closes = (text: string): boolean => {
  const opening = text[0];

  if (opening === '"' || opening === "'") {
    for (let i = 1; i < text.length; i++) {
      if (opening === '"' && text[i] === '\\') {
        i++;
      } else if (text[i] === opening) {
        if (opening === "'" && text[i + 1] === "'") {
          i++;
        } else {
          return true;
        }
      }
    }

    return false;
  }

  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quote) {
      if (c === '\\' && quote === '"') {
        i++;
      } else if (c === quote) {
        quote = null;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '[' || c === '{') {
      depth++;
    } else if (c === ']' || c === '}') {
      depth--;

      if (depth === 0) {
        return true;
      }
    }
  }

  return false;
};

const aliasValue = (name: string, line: number): YamlValue => {
  if (!anchors.has(name)) {
    throw new YamlMiniError(`Unknown alias *${name}`, line);
  }

  return JSON.parse(JSON.stringify(anchors.get(name))) as YamlValue;
};

const detectChildIndent = (lines: string[], start: number, parentIndent: number, skipComments = true): number | null => {
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];

    if (raw.trim() === '') {
      continue;
    }

    if (skipComments && raw.trimStart().startsWith('#')) {
      continue;
    }

    const ind = leadingSpaces(raw);

    if (ind <= parentIndent) {
      return null;
    }

    return ind;
  }

  return null;
};

const nextContentLine = (lines: string[], start: number): number => {
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];

    if (raw.trim() !== '' && !raw.trimStart().startsWith('#')) {
      return i;
    }
  }

  return -1;
};

const leadingSpaces = (line: string): number => {
  let n = 0;

  while (n < line.length && line[n] === ' ') {
    n++;
  }

  return n;
};

const findUnquotedColon = (s: string): number => {
  let inQ: '"' | "'" | null = null;
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inQ) {
      if (c === '\\' && inQ === '"') {
        i++;
        continue;
      }

      if (c === inQ) {
        inQ = null;
      }
    } else {
      if ((c === '"' || c === "'") && (i === 0 || /[\s[{,]/.test(s[i - 1]))) {
        inQ = c;
      } else if (c === '[' || c === '{') {
        depth++;
      } else if (c === ']' || c === '}') {
        depth--;
      } else if (c === ':' && depth === 0 && (i + 1 >= s.length || s[i + 1] === ' ' || s[i + 1] === '\t')) {
        return i;
      }
    }
  }

  return -1;
};

const parseScalar = (raw: string, line: number): YamlValue => {
  if (raw === '' || raw === '~' || raw === 'null') {
    return null;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(raw)) {
    return parseInt(raw, 10);
  }

  if (/^-?\d*\.\d+$/.test(raw)) {
    return parseFloat(raw);
  }

  // Exponents, as YAML 1.2's core schema has them: `1e3`, `1.5E-2`.
  if (/^-?(?:\d+\.?\d*|\.\d+)[eE][-+]?\d+$/.test(raw)) {
    return parseFloat(raw);
  }

  if (raw.startsWith('"')) {
    return parseDoubleQuoted(raw, line);
  }

  if (raw.startsWith("'")) {
    return parseSingleQuoted(raw, line);
  }

  if (raw.startsWith('[') || raw.startsWith('{')) {
    return parseFlow(raw, line);
  }

  if (/^\*[^\s,[\]{}]+$/.test(raw)) {
    return aliasValue(raw.slice(1), line);
  }

  return raw;
};

/** A flow value: `[a, b]`, `{name: Ana}`, and any mix of them. */
const parseFlow = (raw: string, line: number): YamlValue => {
  const reader = { text: raw, at: 0 };
  const value = readFlow(reader, line);
  skipFlowSpace(reader);

  if (reader.at < raw.length) {
    throw new YamlMiniError(raw[0] === '[' ? 'Unterminated flow array' : 'Unexpected text after a flow value', line);
  }

  return value;
};

interface FlowReader {
  text: string;
  at: number;
}

const skipFlowSpace = (reader: FlowReader): void => {
  while (reader.at < reader.text.length && /\s/.test(reader.text[reader.at])) {
    reader.at++;
  }
};

const readFlow = (reader: FlowReader, line: number): YamlValue => {
  skipFlowSpace(reader);
  const c = reader.text[reader.at];

  if (c === '[') {
    reader.at++;
    const items: YamlValue[] = [];

    for (;;) {
      skipFlowSpace(reader);

      if (reader.at >= reader.text.length) {
        throw new YamlMiniError('Unterminated flow array', line);
      }

      if (reader.text[reader.at] === ']') {
        reader.at++;
        return items;
      }

      items.push(readFlow(reader, line));
      skipFlowSpace(reader);

      if (reader.text[reader.at] === ',') {
        reader.at++;
      } else if (reader.text[reader.at] !== ']') {
        throw new YamlMiniError('Unterminated flow array', line);
      }
    }
  }

  if (c === '{') {
    reader.at++;
    const map: Record<string, YamlValue> = {};

    for (;;) {
      skipFlowSpace(reader);

      if (reader.at >= reader.text.length) {
        throw new YamlMiniError('Unterminated flow map', line);
      }

      if (reader.text[reader.at] === '}') {
        reader.at++;
        return map;
      }

      const key = readFlowScalar(reader, line, true);
      skipFlowSpace(reader);
      let value: YamlValue = null;

      if (reader.text[reader.at] === ':') {
        reader.at++;
        skipFlowSpace(reader);
        value = reader.text[reader.at] === ',' || reader.text[reader.at] === '}' ? null : readFlow(reader, line);
      }

      assignKey(map, String(key), value);
      skipFlowSpace(reader);

      if (reader.text[reader.at] === ',') {
        reader.at++;
      } else if (reader.text[reader.at] !== '}') {
        throw new YamlMiniError('Unterminated flow map', line);
      }
    }
  }

  return readFlowScalar(reader, line, false);
};

/** A scalar inside a flow value: quoted, or plain up to `,` `]` `}` (and, for a key, `: `). */
const readFlowScalar = (reader: FlowReader, line: number, key: boolean): YamlValue => {
  const { text } = reader;
  const start = reader.at;
  const c = text[start];

  if (c === '"' || c === "'") {
    let end = start + 1;

    while (end < text.length) {
      if (c === '"' && text[end] === '\\') {
        end += 2;
        continue;
      }

      if (text[end] === c) {
        if (c === "'" && text[end + 1] === "'") {
          end += 2;
          continue;
        }

        break;
      }

      end++;
    }

    reader.at = end + 1;
    return parseScalar(text.slice(start, end + 1), line);
  }

  let end = start;

  while (end < text.length) {
    const here = text[end];

    if (here === ',' || here === ']' || here === '}') {
      break;
    }

    if (key && here === ':' && (end + 1 >= text.length || /[\s,}\]]/.test(text[end + 1]))) {
      break;
    }

    end++;
  }

  reader.at = end;
  const plain = text.slice(start, end).trim();
  return key ? plain : parseScalar(plain, line);
};

const DOUBLE_QUOTE_ESCAPES: Record<string, string> = {
  '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', '0': '\0',
};

const parseDoubleQuoted = (raw: string, line: number): string => {
  if (!raw.endsWith('"') || raw.length < 2) {
    throw new YamlMiniError('Unterminated string', line);
  }

  const body = raw.slice(1, -1);
  let out = '';

  for (let i = 0; i < body.length; i++) {
    const c = body[i];

    if (c !== '\\') {
      out += c;
      continue;
    }

    const next = body[++i];

    if (next === undefined) {
      throw new YamlMiniError('Dangling escape in string', line);
    }

    if (next === 'u') {
      const hex = body.slice(i + 1, i + 5);

      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw new YamlMiniError('Invalid \\u escape', line);
      }

      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
      continue;
    }

    out += DOUBLE_QUOTE_ESCAPES[next] ?? next;
  }

  return out;
};

const parseSingleQuoted = (raw: string, line: number): string => {
  if (!raw.endsWith("'") || raw.length < 2) {
    throw new YamlMiniError('Unterminated string', line);
  }

  return raw.slice(1, -1).replace(/''/g, "'");
};

// Emitter

export const emitYaml = (value: YamlValue): string => {
  return emit(value, 0).trimEnd() + '\n';
};

const emit = (value: YamlValue, indent: number): string => {
  if (value === null) {
    return 'null\n';
  }

  if (typeof value === 'boolean') {
    return `${value}\n`;
  }

  if (typeof value === 'number') {
    return `${value}\n`;
  }

  if (typeof value === 'string') {
    return emitString(value, indent);
  }

  if (Array.isArray(value)) {
    return emitArray(value, indent);
  }

  return emitMap(value, indent);
};

/**
 * A string can be emitted as a `|` literal block only when the parser will
 * reconstruct it exactly: the first content line anchors the block's child
 * indent (so it must not start with whitespace), whitespace-only lines and
 * trailing blank lines are normalized away by the parser, and `\r` would be
 * normalized to `\n`. Anything else must be JSON-quoted.
 */
const blockScalarSafe = (s: string): boolean => {
  // "-->" would end the HTML comment the YAML is written in; quoted, it can be escaped.
  if (s.includes('\r') || /--!?>/.test(s)) {
    return false;
  }

  const lines = s.split('\n');

  if (lines[lines.length - 1].trim() === '') {
    return false;
  }

  const firstContent = lines.find((l) => l.trim() !== '');

  if (firstContent === undefined || /^[ \t]/.test(firstContent)) {
    return false;
  }

  // A content line that trims to `---` would close the markdown frontmatter
  // around the YAML early: findFrontmatter compares trimmed lines.
  if (lines.some((line) => line.trim() === '---')) {
    return false;
  }

  return !lines.some((l) => /^[ \t]+$/.test(l));
};

const emitMultiline = (v: string, keyPrefix: string, blockIndent: number): string => {
  if (blockScalarSafe(v)) {
    const pad = ' '.repeat(blockIndent);
    let out = `${keyPrefix} |\n`;

    for (const line of v.split('\n')) {
      out += `${pad}${line}\n`;
    }

    return out;
  }

  return `${keyPrefix} ${JSON.stringify(v)}\n`;
};

const emitMap = (obj: { [k: string]: YamlValue }, indent: number): string => {
  const pad = ' '.repeat(indent);
  let out = '';

  for (const [key, v] of Object.entries(obj)) {
    if (v === undefined) {
      continue;
    } // treat like JSON.stringify: key is absent

    const writtenKey = formatKey(key);

    if (v === null) {
      out += `${pad}${writtenKey}: null\n`;
      continue;
    }

    if (typeof v === 'string') {
      if (v.includes('\n')) {
        out += emitMultiline(v, `${pad}${writtenKey}:`, indent + 2);
      } else {
        out += `${pad}${writtenKey}: ${needsQuotes(v) ? JSON.stringify(v) : v}\n`;
      }
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out += `${pad}${writtenKey}: ${v}\n`;
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        out += `${pad}${writtenKey}: []\n`;
        continue;
      }

      const allScalar = v.every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean');

      if (allScalar && v.every((x) => typeof x !== 'string' || !needsQuotes(x as string))) {
        out += `${pad}${writtenKey}: [${v.map((x) => formatScalar(x as YamlValue)).join(', ')}]\n`;
      } else {
        out += `${pad}${writtenKey}:\n${emitArray(v, indent + 2)}`;
      }
    } else if (Object.values(v).some((item) => item !== undefined)) {
      out += `${pad}${writtenKey}:\n${emit(v, indent + 2)}`;
    } else {
      // An empty map: written as a flow value, or it would read back as null.
      out += `${pad}${writtenKey}: {}\n`;
    }
  }

  return out;
};

const emitArray = (arr: YamlValue[], indent: number): string => {
  const pad = ' '.repeat(indent);
  let out = '';

  for (const item of arr) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const entries = Object.entries(item).filter(([, v]) => v !== undefined);

      if (entries.length === 0) {
        out += `${pad}- {}\n`;
        continue;
      }

      const [firstKey, firstVal] = entries[0];

      if (keyNeedsQuotes(firstKey)) {
        // A quoted key can't start the `- ` line: it would read as a scalar item.
        out += `${pad}-\n${emitMap(item, indent + 2)}`;
        continue;
      }

      if (firstVal !== null && typeof firstVal === 'object') {
        const flow = emptyCollection(firstVal);
        out += flow === null ? `${pad}- ${firstKey}:\n${emit(firstVal, indent + 4)}` : `${pad}- ${firstKey}: ${flow}\n`;
      } else if (typeof firstVal === 'string' && firstVal.includes('\n')) {
        out += emitMultiline(firstVal, `${pad}- ${firstKey}:`, indent + 4);
      } else {
        out += `${pad}- ${firstKey}: ${formatScalar(firstVal)}\n`;
      }

      for (const [k, v] of entries.slice(1)) {
        const writtenKey = formatKey(k);

        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          const flow = emptyCollection(v);
          out += flow === null ? `${pad}  ${writtenKey}:\n${emit(v, indent + 4)}` : `${pad}  ${writtenKey}: ${flow}\n`;
        } else if (Array.isArray(v)) {
          if (v.length === 0) {
            out += `${pad}  ${writtenKey}: []\n`;
          }
          else {
            const allScalar = v.every((x) => typeof x !== 'object' || x === null);

            if (allScalar) {
              out += `${pad}  ${writtenKey}: [${v.map((x) => formatScalar(x as YamlValue)).join(', ')}]\n`;
            }
            else {
              out += `${pad}  ${writtenKey}:\n${emitArray(v, indent + 4)}`;
            }
          }
        } else if (typeof v === 'string' && v.includes('\n')) {
          out += emitMultiline(v, `${pad}  ${writtenKey}:`, indent + 4);
        } else {
          out += `${pad}  ${writtenKey}: ${formatScalar(v)}\n`;
        }
      }
    } else {
      out += `${pad}- ${formatScalar(item)}\n`;
    }
  }

  return out;
};

/** A map or list with nothing in it, written as a flow value so it doesn't read back as null. */
const emptyCollection = (value: YamlValue): string | null => {
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return Object.values(value).some((item) => item !== undefined) ? null : '{}';
};

/**
 * A key as written: plain when the parser hands it back unchanged, quoted
 * when it wouldn't (`a: b`, ` padded `, `- item`, a quote of its own first).
 */
const formatKey = (key: string): string => {
  return keyNeedsQuotes(key) ? JSON.stringify(key) : key;
};

const keyNeedsQuotes = (key: string): boolean => {
  if (key === '' || key !== key.trim() || /^["']/.test(key) || /^-(\s|$)/.test(key)) {
    return true;
  }

  // Control characters survive only via double-quote escapes.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(key)) {
    return true;
  }

  // The parser must find the colon that ends the key, not one inside it.
  return findUnquotedColon(`${key}: x`) !== key.length;
};

const emitString = (s: string, indent: number): string => {
  if (s.includes('\n')) {
    if (!blockScalarSafe(s)) {
      return `${JSON.stringify(s)}\n`;
    }

    const pad = ' '.repeat(indent);
    return '|\n' + s.split('\n').map((l) => pad + l).join('\n') + '\n';
  }

  return needsQuotes(s) ? `${JSON.stringify(s)}\n` : `${s}\n`;
};

const formatScalar = (v: YamlValue): string => {
  if (v === null) {
    return 'null';
  }

  if (typeof v === 'string') {
    return needsQuotes(v) ? JSON.stringify(v) : v;
  }

  return String(v);
};

/**
 * Words and numbers other YAML readers take for something besides text:
 * YAML 1.1 booleans (`yes`, `On`), nulls, and numbers in any notation.
 */
const NOT_TEXT_ELSEWHERE = /^(?:y|n|yes|no|on|off|true|false|null|~)$|^[-+]?(?:\.?\d|\.(?:inf|nan)$)|^0[xob]/i;

/**
 * Whether a string written plain would read back as itself: no when other
 * YAML readers would take it for a number or boolean, and no when this
 * parser itself would hand back something else. Used by the emitter.
 */
export const needsQuotes = (s: string): boolean => {
  if (s === '' || NOT_TEXT_ELSEWHERE.test(s)) {
    return true;
  }

  // Anything this reader wouldn't hand back as the same text, written plain.
  try {
    if (parseScalar(s, 0) !== s) {
      return true;
    }
  } catch {
    return true;
  }

  if (/[:,#[{}&*!|>'"%@`]/.test(s)) {
    return true;
  }

  if (/^[ ]|[ ]$/.test(s)) {
    return true;
  }

  // Control characters (\r, \t, ...) survive only via double-quote escapes.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(s)) {
    return true;
  }

  return false;
};

/**
 * Whether a one-line value written plain after `key:` reads back as the same
 * string through this parser: no anchors (`&a`), aliases (`*a`), block-scalar
 * starts (`|`, `>+`), comments (` #`), or scalars read as something else
 * (`~`, `.5`). Unlike `needsQuotes` this ignores what *other* YAML readers
 * would do; markdown-writing uses it for values inside `<!-- orbit … -->`
 * comments, which only Orbit reads.
 */
export const plainScalarReadsBack = (s: string): boolean => {
  if (s === '' || s !== s.trim()) {
    return false;
  }

  if (stripComment(s) !== s) {
    return false;
  }

  if (/^&[^\s,[\]{}]+/.test(s) || /^\*[^\s,[\]{}]+$/.test(s) || /^[|>][-+]?\d?$/.test(s)) {
    return false;
  }

  try {
    return parseScalar(s, 0) === s;
  } catch {
    return false;
  }
};
