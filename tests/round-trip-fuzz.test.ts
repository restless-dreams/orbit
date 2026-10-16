import { describe, expect, it } from 'bun:test';
import { parseOrbitMarkdown } from '../src/core/parser-markdown';
import { parseOrbitYAML } from '../src/core/parser-yaml';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import type { OrbitDocument, OrbitNode } from '../src/core/types';
import { ensureUniqueNodeIds } from '../src/core/utils';

/**
 * Property test: parse(serialize(doc)) preserves the tree, for generated
 * documents across both flavors. Node text includes markdown punctuation,
 * hashtags and checkbox- or link-like text, which the markdown serializer
 * escapes; only a leading emoji always reads back as the icon.
 */

const mulberry32 = (seed: number): () => number => {
  let a = seed >>> 0;

  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const WORDS = ['alpha', 'beta', 'Gamma', 'delta9', 'launch', 'Q3 plan', 'infra', 'user research', 'v2 API'];
/** Titles the markdown title syntax would misread without escaping. */
const TRICKY_WORDS = [
  'C# rewrite',
  'snake_case',
  '**bold**',
  '`code`',
  'a*b*c',
  'Fix #42',
  'ship #frontend',
  '[x] not a task',
  '[label](target)',
  '~~gone~~',
  'back\\slash',
  '_private_',
  'heading ##',
  'see <!-- orbit x: y -->',
];
const NOTE_LINES = [
  'plain prose line',
  '### looks like a heading',
  '- looks like a bullet',
  '> already quoted',
  'ends with colon:',
  '  indented start',
  '```code fence```',
];
const STATUSES = ['active', 'done', 'blocked'];
const URLS = [
  'https://example.com/a.png',
  'photos/relative.jpg',
  'https://www.youtube.com/watch?v=abc123xyz',
  'https://vimeo.com/12345',
  'https://cdn.example.com/clip.mp4',
  'https://example.com/embed-widget',
];

const pick = <T>(rnd: () => number, arr: T[]): T => {
  return arr[Math.floor(rnd() * arr.length)];
};

const genNode = (rnd: () => number, level: number, path: string): OrbitNode => {
  const text = rnd() < 0.3 ? `${path} ${pick(rnd, TRICKY_WORDS)}` : `${pick(rnd, WORDS)} ${path}`;
  const node: OrbitNode = { id: '', text, level, children: [] };

  if (rnd() < 0.35) {
    const lineCount = 1 + Math.floor(rnd() * 3);
    node.note = Array.from({ length: lineCount }, () => pick(rnd, NOTE_LINES)).join('\n');
    node.noteFormat = 'markdown';
  }

  if (rnd() < 0.3) {
    node.color = '#F5A3A8';
  }

  if (rnd() < 0.25) {
    node.status = pick(rnd, STATUSES);
  }

  if (rnd() < 0.2) {
    node.priority = 1 + Math.floor(rnd() * 3);
  }

  if (rnd() < 0.2) {
    node.tags = ['one', 'two'].slice(0, 1 + Math.floor(rnd() * 2));
  }

  if (rnd() < 0.15) {
    node.collapsed = rnd() < 0.5;
  }

  const media = rnd();

  if (media < 0.15) {
    node.image = { src: pick(rnd, URLS.slice(0, 2)), alt: rnd() < 0.5 ? 'alt text' : undefined, caption: rnd() < 0.5 ? 'a caption' : undefined };
  } else if (media < 0.25) {
    const src = pick(rnd, URLS.slice(2, 5));
    node.video = {
      src,
      provider: /youtube/.test(src) ? 'youtube' : /vimeo/.test(src) ? 'vimeo' : 'native',
      thumbnail: rnd() < 0.4 ? 'thumb.jpg' : undefined,
      caption: rnd() < 0.4 ? 'video caption' : undefined,
    };
  } else if (media < 0.32) {
    node.embed = { src: URLS[5], caption: rnd() < 0.4 ? 'embed caption' : undefined };
  }

  const maxChildren = level >= 8 ? 0 : level === 0 ? 3 : rnd() < 0.55 ? 0 : Math.floor(rnd() * 3);

  for (let i = 0; i < maxChildren; i++) {
    const child = genNode(rnd, level + 1, `${path}${i}`);
    child.parent = node;
    node.children.push(child);
  }

  return node;
};

interface Snapshot {
  text: string; note?: string; color?: string; status?: string; priority?: number;
  tags?: string[]; collapsed?: boolean;
  image?: { src: string; alt?: string; caption?: string };
  video?: { src: string; thumbnail?: string; caption?: string };
  embed?: { src: string; caption?: string };
  children: Snapshot[];
}

const snapshot = (n: OrbitNode): Snapshot => {
  return {
    text: n.text,
    note: n.note,
    color: n.color,
    status: n.status,
    priority: n.priority,
    tags: n.tags,
    collapsed: n.collapsed,
    image: n.image && { src: n.image.src, alt: n.image.alt, caption: n.image.caption },
    video: n.video && { src: n.video.src, thumbnail: n.video.thumbnail, caption: n.video.caption },
    embed: n.embed && { src: n.embed.src, caption: n.embed.caption },
    children: n.children.map(snapshot),
  };
};

describe('round-trip property test', () => {
  it('parse(serializeOrbitMarkdown(doc)) preserves 40 generated trees', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = mulberry32(seed * 7919);
      const doc: OrbitDocument = { root: genNode(rnd, 0, 'n'), options: {}, warnings: [] };
      const md = serializeOrbitMarkdown(doc);
      const back = parseOrbitMarkdown(md);
      expect({ seed, tree: snapshot(back.root) }).toEqual({ seed, tree: snapshot(doc.root) });
    }
  });

  it('parseOrbitYAML(serializeOrbitYAML(doc)) preserves 40 generated trees', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = mulberry32(seed * 104729);
      const doc: OrbitDocument = { root: genNode(rnd, 0, 'n'), options: {}, warnings: [] };
      const yaml = serializeOrbitYAML(doc);
      const back = parseOrbitYAML(yaml);
      expect({ seed, tree: snapshot(back.root) }).toEqual({ seed, tree: snapshot(doc.root) });
    }
  });
});

