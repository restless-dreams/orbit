/**
 * Framework-agnostic types for Orbit.
 */

import type { OrbitStrings } from './languages.js';
import type { OrbitDiagnostic } from './diagnostics.js';
import type { OrbitThemeName, OrbitThemeToken } from './themes.js';
import type { OrbitAction, OrbitNodeType, OrbitStatusStyle } from './extensions.js';

/** One node of a map, as the parsers produce it. */
export interface OrbitNode {
  /** Unique within the map: a slug of the text (`Product roadmap` becomes `product-roadmap`), or the `id` attribute. */
  id: string;

  /** The node's label, without its icon. */
  text: string;

  /** Depth in the tree: 0 for the root. */
  level: number;

  /** Any CSS color. Without one, the node takes its branch's color from the theme or `palette`. */
  color?: string;

  /**
   * Which of the palette's colors the node takes when it has no `color` of
   * its own: `1` is the first after the root's, cycling. Without one, a
   * top-level node takes the next in turn and a deeper node a shade of its
   * branch's. Edits on the map write it to keep a top-level node's color
   * when the nodes around it change.
   */
  paletteColor?: number;

  /** An emoji (or any short symbol) shown before the text. */
  icon?: string;

  /** Hide the node's children until it is opened. */
  collapsed?: boolean;

  /**
   * The node's type, such as `milestone`. A type defined in the `nodeTypes`
   * option or with `registerNodeType` sets its look, content and actions.
   */
  type?: string;

  /**
   * The version of its type the node was written for, when the type has
   * changed its fields since its first one: `type: task@2`. Not written
   * means 1. See `OrbitNodeType.version`.
   */
  typeVersion?: number;

  /**
   * A URL the node links to, offered as a button when the node is in focus.
   * `#id` links to another node of the map: the button flies there.
   */
  link?: string;

  /** Longer text, shown in the detail sheet: markdown unless `noteFormat` is `plain`. */
  note?: string;

  noteFormat?: 'markdown' | 'plain';
  tags?: string[];

  /**
   * Free text. Some words get a colored dot: `active` (also `doing`, `in progress`),
   * `done` (`complete`, `shipped`), `blocked` (`stuck`, `at risk`), `todo` (`planned`, `next`).
   */
  status?: string;

  priority?: number;

  /** A picture shown inside the node and in the detail sheet. */
  image?: { src: string; alt?: string; caption?: string };

  /** A video (YouTube, Vimeo or a file) played in the detail sheet. */
  video?: { src: string; provider?: 'youtube' | 'vimeo' | 'native'; thumbnail?: string; caption?: string };

  /** A page shown in a frame in the detail sheet. */
  embed?: { src: string; caption?: string };

  /** Attributes Orbit doesn't use itself, kept for your own code (`<!-- orbit owner: Ana -->`). */
  attrs?: Record<string, unknown>;

  /** Where the node comes from in a markdown source. */
  source?: {
    line: number;
    raw: string;
  };

  children: OrbitNode[];

  /** The parent node. Set by the parsers as a non-enumerable property, so trees stay JSON-serializable. */
  parent?: OrbitNode;
}

/** Orbit's own buttons for a node: its picture, video, embed, note, link, and its type's details. */
export type OrbitContentAction = 'image' | 'video' | 'embed' | 'note' | 'link' | 'details';

/** A button pressed under the focused node or in its detail sheet. */
export interface OrbitActionEvent {
  node: OrbitNode;

  /** One of Orbit's buttons, or the `id` of one of your actions. */
  action: OrbitContentAction | (string & {});

  sourceEvent: MouseEvent | KeyboardEvent;
}

/** The `action` event: call `preventDefault()` to skip what the button does (the detail sheet, the link, or your action's `run`). */
export interface OrbitActionDetail extends OrbitActionEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/**
 * What a map reports, by event name. Listen with `renderer.on(name, listener)`,
 * or for `orbit-<name>` DOM events, which bubble from the map's container
 * (and out of `<orbit-map>`).
 */
export interface OrbitEventMap {
  /** The focused node changed. `path` runs from the root to `node`. */
  'focus-change': { node: OrbitNode; path: OrbitNode[] };

