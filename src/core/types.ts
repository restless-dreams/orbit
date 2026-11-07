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

  /**
   * The idea's date: a day, `2026-11-20`, or a day and a time of day,
   * `2026-11-20 09:30`, always in this form (see `parseDue`). It's local
   * time, with no time zone: 9:30 is 9:30 wherever the map is read. Shown
   * small on its planet, and in the detail sheet and the outline; once it's
   * past, in the theme's attention color, unless the idea's status is done.
   */
  due?: string;

  /**
   * A picture shown inside the node and in the detail sheet. A live photo's
   * picture carries its `motion`, the few seconds of video a phone records
   * around it, which the media viewer plays (see `OrbitMotion`).
   */
  image?: { src: string; alt?: string; caption?: string; motion?: OrbitMotion };

  /** A video (YouTube, Vimeo or a file) played in the detail sheet. */
  video?: { src: string; provider?: 'youtube' | 'vimeo' | 'native'; thumbnail?: string; caption?: string };

  /** A page shown in a frame in the detail sheet. */
  embed?: { src: string; caption?: string };

  /**
   * A sound: a voice memo, music or a recording, played in the detail sheet
   * and the media viewer. Its caption is only ever in its own value
   * (`audio: { src: …, caption: … }`): a `caption` key beside it stays with
   * the node's video, embed or picture, as older versions read it.
   */
  audio?: { src: string; caption?: string };

  /**
   * Files the idea holds: a PDF, a spreadsheet, a ticket, any file, each
   * by its address (`media/boarding-pass.pdf`). Its planet shows a
   * paperclip with how many, and the detail sheet lists them; opening one
   * fires `file-open` (see `OrbitFile`).
   */
  files?: OrbitFile[];

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

/**
 * A live photo's motion: the few seconds of video a phone records around a
 * picture. Written `motion: media/summit-motion.mp4` inside the picture's
 * value, or `motion: { src, still }`. The node's picture is the still: the map
 * and the detail sheet show it, and the media viewer plays the motion over it.
 */
export interface OrbitMotion {
  /** The video's address, such as an `.mp4`: relative ones resolve against `baseUrl`, as every media address does. */
  src: string;

  /** Where in the video the picture was taken, in seconds, when the phone said so. */
  still?: number;
}

/**
 * A file an idea holds (see `OrbitNode.files`). Written `media/report.pdf`,
 * or with what Orbit shows of it without opening it:
 * `{ src: media/report.pdf, name: Q3 report.pdf, type: application/pdf, size: 482133 }`.
 */
export interface OrbitFile {
  /** Its address: relative ones resolve against `baseUrl`, as every media address does. */
  src: string;

  /** Its name as people know it, which its address may not keep. Without one, the last part of its address. */
  name?: string;

  /** Its media type, such as `application/pdf`. Without one, its kind comes from its name's extension. */
  type?: string;

  /** How big it is, in bytes. */
  size?: number;
}

/** Orbit's own buttons for a node: its picture, video, sound, embed, note, link, files, and its type's details. */
export type OrbitContentAction = 'image' | 'video' | 'audio' | 'embed' | 'note' | 'link' | 'files' | 'details';

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
  'view-mode-change': { mode: OrbitViewMode };

  /** A node was clicked or activated with the keyboard, before the map reacts. */
  'node-click': { node: OrbitNode };

  /** A content button under the focused node was pressed. */
  action: OrbitActionDetail;

  /** A spun orbit came to rest, with `node` on top. */
  'spin-settle': {
    node: OrbitNode;

    /** @deprecated Use `node`, as every other event names it: `planet` goes in Orbit 1.0. */
    planet: OrbitNode;
  };

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

  /** The media viewer opened, or stepped to another picture, video or sound. */
  'media-open': OrbitMediaEvent;

  /** The media viewer closed. */
  'media-close': OrbitMediaEvent;

  /** The video, sound or live photo's motion in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. */
  'media-state': OrbitMediaState;

  /**
   * One of a node's files was opened in the detail sheet. Without
   * `preventDefault()`, the browser opens its address in a new tab: an app
   * that keeps the files itself takes the press and opens the file its way.
   */
  'file-open': OrbitFileOpenDetail;

  /** A node `spotlight` brought up close moved on screen, came to rest there, or is back in its place (see `phase`). */
  spotlight: OrbitSpotlightEvent;
}

