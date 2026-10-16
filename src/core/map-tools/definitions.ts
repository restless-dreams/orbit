/**
 * The map tools as a model sees them: names, descriptions and inputs, and
 * the shapes each provider's API takes them in.
 */

import { schemaOf, type Fields, type MapToolSchema } from './input.js';

export type MapToolName =
  | 'read_map'
  | 'find_nodes'
  | 'read_node'
  | 'add_nodes'
  | 'update_node'
  | 'move_node'
  | 'reorder_children'
  | 'remove_node'
  | 'show_node';

/** A tool as `MapTools.definitions` lists it: the shape MCP uses, and the data to build any other. */
export type MapToolDefinition = {
  name: MapToolName;
  description: string;

  /** The tool's input, as JSON Schema. */
  inputSchema: MapToolSchema;

  /** Hints for clients that ask before running some tools: whether it only reads, and whether it can remove or overwrite what's there. */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean };
};

/** The tools in the shape each provider's API takes them. */
export type MapToolFormats = {
  /** Anthropic's Messages API (`tools`). */
  anthropic: { name: string; description: string; input_schema: MapToolSchema }[];

  /** OpenAI's Responses API (`tools`). */
  openai: { type: 'function'; name: string; description: string; parameters: MapToolSchema; strict: false }[];

  /** OpenAI's Chat Completions API (`tools`), which most other providers and local servers take too. */
  'openai-chat': { type: 'function'; function: { name: string; description: string; parameters: MapToolSchema } }[];

  /** Google's Gemini API (`config.tools` in `@google/genai`). */
  gemini: { functionDeclarations: { name: string; description: string; parametersJsonSchema: MapToolSchema }[] }[];
};

export type MapToolProvider = keyof MapToolFormats;

const PROVIDERS: readonly MapToolProvider[] = ['anthropic', 'openai', 'openai-chat', 'gemini'];

/** A tool, before it's written as a definition. */
export interface ToolSpec {
  name: MapToolName;
  description: string;
  fields: Fields;

  /** Other names models give its fields, lowercase. */
  synonyms?: Record<string, string>;

  readOnly: boolean;
  destructive: boolean;
}

/** The attributes `update_node` sets and `clear` removes. */
export const ATTRIBUTES = ['note', 'status', 'priority', 'tags', 'icon', 'color', 'link', 'image', 'video', 'embed', 'collapsed'] as const;

export type ToolAttribute = (typeof ATTRIBUTES)[number];

const NODE_ID = 'node_id';
const NODE_SYNONYMS = { id: NODE_ID, node: NODE_ID, nodeid: NODE_ID };

