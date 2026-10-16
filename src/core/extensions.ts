/**
 * Ways to extend Orbit: node types, actions and status words. Each works for
 * one map, through its options, or for every map once registered, which also
 * covers `<orbit-map>` elements and maps in markdown pages. A map's own
 * options win over registered ones.
 */

import type { OrbitNode } from './types.js';
import type { OrbitThemeToken } from './themes.js';
import { statusTone } from './ui/detail-sheet.js';

/** The colored dots statuses get. */
export type OrbitStatusTone = 'active' | 'done' | 'blocked' | 'todo' | 'neutral';

/** How a status word looks: one of the dot tones, or any CSS color. */
export type OrbitStatusStyle = OrbitStatusTone | (string & {});

/** A button under the focused node and in its detail sheet. */
export interface OrbitAction {
  /** Names the action in the `action` event: `event.action === 'assign'`. */
  id: string;

  /** The button's name, read by screen readers, shown as its tooltip and in the detail sheet. */
  label: string | ((node: OrbitNode) => string);

  /**
   * The icon: an emoji or short symbol (`'✏️'`), SVG path data on a 24-unit
   * grid (`'M4 20h4L20 8l-4-4L4 16z'`), or one of Orbit's icons (`'note'`,
   * `'link'`, `'goto'`, `'image'`, `'video'`, `'list'`). Default: the
   * label's first letter.
   */
  icon?: string;

  /** Which nodes offer the action. Default: every node. */
  when?: (node: OrbitNode) => boolean;

  /** Runs when the button is pressed, unless an `action` listener prevents it. */
  run: (node: OrbitNode, event: MouseEvent | KeyboardEvent) => void;
}

/** How nodes of one type look and behave. Nodes pick a type with `type: name`. */
export interface OrbitNodeType {
  /** The type's name for people, shown in the detail sheet and the tooltip: `'Milestone'`. */
  label?: string;

  /** The icon these nodes get unless they set their own. */
  icon?: string;

  /** The color these nodes get unless they set their own; their children take shades of it. */
  color?: string;

  /**
   * Theme tokens for these nodes only, without `--orbit-`: their rim,
   * shadow, glow, label and status colors, such as
   * `{ 'node-stroke': '#B45309', 'node-stroke-width': '3' }`.
   */
  tokens?: Partial<Record<OrbitThemeToken, string>>;

  /**
   * Draws inside the node, the way a picture does: `element` is a 100 × 100 px
   * box clipped to the node's circle and scaled with it, and the label moves
   * outside. Return a function to clean up when the node leaves the map.
   */
  render?: (node: OrbitNode, element: HTMLElement) => void | (() => void);

  /** Adds a section to the detail sheet, above the note; the node gets a "Details" button. */
  details?: (node: OrbitNode, element: HTMLElement) => void;

  /** Actions only nodes of this type offer, after the map's own. */
  actions?: OrbitAction[];

  /**
   * The version of the fields these nodes keep in their attributes, once
   * the type changes them: 1 at first. Nodes say which version they were
   * written for (`type: task@2`; none means 1), and older ones are brought
   * up to date with `upgrade` when a map is drawn.
   */
  version?: number;

  /**
   * Brings a node written for an older version of the type up to date:
   * renames or reshapes its attributes, in place. `from` is the version it
   * was written for. Runs once per node when a map is drawn (or with
   * `upgradeNodeTypes`), and the next save writes the node as upgraded.
   * Nodes written for a newer version than this one are left as they are.
   */
  upgrade?: (node: OrbitNode, from: number) => void;
}

/** The extensions a map is created with, before the registered ones. */
export interface OrbitExtensionOptions {
  /** Node types by name. */
  nodeTypes?: Record<string, OrbitNodeType>;

  /** Actions every node offers (or the ones `when` picks). */
  actions?: OrbitAction[];

  /** Status words and how they look: `{ review: 'active', 'on hold': '#A855F7' }`. */
  statuses?: Record<string, OrbitStatusStyle>;

  /**
   * The type a node is drawn as when it names none: its look, content and
   * actions, as if it said `type: name`, for display only. Orbit never writes
   * it to the map, never upgrades a node for it, and asks again whenever it
   * draws, so return undefined to draw the node as it is. Called often: keep
   * it quick.
   */
  nodeTypeFor?: (node: OrbitNode) => string | undefined;
}

const registeredTypes = new Map<string, OrbitNodeType>();
const registeredActions = new Map<string, OrbitAction>();
const registeredStatuses = new Map<string, OrbitStatusStyle>();

/**
 * Defines a node type for every map: nodes with `type: name` (any case) take
 * it. Returns a function that removes it again.
 */
export const registerNodeType = (name: string, definition: OrbitNodeType): () => void => {
  return register(registeredTypes, wordKey(name), definition);
};

/** Adds an action to every map. Returns a function that removes it again. */
export const registerAction = (action: OrbitAction): () => void => {
  return register(registeredActions, action.id, action);
};

/**
 * Gives a status word its look on every map: one of the tones (`active`,
 * `done`, `blocked`, `todo`, `neutral`) or any CSS color. Returns a function
 * that removes it again.
 */
export const registerStatus = (word: string, style: OrbitStatusStyle): () => void => {
  return register(registeredStatuses, wordKey(word), style);
};

const register = <Value>(registry: Map<string, Value>, key: string, value: Value): () => void => {
  registry.set(key, value);

  return () => {
    if (registry.get(key) === value) {
      registry.delete(key);
    }
  };
};

/** Types and status words match whatever their case and surrounding spaces. */
const wordKey = (word: string): string => {
  return word.trim().toLowerCase();
};

const TONES = new Set<string>(['active', 'done', 'blocked', 'todo', 'neutral']);

