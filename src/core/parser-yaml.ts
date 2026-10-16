import type { OrbitDocumentOptions, OrbitNode, ParsedOrbitDocument } from './types.js';
import { parseYaml, yamlItemLine, yamlLineOf, YamlMiniError } from './yaml-mini.js';
import { UNTITLED_ROOT_ID, UNTITLED_ROOT_TEXT } from './parser-markdown.js';
import { upgradeFormat } from './format-upgrades.js';
import { checkNodeLinks } from './node-links.js';
import { ensureUniqueNodeIds, nodeSlug, setParent } from './utils.js';
import { DiagnosticCollector } from './diagnostics.js';
import { applyDocumentOption, DOCUMENT_OPTION_KEYS, unknownOptionMessage } from './document-options.js';
import { assignNodeAttribute, type AttributeVocabulary } from './node-attributes.js';
import { lineOfKey, normalizeSource } from './source.js';

export interface ParseYamlOptions {
  /** Throw on the first problem instead of recording a diagnostic. Off by default. */
  strict?: boolean;

  /** The name of the root Orbit makes up for several top-level nodes and no title. Default "Untitled map"; its id is `untitled-map` whatever its name. */
  untitled?: string;
}

export const parseOrbitYAML = (input: string, options: ParseYamlOptions = {}): ParsedOrbitDocument => {
  const diagnostics = new DiagnosticCollector(options.strict ?? false);
  const source = normalizeSource(input);
  const lines = source.split('\n');
  const extra: Record<string, unknown> = {};
  const result = (root: OrbitNode, docOptions: OrbitDocumentOptions): ParsedOrbitDocument => ({
    root,
    options: docOptions,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
    warnings: diagnostics.warnings,
    diagnostics: diagnostics.diagnostics,
  });

  let parsed: unknown;

  try {
    parsed = parseYaml(source);
  } catch (error) {
    const problem = error instanceof YamlMiniError ? error : null;
    diagnostics.recover('invalid-yaml', `Invalid YAML: ${problem?.reason ?? (error as Error).message}`, problem?.line ?? 1, 'error');
    return result(emptyNode(), {});
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.recover('invalid-yaml', 'A YAML map needs top-level "key: value" entries such as "nodes:".', 1, 'error');
    return result(emptyNode(), {});
  }

  const docOptions: OrbitDocumentOptions = {};
  const map = parsed as Record<string, unknown>;

  for (const [key, value] of Object.entries(map)) {
    if (key === 'nodes') {
      continue;
    }

    const line = lineOfKey(lines, key);

    if (!DOCUMENT_OPTION_KEYS.has(key)) {
      diagnostics.recover('unknown-yaml-key', unknownOptionMessage(key, 'top-level'), line);
      extra[key] = value;
      continue;
    }

    applyDocumentOption(docOptions, key, value, (message) => diagnostics.recover('invalid-option-value', message, line));
  }

  const nodes = map.nodes;

  if (!Array.isArray(nodes) || nodes.length === 0) {
    const message = nodes !== undefined && nodes !== null && !Array.isArray(nodes)
      ? '"nodes" must be a list: start the root on the line below it with "- text: …".'
      : 'No nodes found. Add a "nodes:" list with one root node.';
    diagnostics.recover('no-structure', message, lineOfKey(lines, 'nodes') ?? 1);
    return result(emptyNode(), docOptions);
  }

  const root = nodes.length === 1 ? buildNode(nodes[0], 0, undefined, diagnostics, yamlItemLine(nodes, 0)) : sharedRoot(docOptions.title, diagnostics, lineOfKey(lines, 'nodes'), options.untitled);

  if (nodes.length > 1) {
    // Several top-level nodes share a root named after the title.
    nodes.forEach((raw, index) => {
      root.children.push(buildNode(raw, 1, root, diagnostics, yamlItemLine(nodes, index)));
    });
  }

  ensureUniqueNodeIds(root);
  checkNodeLinks(root, diagnostics, (node, _href, inNote) => nodeKeyLines.get(node)?.(inNote ? 'note' : 'link'));
  const document = result(root, docOptions);
  upgradeFormat(document, diagnostics, lineOfKey(lines, 'schemaVersion'));
  document.warnings = diagnostics.warnings;
  return document;
};

const sharedRoot = (title: string | undefined, diagnostics: DiagnosticCollector, line: number | undefined, untitled = UNTITLED_ROOT_TEXT): OrbitNode => {
  if (title !== undefined) {
    return { id: nodeSlug(title), text: title, level: 0, children: [] };
  }

  diagnostics.note(
    'synthetic-root',
    `Several top-level nodes, so the map is rooted at "${untitled}". Add a title to name it.`,
    line,
  );
  // Named in the reader's language, with the same id in every one.
  return { id: UNTITLED_ROOT_ID, text: untitled, level: 0, children: [] };
};