/** Every tool, in the order they're offered. `show_node` is only for a map on screen. */
export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: 'read_map',
    description: 'Read the mind map as an outline: a line for each node (an idea), indented under its parent, with its id after a #, its attributes in parentheses, and the start of its note on the next line after >. Read it before changing the map: the other tools take these ids. A big map is cut short: read a branch with node_id, or search with find_nodes.',
    fields: {
      node_id: { type: 'string', description: 'Read only this node and the nodes under it. Leave out to read the whole map.' },
      depth: { type: 'integer', minimum: 1, description: 'How many levels under it to read: 1 for its children only. Leave out to read them all.' },
    },
    synonyms: NODE_SYNONYMS,
    readOnly: true,
    destructive: false,
  },
  {
    name: 'find_nodes',
    description: 'Search the map for nodes by the words in their titles, notes and tags, by status or by tag. Returns each match with its id and where it is in the map.',
    fields: {
      query: { type: 'string', description: 'Words to look for, in any case, with or without accents. A node matches when it has every word.' },
      status: { type: 'string', description: 'Only nodes with this status. todo, active, done and blocked also find the words that mean the same, such as planned, in progress, shipped or stuck.' },
      tag: { type: 'string', description: 'Only nodes with this tag.' },
    },
    synonyms: { text: 'query', search: 'query', words: 'query', tags: 'tag' },
    readOnly: true,
    destructive: false,
  },
  {
    name: 'read_node',
    description: 'Read everything about one node: its title, its whole note, its attributes, its picture, video or embedded page, where it is in the map, its children, and the nodes that link to it.',
    fields: {
      node_id: { type: 'string', required: true, description: 'The node to read, by the id read_map or find_nodes gave.' },
    },
    synonyms: NODE_SYNONYMS,
    readOnly: true,
    destructive: false,
  },
  {
    name: 'add_nodes',
    description: 'Add nodes under a node: one, several, or whole branches at once, written as a markdown list. Each item is a node, items indented under it are its children, at any depth, and indented lines under an item that aren\'t items are its note. On an item\'s line, [ ], [/] or [x] first sets its status to todo, active or done, an emoji first sets its icon, words after a # at the end are its tags, and <!-- orbit color: tomato, priority: 1 --> at the end sets other attributes. Returns the new nodes with their ids.',
    fields: {
      parent_id: { type: 'string', required: true, description: 'The node to add them under.' },
      outline: { type: 'string', required: true, description: 'The nodes, as a markdown list: "- Social media\\n  - Instagram\\n- Newsletter".' },
      index: { type: 'integer', minimum: 0, description: 'Where they go among the children of parent_id: 0 puts them first. Leave out to put them last.' },
    },
    synonyms: { parent: 'parent_id', parentid: 'parent_id', under: 'parent_id', markdown: 'outline', nodes: 'outline', items: 'outline', children: 'outline', text: 'outline', position: 'index' },
    readOnly: false,
    destructive: false,
  },
  {
    name: 'update_node',
    description: 'Change a node\'s title or attributes. Only the fields you give change; to remove an attribute, name it in clear. A new title can give the node a new id, which the result says.',
    fields: {
      node_id: { type: 'string', required: true, description: 'The node to change.' },
      text: { type: 'string', description: 'Its title: plain text, a few words.' },
      note: { type: 'string', description: 'Its note, in markdown, for details and longer text. Replaces the note it has.' },
      status: { type: 'string', description: 'todo, active, done or blocked, which show a colored dot, or any other word.' },
      priority: { type: 'number', description: 'A number, such as 1 for the most important.' },
      tags: { type: 'list', description: 'All its tags, as words: they replace the ones it has.' },
      icon: { type: 'string', description: 'An emoji shown before its title.' },
      color: { type: 'string', description: 'A CSS color, such as #E8A33D or tomato: its children take shades of it. Nodes without one take the theme\'s colors, so set it only when asked.' },
      link: { type: 'string', description: 'A web address it links to, or #id to link to another node of the map.' },
      image: {
        type: 'record',
        description: 'A picture shown in the node.',
        fields: {
          src: { type: 'string', required: true, description: 'The picture\'s address.' },
          alt: { type: 'string', description: 'What the picture shows, for people who can\'t see it.' },
          caption: { type: 'string', description: 'A caption.' },
        },
      },
      video: {
        type: 'record',
        description: 'A video the node plays.',
        fields: {
          src: { type: 'string', required: true, description: 'The video\'s address: YouTube, Vimeo or a video file.' },
          caption: { type: 'string', description: 'A caption.' },
        },
      },
      embed: {
        type: 'record',
        description: 'A web page shown in a frame in the node\'s details.',
        fields: {
          src: { type: 'string', required: true, description: 'The page\'s address.' },
          caption: { type: 'string', description: 'A caption.' },
        },
      },
      collapsed: { type: 'boolean', description: 'true hides its children until the reader opens it.' },
      clear: { type: 'list', values: ATTRIBUTES, description: 'Attributes to remove, such as ["status", "color"].' },
    },
    synonyms: {
      ...NODE_SYNONYMS, title: 'text', name: 'text', label: 'text', notes: 'note', description: 'note', details: 'note', state: 'status',
      tag: 'tags', labels: 'tags', emoji: 'icon', colour: 'color', url: 'link', href: 'link', picture: 'image', photo: 'image',
      remove: 'clear', unset: 'clear', delete: 'clear',
    },
    readOnly: false,
    destructive: true,
  },
  {
    name: 'move_node',
    description: 'Move a node, with everything under it, under another node, or to another place among its siblings.',
    fields: {
      node_id: { type: 'string', required: true, description: 'The node to move.' },
      parent_id: { type: 'string', description: 'The node to move it under. Leave out to keep its parent and change only its place.' },
      index: { type: 'integer', minimum: 0, description: 'Its place among the children of its new parent: 0 puts it first. Leave out to put it last.' },
    },
    synonyms: { ...NODE_SYNONYMS, parent: 'parent_id', parentid: 'parent_id', under: 'parent_id', to: 'parent_id', position: 'index' },
    readOnly: false,
    destructive: false,
  },
  {
    name: 'reorder_children',
    description: 'Put the children of a node in a new order, all at once: to sort them, or to group the ones that go together.',
    fields: {
      parent_id: { type: 'string', required: true, description: 'The node whose children to reorder.' },
      order: { type: 'list', required: true, description: 'The ids of all its children, in their new order.' },
    },
    synonyms: { parent: 'parent_id', parentid: 'parent_id', node_id: 'parent_id', id: 'parent_id', ids: 'order', children: 'order', child_ids: 'order' },
    readOnly: false,
    destructive: false,
  },
  {
    name: 'remove_node',
    description: 'Remove a node and everything under it. Remove nodes only when asked to.',
    fields: {
      node_id: { type: 'string', required: true, description: 'The node to remove. The root can\'t be removed.' },
    },
    synonyms: NODE_SYNONYMS,
    readOnly: false,
    destructive: true,
  },
  {
    name: 'show_node',
    description: 'Show the reader a node: the map flies to it, with its children around it. Use it when they ask to see or go to something, or to show them what you changed.',
    fields: {
      node_id: { type: 'string', required: true, description: 'The node to show.' },
    },
    synonyms: NODE_SYNONYMS,
    readOnly: true,
    destructive: false,
  },
];