  /** The map switched between focus mode and the overview. */
  'view-mode-change': { mode: ViewMode };

  /** A node was clicked or activated with the keyboard, before the map reacts. */
  'node-click': { node: OrbitNode };

  /** A content button under the focused node was pressed. */
  action: OrbitActionDetail;

  /** A spun orbit came to rest, with this planet on top. */
  'spin-settle': { planet: OrbitNode };

  /**
   * A node was long-pressed, right-clicked, or chosen with the context menu
   * key: the place for a menu of things to do with it. A DOM listener calls
   * `preventDefault()` to take the press (see `onNodeContext`).
   */
  'node-context': OrbitNodeContextEvent;

  /** The map was edited with `addNode`, `updateNode`, `removeNode` or `moveNode`. */
  edit: OrbitEdit;

  /** The field for typing on the map opened: on a node, or in the orbit for a new idea. */
  'editor-open': OrbitEditorEvent;

  /** The field for typing on the map closed. */
  'editor-close': OrbitEditorEvent;

  /** A node is dragged somewhere else on an editable map: lifted, carried over a place, or let go (see `phase`). */
  'node-drag': OrbitNodeDragEvent;

  /** The media viewer opened, or stepped to another picture or video. */
  'media-open': OrbitMediaEvent;

  /** The media viewer closed. */
  'media-close': OrbitMediaEvent;

  /** The video in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. */
  'media-state': OrbitMediaState;
}

/** A node's picture or video in the media viewer. */
export interface OrbitMediaEvent {
  node: OrbitNode;

  /** `image`, the node's picture, or `video`, its video. */
  kind: 'image' | 'video';

  /** Its place among the map's pictures and videos, in reading order, from 0. */
  index: number;

  /** How many pictures and videos the viewer steps through. */
  total: number;
}

/** What `openMedia` shows. */
export interface OrbitMediaOptions {
  /** For a node with a picture and a video: which to show. Default: the picture. */
  kind?: 'image' | 'video';

  /** Start a video playing as it opens. Default true. */
  autoplay?: boolean;

  /** Start a video this many seconds in. YouTube and Vimeo start at the whole second. Default 0. */
  startAt?: number;
}

/** The video in the media viewer, as it plays (see the `media-state` event). */
export interface OrbitMediaState {
  node: OrbitNode;

  /** Playing, rather than paused, not started yet, or ended. */
  playing: boolean;

  /** Where it is, in seconds from the start. */
  time: number;

  /** How long it is, in seconds, once known. */
  duration: number | null;

  /** It played to the end. */
  ended: boolean;

  /**
   * Its sound is off. Browsers let a video start with sound only once the
   * reader has interacted with the page; a video started before that plays
   * muted.
   */
  muted: boolean;
}

/**
 * A node dragged somewhere else (see `editable`). `start` as it leaves its
 * place under the finger, the moment to close a menu the long press opened;
 * `over` whenever where it would go changes; `end` when it's let go, after
 * the `edit` that moved it, if it moved.
 */
export interface OrbitNodeDragEvent {
  phase: 'start' | 'over' | 'end';
  node: OrbitNode;

  /**
   * Where it would go, or (on `end`) went: into `parent`, at `index` among
   * its children (null: after the last). On `start`, where it was; null over
   * no place, and on an `end` that put it back.
   */
  parent: OrbitNode | null;

  index: number | null;
}

/** The field for typing a node's text on the map (see `editable`, `editNode` and `editNewNode`). */
export interface OrbitEditorEvent {
  /** The node whose text is typed, or null for a new idea. */
  node: OrbitNode | null;

  /** For a new idea, the node it goes under. */
  parent: OrbitNode | null;
}

/** A long press, right click or context menu key on a node. */
export interface OrbitNodeContextEvent {
  node: OrbitNode;

  /** Where, in CSS pixels from the map's top left corner: the press, or the node's center for the keyboard. */
  x: number;

  y: number;
}

/** An edit to the map, as the `edit` event and `onEdit` report it. */
export interface OrbitEdit {
  kind: 'add' | 'update' | 'remove' | 'move';

  /** The node added, changed, removed or moved. */
  node: OrbitNode;