/*
 * Every attribute at once: icons that are and aren't emoji, links to pages
 * and to other nodes, ids set by hand, types, custom attributes whose values
 * hold quotes, commas and "-->", several media per node with captions, plain
 * notes, and statuses and tags with spaces.
 */
const ICONS = ['🚀', '✅', '📚', '★', '→'];
const LINKS = ['https://example.com/a?b=1&c=2', 'mailto:team@example.com', 'docs/page.html', 'https://en.wikipedia.org/wiki/Orbit_(film)', 'my notes.html'];
const TYPES = ['milestone', 'person', 'Risk', 'big rock'];
const RICH_STATUSES = ['active', 'done', 'blocked', 'todo', 'in review', 'At Risk'];
const RICH_TAGS = ['one', 'two words', 'sprint-3', 'C++'];
const CUSTOM: Record<string, unknown>[] = [
  { owner: 'Ana Torres' },
  { estimate: 3, billable: true },
  { warning: 'ends --> here' },
  { quote: 'say "hi", then go' },
  { path: 'a: b # c' },
  { 'review-by': '2026-10-31' },
];

const genRichNode = (rnd: () => number, level: number, path: string): OrbitNode => {
  const node = genNode(rnd, level, path);
  node.children = [];

  if (rnd() < 0.2) {
    node.icon = pick(rnd, ICONS);
  }

  if (rnd() < 0.15) {
    node.link = pick(rnd, LINKS);
  }

  if (rnd() < 0.15) {
    node.id = `x-${path}`;
  }

  if (rnd() < 0.15) {
    node.type = pick(rnd, TYPES);
  }

  if (rnd() < 0.2) {
    node.attrs = { ...pick(rnd, CUSTOM) };
  }

  if (node.status !== undefined || rnd() < 0.1) {
    node.status = pick(rnd, RICH_STATUSES);
  }

  if (node.tags !== undefined) {
    node.tags = RICH_TAGS.filter(() => rnd() < 0.5);

    if (node.tags.length === 0) {
      delete node.tags;
    }
  }

  if (node.note !== undefined && rnd() < 0.2) {
    node.noteFormat = 'plain';
  }

  // More than one kind of media, each with a caption now and then.
  if (rnd() < 0.15) {
    node.image = { src: pick(rnd, [...URLS.slice(0, 2), 'photos/my photo (1).jpg']), alt: rnd() < 0.5 ? 'alt [text]' : undefined, caption: rnd() < 0.5 ? 'image caption' : undefined };
  }

  if (rnd() < 0.15) {
    node.video = { src: URLS[2], provider: 'youtube', caption: rnd() < 0.5 ? 'video caption' : undefined };
  }

  if (rnd() < 0.15) {
    node.embed = { src: URLS[5], caption: rnd() < 0.5 ? 'embed caption' : undefined };
  }

  const maxChildren = level >= 6 ? 0 : level === 0 ? 3 : rnd() < 0.55 ? 0 : Math.floor(rnd() * 3);

  for (let index = 0; index < maxChildren; index++) {
    const child = genRichNode(rnd, level + 1, `${path}${index}`);
    child.parent = node;
    node.children.push(child);
  }

  return node;
};

/** A generated tree with every node's id settled, and some nodes linking to others by id. */
const genRichDocument = (seed: number): OrbitDocument => {
  const rnd = mulberry32(seed);
  const root = genRichNode(rnd, 0, 'n');
  ensureUniqueNodeIds(root);
  const all: OrbitNode[] = [];

  const collect = (node: OrbitNode) => {
    all.push(node);
    node.children.forEach(collect);
  };

  collect(root);

  for (const node of all) {
    if (node !== root && rnd() < 0.1) {
      node.link = `#${pick(rnd, all).id}`;
    }
  }

  return { root, options: {}, warnings: [] };
};

interface RichSnapshot extends Omit<Snapshot, 'children'> {
  id: string;
  icon?: string;
  link?: string;
  type?: string;
  attrs?: Record<string, unknown>;
  noteFormat?: string;
  children: RichSnapshot[];
}

const richSnapshot = (n: OrbitNode): RichSnapshot => {
  return {
    ...snapshot(n),
    id: n.id,
    icon: n.icon,
    link: n.link,
    type: n.type,
    attrs: n.attrs && Object.keys(n.attrs).length > 0 ? n.attrs : undefined,
    noteFormat: n.note ? n.noteFormat ?? 'markdown' : undefined,
    children: n.children.map(richSnapshot),
  };
};

describe('round trips with every attribute', () => {
  const SEEDS = Number(process.env.ORBIT_FUZZ_SEEDS ?? 60);

  it(`markdown keeps ${SEEDS} generated trees with every attribute`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const doc = genRichDocument(seed * 15485863);
      const back = parseOrbitMarkdown(serializeOrbitMarkdown(doc));
      expect({ seed, tree: richSnapshot(back.root) }).toEqual({ seed, tree: richSnapshot(doc.root) });
    }
  });

  it(`YAML keeps ${SEEDS} generated trees with every attribute`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const doc = genRichDocument(seed * 32452843);
      const back = parseOrbitYAML(serializeOrbitYAML(doc));
      expect({ seed, tree: richSnapshot(back.root) }).toEqual({ seed, tree: richSnapshot(doc.root) });
    }
  });
});

