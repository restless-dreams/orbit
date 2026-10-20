/**
 * A small XML reader for other apps' map files, and a forgiving reader for
 * the HTML in their notes. Neither loads anything a file points to: XML
 * reads its five entities and numeric references only, HTML adds a fixed
 * table of common named ones, a DOCTYPE is skipped without reading what it
 * declares, and the size of the input and the depth of nesting are capped.
 */

export interface MarkupElement {
  /** The element's name as written, with its prefix: `xhtml:p`. */
  name: string;

  /** The name without a prefix, lowercased in HTML: `p`. */
  localName: string;

  /** Attributes by name as written, values decoded. */
  attributes: Record<string, string>;

  children: MarkupNode[];
}

/** An element, or text. */
export type MarkupNode = MarkupElement | string;

/** A file that isn't well-formed XML, or too big or too deep to read. */
export class MarkupError extends Error {
  /** The 1-based line of the problem. */
  readonly line: number;

  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = 'MarkupError';
    this.line = line;
  }
}

/** The most characters a file may have: far beyond any map, short of exhausting memory. */
export const MAX_MARKUP_LENGTH = 64 * 1024 * 1024;

/** The deepest nesting read: deeper files are refused rather than risking the stack. */
export const MAX_MARKUP_DEPTH = 1000;

const XML_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Named character references HTML notes use beyond XML's five. */
const HTML_ENTITIES: Record<string, string> = {
  ...XML_ENTITIES,
  nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×', divide: '÷', euro: '€', pound: '£', yen: '¥', cent: '¢',
  sect: '§', para: '¶', iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', acute: '´', uml: '¨', shy: '\u00ad', frac12: '½', frac14: '¼', frac34: '¾',
  sup1: '¹', sup2: '²', sup3: '³', micro: 'µ', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', rArr: '⇒', lArr: '⇐', hArr: '⇔',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', yacute: 'ý', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Yacute: 'Ý',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û', Acirc: 'Â', Ecirc: 'Ê', Icirc: 'Î', Ocirc: 'Ô', Ucirc: 'Û',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', yuml: 'ÿ', Auml: 'Ä', Euml: 'Ë', Iuml: 'Ï', Ouml: 'Ö', Uuml: 'Ü',
  atilde: 'ã', otilde: 'õ', ntilde: 'ñ', Atilde: 'Ã', Otilde: 'Õ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç', aring: 'å', Aring: 'Å',
  aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', szlig: 'ß', thorn: 'þ', THORN: 'Þ', eth: 'ð', ETH: 'Ð', oelig: 'œ', OElig: 'Œ',
};

/** Elements HTML never closes. */
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/** Elements whose content is code to run or styles, not text to keep. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

const NAME = /^[^\s/>=]+/;
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/y;

interface ReadingMode {
  html: boolean;
}

/**
 * An XML file's bytes as text, in the encoding its byte order mark or its
 * declaration names (UTF-8 when neither does). Old OPML files are often
 * ISO-8859-1. A file that isn't valid UTF-8 and names no encoding is read as
 * Windows-1252, which every byte is.
 */
export const decodeMarkup = (bytes: Uint8Array): string => {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  // UTF-16 without a byte order mark still starts "<?xml": every other byte is zero.
  if (bytes[0] === 0x3c && bytes[1] === 0x00) {
    return new TextDecoder('utf-16le').decode(bytes);
  }

  if (bytes[0] === 0x00 && bytes[1] === 0x3c) {
    return new TextDecoder('utf-16be').decode(bytes);
  }

  const start = String.fromCharCode(...bytes.subarray(0, 200));
  const declared = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/.exec(start)?.[1];

  if (declared && !/^utf-?8$/i.test(declared)) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // An encoding this browser can't decode: read the file as UTF-8 below.
    }
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder(declared ? 'utf-8' : 'windows-1252').decode(bytes);
  }
};

/**
 * The document element of an XML file. Throws a `MarkupError` for a file
 * that isn't well-formed, so a damaged map is refused rather than read in part.
 */
export const parseXml = (text: string): MarkupElement => {
  const root = readMarkup(text, { html: false });
  const elements = root.children.filter(isElement);

  if (elements.length !== 1) {
    throw new MarkupError(elements.length === 0 ? 'No element in the file' : 'More than one top element', 1);
  }

  return elements[0];
};

/** A piece of HTML, as the children of an element named `#fragment`. Never throws for markup it can read some way. */
export const parseHtml = (text: string): MarkupElement => {
  return readMarkup(text, { html: true });
};

