// Builds the files coding agents read from the docs: llms-full.txt (llms.txt
// plus every guide, in one file) and the references next to the agent skill
// in skills/orbit. Run `bun run docs:llms` after editing the README,
// llms.txt or docs/; tests/docs.test.ts fails while they are out of date.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

const root = join(import.meta.dir, '..');

/** The guides llms-full.txt joins, in reading order. */
const GUIDES = [
  'README.md', 'docs/guide.md', 'docs/format.md', 'docs/recipes.md', 'docs/theming.md', 'docs/extending.md', 'docs/editing.md', 'docs/map-tools.md', 'docs/media.md',
  'docs/import-export.md', 'docs/languages.md', 'docs/accessibility.md', 'docs/agents.md',
];

/** Guides the skill keeps next to its SKILL.md. */
const SKILL_REFERENCES = [
  'docs/guide.md', 'docs/format.md', 'docs/recipes.md', 'docs/theming.md', 'docs/extending.md', 'docs/editing.md', 'docs/map-tools.md', 'docs/media.md', 'docs/languages.md',
  'docs/import-export.md',
];

/** Where links that leave the skill's folder go: the repository, and its files as they are for pictures. */
const REPOSITORY = 'https://github.com/restless-dreams/orbit/blob/main';
const REPOSITORY_FILES = 'https://raw.githubusercontent.com/restless-dreams/orbit/main';

const read = (path: string) => readFileSync(join(root, path), 'utf8').trimEnd();

/**
 * Changes every link and picture in `markdown` outside code, where examples
 * show links as they're written: fenced blocks and inline code stay as they are.
 */
export const mapLinks = (markdown: string, change: (target: string, picture: boolean) => string): string => {
  let fence: string | null = null;

  return markdown.split('\n').map((line) => {
    const opening = /^\s*(`{3,}|~{3,})/.exec(line);

    if (fence === null && opening) {
      fence = opening[1];
      return line;
    }

    if (fence !== null) {
      if (line.trimStart().startsWith(fence)) {
        fence = null;
      }

      return line;
    }

    return line.split(/(`[^`]*`)/).map((piece) => {
      if (piece.startsWith('`')) {
        return piece;
      }

      return piece.replace(/(!?)(\[[^\]]*\]\()([^)\s]+)(\))/g, (_, bang: string, text: string, target: string, end: string) => `${bang}${text}${change(target, bang === '!')}${end}`);
    }).join('');
  }).join('\n');
};

/** The links and pictures in `markdown` outside code. */
export const linksIn = (markdown: string): string[] => {
  const links: string[] = [];

  mapLinks(markdown, (target) => {
    links.push(target);
    return target;
  });

  return links;
};

/** Whether a link leaves the file it's in: an address, or an anchor in the same file. */
export const isAddressOrAnchor = (target: string): boolean => {
  return /^([a-z]+:|#)/i.test(target);
};

/** A guide as the skill keeps it: links to the guides beside it stay, and the rest point at the repository. */
const forTheSkill = (path: string, markdown: string): string => {
  const kept = new Set(SKILL_REFERENCES.map((reference) => posix.basename(reference)));

  return mapLinks(markdown, (target, picture) => {
    if (isAddressOrAnchor(target) || kept.has(target.split('#')[0])) {
      return target;
    }

    return `${picture ? REPOSITORY_FILES : REPOSITORY}/${posix.join(posix.dirname(path), target)}`;
  });
};

/** Every generated file, by path, with its content. */
export const llmsFiles = (): Record<string, string> => {
  const sections = GUIDES.map((path) => `<!-- ${path} -->\n\n${read(path)}`);
  const files: Record<string, string> = {
    'llms-full.txt': `${[read('llms.txt'), ...sections].join('\n\n---\n\n')}\n`,
  };

  for (const path of SKILL_REFERENCES) {
    const name = posix.basename(path);
    files[`skills/orbit/references/${name}`] = `<!-- A copy of ${path}, made by scripts/build-llms.ts, with links to other files pointing at the repository. Edit the original. -->\n\n${forTheSkill(path, read(path))}\n`;
  }

  return files;
};

if (import.meta.main) {
  for (const [path, content] of Object.entries(llmsFiles())) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
    console.log('Wrote', path);
  }
}