/** Where a node is drawn on screen: its circle's center, in px from the map's top left, and its radius in px. */
export interface OrbitNodeCircle {
  x: number;
  y: number;
  radius: number;
}

/** How `spotlight` brings a node up close. */
export interface OrbitSpotlightOptions {
  /**
   * How much of the room the node fills across, along the room's shorter
   * side: more than 0, up to 1. Default 0.86.
   */
  share?: number;

  /**
   * The parts of the map the page covers with its own controls while the
   * node is up close, such as a toolbar for what's laid over it, in px: the
   * node is held in the middle of what's left. Default none; the map's own
   * `insets` aren't used, nor changed.
   */
  insets?: OrbitInsets;
}

/**
 * A node `spotlight` brought up close, and where its circle is on screen
 * (see `OrbitNodeCircle`). `move` as the camera flies to it or back from
 * it, on each frame its circle moves; `rest` once the flight to it lands,
 * and again whenever its circle changes while it's held there (the map
 * resized, say), for whatever the page lays over it to follow; `end` once
 * the camera is back from it and the map takes input again, with where the
 * node is then.
 */
export interface OrbitSpotlightEvent extends OrbitNodeCircle {
  phase: 'move' | 'rest' | 'end';
  node: OrbitNode;
}

/** One of a node's files opened in the detail sheet. */
export interface OrbitFileOpenEvent {
  node: OrbitNode;

  /** The file, as the node has it. */
  file: OrbitFile;

  /** Its place among the node's files, from 0. */
  index: number;

  sourceEvent: MouseEvent | KeyboardEvent;
}

/** The `file-open` event: call `preventDefault()` to open the file your way, instead of in a new tab. */
export interface OrbitFileOpenDetail extends OrbitFileOpenEvent {
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

/** A node's picture, video or sound in the media viewer. */
export interface OrbitMediaEvent {
  node: OrbitNode;

  /** `image`, the node's picture, `video`, its video, or `audio`, its sound. */
  kind: 'image' | 'video' | 'audio';

  /** Its place among the map's pictures, videos and sounds, in reading order, from 0. */
  index: number;

  /** How many pictures, videos and sounds the viewer steps through. */
  total: number;
}

/** What `openMedia` shows. */
export interface OrbitMediaOptions {
  /** For a node with more than one: which to show. Default: the picture, then the video, then the sound. */
  kind?: 'image' | 'video' | 'audio';

  /** Start a video or sound playing as it opens, and a live photo's motion once (never with reduced motion). Default true. */
  autoplay?: boolean;

  /** Start a video or sound this many seconds in. YouTube and Vimeo start at the whole second. Default 0. */
  startAt?: number;
}

/** The video, sound or live photo's motion in the media viewer, as it plays (see the `media-state` event). */
export interface OrbitMediaState {
  node: OrbitNode;