export const isElement = (node: MarkupNode): node is MarkupElement => {
  return typeof node !== 'string';
};

/** The element's child elements, all of them or those with one local name. */
export const childElements = (element: MarkupElement, localName?: string): MarkupElement[] => {
  return element.children.filter((child): child is MarkupElement => isElement(child) && (localName === undefined || child.localName === localName));
};

/** The element's first child element with this local name. */
export const childElement = (element: MarkupElement, localName: string): MarkupElement | undefined => {
  return element.children.find((child): child is MarkupElement => isElement(child) && child.localName === localName);
};

/** An attribute by its name without a prefix: `href` finds `xlink:href`. */
export const attributeOf = (element: MarkupElement, localName: string): string | undefined => {
  if (Object.prototype.hasOwnProperty.call(element.attributes, localName)) {
    return element.attributes[localName];
  }

  for (const [name, value] of Object.entries(element.attributes)) {
    if (localPart(name) === localName) {
      return value;
    }
  }

  return undefined;
};

/** All the text inside an element, as written. */
export const textContent = (node: MarkupNode): string => {
  if (!isElement(node)) {
    return node;
  }

  let text = '';
  const pending: MarkupNode[] = [node];

  while (pending.length > 0) {
    const next = pending.pop() as MarkupNode;

    if (isElement(next)) {
      for (let index = next.children.length - 1; index >= 0; index--) {
        pending.push(next.children[index]);
      }
    } else {
      text += next;
    }
  }

  return text;
};

const localPart = (name: string): string => {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
};

const lineAt = (text: string, index: number): number => {
  let line = 1;

  for (let position = text.indexOf('\n'); position !== -1 && position < index; position = text.indexOf('\n', position + 1)) {
    line += 1;
  }

  return line;
};

const readMarkup = (input: string, mode: ReadingMode): MarkupElement => {
  if (input.length > MAX_MARKUP_LENGTH) {
    throw new MarkupError(`The file is larger than ${MAX_MARKUP_LENGTH / 1024 / 1024} MB of text`, 1);
  }

  // XML reads every line break as a line feed.
  const text = input.replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
  const fragment: MarkupElement = { name: '#fragment', localName: '#fragment', attributes: {}, children: [] };
  const open: MarkupElement[] = [fragment];
  const entities = mode.html ? HTML_ENTITIES : XML_ENTITIES;
  let index = 0;

  const fail = (message: string, at: number): never => {
    throw new MarkupError(message, lineAt(text, at));
  };

  const current = (): MarkupElement => open[open.length - 1];

  const addText = (value: string): void => {
    if (value === '') {
      return;
    }

    const children = current().children;
    const last = children.length - 1;

    if (last >= 0 && typeof children[last] === 'string') {
      children[last] = (children[last] as string) + value;
    } else {
      children.push(value);
    }
  };

  while (index < text.length) {
    const tag = text.indexOf('<', index);

    if (tag === -1) {
      addText(decodeEntities(text.slice(index), entities));
      break;
    }

    if (tag > index) {
      addText(decodeEntities(text.slice(index, tag), entities));
    }

    index = tag;

    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4);

      if (end === -1) {
        if (mode.html) {
          break;
        }

        fail('A comment that never ends', index);
      }

      index = end + 3;
      continue;
    }

    if (text.startsWith('<![CDATA[', index)) {
      const end = text.indexOf(']]>', index + 9);

      if (end === -1) {
        fail('A CDATA section that never ends', index);
      }

      addText(text.slice(index + 9, end));
      index = end + 3;
      continue;
    }

    if (text.startsWith('<?', index)) {
      const end = text.indexOf('?>', index + 2);

      if (end === -1) {
        fail('A processing instruction that never ends', index);
      }

      index = end + 2;
      continue;
    }

    if (text.startsWith('<!', index)) {
      // A DOCTYPE, its internal subset included: skipped, never read.
      index = skipDeclaration(text, index, fail);
      continue;
    }

    if (text.startsWith('</', index)) {
      const end = text.indexOf('>', index + 2);

      if (end === -1) {
        fail('An end tag that never closes', index);
      }

      const name = text.slice(index + 2, end).trim();
      closeElement(open, name, mode, () => fail(`</${name}> doesn't match <${current().name}>`, index));
      index = end + 1;
      continue;
    }

    const nameMatch = NAME.exec(text.slice(index + 1, index + 257));

    if (!nameMatch || !/^[\p{L}_:]/u.test(nameMatch[0])) {
      if (mode.html) {
        // A lone "<" in HTML is text.
        addText('<');
        index += 1;
        continue;
      }

      fail('A "<" that starts no tag', index);
    }

    const name = (nameMatch as RegExpExecArray)[0];
    const [attributes, afterAttributes, selfClosing] = readAttributes(text, index + 1 + name.length, entities, mode, fail);
    const localName = mode.html ? localPart(name).toLowerCase() : localPart(name);
    const element: MarkupElement = { name, localName, attributes, children: [] };
    current().children.push(element);
    index = afterAttributes;

    if (mode.html && RAW_TEXT_ELEMENTS.has(localName)) {
      // Code and styles are left out, up to their end tag.
      const end = text.toLowerCase().indexOf(`</${localName}`, index);
      index = end === -1 ? text.length : text.indexOf('>', end) + 1 || text.length;
      continue;
    }

    if (selfClosing || (mode.html && VOID_ELEMENTS.has(localName))) {
      continue;
    }

    if (open.length > MAX_MARKUP_DEPTH) {
      fail(`Elements nested more than ${MAX_MARKUP_DEPTH} deep`, index);
    }

    open.push(element);
  }

  if (!mode.html && open.length > 1) {
    fail(`<${current().name}> is never closed`, text.length);
  }

  return fragment;
};

