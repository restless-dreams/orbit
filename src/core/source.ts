/**
 * Source text helpers shared by the dispatcher and both parsers. Normalizing
 * never adds or removes lines, so diagnostics keep pointing at the line the
 * author wrote.
 */

/**
 * Strips a byte-order mark, converts CRLF/CR line endings to LF, and removes
 * indentation shared by every non-blank line, so markdown indented inside
 * HTML or a template literal parses like flush-left markdown.
 */
export const normalizeSource = (input: string): string => {
  // Only a byte-order mark at the start: U+FEFF inside the text is a zero-width no-break space, and kept.
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return dedent(text);
};

/** The indentation every non-blank line shares, which `normalizeSource` removes. */
export const sharedIndentation = (text: string): string => {
  let common: string | null = null;

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue;
    }

    const indent = /^[ \t]*/.exec(line)![0];

    if (common === null) {
      common = indent;
      continue;
    }

    let length = 0;

    while (length < common.length && length < indent.length && common[length] === indent[length]) {
      length += 1;
    }

    common = common.slice(0, length);

    if (common === '') {
      return '';
    }
  }

  return common ?? '';
};

export const dedent = (text: string): string => {
  const lines = text.split('\n');
  let common: string | null = null;

  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }

    const indent = /^[ \t]*/.exec(line)![0];

    if (common === null) {
      common = indent;
      continue;
    }

    let length = 0;

    while (length < common.length && length < indent.length && common[length] === indent[length]) {
      length += 1;
    }

    common = common.slice(0, length);

    if (common === '') {
      return text;
    }
  }

  if (!common) {
    return text;
  }

  const prefix = common;
  return lines
    .map((line) => {
      if (line.startsWith(prefix)) {
        return line.slice(prefix.length);
      }

      // Only a blank line can miss the shared indent (a shorter one): drop
      // just the part they share, so saving can put the rest back.
      let shared = 0;

      while (shared < line.length && line[shared] === prefix[shared]) {
        shared += 1;
      }

      return line.slice(shared);
    })
    .join('\n');
};

export const firstContentLineIndex = (lines: string[]): number => {
  return lines.findIndex((line) => line.trim() !== '');
};

export interface FrontmatterBlock {
  /** The YAML between the fences. */
  yaml: string;

  /** 0-based index of the opening `---` line. */
  openIndex: number;

  /** 0-based index of the closing `---` line. */
  closeIndex: number;
}

/** Frontmatter is a `---` fenced block starting on the first non-blank line. */
export const findFrontmatter = (lines: string[]): FrontmatterBlock | null => {
  const openIndex = firstContentLineIndex(lines);

  if (openIndex === -1 || lines[openIndex].trim() !== '---') {
    return null;
  }

  for (let index = openIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      return { yaml: lines.slice(openIndex + 1, index).join('\n'), openIndex, closeIndex: index };
    }
  }

  return null;
};

/** 1-based line of the first `key:` entry inside a frontmatter or YAML block. */
export const lineOfKey = (lines: string[], key: string, fromIndex = 0, toIndex = lines.length): number | undefined => {
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);

  for (let index = fromIndex; index < toIndex; index += 1) {
    if (pattern.test(lines[index])) {
      return index + 1;
    }
  }

  return undefined;
};
