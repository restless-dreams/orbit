import type { OrbitNode } from './types.js';

export const slugify = (value: string): string => {
  const slug = foldAccents(value)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'node';
};

/**
 * Drops accents from Latin, Greek and Cyrillic letters ("Investigación" becomes
 * "Investigacion") and folds compatibility forms (full-width letters,
 * ligatures) while leaving other scripts intact, so ids stay readable in
 * any language.
 */
const foldAccents = (value: string): string => {
  return value
    .normalize('NFKD')
    .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu, '$1')
    .normalize('NFC');
};

/**
 * Slug used for auto-generated node ids in both parsers and for detecting
 * explicit ids in both serializers (`nodesWithExplicitIds`), which is why
 * it lives here.
 */
export const nodeSlug = (text: string): string => {
  return (
    Array.from(
      foldAccents(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .trim()
        .replace(/\s+/g, '-'),
    )
      .slice(0, 64)
      .join('') || 'node'
  );
};

/**
 * Links a node to its parent. The link is non-enumerable so a parsed tree
 * stays a plain tree for `JSON.stringify`, spreads and structured clones.
 */
export const setParent = (node: OrbitNode, parent: OrbitNode | undefined): void => {
  Object.defineProperty(node, 'parent', { value: parent, writable: true, configurable: true, enumerable: false });
};

/**
 * Hands out node ids in document order, the way the parsers number them:
 * an id stays as it is the first time, and repeats become `id-2`, `id-3`….
 */
const nodeIdAllocator = (): { peek(base: string): string; take(base: string): string } => {
  const used = new Set<string>();
  const nextSuffix = new Map<string, number>();

  const candidate = (base: string): { id: string; suffix?: number } => {
    if (!used.has(base)) {
      return { id: base };
    }

    let suffix = nextSuffix.get(base) ?? 2;

    while (used.has(`${base}-${suffix}`)) {
      suffix += 1;
    }

    return { id: `${base}-${suffix}`, suffix };
  };

  return {
    peek: (base) => candidate(base).id,
    take: (base) => {
      const { id, suffix } = candidate(base);
      used.add(id);
      nextSuffix.set(base, suffix === undefined ? 2 : suffix + 1);
      return id;
    },
  };
};

export const ensureUniqueNodeIds = (root: OrbitNode): void => {
  const ids = nodeIdAllocator();

  const walk = (node: OrbitNode): void => {
    node.id = ids.take(node.id.trim() || slugify(node.text));

    for (const child of node.children) {
      walk(child);
    }
  };

  walk(root);
};

/**
 * The nodes whose ids a serializer has to write: those the parsers wouldn't
 * give them from their text. A second "Research" reads back as
 * `research-2` on its own, so it needs no id attribute.
 */
export const nodesWithExplicitIds = (root: OrbitNode): Set<OrbitNode> => {
  const ids = nodeIdAllocator();
  const explicit = new Set<OrbitNode>();

  const walk = (node: OrbitNode): void => {
    const fromText = nodeSlug(node.text);

    if (ids.peek(fromText) === node.id) {
      ids.take(fromText);
    } else {
      explicit.add(node);
      ids.take(node.id);
    }

    for (const child of node.children) {
      walk(child);
    }
  };

  walk(root);
  return explicit;
};

export const findNodeById = (root: OrbitNode, id: string): OrbitNode | null => {
  if (root.id === id) {
    return root;
  }

  for (const child of root.children) {
    const found = findNodeById(child, id);

    if (found) {
      return found;
    }
  }

  return null;
};

export const getNodePath = (root: OrbitNode, id: string): OrbitNode[] => {
  const path: OrbitNode[] = [];

  const walk = (node: OrbitNode, current: OrbitNode[]): boolean => {
    const next = [...current, node];

    if (node.id === id) {
      path.push(...next);
      return true;
    }

    for (const child of node.children) {
      if (walk(child, next)) {
        return true;
      }
    }

    return false;
  };

  walk(root, []);
  return path;
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};