/** How a status looks on a map: its tone, and its own color when it has one. */
export interface StatusLook {
  tone: OrbitStatusTone;
  color?: string;
}

/**
 * One map's view of the extensions: its own node types, actions and status
 * words first, then the registered ones. Lookups read the registries each
 * time, so a type registered after the map was created applies on its next
 * redraw.
 */
export class MapExtensions {
  private readonly types = new Map<string, OrbitNodeType>();
  private readonly statuses = new Map<string, OrbitStatusStyle>();
  private readonly actionList: OrbitAction[];
  private readonly typeFor: ((node: OrbitNode) => string | undefined) | undefined;

  /** `nodeTypeFor` threw: it's asked on every frame, so the console hears of it once. */
  private typeForFailed = false;

  constructor(options: OrbitExtensionOptions = {}) {
    for (const [name, definition] of Object.entries(options.nodeTypes ?? {})) {
      this.types.set(wordKey(name), definition);
    }

    for (const [word, style] of Object.entries(options.statuses ?? {})) {
      this.statuses.set(wordKey(word), style);
    }

    this.actionList = options.actions ?? [];
    this.typeFor = options.nodeTypeFor;
  }

  /**
   * The name of the type the node is drawn as: its own `type`, or for a node
   * that names none, the one `nodeTypeFor` gives it for display.
   */
  typeName(node: OrbitNode): string | undefined {
    if (node.type) {
      return node.type;
    }

    const typeFor = this.typeFor;

    if (!typeFor) {
      return undefined;
    }

    let name: string | undefined;

    try {
      name = typeFor(node);
    } catch (error) {
      if (!this.typeForFailed) {
        this.typeForFailed = true;
        console.error('[orbit] nodeTypeFor() threw:', error);
      }

      return undefined;
    }

    return typeof name === 'string' && name.trim() !== '' ? name : undefined;
  }

  /** The type the node is drawn as, if this map knows it: its own, or one given for display (see `typeName`). */
  nodeType(node: OrbitNode): OrbitNodeType | undefined {
    const name = this.typeName(node);
    return name === undefined ? undefined : this.typeNamed(name);
  }

  /** The node's own type (`type`), never one given for display: what upgrades go by. */
  ownType(node: OrbitNode): OrbitNodeType | undefined {
    return node.type ? this.typeNamed(node.type) : undefined;
  }

  private typeNamed(name: string): OrbitNodeType | undefined {
    const key = wordKey(name);
    return this.types.get(key) ?? registeredTypes.get(key);
  }

  /** The node's icon: its own, or its type's. */
  icon(node: OrbitNode): string | undefined {
    return node.icon ?? this.nodeType(node)?.icon;
  }

  /** The node's own color, or its type's. */
  color(node: OrbitNode): string | undefined {
    return node.color ?? this.nodeType(node)?.color;
  }

  /** The actions a node offers: the map's, the registered ones, then its type's, each id once. */
  actions(node: OrbitNode): OrbitAction[] {
    const seen = new Set<string>();
    const offered: OrbitAction[] = [];

    for (const action of [...this.actionList, ...registeredActions.values(), ...(this.nodeType(node)?.actions ?? [])]) {
      if (seen.has(action.id)) {
        continue;
      }

      seen.add(action.id);

      if (!action.when || guarded(`the "${action.id}" action's when()`, false, () => action.when!(node))) {
        offered.push(action);
      }
    }

    return offered;
  }

  /** How a status looks: a word this map or a registration names, or one of the built-in words. */
  status(word: string): StatusLook {
    const key = wordKey(word);
    const style = this.statuses.get(key) ?? registeredStatuses.get(key);

    if (style === undefined) {
      return { tone: statusTone(word) };
    }

    return TONES.has(style) ? { tone: style as OrbitStatusTone } : { tone: 'neutral', color: style };
  }
}

/**
 * Brings nodes written for older versions of their types up to date (see
 * `OrbitNodeType.version`), with the types `nodeTypes` defines or the
 * registered ones. Maps do this when they're drawn; this is for documents
 * read without one, on a server or in a script. Returns how many nodes
 * were upgraded.
 */
export const upgradeNodeTypes = (root: OrbitNode, nodeTypes?: Record<string, OrbitNodeType>): number => {
  return upgradeTypes(root, new MapExtensions({ nodeTypes }));
};

/** Upgrades the nodes under `root` with the types `extensions` knows. */
export const upgradeTypes = (root: OrbitNode, extensions: MapExtensions): number => {
  let upgraded = 0;

  const visit = (node: OrbitNode): void => {
    // Only a type the node names: one given for display is never written, so there's nothing to upgrade.
    const type = extensions.ownType(node);
    const from = node.typeVersion ?? 1;

    if (type?.version !== undefined && type.upgrade && from < type.version) {
      const upgrade = type.upgrade;

      const done = guarded(`the "${node.type}" type's upgrade()`, false, () => {
        upgrade(node, from);
        return true;
      });

      if (done) {
        node.typeVersion = type.version;
        upgraded += 1;
      }
    }

    node.children.forEach(visit);
  };

  visit(root);
  return upgraded;
};

/** An action's label for a node. */
export const actionLabel = (action: OrbitAction, node: OrbitNode): string => {
  return typeof action.label === 'function' ? guarded(`the "${action.id}" action's label()`, action.id, () => (action.label as (node: OrbitNode) => string)(node)) : action.label;
};

/**
 * Runs code a map was extended with. If it throws, the map carries on and
 * the console says which extension failed.
 */
export const guarded = <Result>(what: string, fallback: Result, run: () => Result): Result => {
  try {
    return run();
  } catch (error) {
    console.error(`[orbit] ${what} threw:`, error);
    return fallback;
  }
};
