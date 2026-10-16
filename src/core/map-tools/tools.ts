/**
 * Map tools: what a language model needs to read a map and change it, from
 * any provider. The definitions come in each provider's shape, and `run`
 * carries out a call on a map on screen, where each change animates into
 * place and fires `edit` as anyone's would, or on a document without one,
 * on a server. A call that can't be carried out changes nothing and says
 * why, in words a model can act on: the id it meant, a move that can't be
 * made, a value the map can't use.
 */

import type { OrbitDocument, OrbitNewNode, OrbitNode, OrbitNodeInput } from '../types.js';
import type { OrbitSVGRenderer } from '../svg-renderer.js';
import { parseOrbit } from '../dispatch.js';
import { leadingEmoji, parseOrbitMarkdown } from '../parser-markdown.js';
import { formatDiagnostic } from '../diagnostics.js';
import { addToTree, moveInTree, newNodeFrom, removeFromTree, updateInTree } from '../editing.js';
import { findIndexedLinkedNode, findLinkedNode, indexNodes, isNodeLink, nodeLinksOf } from '../node-links.js';
import { findNodeById, getNodePath, nodeSlug } from '../utils.js';
import { suggest } from '../suggest.js';
import { guardUrl } from '../url-guard.js';
import { ATTRIBUTES, definitionOf, formatDefinitions, TOOL_SPECS, type MapToolDefinition, type MapToolFormats, type MapToolName, type MapToolProvider, type ToolAttribute, type ToolSpec } from './definitions.js';
import { InputError, list, readInput } from './input.js';
import { count, descendants, findNodes, nameOf, nodeDetails, outlineOf, readOutline, searchable, type Search } from './reading.js';

/** How many nodes read_map shows at once, unless `readLimit` says otherwise. */
const READ_LIMIT = 250;
/** Titles longer than this, in characters, get a hint to keep them short. */
const LONG_TITLE = 60;
/** What a CSS color looks like: a hex code, a name, or a color function. Browsers check the rest. */
const COLOR_SYNTAX = /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\(.+\))$/i;
/** Diagnostics an outline of new nodes always has, or can't judge alone. */
const OUTLINE_CODES_LEFT_OUT = new Set(['synthetic-root', 'no-structure', 'unknown-link-target']);

export interface MapToolsOptions {
  /** Offer only the tools that read the map, for an assistant that answers questions about it. Default false. */
  readOnly?: boolean;

  /** The most nodes `read_map` shows at once; a bigger map is cut short, whole levels first. Default 250. */
  readLimit?: number;
}

/** What a tool call did, to send back to the model. */
export interface MapToolResult {
  /** False when the call couldn't be carried out: nothing changed, and `text` says why and what to send instead. */
  ok: boolean;

  /** What happened, for the model, with the ids to use next. */
  text: string;

  /** Whether the map changed. */
  changed: boolean;
}

/** Map tools for one map (see `createMapTools`). */
export interface MapTools {
  /** The tools: name, description, input as JSON Schema, and hints. The shape MCP takes, and the data for any other. */
  readonly definitions: MapToolDefinition[];

  /** How to use the tools, to add to the model's system prompt. */
  readonly instructions: string;

  /** The tools in the shape a provider's API takes: `anthropic`, `openai` (Responses), `openai-chat` (Chat Completions, and most other providers) or `gemini`. */
  for<Provider extends MapToolProvider>(provider: Provider): MapToolFormats[Provider];

  /**
   * Carries out a tool call: its name, and its input as an object or as
   * the JSON text OpenAI sends. Never throws for a call a model gets wrong:
   * the result says what went wrong instead.
   */
  run(name: string, input?: unknown): MapToolResult;

  /** The map as it is now. Edits change it in place. */
  readonly document: OrbitDocument | null;
}

/** What a map on screen offers the tools: an `OrbitSVGRenderer` has it all. */
type LiveMap = Pick<OrbitSVGRenderer, 'getDocument' | 'addNode' | 'updateNode' | 'moveNode' | 'removeNode' | 'flyTo' | 'getFocusedNode' | 'getViewMode'>;