  /** The whole tree after the edit. `renderer.toMarkdown()` writes it as orbit-md. */
  tree: OrbitNode;
}

/** What `addNode` and `updateNode` take: a node's text and attributes. */
export type OrbitNodeInput = Partial<Pick<
  OrbitNode,
  'text' | 'icon' | 'color' | 'paletteColor' | 'status' | 'priority' | 'tags' | 'collapsed' | 'link' | 'note' | 'noteFormat' | 'image' | 'video' | 'embed' | 'type' | 'typeVersion' | 'attrs'
>>;

/** What `addNode` takes: a node's text and attributes, and the nodes to add under it, as many levels down as you like. */
export type OrbitNewNode = OrbitNodeInput & { text: string; children?: OrbitNewNode[] };

export type OrbitEventName = keyof OrbitEventMap;

/** `focus`: one node at the center with its children around it. `all`: the overview of the whole tree. */
export type ViewMode = 'focus' | 'all';

/** A built-in theme, or `auto` for `paper` or `night` following the reader's light or dark preference. */
export type OrbitThemePreset = OrbitThemeName | 'auto';

export interface ContainerSize {
  width: number;
  height: number;
}

/** Options a document sets in its frontmatter (markdown) or top-level keys (YAML). */
export interface OrbitDocumentOptions {
  /** The map's accessible name and SVG title. */
  title?: string;

  /** A theme name, as written (unknown names are reported and ignored). */
  theme?: string;

  /** Written `view:` in the document. */
  viewMode?: ViewMode;

  showRings?: boolean;
  interactive?: boolean;

  /** Written `animation:` in the document. */
  orbitAnimation?: boolean;

  /** Written `speed:` in the document: seconds per turn of the orbit's drift. */
  orbitSpeed?: number;

  palette?: string[];

  /** Height in pixels, used by `<orbit-map>` elements and marked placeholders. */
  height?: number;

  maxDepth?: number;
  className?: string;
  baseUrl?: string;

  /** The format version the document is written for. */
  schemaVersion?: number;
}

/** A parsed map: its tree, its options and the problems the parser worked around. */
export interface OrbitDocument {
  root: OrbitNode;
  options: OrbitDocumentOptions;

  /**
   * Frontmatter or top-level YAML keys Orbit doesn't read (another app's,
   * or a newer Orbit's), as written. Both serializers write them back, so
   * nothing a document says is lost by reading and saving it.
   */
  extra?: Record<string, unknown>;

  /** Problems the parser recovered from, one line each ("Line 4: …"). */
  warnings: string[];

  /** The same problems with a code, line and severity. Always set on parse results. */
  diagnostics?: OrbitDiagnostic[];
}

/** A document as the parsers return it, with its diagnostics always set. */
export type ParsedOrbitDocument = OrbitDocument & { diagnostics: OrbitDiagnostic[] };

/**
 * A theme with your own values: `{ preset: 'night', tokens: { surface: '#0b1020', 'ring-dash': 'none' } }`.
 * Each token sets the matching `--orbit-*` CSS custom property on the map,
 * so a value the page sets in its own CSS still wins.
 */
export interface OrbitRendererTheme {
  /** The theme to start from: a built-in one or one registered with `registerTheme`. Without one, the document's theme (or `paper`). */
  preset?: OrbitThemePreset | (string & {});

  /** Token values by name, as listed in `THEME_TOKENS` (`surface`, `color-1`, `ring-dash`, …). */
  tokens?: Partial<Record<OrbitThemeToken, string>>;
}

/** How a flicked orbit spins in focus mode. */
export interface OrbitSpinOptions {
  /** Seconds for a free spin to lose about two thirds of its speed. Default 1.4. */
  decay?: number;

  /** Fastest spin, in degrees per second. Default 1440 (four turns a second). */
  maxSpeed?: number;

  /** Bring the nearest planet to the top as a spin comes to rest. Off by default. */
  snap?: 'planet' | false;

  /** Vibrate briefly as planets pass the top, on devices that support it. Off by default. */
  haptics?: boolean;
}