  /** What plays: the node's `video`, its sound (`audio`), or its live photo's motion over its picture (`image`). */
  kind: 'image' | 'video' | 'audio';

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

/**
 * What `addNode` and `updateNode` take: a node's text and attributes, read
 * as a file's are. The format's shorthands work here too: a picture, video,
 * sound or embed as its address (`{ image: 'summit.jpg' }`), a live photo's
 * motion as its own, tags as `'web, mobile'`, a type as `'task@2'` and a
 * date as `'2026-11-20T09:30'`. A value Orbit can't read throws a
 * `TypeError` that says what it takes, and the map stays as it was.
 */
export type OrbitNodeInput = Partial<Pick<
  OrbitNode,
  'text' | 'icon' | 'color' | 'paletteColor' | 'status' | 'priority' | 'due' | 'collapsed' | 'link' | 'note' | 'noteFormat' | 'type' | 'typeVersion' | 'attrs'
>> & {
  tags?: string[] | string;
  image?: string | (Omit<NonNullable<OrbitNode['image']>, 'motion'> & { motion?: OrbitMotion | string });
  video?: string | OrbitNode['video'];
  audio?: string | OrbitNode['audio'];
  embed?: string | OrbitNode['embed'];
  files?: string | OrbitFile | (string | OrbitFile)[];
};

/** What `addNode` takes: a node's text and attributes, and the nodes to add under it, as many levels down as you like. */
export type OrbitNewNode = OrbitNodeInput & { text: string; children?: OrbitNewNode[] };

export type OrbitEventName = keyof OrbitEventMap;

/** `focus`: one node at the center with its children around it. `all`: the overview of the whole tree. */
export type OrbitViewMode = 'focus' | 'all';

/** @deprecated Use `OrbitViewMode`: this name goes in Orbit 1.0. */
export type ViewMode = OrbitViewMode;

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

  /** The first view: `focus` or `all`, the overview. */
  view?: OrbitViewMode;

  showRings?: boolean;
  interactive?: boolean;

  /** Keep the orbit turning slowly on its own. */
  animation?: boolean;

  /** Seconds per turn of the orbit's drift. */
  speed?: number;

  /** @deprecated Use `view`, as the document writes it: this name goes in Orbit 1.0. */
  viewMode?: OrbitViewMode;

  /** @deprecated Use `animation`, as the document writes it: this name goes in Orbit 1.0. */
  orbitAnimation?: boolean;

  /** @deprecated Use `speed`, as the document writes it: this name goes in Orbit 1.0. */
  orbitSpeed?: number;

  palette?: string[];

  /** Height in pixels, used by `<orbit-map>` elements and marked placeholders. */
  height?: number;

  maxDepth?: number;
  className?: string;

  /** Where the map's relative addresses resolve from: a web address (http or https) or a relative path; others are reported and ignored. */
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

  /** The same problems with a code, line and severity. Always set on parse results, and on a map's `getDocument()`. */
  diagnostics?: OrbitDiagnostic[];
}

/** A document as the parsers return it, with its diagnostics always set. */
export type OrbitParsedDocument = OrbitDocument & { diagnostics: OrbitDiagnostic[] };

/** @deprecated Use `OrbitParsedDocument`: this name goes in Orbit 1.0. */
export type ParsedOrbitDocument = OrbitParsedDocument;

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

  /**
   * Smallest zoom in the overview, relative to the fitted view. Default 0.4.
   * Focus mode stops at 0.6 whatever this says: zooming out there goes up a
   * level, or from the root to the overview, before it gets that far.
   */
  minimum?: number;

  /** Largest zoom, relative to the fitted view. Default 6. */
  maximum?: number;
}

/** Room the page's own controls take at the map's edges, in px (see `OrbitRendererOptions.insets`). */
export interface OrbitInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/**
 * How a map looks and behaves. Every option is optional; options passed to
 * the renderer win over the document's frontmatter.
 */
export interface OrbitRendererOptions {
  /** The first view: `focus` (default) or `all`, the overview. */
  view?: OrbitViewMode;

  /** @deprecated Use `view`, as a document writes it: this name goes in Orbit 1.0. */
  viewMode?: OrbitViewMode;

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
  animation?: boolean;

  /** Seconds per turn of `animation`'s drift: bigger is slower. Default 90. */
  speed?: number;

  /** @deprecated Use `animation`, as a document writes it: this name goes in Orbit 1.0. */
  orbitAnimation?: boolean;

  /** @deprecated Use `speed`, as a document writes it: this name goes in Orbit 1.0. */
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
   * in (the closest `lang` attribute), then English. Orbit speaks English,
   * Spanish and Brazilian Portuguese; `registerLanguage` adds others.
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