/** What the tools change: a map on screen, through its methods, or a document. */
interface Target {
  document(): OrbitDocument | null;
  add(parentId: string, input: OrbitNewNode, index?: number): OrbitNode | null;
  update(id: string, changes: OrbitNodeInput): OrbitNode | null;
  move(id: string, parentId: string, index?: number): OrbitNode | null;
  remove(id: string): OrbitNode | null;

  /** A map on screen. */
  live: LiveMap | null;

  /** Written for a newer version of the format, so this one could lose what it doesn't read by changing it. */
  newer: boolean;
}

/** A call that can't be carried out, with what to do instead. */
class CallError extends Error {}

/** What a tool did, and what's worth knowing besides. */
interface Outcome {
  text: string;
  changed: boolean;
}

/**
 * Tools a language model calls to read and edit a map: on screen (an
 * `OrbitSVGRenderer`, such as `createOrbitMap` returns or `<orbit-map>`'s
 * `renderer`), where each change animates and fires `edit`, or a document
 * (or its markdown or YAML), which they change in place.
 */
export const createMapTools = (map: OrbitSVGRenderer | OrbitDocument | string, options: MapToolsOptions = {}): MapTools => {
  const target = targetOf(map);
  const readLimit = typeof options.readLimit === 'number' && Number.isFinite(options.readLimit) ? Math.max(10, Math.trunc(options.readLimit)) : READ_LIMIT;
  const specs = TOOL_SPECS.filter((spec) => (spec.name !== 'show_node' || target.live !== null) && (spec.readOnly || !options.readOnly));
  const definitions = specs.map(definitionOf);
  // Ids this session changed or removed, so a call with an id from before still finds its node, or says what happened to it.
  const renamed = new Map<string, string>();
  const removed = new Map<string, string>();
  const notes: string[] = [];

  /** The node an id names: a node's id, with or without its #, an id from before a rename, or a title only one node has. */
  const resolve = (root: OrbitNode, given: string, field: string): OrbitNode => {
    const id = given.trim().replace(/^#/, '');
    const direct = findNodeById(root, id);

    if (direct) {
      return direct;
    }

    let current = id;
    const seen = new Set<string>();

    while (renamed.has(current) && !seen.has(current)) {
      seen.add(current);
      current = renamed.get(current)!;
    }

    const followed = current === id ? null : findNodeById(root, current);

    if (followed) {
      notes.push(`#${id} is ${nameOf(followed)} now.`);
      return followed;
    }

    if (removed.has(id)) {
      throw new CallError(`${field} names #${id}, but "${removed.get(id)}" was removed.`);
    }

    const wanted = searchable(id);
    const titled = allNodes(root).filter((node) => searchable(node.text.trim()) === wanted || node.id === nodeSlug(id));

    if (titled.length === 1) {
      notes.push(`${field} takes ids: the id of "${titled[0].text}" is #${titled[0].id}.`);
      return titled[0];
    }

    if (titled.length > 1) {
      throw new CallError(`${titled.length} nodes are called "${given}": ${titled.map((node) => `${nameOf(node)}${node.parent ? ` under "${node.parent.text}"` : ''}`).join(', ')}. Give ${field} one of their ids.`);
    }

    const near = suggest(id, allNodes(root).map((node) => node.id));
    const nearNode = near === undefined ? null : findNodeById(root, near);
    throw new CallError(`No node has the id "${id}".${nearNode ? ` Did you mean ${nameOf(nearNode)}?` : ''} read_map and find_nodes give every node's id.`);
  };

  const calls: Record<MapToolName, (values: Record<string, unknown>, root: OrbitNode, document: OrbitDocument) => Outcome> = {
    read_map: (values, root, document) => {
      const start = typeof values.node_id === 'string' ? resolve(root, values.node_id, 'node_id') : root;
      const levels = typeof values.depth === 'number' ? values.depth : Infinity;
      const { lines, complete } = readOutline(start, levels, readLimit);
      const header: string[] = [];

      if (start === root) {
        const title = document.options.title ?? root.text;
        header.push(`The map "${title}" has ${count(1 + descendants(root), 'node')}.`);
      } else {
        const path = getNodePath(root, start.id);
        header.push(`${nameOf(start)}, in ${path.slice(0, -1).map((node) => node.text).join(' › ')}, has ${count(descendants(start), 'node')} under it.`);
      }

      const live = target.live;

      if (live) {
        const focused = live.getFocusedNode();
        header.push(live.getViewMode() === 'all' || !focused ? 'The reader is looking at the whole map.' : `The reader is looking at ${nameOf(focused)}.`);
      }

      const footer = complete ? [] : ['Nodes further down aren\'t shown: read a branch with read_map and its node_id, or search with find_nodes.'];
      return { text: [header.join(' '), ...lines, ...footer].join('\n'), changed: false };
    },

    find_nodes: (values, root) => {
      if (values.query === undefined && values.status === undefined && values.tag === undefined) {
        throw new CallError('find_nodes needs something to look for: query, status, tag, or more than one.');
      }

      return { text: findNodes(root, values as Search), changed: false };
    },

    read_node: (values, root) => {
      const node = resolve(root, values.node_id as string, 'node_id');
      return { text: nodeDetails(root, node, getNodePath(root, node.id)), changed: false };
    },

    add_nodes: (values, root) => {
      const parent = resolve(root, values.parent_id as string, 'parent_id');
      const nodes = readNewNodes(values.outline as string);
      const index = values.index as number | undefined;
      const added: OrbitNode[] = [];

      nodes.forEach((input, offset) => {
        const node = target.add(parent.id, input, index === undefined ? undefined : index + offset);

        if (node) {
          added.push(node);
        }
      });

      if (added.length === 0) {
        throw new CallError(`Nothing could be added under ${nameOf(parent)}.`);
      }

      for (const node of added) {
        const twin = parent.children.find((sibling) => sibling !== node && !added.includes(sibling) && searchable(sibling.text) === searchable(node.text));

        if (twin) {
          notes.push(`${nameOf(node)} has the same title as ${nameOf(twin)} beside it. If it's there twice by mistake, remove one with remove_node.`);
        }
      }

      const all = added.flatMap(allNodes);
      const long = all.filter((node) => node.text.length > LONG_TITLE);

      if (long.length > 0) {
        notes.push(`${long.map(nameOf).join(', ')} ${long.length === 1 ? 'has a long title' : 'have long titles'}: a few words read best on the map, with the rest in the note.`);
      }

      notes.push(...brokenLinks(target.document()?.root ?? root, all));
      return {
        text: [`Added ${count(all.length, 'node')} under ${nameOf(parent)}${placeOf(added, parent)}:`, ...added.flatMap((node) => outlineOf(node))].join('\n'),
        changed: added.length > 0,
      };
    },

    update_node: (values, root) => {
      const node = resolve(root, values.node_id as string, 'node_id');
      const previousId = node.id;
      const { changes, set, cleared, absent } = readChanges(values, root, node);

      if (set.length === 0 && cleared.length === 0) {
        if (absent.length === 0) {
          throw new CallError(`update_node needs something to change: ${list(['text', ...ATTRIBUTES])}, or clear to remove attributes.`);
        }

        return { text: `${nameOf(node)} has no ${list(absent)} to remove: nothing changed.`, changed: false };
      }

      const updated = target.update(node.id, changes);

      if (!updated) {
        throw new CallError(`${nameOf(node)} couldn't be changed.`);
      }

      if (changes.note !== undefined) {
        notes.push(...brokenLinks(root, [updated]));
      }

      const described = [set.length > 0 ? `set its ${list(set)}` : '', cleared.length > 0 ? `removed its ${list(cleared)}` : ''].filter((part) => part !== '').join('; ');
      let text = `Changed ${nameOf(updated)}: ${described}.`;

      if (updated.id !== previousId) {
        renamed.set(previousId, updated.id);
        text += ` Its id is #${updated.id} now: it was #${previousId}.`;
      }

      return { text, changed: true };
    },

    move_node: (values, root) => {
      const node = resolve(root, values.node_id as string, 'node_id');

      if (values.parent_id === undefined && values.index === undefined) {
        throw new CallError('move_node needs where to move the node: parent_id, index, or both.');
      }

      const path = getNodePath(root, node.id);

      if (path.length < 2) {
        throw new CallError(`${nameOf(node)} is the root: it can't move, as every other node is under it.`);
      }

      const parent = values.parent_id === undefined ? path[path.length - 2] : resolve(root, values.parent_id as string, 'parent_id');

      if (parent === node) {
        throw new CallError(`${nameOf(node)} can't go under itself. Give parent_id another node.`);
      }

      if (getNodePath(root, parent.id).includes(node)) {
        throw new CallError(`${nameOf(node)} can't go under ${nameOf(parent)}, which is inside it. Move ${nameOf(parent)} out of it first, or choose another parent.`);
      }

      const under = descendants(node);
      const moved = target.move(node.id, parent.id, values.index as number | undefined);

      if (!moved) {
        throw new CallError(`${nameOf(node)} couldn't be moved.`);
      }

      return { text: `Moved ${nameOf(moved)}${under > 0 ? `, with the ${count(under, 'node')} under it,` : ''} under ${nameOf(parent)}${placeOf([moved], parent)}.`, changed: true };
    },

    reorder_children: (values, root) => {
      const parent = resolve(root, values.parent_id as string, 'parent_id');
      const children = [...parent.children];

      if (children.length === 0) {
        throw new CallError(`${nameOf(parent)} has no children to reorder.`);
      }

      const order = (values.order as string[]).map((given) => childNamed(parent, given));
      const twice = order.find((child, position) => order.indexOf(child) !== position);

      if (twice) {
        throw new CallError(`order lists ${nameOf(twice)} twice: list each child once.`);
      }

      const missing = children.filter((child) => !order.includes(child));

      if (missing.length > 0) {
        throw new CallError(`order needs all ${children.length} children of ${nameOf(parent)}, and leaves out ${missing.map(nameOf).join(', ')}.`);
      }

      if (order.every((child, position) => children[position] === child)) {
        return { text: `The children of ${nameOf(parent)} are in that order already.`, changed: false };
      }

      order.forEach((child, position) => {
        const current = findNodeById(target.document()?.root ?? root, parent.id) ?? parent;

        if (current.children[position]?.id !== child.id) {
          target.move(child.id, parent.id, position);
        }
      });

      return { text: `The children of ${nameOf(parent)} are in this order now: ${order.map(nameOf).join(', ')}.`, changed: true };
    },

    remove_node: (values, root) => {
      const node = resolve(root, values.node_id as string, 'node_id');

      if (node === root) {
        throw new CallError(`${nameOf(node)} is the root, and the map is all under it: it can't be removed. Remove the nodes under it one by one, or give it a new title with update_node.`);
      }

      const gone = allNodes(node);

      if (!target.remove(node.id)) {
        throw new CallError(`${nameOf(node)} couldn't be removed.`);
      }

      for (const each of gone) {
        removed.set(each.id, each.text);
      }

      return { text: `Removed ${nameOf(node)}${gone.length > 1 ? ` and the ${count(gone.length - 1, 'node')} under it` : ''}.`, changed: true };
    },

    show_node: (values, root) => {
      const node = resolve(root, values.node_id as string, 'node_id');
      target.live?.flyTo(node.id);
      return { text: `The map shows ${nameOf(node)} now, with its children around it.`, changed: false };
    },
  };

  /** The child of `parent` that `given` names. */
  const childNamed = (parent: OrbitNode, given: string): OrbitNode => {
    const id = given.trim().replace(/^#/, '');
    const child = parent.children.find((each) => each.id === id || each.id === renamed.get(id))
      ?? parent.children.find((each) => searchable(each.text.trim()) === searchable(id));

    if (!child) {
      throw new CallError(`${given} isn't a child of ${nameOf(parent)}. Its children: ${parent.children.map(nameOf).join(', ')}.`);
    }

    return child;
  };

  const run = (name: string, input?: unknown): MapToolResult => {
    notes.length = 0;
    const spec = TOOL_SPECS.find((each) => each.name === name);
    const offered = specs.find((each) => each.name === name);

    if (!offered) {
      if (spec?.name === 'show_node') {
        return failure('show_node only works on a map on screen.');
      }

      if (spec) {
        return failure(`${name} isn't available: this map can only be read.`);
      }

      const near = suggest(String(name), specs.map((each) => each.name));
      return failure(`There's no tool "${String(name)}".${near === undefined ? '' : ` Did you mean ${near}?`} The tools are ${list(specs.map((each) => each.name))}.`);
    }

    const document = target.document();

    if (!document) {
      return failure('There\'s no map to read yet: it hasn\'t been drawn.');
    }

    if (!offered.readOnly && target.newer) {
      return failure('This map was written for a newer version of Orbit, and changing it here could lose what this version doesn\'t read. It can be read, but not changed.');
    }

    try {
      const { values, ignored } = readInput(offered.name, offered.fields, input, offered.synonyms);
      const outcome = calls[offered.name](values, document.root, document);

      if (ignored.length > 0) {
        notes.push(`${offered.name} doesn't take ${list(ignored.map((key) => `"${key}"`))}, so ${ignored.length === 1 ? 'it was' : 'they were'} left out. It takes ${list(Object.keys(offered.fields))}.`);
      }

      return { ok: true, text: [outcome.text, ...notes.map((note) => `Note: ${note}`)].join('\n'), changed: outcome.changed };
    } catch (error) {
      if (error instanceof CallError || error instanceof InputError) {
        return failure(error.message, offered);
      }

      throw error;
    }
  };

  return {
    definitions,
    instructions: instructionsFor(target.live !== null, options.readOnly === true),
    for: (provider) => formatDefinitions(definitions, provider),
    run,
    get document() {
      return target.document();
    },
  };
};

const failure = (message: string, spec?: ToolSpec): MapToolResult => {
  return { ok: false, text: spec && !spec.readOnly ? `${message} Nothing changed.` : message, changed: false };
};

const targetOf = (map: OrbitSVGRenderer | OrbitDocument | string): Target => {
  if (isLiveMap(map)) {
    return {
      document: () => map.getDocument(),
      add: (parentId, input, index) => map.addNode(parentId, input, index),
      update: (id, changes) => map.updateNode(id, changes),
      move: (id, parentId, index) => map.moveNode(id, parentId, index),
      remove: (id) => map.removeNode(id),
      live: map,
      newer: false,
    };
  }

  const document = typeof map === 'string' ? parseOrbit(map) : map;

  if (!document || typeof document !== 'object' || !document.root || !Array.isArray(document.root.children)) {
    throw new TypeError(`createMapTools() takes a map on screen (createOrbitMap's result, or <orbit-map>'s renderer), a parsed document, or a map's markdown or YAML, but got ${map === null ? 'null' : typeof map}.`);
  }

  return {
    document: () => document,
    add: (parentId, input, index) => addToTree(document.root, parentId, input, index)?.node ?? null,
    update: (id, changes) => updateInTree(document.root, id, changes)?.node ?? null,
    move: (id, parentId, index) => moveInTree(document.root, id, parentId, index)?.node ?? null,
    remove: (id) => removeFromTree(document.root, id)?.node ?? null,
    live: null,
    newer: (document.diagnostics ?? []).some((diagnostic) => diagnostic.code === 'unsupported-schema-version'),
  };
};

const isLiveMap = (map: unknown): map is LiveMap => {
  const candidate = map as Partial<LiveMap> | null;
  return typeof candidate === 'object' && candidate !== null && typeof candidate.getDocument === 'function' && typeof candidate.addNode === 'function';
};

/** The text for the system prompt. */
const instructionsFor = (live: boolean, readOnly: boolean): string => {
  const lines = readOnly
    ? [
      'You can read the mind map with the map tools. Each node is an idea, with an id.',
      '- read_map shows the map as an outline, with every node\'s id; find_nodes searches a big one, and read_node shows everything about one node, its whole note included.',
      '- Answer from what the map says, and say when it doesn\'t say.',
    ]
    : [
      'You can read and change the mind map with the map tools. Each node is an idea, with an id.',
      '- Read the map before you change it: read_map shows it as an outline with every node\'s id, and find_nodes searches a big one. The other tools take those ids.',
      '- Keep titles to a few words, and put details and longer text in the note.',
      '- Write in the language the map is written in.',
      '- Add several nodes, or whole branches, with one add_nodes call.',
      '- A new title can give a node a new id: use the ids the latest results give.',
      '- Remove nodes only when asked to.',
    ];

  if (live) {
    lines.push(readOnly ? '- show_node takes the reader to a node.' : '- The reader sees each change on the map as you make it, and show_node takes them to a node.');
  }

  return lines.join('\n');
};

/** Every node from `root` down, in reading order. */
const allNodes = (root: OrbitNode): OrbitNode[] => {
  return [root, ...root.children.flatMap(allNodes)];
};

/** Where `nodes`, siblings in a row, are among their parent's children, as a result says it: after the one before them, or first. */
const placeOf = (nodes: OrbitNode[], parent: OrbitNode): string => {
  const first = parent.children.indexOf(nodes[0]);
  const last = parent.children.indexOf(nodes[nodes.length - 1]);

  if (first > 0) {
    return `, after ${nameOf(parent.children[first - 1])}`;
  }

  if (first === 0 && last < parent.children.length - 1) {
    return `, first, before ${nameOf(parent.children[last + 1])}`;
  }

  return '';
};

/** The `#id` links of `nodes` that point at no node, with the id they probably meant. */
const brokenLinks = (root: OrbitNode, nodes: OrbitNode[]): string[] => {
  const index = indexNodes(root);
  const ids = [...index.keys()];

  return nodes.flatMap((node) => nodeLinksOf(node)
    .filter((href) => !findIndexedLinkedNode(index, href))
    .map((href) => {
      const near = suggest(href.slice(1), ids);
      return `${nameOf(node)} links to ${href}, but no node has that id.${near === undefined ? '' : ` Did you mean #${near}?`}`;
    }));
};

/**
 * The nodes an outline lists, read as orbit-md: a list, headings, or lines
 * of plain text, a node each. An outline that doesn't read cleanly, such as
 * a misspelled attribute, adds nothing: the error says what to fix.
 */
const readNewNodes = (outline: string): OrbitNewNode[] => {
  let source = outline.replace(/\r\n?/g, '\n');

  if (/^\s*---\s*\n/.test(source)) {
    throw new CallError('outline takes the nodes to add as a markdown list, without frontmatter.');
  }

  let document = parseOrbitMarkdown(source);

  if (document.diagnostics.some((diagnostic) => diagnostic.code === 'no-structure')) {
    source = source.split('\n').map((line) => line.trim()).filter((line) => line !== '').map((line) => `- ${line}`).join('\n');
    document = parseOrbitMarkdown(source);
  }

  const roots = document.diagnostics.some((diagnostic) => diagnostic.code === 'synthetic-root') ? document.root.children : [document.root];
  const untitled = roots.flatMap(allNodes).find((node) => node.text.trim() === '');

  if (roots.length === 0 || untitled) {
    throw new CallError(untitled?.source
      ? `Line ${untitled.source.line} of outline has an item without a title.`
      : 'outline has no nodes: write them as a markdown list, like "- Social media\\n- Newsletter".');
  }

  // Nothing is kept from an outline with problems, so the parser's "kept as written" doesn't apply.
  const problems = document.diagnostics
    .filter((diagnostic) => !OUTLINE_CODES_LEFT_OUT.has(diagnostic.code))
    .map((diagnostic) => formatDiagnostic(diagnostic).replace(/[,;] kept as (?:a custom attribute|written)(?:, but not used)?/, ''));

  if (problems.length > 0) {
    throw new CallError(`outline doesn't read cleanly. Fix ${problems.length === 1 ? 'this' : 'these'}, and send it again:\n${problems.map((problem) => `- ${problem}`).join('\n')}\nLines count from the outline's first line.`);
  }

  return roots.map(newNodeFrom);
};

/** What update_node changes: the changes, checked; what they set and remove; and what they'd remove that isn't there. */
interface Changes {
  changes: OrbitNodeInput;
  set: string[];
  cleared: string[];
  absent: string[];
}

/** The changes update_node asks for, checked. */
const readChanges = (values: Record<string, unknown>, root: OrbitNode, node: OrbitNode): Changes => {
  const changes: OrbitNodeInput = {};
  const set: string[] = [];
  const clear = new Set((values.clear as ToolAttribute[] | undefined) ?? []);
  const cleared: string[] = [];
  const absent: string[] = [];

  const remove = (name: ToolAttribute) => {
    if (node[name] === undefined) {
      absent.push(name);
      return;
    }

    (changes as Record<string, unknown>)[name] = undefined;
    cleared.push(name);
  };

  for (const name of clear) {
    if (values[name] !== undefined) {
      throw new CallError(`${name} is both given and in clear: give it a value, or clear it.`);
    }

    remove(name);
  }

  if (values.text !== undefined) {
    let text = String(values.text).replace(/\s+/g, ' ').trim();

    if (text === '') {
      throw new CallError('text can\'t be empty: every node has a title. To take the node out of the map, use remove_node.');
    }

    const emoji = leadingEmoji(text);

    if (emoji && values.icon === undefined && !clear.has('icon')) {
      // Saved, the map would read the emoji back as the node's icon.
      changes.icon = emoji.icon;
      text = emoji.text;
      set.push('icon');
    }

    changes.text = text;
    set.push('title');
  }

  const text = (name: 'note' | 'status' | 'icon' | 'color' | 'link'): string | undefined => {
    const value = values[name];

    if (value === undefined) {
      return undefined;
    }

    const written = name === 'note' ? String(value).trim() : String(value).replace(/\s+/g, ' ').trim();

    if (written === '') {
      remove(name);
      return undefined;
    }

    set.push(name);
    return written;
  };

  const note = text('note');

  if (note !== undefined) {
    changes.note = note;
  }

  const status = text('status');

  if (status !== undefined) {
    changes.status = status;
  }

  if (values.priority !== undefined) {
    changes.priority = values.priority as number;
    set.push('priority');
  }

  if (values.tags !== undefined) {
    const tags = [...new Set((values.tags as string[]).map((tag) => tag.replace(/^#/, '').trim()).filter((tag) => tag !== ''))];

    if (tags.length === 0) {
      remove('tags');
    } else {
      changes.tags = tags;
      set.push('tags');
    }
  }

  const icon = text('icon');

  if (icon !== undefined) {
    if (/^[\p{L}\p{N}][\p{L}\p{N}\s'-]+$/u.test(icon) || Array.from(icon).length > 8) {
      throw new CallError(`icon takes an emoji, such as 🚀, not ${JSON.stringify(icon)}.`);
    }

    changes.icon = icon;
  }

  const color = text('color');

  if (color !== undefined) {
    const supports = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' ? CSS.supports('color', color) : true;

    if (!COLOR_SYNTAX.test(color) || !supports) {
      throw new CallError(`"${color}" isn't a CSS color. Use a color name, such as tomato, or a code, such as #E8A33D.`);
    }

    changes.color = color;
  }

  const link = text('link');

  if (link !== undefined) {
    if (isNodeLink(link)) {
      if (!findLinkedNode(root, link)) {
        const near = suggest(link.slice(1), allNodes(root).map((each) => each.id));
        throw new CallError(`link ${link} points at no node.${near === undefined ? '' : ` Did you mean #${near}?`} Node links are # and a node's id.`);
      }
    } else if (guardUrl(link, 'link', false) === null) {
      throw new CallError(`"${link}" isn't an address the map can open: use a web address, such as https://example.com.`);
    }

    changes.link = link;
  }

  for (const name of ['image', 'video', 'embed'] as const) {
    const media = values[name] as Record<string, string> | undefined;

    if (media === undefined) {
      continue;
    }

    const src = media.src.trim();

    if (src === '') {
      remove(name);
      continue;
    }

    if (guardUrl(src, name, false) === null) {
      throw new CallError(`${name} can't show "${src}": use a web address, such as https://example.com/${name === 'image' ? 'photo.jpg' : name === 'video' ? 'video.mp4' : 'page'}.`);
    }

    const extras = Object.fromEntries(Object.entries(media).filter(([key, value]) => key !== 'src' && value.trim() !== '').map(([key, value]) => [key, value.trim()]));
    (changes as Record<string, unknown>)[name] = { src, ...extras };
    set.push(name === 'image' ? 'picture' : name === 'embed' ? 'embedded page' : 'video');
  }

  if (values.collapsed !== undefined) {
    if (values.collapsed === true) {
      changes.collapsed = true;
      set.push('collapsed');
    } else {
      remove('collapsed');
    }
  }

  return { changes, set, cleared, absent };
};