/** How the map responds to the wheel, trackpads and pinches. */
export interface OrbitZoomOptions {
  /**
   * `auto` (default): the wheel zooms freely when the map is the whole page
   * and needs Ctrl or ⌘ when the page scrolls; `always`; `modifier`; or
   * `false` to ignore the wheel.
   */
  wheel?: 'auto' | 'always' | 'modifier' | false;

  /** Smallest zoom, relative to the fitted view. Default 0.4. */
  minimum?: number;

  /** Largest zoom, relative to the fitted view. Default 6. */
  maximum?: number;
}

/**
 * How a map looks and behaves. Every option is optional; options passed to
 * the renderer win over the document's frontmatter.
 */
/** Room the page's own controls take at the map's edges, in px (see `RendererOptions.insets`). */
export interface OrbitInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface RendererOptions {
  /** The first view: `focus` (default) or `all`, the overview. */
  viewMode?: ViewMode;

  /**
   * The node in focus when the map first draws, by id: to open a map where
   * the reader left it. Default: the root. Later renders keep the reader's place.
   */
  focus?: string;

  /** Draw the dashed orbit rings. Default true. */
  showRings?: boolean;

  /** `false` draws a still picture: no clicks, drags, zoom or keyboard. Default true. */
  interactive?: boolean;

  /** Keep the orbit turning slowly on its own. */
  orbitAnimation?: boolean;

  /** Seconds per revolution of `orbitAnimation`. */
  orbitSpeed?: number;

  /** Levels below the root to render (1 = root + direct children). */
  maxDepth?: number;

  /** Node colors: the first for the root, then one per top-level branch (cycling). Default: the theme's. */
  palette?: string[];

  /**
   * A theme name (`'night'`, `'cosmos'`, or one registered with
   * `registerTheme`) or a theme object. An object without a `preset` keeps
   * the document's theme and changes the tokens it names.
   */
  theme?: OrbitThemePreset | (string & {}) | OrbitRendererTheme;

  /** The map's accessible name. Default: the document's `title`. */
  ariaLabel?: string;

  /**
   * The language of the map's controls, sheets and announcements: a BCP 47
   * tag such as `es` or `pt-BR`. Default: the language the map's element is
   * in (the closest `lang` attribute), then English. Orbit speaks English and
   * Spanish; `registerLanguage` adds others.
   */
  language?: string;

  /** Words to change on this map only, over its language's: `{ zoomIn: 'Closer' }`. */
  strings?: Partial<OrbitStrings>;

  /** Breadcrumbs, the view switch, the list button and zoom buttons. Default true. */
  showControls?: boolean;

  /** How a flicked orbit spins. */
  spin?: OrbitSpinOptions;

  /** How the wheel, trackpads and pinches zoom. */
  zoom?: OrbitZoomOptions;

  /** Navigation flight length in milliseconds, or `auto` to scale with the distance travelled. */
  transitionDuration?: 'auto' | number;

  /** A node was clicked or activated with the keyboard, before the map reacts. */
  onNodeClick?: (node: OrbitNode) => void;

  onViewModeChange?: (mode: ViewMode) => void;

  /** A button was pressed. Return `false` to skip what it does (the detail sheet, the link, or your action's `run`). */
  onAction?: (event: OrbitActionEvent) => void | false;

  /** A new node is in focus. */
  onFocusChange?: (node: OrbitNode) => void;

  /**
   * A node was long-pressed, right-clicked or chosen with the context menu
   * key: show a menu of things to do with it at (`x`, `y`). With this
   * callback or a `node-context` listener, the press is yours: it doesn't
   * open the node, and the browser's own menu stays closed.
   */
  onNodeContext?: (event: OrbitNodeContextEvent) => void;

  /** The map was edited with `addNode`, `updateNode`, `removeNode` or `moveNode`; save `renderer.toMarkdown()` to keep it. */
  onEdit?: (edit: OrbitEdit) => void;

  /** The field for typing on the map opened. */
  onEditorOpen?: (event: OrbitEditorEvent) => void;

  /** The field for typing on the map closed. */
  onEditorClose?: (event: OrbitEditorEvent) => void;