export const definitionOf = (spec: ToolSpec): MapToolDefinition => {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: schemaOf(spec.fields),
    annotations: { readOnlyHint: spec.readOnly, destructiveHint: spec.destructive },
  };
};

/** The definitions in the shape `provider`'s API takes. */
export const formatDefinitions = <Provider extends MapToolProvider>(definitions: readonly MapToolDefinition[], provider: Provider): MapToolFormats[Provider] => {
  const tools = definitions.map(({ name, description, inputSchema }) => ({ name, description, schema: structuredCopy(inputSchema) }));

  switch (provider as MapToolProvider) {
    case 'anthropic':
      return tools.map(({ name, description, schema }) => ({ name, description, input_schema: schema })) as MapToolFormats[Provider];
    case 'openai':
      // Strict mode would make every field required: models would send each one, and couldn't leave any out.
      return tools.map(({ name, description, schema }) => ({ type: 'function', name, description, parameters: schema, strict: false })) as MapToolFormats[Provider];
    case 'openai-chat':
      return tools.map(({ name, description, schema }) => ({ type: 'function', function: { name, description, parameters: schema } })) as MapToolFormats[Provider];
    case 'gemini':
      return [{ functionDeclarations: tools.map(({ name, description, schema }) => ({ name, description, parametersJsonSchema: schema })) }] as MapToolFormats[Provider];
    default:
      throw new TypeError(`Map tools come in the shapes of ${PROVIDERS.map((name) => `"${name}"`).join(', ')}, not ${JSON.stringify(provider)}. For any other, build them from tools.definitions: each has a name, a description and an inputSchema (JSON Schema).`);
  }
};

/** A copy a caller can change without changing the definitions. */
const structuredCopy = <Value>(value: Value): Value => {
  return JSON.parse(JSON.stringify(value)) as Value;
};