/** A YAML node's own keys: its text and its children. */
const YAML_NODE_VOCABULARY: AttributeVocabulary = {
  keys: ['text', 'children'],
  synonyms: { title: 'text', label: 'text', name: 'text', items: 'children', nodes: 'children', subnodes: 'children' },
};

/** Keys people (and agents) write for a node's text and its children: read as them when the real key is missing, and reported. */
const TEXT_SYNONYMS = ['title', 'name', 'label'];
const CHILDREN_SYNONYMS = ['items', 'nodes', 'subnodes'];

/** The key a node's text or children are under: the real one, or a synonym standing in for it. */
const misnamedKey = (map: Record<string, unknown>, key: 'text' | 'children', diagnostics: DiagnosticCollector, lineOf: (key: string) => number | undefined): string => {
  if (map[key] !== undefined && map[key] !== null) {
    return key;
  }

  const synonym = key === 'text'
    ? TEXT_SYNONYMS.find((candidate) => typeof map[candidate] === 'string' || typeof map[candidate] === 'number')
    : CHILDREN_SYNONYMS.find((candidate) => Array.isArray(map[candidate]));

  if (synonym === undefined) {
    return key;
  }

  const what = key === 'text' ? 'text goes' : 'children go';
  diagnostics.recover('misnamed-node-key', `A node's ${what} in "${key}", not "${synonym}": read as its ${key === 'text' ? 'text' : 'children'}. Rename "${synonym}" to "${key}".`, lineOf(synonym));
  return synonym;
};

/** Where each node's keys were written, for problems found once the tree is built (links to missing nodes). */
const nodeKeyLines = new WeakMap<OrbitNode, (key: string) => number | undefined>();

/** A YAML node, from its map (or plain text); `line` is where its list item starts, for problems Orbit can't place closer. */
const buildNode = (raw: unknown, level: number, parent: OrbitNode | undefined, diagnostics: DiagnosticCollector, line?: number): OrbitNode => {
  // Scalar shorthand: a plain string/number/boolean child is its text.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    const text = raw === null || Array.isArray(raw) ? '' : String(raw);

    if (raw === null || Array.isArray(raw)) {
      diagnostics.note('ignored-node-entry', `Ignored ${Array.isArray(raw) ? 'an array' : 'a null'} node entry: expected a map or plain text.`, line);
    }

    const node: OrbitNode = { id: nodeSlug(text), text, level, children: [] };
    setParent(node, parent);
    nodeKeyLines.set(node, () => line);
    return node;
  }

  const map = raw as Record<string, unknown>;
  const lineOf = (key: string) => yamlLineOf(map, key) ?? line;

  if (map.text !== undefined && map.text !== null && typeof map.text === 'object') {
    diagnostics.recover('invalid-attributes', `text must be a word or a number, not ${Array.isArray(map.text) ? 'a list' : 'a map'}; its text form is used`, lineOf('text'));
  }

  if (map.children !== undefined && map.children !== null && !Array.isArray(map.children)) {
    const got = typeof map.children === 'object' ? 'a map' : `"${String(map.children)}"`;
    diagnostics.recover('invalid-attributes', `children must be a list of nodes, not ${got}; ignored`, lineOf('children'));
  }

  const textKey = misnamedKey(map, 'text', diagnostics, lineOf);
  const childrenKey = misnamedKey(map, 'children', diagnostics, lineOf);
  const node: OrbitNode = {
    id: (typeof map.id === 'string' || typeof map.id === 'number') && String(map.id).trim() !== '' ? String(map.id) : nodeSlug(String(map[textKey] ?? '')),
    text: String(map[textKey] ?? ''),
    level,
    children: [],
  };
  setParent(node, parent);
  nodeKeyLines.set(node, lineOf);
  const entries = Object.entries(map);

  for (const [key, value] of entries) {
    if (key === 'text' || key === 'id' || key === 'children' || key === 'caption' || key === textKey || key === childrenKey) {
      continue;
    }

    assignNodeAttribute(node, key, value, diagnostics, lineOf(key), YAML_NODE_VOCABULARY);
  }

  // A node-level caption applies to the media set above.
  if ('caption' in map) {
    assignNodeAttribute(node, 'caption', map.caption, diagnostics, lineOf('caption'));
  }

  const children = map[childrenKey];

  if (Array.isArray(children)) {
    children.forEach((child, index) => {
      node.children.push(buildNode(child, level + 1, node, diagnostics, yamlItemLine(children, index) ?? lineOf(childrenKey)));
    });
  }

  return node;
};

const emptyNode = (): OrbitNode => {
  return { id: 'empty', text: '', level: 0, children: [] };
};