  onViewModeChange?: (mode: OrbitViewMode) => void;

  /** A button was pressed. Return `false` to skip what it does (the detail sheet, the link, or your action's `run`). */
  onAction?: (event: OrbitActionEvent) => void | false;

  /** A new node is in focus, with the `path` from the root to it, as `focus-change` has them. */
  onFocusChange?: (node: OrbitNode, path: OrbitNode[]) => void;

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
   * Changing them moves a fitted view to its new place (see
   * `insetsTransition`).
   */
  insets?: OrbitInsets;

  /**
   * How the insets a `setOptions` call brings take effect, for that call
   * alone. By default (`'instant'`) a fitted view is kept within its new
   * room at once, as it has to be while the keyboard slides or a sheet is
   * dragged and the insets change every frame. `'glide'` glides it all the
   * way from where it was, with the camera, for a change made once, such as
   * a panel coming or going.
   */
  insetsTransition?: 'instant' | 'glide';

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
  onSpinSettle?: (node: OrbitNode) => void;

  /** Buttons under the focused node for its note, media, link and actions. Default true. */
  showActionButtons?: boolean;

  /** Open the built-in detail sheet for notes, embeds and the details of a node's type. Default true. */
  showDetailSheet?: boolean;

  /**
   * Show pictures, videos and sounds in the media viewer, over the whole
   * window: "View picture", "Play video" and "Play sound" open it, and so do
   * the detail sheet's pictures and its videos' and sounds' Expand buttons.
   * Default true. With `false`, those buttons open the detail sheet instead
   * (unless `showDetailSheet` is `false` too), whose videos and sounds then
   * have no Expand button. `openMedia` opens the viewer either way.
   */
  showMediaViewer?: boolean;

  /** @deprecated Use `showMediaViewer`, named as `showRings` and the other switches are: this name goes in Orbit 1.0. */
  mediaViewer?: boolean;

  /** The media viewer opened, or stepped to another picture, video or sound. */
  onMediaOpen?: (event: OrbitMediaEvent) => void;

  /** The media viewer closed. */
  onMediaClose?: (event: OrbitMediaEvent) => void;

  /** The video, sound or live photo's motion in the media viewer started, paused, moved on, ended or was muted; while it plays, its time a few times a second. */
  onMediaState?: (state: OrbitMediaState) => void;

  /**
   * Whether the detail sheet opens a node's files: with `false` it lists
   * them, each with its name, kind and size, and says they stayed with the
   * map, as in a web page made without them. Default true.
   */
  openFiles?: boolean;

  /** One of a node's files was opened in the detail sheet. Return `false` to open it your way instead of in a new tab. */
  onFileOpen?: (event: OrbitFileOpenEvent) => void | false;

  /** A node `spotlight` brought up close moved on screen, came to rest there, or is back in its place. */
  onSpotlight?: (event: OrbitSpotlightEvent) => void;

  /** Renders a note to HTML yourself. The HTML is used as-is: sanitize untrusted notes. */
  noteRenderer?: (note: string, context: { node: OrbitNode; format: 'markdown' | 'plain' }) => string;

  /**
   * Resolves relative image, video, sound and link URLs: an http, https or
   * file address, or a relative one, which the page's address completes.
   * Joined to a base of any other kind, such as `javascript:`, they'd take
   * its scheme, so they stay relative instead.
   */
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

/** @deprecated Use `OrbitRendererOptions`: this name goes in Orbit 1.0. */
export type RendererOptions = OrbitRendererOptions;

export const DEFAULT_OPTIONS: Required<Pick<OrbitRendererOptions, 'view' | 'showRings' | 'interactive' | 'animation' | 'speed' | 'showControls'>> = {
  view: 'focus',
  showRings: true,
  interactive: true,
  animation: false,
  speed: 90,
  showControls: true,
};