/** Reads a tag's attributes up to its `>`: the attributes, where the tag ends, and whether it closed itself. */
const readAttributes = (
  text: string,
  start: number,
  entities: Record<string, string>,
  mode: ReadingMode,
  fail: (message: string, at: number) => never,
): [Record<string, string>, number, boolean] => {
  const attributes: Record<string, string> = {};
  let index = start;

  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index])) {
      index += 1;
    }

    if (text[index] === '>') {
      return [attributes, index + 1, false];
    }

    if (text.startsWith('/>', index)) {
      return [attributes, index + 2, true];
    }

    if (text[index] === '/') {
      index += 1;
      continue;
    }

    ATTRIBUTE.lastIndex = index;
    const match = ATTRIBUTE.exec(text);

    if (!match || match[0].length === 0) {
      fail('A tag that never closes', start);
    }

    const [whole, name, doubleQuoted, singleQuoted, unquoted] = match as RegExpExecArray;

    if (unquoted !== undefined && !mode.html) {
      fail(`The value of ${name} has no quotes`, index);
    }

    const raw = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
    // XML reads tabs and line breaks written in a value as spaces; &#10; stays a line break.
    attributes[name] = decodeEntities(mode.html ? raw : raw.replace(/[\t\n]/g, ' '), entities);
    index += whole.length;
  }

  return fail('A tag that never closes', start);
};

const skipDeclaration = (text: string, start: number, fail: (message: string, at: number) => never): number => {
  let depth = 0;
  let quote: string | null = null;

  for (let index = start + 2; index < text.length; index++) {
    const character = text[index];

    if (quote) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      depth += 1;
    } else if (character === ']') {
      depth -= 1;
    } else if (character === '>' && depth <= 0) {
      return index + 1;
    }
  }

  return fail('A declaration that never ends', start);
};

const closeElement = (open: MarkupElement[], name: string, mode: ReadingMode, mismatch: () => never): void => {
  const top = open[open.length - 1];

  if (open.length > 1 && (top.name === name || (mode.html && top.localName === localPart(name).toLowerCase()))) {
    open.pop();
    return;
  }

  if (!mode.html) {
    mismatch();
  }

  // HTML closes what's open up to the element the end tag names, and ignores one that names none.
  const wanted = localPart(name).toLowerCase();

  for (let depth = open.length - 1; depth > 0; depth--) {
    if (open[depth].localName === wanted) {
      open.length = depth;
      return;
    }
  }
};

/** Text with its character references read: numeric ones, and the named ones in `entities`; any other stays as written. */
const decodeEntities = (text: string, entities: Record<string, string>): string => {
  if (!text.includes('&')) {
    return text;
  }

  return text.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g, (whole, reference: string) => {
    if (reference.startsWith('#')) {
      const code = reference[1] === 'x' || reference[1] === 'X' ? parseInt(reference.slice(2), 16) : parseInt(reference.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
    }

    return Object.prototype.hasOwnProperty.call(entities, reference) ? entities[reference] : whole;
  });
};