  /** A node is dragged somewhere else (see `editable` and the `node-drag` event). */
  onNodeDrag?: (event: OrbitNodeDragEvent) => void;

  /**
   * How long (ms) a finger or pen holds still on a node before it counts as
   * a long press (see `onNodeContext`). Default 500; apps can pass their
   * platform's own, such as Android's 400.
   */
  longPressDelay?: number;

  /**
   * The parts of the map the page covers with its own controls, such as a
   * toolbar floating over its bottom edge, in px from each edge. Views are
   * fitted into what's left, and the map still draws under the controls.
   * Changing them glides a fitted view to its new place.
   */
  insets?: OrbitInsets;

  /**
   * Build the map on the map: a + in the orbit adds an idea, typed right
   * in its new planet, and a long press, a right click or F2 edits a
   * node's text where it is. A node held still, by a long press or the
   * mouse, lifts: drag it onto another node to move it there, or to a place
   * in the orbit to put it there. Default false.
   */
  editable?: boolean;

  /**
   * Keys for building an editable map at speed, as in mind-map apps. On a
   * node with keyboard focus, Tab (or Insert) adds an idea under it,
   * Shift+Enter adds one beside it, and Delete removes it. While typing,
   * Tab keeps what was typed and goes on a level down, under it; with
   * nothing typed, it moves the field under the idea before. Shift+Tab goes
   * on a level up, beside the parent. Tab then stays in the map; Shift+Tab
   * from a node still leaves it. Default false.
   */
  editingKeys?: boolean;

  /** Called when a flicked orbit comes to rest, with the planet nearest the top. */
  onSpinSettle?: (planet: OrbitNode) => void;

  /** Buttons under the focused node for its note, media, link and actions. Default true. */
  showActionButtons?: boolean;

  /** Open the built-in detail sheet for notes, embeds and the details of a node's type. Default true. */
  showDetailSheet?: boolean;

  /**
   * Show pictures and videos in the media viewer, over the whole window:
   * "View image" and "Play video" open it, and so do the pictures and
   * videos in the detail sheet. Default true. With `false`, those buttons
   * open the detail sheet instead (unless `showDetailSheet` is `false` too).
   * `openMedia` opens the viewer either way.
   */
  mediaViewer?: boolean;

  /** The media viewer opened, or stepped to another picture or video. */
  onMediaOpen?: (event: OrbitMediaEvent) => void;

  /** The media viewer closed. */
  onMediaClose?: (event: OrbitMediaEvent) => void;

  /** The video in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. */
  onMediaState?: (state: OrbitMediaState) => void;

  /** Renders a note to HTML yourself. The HTML is used as-is: sanitize untrusted notes. */
  noteRenderer?: (note: string, context: { node: OrbitNode; format: 'markdown' | 'plain' }) => string;

  /** Resolves relative image, video and link URLs. */
  baseUrl?: string;

  /**
   * Node types by name: what nodes with `type: name` look like, draw inside
   * them, show in the detail sheet and offer as actions. They come before the
   * ones registered with `registerNodeType`.
   */
  nodeTypes?: Record<string, OrbitNodeType>;

  /** Your own buttons under the focused node and in its detail sheet, before the registered ones. */
  actions?: OrbitAction[];

  /**
   * Status words and how they look: a dot tone (`active`, `done`, `blocked`,
   * `todo`, `neutral`) or any CSS color, as in `{ review: 'active', 'on hold': '#A855F7' }`.
   */
  statuses?: Record<string, OrbitStatusStyle>;

  /**
   * The type a node that names none is drawn as, for display only: as if it
   * said `type: name`, with that type's look, content and actions. Orbit never
   * writes it to the map, and asks again whenever it draws; return undefined
   * to draw the node as it is. Called often: keep it quick.
   */
  nodeTypeFor?: (node: OrbitNode) => string | undefined;
}

export const DEFAULT_OPTIONS: Required<Pick<RendererOptions, 'viewMode' | 'showRings' | 'interactive' | 'orbitAnimation' | 'orbitSpeed' | 'showControls'>> = {
  viewMode: 'focus',
  showRings: true,
  interactive: true,
  orbitAnimation: false,
  orbitSpeed: 90,
  showControls: true,
};
