/**
 * OrbitSVGRenderer draws a map into a container element and makes it
 * explorable.
 *
 * Each view (a node in focus, or the overview) is a scene in world
 * coordinates (engine/scene.ts), seen through one camera. Moving between
 * views flies the camera along a smooth zoom path while the nodes both views
 * share move into place; when the flight lands, the world is re-rooted on
 * the new scene. In focus mode the orbit spins with momentum when flicked,
 * zooming far enough into a planet enters it, and zooming out leaves.
 *
 * Nodes, rings and links are SVG under one camera transform. Labels, badges,
 * controls and the detail sheet are HTML on top, so text stays sharp and
 * readable at any zoom.
 */

import type {
  OrbitActionDetail,
  OrbitDocument,
  OrbitDocumentOptions,
  OrbitEdit,
  OrbitEditorEvent,
  OrbitEventMap,
  OrbitEventName,
  OrbitMediaEvent,
  OrbitMediaOptions,
  OrbitMediaState,
  OrbitNode,
  OrbitNodeContextEvent,
  OrbitNodeDragEvent,
  OrbitNewNode,
  OrbitNodeInput,
  OrbitRendererTheme,
  OrbitThemePreset,
  RendererOptions,
  ViewMode,
} from './types.js';
import { DEFAULT_OPTIONS } from './types.js';
import { findNodeById, getNodePath } from './utils.js';
import { addToTree, moveInTree, removeFromTree, updateInTree } from './editing.js';
import { branchPalette, type BranchColorRules } from './branch-colors.js';
import { serializeOrbitMarkdown } from './serializer-markdown.js';

import { documentToRendererOptions } from './document-options.js';

import { parseOrbit } from './dispatch.js';
import { guardUrl, resolveUrl } from './url-guard.js';

import { THEME_TOKENS, expandTheme, isThemeName, resolvePalette, resolveThemeTokens, themeName, themeNames, themeOverrides, type OrbitThemeToken } from './themes.js';
import { ensureStyles } from './styles.js';
import { InputController, wheelZoomFactor, type DragGesture, type Point } from './input-controller.js';
import { AnimationClock, easeInOutCubic, type FrameTask } from './engine/animation-clock.js';
import {
  IDENTITY,
  cameraTransform,
  panBy,
  screenToWorld,
  smoothZoomPath,
  worldToScreen,
  zoomAround,
  type Camera,
  type CameraPath,
  type Insets,
  type Similarity,
  type Viewport,
} from './engine/camera.js';
import { AngularVelocityTracker, SpinPhysics, normalizeDelta } from './engine/spin.js';
import { Glide, PointVelocityTracker } from './engine/glide.js';
import { alignScene, assignNodeColors, buildFocusScene, buildOverviewScene, fitScene, toDegrees, type NodeRole, type Scene, type SceneNode, type SceneOptions } from './engine/scene.js';
import { fadeDisplay, placedFrame, sceneDisplay, transitionDisplay, type Display, type DisplayNode, type DisplaySlot, type Transition } from './engine/display.js';
import {
  AddSlotView,
  COUNT_HEIGHT,
  COUNT_POSITION,
  createDefinitions,
  describeNode,
  insideFontSize,
  insideLabelLayout,
  insideLabelReach,
  insideLabelWidth,
  measureCount,
  showsCount,
  svgElement,
  placeShading,
  readShadeCircle,
  type ViewIds,
} from './engine/views.js';
import { nodeUnder, orbitPlaceAt, samePlace, unreachableIds, type DropPlace } from './engine/node-drag.js';
import { exportDisplay } from './engine/export.js';
import { LabelFonts, onMeasurementsReset } from './engine/text-measure.js';
import { resolveColor } from './engine/colors.js';
import { Controls } from './ui/controls.js';
import { AccessibleOutline, Tooltip } from './ui/outline.js';
import { DetailSheet, type DetailSection } from './ui/detail-sheet.js';
import { MediaViewer, galleryItems, showsMedia, type MediaItem, type MediaKind } from './ui/media-viewer.js';
import type { PlaybackState } from './ui/media-players.js';
import { ActionBar, actionRows, type ActionRows, type LinkDescription } from './ui/actions.js';
import { InlineEditor, type EditorPlacement } from './ui/inline-editor.js';
import { findLinkedNode, isNodeLink } from './node-links.js';
import { MapExtensions, actionLabel, guarded, upgradeTypes } from './extensions.js';
import { noteToPlainText } from './ui/note-markdown.js';
import { OrbitWords, languageOf } from './languages.js';
import { RingsAndLinks } from './renderer/rings-and-links.js';
import { LabelPainter } from './renderer/label-painter.js';
import { NodePainter } from './renderer/node-painter.js';
import { ContentPainter } from './renderer/content-painter.js';
import { mergeRendererOptions, resolveInsets, spinSettings, type ResolvedRendererOptions } from './renderer/options.js';
import { SLOT_STOP, createEmptyState, fillEmptyState, isAddSlot, isApplePlatform, isFocusVisible, nodeIdFrom, reportListenerError, scrollsAround } from './renderer/dom.js';
import { clockwiseFromTop, closeInSize, innerOrbitEdge, orderedPlanets, overlayPlacement, renameNodes, visiblePart, withArrival, type Arrival } from './renderer/scene-helpers.js';
import { definedEntries, expectObject, isEmptyTree, isOrbitDocument, newIdeaText, sameTree, sameValues, transplantSource } from './renderer/trees.js';

/** Zoom (relative to the fitted view) past which zooming toward a planet or moon enters it. */
const ENTER_ZOOM = 1.75;
/**
 * …and once the planet under the pointer is this big on screen (px), big
 * enough to read inside: a crowded orbit can be zoomed into and read
 * before it enters a planet.
 */
const ENTER_RADIUS = 42;
/** Zoom below which focus mode goes up a level, or from the root to the overview. */
const EXIT_ZOOM = 0.72;
/** Focus mode never zooms out further than this; it leaves at EXIT_ZOOM first. */
const FOCUS_MINIMUM_ZOOM = 0.6;
const DEFAULT_MINIMUM_ZOOM = 0.4;
const DEFAULT_MAXIMUM_ZOOM = 6;
/** Zoom per press of a zoom button or the + and − keys. */
const STEP_ZOOM = 1.6;
/** Wheel zoom eases toward where the wheel sent it with this time constant (ms). */
const WHEEL_SMOOTHING = 70;
/** Haptic ticks only below this spin speed (degrees per second); faster ones would just buzz. */
const HAPTIC_SPEED_LIMIT = 720;
const ENTRY_DURATION = 650;
const MORPH_DURATION = 380;
/** How long the planets take to make room as the place held for a node being dragged moves. */
const DRAG_MORPH_DURATION = 260;
/** A node being dragged can be dropped into another this far (px) past its edge, so small moons can be hit. */
const DROP_REACH = 12;
/**
 * A planet of the focused orbit takes a node dropped into it only nearer its
 * middle than this share of its radius (and at least `PLANET_CORE_PX`):
 * over its rim, the press is on the orbit, placing the node beside it.
 */
const PLANET_CORE = 0.6;
const PLANET_CORE_PX = 16;
/** The target so far holds on this much further than it caught, so it doesn't flicker at its edge. */
const KEEP_TARGET = 1.3;
/** A node dragged at least this close (px) to the orbit's ring goes to a place in it. */
const ORBIT_BAND = 32;
/** Over a node it would go into, a dragged node shrinks to this size, as if about to go inside, and leaves the target's name in view. */
const INTO_SCALE = 0.55;
/** Each frame, a dragged node's size goes this share of the way to where it's heading. */
const CARRIED_EASING = 0.3;
/** With reduced motion, views cross-fade in this long instead of flying. */
const FADE_DURATION = 220;
/** Clicks this soon after a flight starts are the second half of a double click. */
const CLICK_GUARD = 350;
/**
 * One long press can reach the map twice, as Orbit's own and as the
 * browser's context menu: a second report for the same node this soon (ms)
 * is the same press.
 */
const CONTEXT_REPEAT = 700;
/** Maps this wide (px) or narrower trade their breadcrumbs for a back chip (the `orbit--narrow` class). */
const NARROW_MAP = 560;
/** The drift paints a turn once it moves the outermost body this far (px); a slow drift moves less than that most frames. */
const DRIFT_STEP = 0.5;
/** The focused node's buttons keep this far from its planets and its name (px). */
const ACTION_CLEARANCE = 6;
/** Buttons on the sun's lower rim sit this far in from its edge (px). */
const ACTION_RIM_INSET = 10;
/** Buttons under the orbit sit this far below its edge, and keep this far from the map's edges and its zoom buttons (px). */
const ACTION_ORBIT_GAP = 12;
const ACTION_EDGE_MARGIN = 12;

/** Where the focused node's buttons go: the middle of their top edge (px), and the width they wrap at (0 keeps them on one line). */
interface ActionsPlace {
  x: number;
  y: number;
  wrap: number;
}

/** What the field for typing on the map is for: a node's text, or a new idea at `index` among `parentId`'s children. */
interface EditSession {
  nodeId: string | null;
  parentId: string;
  index: number;
}

/**
 * A node held up by a press, then dragged somewhere else (see `editable`).
 * It stays where it was, only lifted, until the press moves.
 */
interface NodeDrag {
  id: string;
  node: OrbitNode;
  parent: OrbitNode;

  /** Its place among its parent's children when it was lifted. */
  index: number;

  /** What it can't be dropped into: itself, everything under it, and its parent. */
  unreachable: Set<string>;

  /** Following the press, rather than only lifted. */
  moving: boolean;

  /** The press, in px from the map's top left. */
  point: Point;

  /** Where the press took hold of it, from its center, in world units. */
  grab: Point;

  /** It, and the moons that go with it, as drawn when it was lifted, from its center. */
  bodies: DisplayNode[];

  /** In focus mode, the orbit's ring's radius with it: where places are once the orbit is empty without it. */
  ringRadius: number | null;

  /**
   * In focus mode, the radii of the orbit's rings when it started moving, and
   * the size they were laid out for: the rings keep them until the drop (see
   * `SceneOptions.keptRings`), unless the map changes size.
   */
  rings: { focusId: string; radii: number[]; size: Viewport } | null;

  /**
   * The place held for it in the focused orbit, counted among the sun's
   * children without it: at first where it came from, for one of them, then
   * wherever it was last carried along the ring. Let go over nothing, it
   * lands there.
   */
  slot: number | null;

  /** Where it would go if let go now. */
  place: DropPlace | null;

  /** Lifted by a long press no one took: let go without moving, it's typed into instead. */
  editOnRelease: boolean;

  /** Its size, eased: smaller while it's over a node it would go into. */
  scale: number;
}

/** Orbit's own buttons; any other action is one of yours. */
const CONTENT_ACTIONS = new Set<string>(['details', 'image', 'video', 'embed', 'note', 'link']);

interface CameraFlight {
  path: CameraPath;
  target: Camera;
  anchor: Point;
  startedAt: number;
  duration: number;
}

export class OrbitSVGRenderer {
  private static registry = new WeakMap<HTMLElement, OrbitSVGRenderer>();
  private static instanceCounter = 0;

  /** Destroys the renderer drawing into `target`, if there is one. Returns whether there was. */
  static unmount(target: HTMLElement): boolean {
    const existing = OrbitSVGRenderer.registry.get(target);

    if (!existing) {
      return false;
    }

    existing.destroy();
    return true;
  }

  private readonly container: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly definitions: SVGDefsElement;

  /** The camera as last written to the world: a spin repaints every frame without moving it. */
  private worldTransform = '';


  /** The theme the shading was last placed for (see `placeShading`). */
  private shadingTheme = '';




  private readonly layers: Record<'rings' | 'links' | 'moons' | 'nodes' | 'suns' | 'carried', SVGGElement>;
  private readonly labelLayer: HTMLDivElement;

  /** The fonts the labels are drawn with, which names are measured and fitted in. */
  private readonly labelFonts: LabelFonts;

  private readonly labelPainter: LabelPainter;

  /** Stops listening for fonts that finish loading. */
  private readonly stopWatchingFonts: () => void;

  /** What node types draw inside their nodes, between the nodes and the labels. */
  private readonly contentLayer: HTMLDivElement;

  private readonly contentPainter: ContentPainter;


  /** This map's node types, actions and status words, then the registered ones. */
  private extensions: MapExtensions;

  /** The words the map speaks, in its language, and the language and words they were made for. */
  private words: OrbitWords;

  private requestedLanguage: string | null;
  private requestedStrings: RendererOptions['strings'];
  private readonly overlayLayer: HTMLDivElement;
  private readonly emptyState: HTMLDivElement;
  private readonly actionBar: ActionBar;
  private readonly tooltip: Tooltip;
  private readonly controls: Controls;
  private readonly outline: AccessibleOutline;
  private readonly sheet: DetailSheet;
  private readonly viewer: MediaViewer;
  private readonly input: InputController;
  private readonly clock: AnimationClock;
  private readonly spinPhysics = new SpinPhysics();
  private readonly spinTracker = new AngularVelocityTracker();
  private readonly panTracker = new PointVelocityTracker();
  private readonly glide = new Glide();
  // SVG ids resolve document-wide, so they are unique per renderer.
  private readonly ids: ViewIds;
  private resizeObserver: ResizeObserver | null = null;
  private visibilityObserver: IntersectionObserver | null = null;

  /** Every node's color, from `getNodeColor`'s first call until the map or its options change. */
  private nodeColors: Map<string, string> | null = null;

  private taskTokens: Record<string, string> | null = null;

  /** Whether any of the map is on screen; off screen, the drift rests. */
  private onScreen = true;

  /** The reduced-motion query, asked once: the drift checks it every frame. */
  private reducedMotionQuery: MediaQueryList | null | undefined;

  private options: ResolvedRendererOptions;

  /** Options from the caller (constructor and setOptions); they win over the document's. */
  private userOptions: RendererOptions;

  /** Options from the rendered document's frontmatter or YAML keys. */
  private documentOptions: RendererOptions = {};

  /** Those options as the document wrote them, for `getDocument()` and `toMarkdown()`. */
  private sourceOptions: OrbitDocumentOptions = {};

  /** The document's keys Orbit doesn't read, written back on save. */
  private sourceExtra: Record<string, unknown> | undefined;

  private themeProperties: string[] = [];

  private tree: OrbitNode | null = null;
  private focusPath: string[] = [];
  private viewMode: ViewMode;
  private viewport: Viewport = { width: 0, height: 0 };

  /** The size the views were last laid out for: resizes close to it keep the layout. */
  private layoutSize: Viewport = { width: 0, height: 0 };

  /** The map was resized while flying: lay the view out again once it lands. */
  private relayoutOnArrival = false;

  /** The page's controls moved while flying (see `insets`): fit the view again once it lands. */
  private refitOnArrival = false;

  private scene: Scene | null = null;
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private transition: Transition | null = null;

  /** Where a flight between two branches goes after passing through their common ancestor. */
  private nextScene: Scene | null = null;

  /** The camera a flight ends on, when it isn't the scene's fitted view. */
  private landingCamera: Camera | null = null;

  private cameraFlight: CameraFlight | null = null;
  private wheelZoom: { remaining: number; anchor: Point } | null = null;
  private display: Display | null = null;
  private restingDisplay: { scene: Scene; rotation: number; display: Display } | null = null;






  private readonly ringsAndLinks: RingsAndLinks;
  private readonly nodePainter: NodePainter;





  /** The node that holds the map's single tab stop. */
  private activeId: string | null = null;

  private tabStopsChanged = true;
  private hoveredId: string | null = null;
  private keyboardFocusId: string | null = null;
  private topPlanetId: string | null = null;
  private userSpun = false;

  /** Put keyboard focus back on the map when a flight lands (its node may have left). */
  private returnFocusToMap = false;

  private dragging = false;

  /** The last node a long press, right click or context menu key reported, and whether someone took it. */
  private lastContext: { id: string; time: number; taken: boolean } | null = null;

  /** Nodes whose ids an edit changed, old to new, so the next redraw moves them rather than replacing them. */
  private renamedIds = new Map<string, string>();

  /** Nodes an edit changed in place (the node itself, or a parent's children): the next paint draws them again. */
  private readonly changedIds = new Set<string>();

  /** The + in the orbit, and the field for typing on the map. */
  private readonly addSlotView = new AddSlotView();

  /** The place held in the orbit for a planet being dragged: like the +, but nothing to press. */
  private readonly heldPlaceView = new AddSlotView(true);

  private readonly editor: InlineEditor;
  private editing: EditSession | null = null;
  private arrival: Arrival | null = null;

  /** A node held up to be dragged somewhere else. */
  private nodeDrag: NodeDrag | null = null;

  /** The frame a dragged node was let go in: the flight that follows starts from it. */
  private dropFrom: Display | null = null;

  /** A long press no one took a menu for, on a node it lifts: let go without moving, the node is typed into. */
  private editOnLift: string | null = null;


  private ambientRunning = false;

  /** Drift not painted yet, in degrees: less than a `DRIFT_STEP`. */
  private pendingDrift = 0;

  /** How far the current view's spinning bodies reach from the sun (world units). */
  private spinReach: { scene: Scene; reach: number } | null = null;

  private pageScrollCheck: { time: number; scrolls: boolean } | null = null;
  private readonly listeners = new Map<OrbitEventName, Set<(detail: never) => void>>();
  private destroyed = false;
  private warnedFlat = false;
  private warnedTheme: string | null = null;

  constructor(container: HTMLElement, options: RendererOptions = {}) {
    if (!container || typeof (container as Partial<HTMLElement>).appendChild !== 'function') {
      throw new TypeError(
        `Orbit needs an element to draw the map in, but got ${container === null ? 'null' : typeof container}. `
          + 'Check that the selector matches an element and that the code runs after the element exists.',
      );
    }

    OrbitSVGRenderer.unmount(container);
    this.container = container;
    this.userOptions = { ...options };
    this.options = this.resolveOptions();
    this.extensions = this.createExtensions();
    this.requestedLanguage = this.options.language ?? languageOf(container);
    this.requestedStrings = this.options.strings;
    this.words = new OrbitWords(this.requestedLanguage, this.requestedStrings);
    this.viewMode = this.options.viewMode;
    const prefix = `orbit-${(++OrbitSVGRenderer.instanceCounter).toString(36)}`;
    this.ids = { clip: `${prefix}-clip`, shade: `${prefix}-shade`, speckShade: `${prefix}-speck-shade`, shadow: `${prefix}-shadow`, sunShadow: `${prefix}-sun-shadow` };

    this.root = document.createElement('div');
    this.root.className = 'orbit';
    this.svg = svgElement('svg', { class: 'orbit__canvas' });
    this.svg.setAttribute('aria-roledescription', this.words.text('mindMapRole'));
    this.definitions = createDefinitions(this.ids);
    this.svg.appendChild(this.definitions);
    this.world = svgElement('g', { class: 'orbit__world' });
    this.layers = {
      rings: svgElement('g', { class: 'orbit__rings' }),
      links: svgElement('g', { class: 'orbit__links' }),
      moons: svgElement('g', { class: 'orbit__moons' }),
      nodes: svgElement('g', { class: 'orbit__nodes' }),
      suns: svgElement('g', { class: 'orbit__suns' }),
      // A node being dragged, and its moons: above everything it passes over, the sun included.
      carried: svgElement('g', { class: 'orbit__carried' }),
    };
    this.world.append(this.layers.rings, this.layers.links, this.layers.moons, this.layers.nodes, this.layers.suns, this.layers.carried);
    this.ringsAndLinks = new RingsAndLinks(this.layers);
    this.nodePainter = new NodePainter(this.root, this.definitions, this.ids, this.layers, {
      extensions: () => this.extensions,
      words: () => this.words,
      baseUrl: () => this.options.baseUrl,
      scene: () => this.scene,
      inFlight: () => this.transition !== null,
      spinResting: () => this.spinPhysics.mode === 'idle',
      driftRunning: () => this.ambientRunning,
      editedId: () => this.editedId(),
      drag: () => {
        const drag = this.nodeDrag;
        return {
          liftedId: drag?.id ?? null,
          carried: drag?.moving ? new Set(drag.bodies.map((body) => body.id)) : null,
          targetId: drag?.moving && drag.place?.into ? drag.place.parentId : null,
        };
      },
      changedIds: () => this.changedIds,
      requestPaint: () => this.clock.requestPaint(),
      tabStopsChanged: () => {
        this.tabStopsChanged = true;
      },
      viewRemoved: (id) => {
        this.labelPainter.forgetNode(id);
        this.tabStopsChanged = true;
      },
    });
    this.layers.nodes.appendChild(this.addSlotView.element);
    this.layers.nodes.appendChild(this.heldPlaceView.element);
    this.svg.appendChild(this.world);

    this.contentLayer = document.createElement('div');
    this.contentLayer.className = 'orbit__contents';
    this.contentLayer.setAttribute('aria-hidden', 'true');
    this.contentPainter = new ContentPainter(this.contentLayer, {
      extensions: () => this.extensions,
      viewport: () => this.viewport,
      changedIds: () => this.changedIds,
    });
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'orbit__labels';
    this.labelLayer.setAttribute('aria-hidden', 'true');
    this.labelFonts = new LabelFonts(this.labelLayer, () => this.extensions);
    this.labelPainter = new LabelPainter(this.labelLayer, this.labelFonts, {
      extensions: () => this.extensions,
      viewport: () => this.viewport,
      restingScene: () => (this.transition ? null : this.scene),
      inFlight: () => this.transition !== null,
      cameraMoving: () => this.cameraFlight !== null || this.wheelZoom !== null || this.glide.isMoving || this.dragging,
      changedIds: () => this.changedIds,
      editedId: () => this.editedId(),
      animationsEnabled: () => this.animationsEnabled(),
      requestPaint: () => this.clock.requestPaint(),
      nodeView: (id) => this.nodePainter.view(id),
      themeTokens: () => this.exportTokens(),
    });
    this.overlayLayer = document.createElement('div');
    this.overlayLayer.className = 'orbit__overlay';
    this.actionBar = new ActionBar({
      onAction: (node, action, event) => this.runAction(node, action, event),
      describeLink: (node) => this.describeLink(node),
      actions: (node) => this.extensions.actions(node),
      hasDetails: (node) => Boolean(this.extensions.nodeType(node)?.details),
      returnFocus: () => this.focusNodeElement(this.activeId ?? this.focusId),
      words: () => this.words,
    });
    this.overlayLayer.appendChild(this.actionBar.element);
    this.editor = new InlineEditor({
      onSave: (text, how) => this.saveEdit(text, how),
      onCancel: () => this.finishEditing(true),
      onTab: (text, back) => this.tabFromEditor(text, back),
    });
    this.overlayLayer.appendChild(this.editor.element);
    this.emptyState = createEmptyState(this.words);
    this.tooltip = new Tooltip();
    this.controls = new Controls({
      onNavigate: (nodeId) => {
        this.navigate('focus', nodeId);
      },
      onViewMode: (mode) => this.setViewMode(mode),
      onZoom: (direction) => this.zoomBy(direction === 1 ? STEP_ZOOM : 1 / STEP_ZOOM),
      onFit: () => this.fit(),
      onToggleOutline: () => this.toggleOutline(),
    }, this.words);
    this.outline = new AccessibleOutline((nodeId) => this.selectFromOutline(nodeId), this.words);
    this.root.append(
      this.svg,
      this.contentLayer,
      this.labelLayer,
      this.overlayLayer,
      this.emptyState,
      this.tooltip.element,
      this.controls.element,
      this.outline.element,
      this.outline.live,
    );
    this.sheet = new DetailSheet(this.root);
    this.viewer = new MediaViewer(this.root, {
      items: () => (this.tree ? galleryItems(this.tree, this.options.maxDepth) : []),
      node: (id) => (this.tree ? findNodeById(this.tree, id) : null),
      baseUrl: () => this.options.baseUrl,
      interactive: () => this.options.interactive !== false,
      icon: (node) => this.extensions.icon(node),
      onShow: (item, index, total) => this.mediaShown('media-open', item, index, total),
      onClose: (item, index, total) => this.mediaShown('media-close', item, index, total),
      onState: (node, state) => this.mediaPlayed(node, state),
      words: () => this.words,
    });
    container.appendChild(this.root);
    ensureStyles(this.root);
    OrbitSVGRenderer.registry.set(container, this);

    this.clock = new AnimationClock(() => this.paint());

    // A font that finishes loading changes how wide names are: fit them again, where they are.
    this.stopWatchingFonts = onMeasurementsReset(() => {
      this.labelFonts.refresh();
      this.labelPainter.refit();
    });

    this.input = new InputController(this.root, {
      isInteractive: () => this.options.interactive !== false,
      longPressDelay: () => {
        const delay = this.options.longPressDelay;
        return typeof delay === 'number' && Number.isFinite(delay) && delay > 0 ? delay : 500;
      },
      dragGesture: (point) => this.dragGestureAt(point),
      spinCenter: () => this.sunOnScreen(),
      isCoasting: () => this.spinPhysics.isMoving || this.glide.isMoving,
      onCatch: () => {
        this.spinPhysics.stop();
        this.glide.stop();
      },
      onSpinStart: (time, angle) => {
        this.spinTracker.reset(time, angle);
        this.spinPhysics.grab();
        this.userSpun = true;
      },
      onSpinMove: (time, angle) => {
        this.spinPhysics.drag(this.spinTracker.add(time, angle));
        this.tickHaptics();
        this.clock.requestPaint();
      },
      onSpinEnd: (time, cancelled) => this.releaseSpin(cancelled ? 0 : this.spinTracker.velocityAt(time)),
      onPanStart: (time) => {
        this.glide.stop();
        this.cameraFlight = null;
        this.panTracker.reset(time);
      },
      onPan: (deltaX, deltaY, time) => {
        this.panTracker.add(time, deltaX, deltaY);
        this.panCamera(deltaX, deltaY);
      },
      onPanEnd: (time, cancelled) => {
        if (!cancelled && !this.prefersReducedMotion()) {
          this.glide.start(this.panTracker.velocityAt(time));

          if (this.glide.isMoving) {
            this.clock.add(this.glideTask);
          }
        }
      },
      onPinch: (factor, center, deltaX, deltaY) => {
        // A pinch takes the camera over from any flight in progress.
        this.cameraFlight = null;
        this.panCamera(deltaX, deltaY);
        this.zoomAt(factor, center);
      },
      onPinchEnd: () => this.settleZoom(),
      onWheel: (event, point) => this.handleWheel(event, point),
      onDoubleTap: (point, target) => this.handleDoubleTap(point, target),
      onLongPress: (point, target) => {
        const id = nodeIdFrom(target);
        return id !== null && this.openNodeContext(id, point, true);
      },
      onHold: (point, target) => this.liftNode(nodeIdFrom(target), point),
      onNodeDrag: (point, phase) => this.dragNode(point, phase),
      onDraggingChange: (dragging) => {
        this.dragging = dragging;
        this.root.classList.toggle('orbit--dragging', dragging);

        if (dragging) {
          this.hoveredId = null;
          this.updateTooltip();
        } else {
          // Labels that rode along with the drag are placed again where it ended.
          this.clock.requestPaint();
        }

        this.syncAmbientMotion();
      },
    });

    this.svg.addEventListener('click', this.handleClick);
    this.svg.addEventListener('contextmenu', this.handleContextMenu);
    this.svg.addEventListener('keydown', this.handleKeyDown);
    this.svg.addEventListener('pointerover', this.handlePointerOver);
    this.svg.addEventListener('pointerout', this.handlePointerOut);
    // On the root, not the SVG: Chromium makes an SVG element with focus
    // listeners a tab stop of its own.
    this.root.addEventListener('focusin', this.handleFocusIn);
    this.root.addEventListener('focusout', this.handleFocusOut);

    this.applyOptionEffects(null);
    this.setViewport(this.readContainerSize());
    this.observeResize();
    this.observeVisibility();
  }

  /**
   * Draws a map: markdown or YAML source (parsed forgivingly), a parsed
   * document, or a node tree. A document's frontmatter options apply, though
   * options given to the renderer win. Drawing a new version of the same map
   * keeps the reader's place: the focused node, or its closest ancestor that
   * still exists.
   */
  render(input: string | OrbitNode | OrbitDocument): void {
    if (typeof input === 'string') {
      input = parseOrbit(input, { untitled: this.words.text('untitledMap') });
    }

    const tree = isOrbitDocument(input) ? input.root : input;
    // Nodes written for older versions of their types are brought up to date; the next save writes them.
    upgradeTypes(tree, this.extensions);

    if (this.isSameMap(tree, isOrbitDocument(input) ? input.options : null)) {
      // The map as it already is, say from an editor saving an edit made on
      // the map: keep the view, and the edit's animation, going.
      if (isOrbitDocument(input)) {
        // Keys Orbit doesn't read don't change the drawing, but they're the map's, to save as given.
        this.sourceExtra = input.extra;
      }

      this.adoptTree(tree);
      return;
    }

    if (isOrbitDocument(input)) {
      this.sourceOptions = { ...input.options };
      this.sourceExtra = input.extra;
      this.documentOptions = documentToRendererOptions(input.options);
      this.options = this.resolveOptions();

      // The document picks the initial view; later renders keep whatever
      // view the reader switched to.
      if (this.tree === null) {
        this.viewMode = this.options.viewMode;
      }

      this.applyOptionEffects(null);
    } else {
      // A bare tree has no frontmatter: nothing of a document drawn before applies to it.
      this.sourceOptions = {};
      this.sourceExtra = undefined;
      this.documentOptions = {};
      this.options = this.resolveOptions();
      this.applyOptionEffects(null);
    }

    this.showTree(tree);
  }

  setOptions(options: RendererOptions): void {
    this.nodeColors = null;
    this.taskTokens = null;
    this.userOptions = { ...this.userOptions, ...options };
    const previous = this.options;
    this.options = this.resolveOptions();
    this.applyOptionEffects(previous);

    if (options.viewMode !== undefined && options.viewMode !== this.viewMode) {
      if (this.tree) {
        this.navigate(options.viewMode, this.focusId, false);
      } else {
        this.viewMode = options.viewMode;
      }
    }
  }

  /**
   * Listens for a map event; returns a function that stops listening. The
   * same events are dispatched on the container as `orbit-<name>` DOM events.
   */
  on<Name extends OrbitEventName>(name: Name, listener: (detail: OrbitEventMap[Name]) => void): () => void {
    let listeners = this.listeners.get(name);

    if (!listeners) {
      listeners = new Set();
      this.listeners.set(name, listeners);
    }

    const stored = listener as (detail: never) => void;
    listeners.add(stored);

    return () => {
      this.listeners.get(name)?.delete(stored);
    };
  }

  getSVGElement(): SVGSVGElement {
    return this.svg;
  }

  /**
   * The current view as a standalone SVG document: colors resolved, labels
   * as SVG text, nothing that depends on the page's stylesheet.
   */
  toSVGString(): string {
    const viewport = this.viewport.width > 0 && this.viewport.height > 0 ? this.viewport : { width: 800, height: 600 };
    // Mid-flight, export where the flight is going.
    let destination = this.transition ? this.nextScene ?? this.transition.target : this.scene;

    // The + is for editing, not part of the map: export the map as it reads without it.
    if (destination?.addSlot) {
      destination = this.buildScene(false);
    }

    const resting = destination
      ? sceneDisplay(destination, this.transition ? 0 : this.rotation, this.transition ? destination.frame : this.camera)
      : null;
    return exportDisplay(resting, {
      viewport,
      extensions: this.extensions,
      tokens: this.exportTokens(),
      showRings: this.options.showRings !== false,
      title: this.options.ariaLabel || this.tree?.text || this.words.text('mindMap'),
      words: this.words,
      fills: (node) => this.nodePainter.view(node.id)?.resolvedFill() ?? '',
      // The file will be opened away from the page: resolve relative URLs now.
      baseUrl: this.options.baseUrl ?? this.root.ownerDocument.baseURI,
      // Names break where they do on the map.
      measures: this.labelFonts,
    });
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  /** Switches between focus mode and the overview (fires onViewModeChange). */
  setViewMode(mode: ViewMode): void {
    if (mode === this.viewMode) {
      return;
    }

    if (!this.tree) {
      this.viewMode = mode;
      return;
    }

    this.navigate(mode, this.focusId);
  }

  /** Ids from the root to the focused node. */
  getFocusPath(): string[] {
    return [...this.focusPath];
  }

  /** The node focused in focus mode (the sun). */
  getFocusedNode(): OrbitNode | null {
    if (!this.tree) {
      return null;
    }

    return findNodeById(this.tree, this.focusId);
  }

  /**
   * Focuses a node by id and flies to it (fires onFocusChange). In the
   * overview, the camera moves to the node instead. Returns false when the
   * id isn't in the map.
   */
  focusNode(id: string): boolean {
    if (!this.tree) {
      return false;
    }

    const path = getNodePath(this.tree, id);

    if (path.length === 0) {
      return false;
    }

    if (this.viewMode === 'focus') {
      return this.navigate('focus', id);
    }

    const changed = id !== this.focusId;
    this.focusPath = path.map((node) => node.id);
    this.outline.setCurrent(this.focusId);
    const entry = this.scene?.nodes.get(id);

    if (entry && this.scene) {
      const [, maximum] = this.zoomRange();
      const scale = Math.min(this.scene.frame.scale * maximum, Math.max(this.camera.scale, 34 / entry.radius));
      this.flyCamera(this.clampCamera({ x: entry.x, y: entry.y, scale }), this.viewportCenter());
    }

    if (changed) {
      this.emitFocusChange(path);
    }

    return true;
  }

  /**
   * Flies to a node by id, switching to focus mode if needed (fires
   * onFocusChange and onViewModeChange). Returns false when there's no such node.
   */
  flyTo(id: string): boolean {
    return this.navigate('focus', id);
  }

  /** Flies out to the overview of the whole map (fires onViewModeChange). */
  overview(): void {
    this.setViewMode('all');
  }

  /** Zooms by `factor` around the middle of the map (above 1 zooms in). */
  zoomBy(factor: number): void {
    this.zoomStep(factor, this.viewportCenter());
  }

  /** Returns the camera to the fitted view. */
  fit(): void {
    if (this.scene) {
      this.flyCamera(this.scene.frame, this.viewportCenter());
    }
  }

  /**
   * Flicks the orbit at `speed` degrees per second; negative speeds turn it
   * counterclockwise. Only in focus mode.
   */
  spin(speed: number): void {
    if (this.viewMode !== 'focus' || !this.scene || this.transition) {
      return;
    }

    this.userSpun = true;
    this.releaseSpin(speed / 1000);
  }

  /**
   * Shows a node's picture or video in the media viewer, over the whole
   * window, opening it if it's closed: to show a picture big, or play a
   * video, from your own controls. A node with both shows its picture
   * unless `kind` is `video`, and a video starts playing unless `autoplay`
   * is `false`, from the start or `startAt` seconds in. It opens whatever
   * `mediaViewer`, `showDetailSheet` and `interactive` say; on a map that
   * isn't interactive, the viewer takes no input of its own and has no
   * buttons. Fires `media-open`. Returns false when the map has no such
   * node, or the node no such picture or video.
   */
  openMedia(nodeId: string, options: OrbitMediaOptions = {}): boolean {
    const node = this.tree ? findNodeById(this.tree, nodeId) : null;

    if (!node) {
      return false;
    }

    const kind: MediaKind = options.kind === 'image' || options.kind === 'video' ? options.kind : showsMedia(node, 'image') ? 'image' : 'video';
    return this.viewer.open({ node, kind }, { autoplay: options.autoplay !== false, startAt: options.startAt });
  }

  /** Closes the media viewer, if it's open (fires `media-close`). */
  closeMedia(): void {
    this.viewer.close();
  }

  /**
   * Plays the video in the media viewer. Returns false when it shows no
   * video, or one on a site Orbit has no player for. Files, YouTube and
   * Vimeo play.
   */
  playMedia(): boolean {
    return this.viewer.play();
  }

  /** Pauses the video in the media viewer. Returns false when it shows no video it can pause. */
  pauseMedia(): boolean {
    return this.viewer.pause();
  }

  /** Moves the video in the media viewer to `seconds` from its start. Returns false when it shows no video it can move. */
  seekMedia(seconds: number): boolean {
    return this.viewer.seek(seconds);
  }

  /**
   * Turns on the sound of the video in the media viewer: one a browser
   * started muted, say. Browsers allow sound only once the reader has
   * interacted with the page, so call it from a press, such as a "Tap for
   * sound" button's. Returns false when it shows no video it can drive.
   */
  unmuteMedia(): boolean {
    return this.viewer.unmute();
  }

  /**
   * The color a node is drawn with: its own, its type's, or its branch's
   * from the palette and theme. For lists and legends next to the map. A hex
   * color, or the CSS color as written when Orbit can't read it; `null` when
   * the id isn't in the map.
   */
  getNodeColor(id: string): string | null {
    const tree = this.tree;

    if (!tree) {
      return null;
    }

    // Every node's color at once, kept until the map or its options change: a list next to a big map asks for each.
    this.nodeColors ??= assignNodeColors(tree, resolvePalette(this.options.palette), (node) => this.extensions.color(node));
    const color = this.nodeColors.get(id);

    if (!color) {
      return null;
    }

    // Only theme references need the page's styles, and reading them is slow.
    return resolveColor(color, /var\(/i.test(color) ? this.tokensForThisTask() : {});
  }

  /**
   * The theme's tokens as the page resolves them, read once per task:
   * reading them asks the browser for every token, and a list next to a big
   * map asks for hundreds of colors at once.
   */
  private tokensForThisTask(): Record<string, string> {
    if (!this.taskTokens) {
      this.taskTokens = this.exportTokens();

      queueMicrotask(() => {
        this.taskTokens = null;
      });
    }

    return this.taskTokens;
  }

  /**
   * The map as a document: its tree, and the options its source set in
   * frontmatter. Edits change this tree in place.
   */
  getDocument(): OrbitDocument | null {
    if (!this.tree) {
      return null;
    }

    const document: OrbitDocument = { root: this.tree, options: { ...this.sourceOptions }, warnings: [] };

    if (this.sourceExtra) {
      document.extra = { ...this.sourceExtra };
    }

    return document;
  }

  /**
   * The map as orbit-md, frontmatter included: what to save after an edit.
   * A map read from markdown comes back as it was written, with only what
   * the edits changed written again, so a file written by hand or by
   * another app keeps its formatting and everything Orbit doesn't read.
   */
  toMarkdown(): string {
    const document = this.getDocument();
    return document ? serializeOrbitMarkdown(document) : '';
  }

  /**
   * Adds a node under `parentId`, at `index` among its children (default:
   * last), with any `children` it lists under it; it flies out of its parent
   * into place. Ids come from the text, as when the map is read from
   * markdown. Fires `edit` once. Returns the new node, or null when there's
   * no such parent.
   */
  addNode(parentId: string, input: OrbitNewNode, index?: number): OrbitNode | null {
    expectObject('addNode', input, `addNode('${parentId}', { text: 'New idea' })`);
    return this.insertNode(parentId, input, index);
  }

  /**
   * Changes a node's text or attributes: `{ text: 'Budget' }`, `{ status:
   * 'done' }`, or `{ color: undefined }` to remove one. New text gives the
   * node a new id when its id came from its text and no link points at it,
   * so the saved map needs no id attribute. Fires `edit`. Returns the
   * node, or null when there's no such node.
   */
  updateNode(id: string, changes: OrbitNodeInput): OrbitNode | null {
    expectObject('updateNode', changes, `updateNode('${id}', { text: 'New title' })`);
    const updated = this.tree ? updateInTree(this.tree, id, changes, this.branchColorRules()) : null;

    if (!updated) {
      return null;
    }

    const { node, previousId } = updated;

    if (node.id !== previousId) {
      this.renameView(previousId, node.id);
    }

    this.changedIds.add(node.id);
    this.afterEdit('update', node);
    return node;
  }

  /**
   * Removes a node and everything under it. When the node in focus goes,
   * the nearest node left takes the focus. The root stays. Fires `edit`.
   * Returns the removed node, or null.
   */
  removeNode(id: string): OrbitNode | null {
    const removed = this.tree ? removeFromTree(this.tree, id, this.branchColorRules()) : null;

    if (!removed) {
      return null;
    }

    const { node, parent } = removed;
    this.changedIds.add(parent.id);
    this.afterEdit('remove', node, this.words.text('removed', { name: node.text || this.words.text('anIdea') }));
    return node;
  }

  /**
   * Moves a node, with everything under it, under `parentId` at `index`
   * among its children (default: last). Fires `edit`. Returns the node,
   * or null when either node is missing, the node is the root, or
   * `parentId` is inside the node.
   */
  moveNode(id: string, parentId: string, index?: number): OrbitNode | null {
    const moved = this.tree ? moveInTree(this.tree, id, parentId, index, this.branchColorRules()) : null;

    if (!moved) {
      return null;
    }

    const { node, from, to } = moved;
    this.changedIds.add(from.id).add(to.id);
    const name = node.text || this.words.text('anIdea');
    this.afterEdit('move', node, to.text ? this.words.text('moved', { name, parent: to.text }) : this.words.text('movedToTop', { name }));
    return node;
  }

  /**
   * Opens a field over a node to type its text where it is: Enter saves,
   * Escape cancels, and leaving the field saves. A moon, or a node out of
   * view, flies into view first. Fires `editor-open`, then `editor-close`.
   * Returns false when there's no such node.
   */
  editNode(id: string): boolean {
    const tree = this.tree;
    const path = tree ? getNodePath(tree, id) : [];

    if (path.length === 0 || this.options.interactive === false) {
      return false;
    }

    this.stopEditing();
    const node = path[path.length - 1];
    const parent = path[path.length - 2] ?? null;
    const role = (this.transition?.target ?? this.scene)?.nodes.get(id)?.role;

    if (this.viewMode === 'focus' && (role === undefined || role === 'moon')) {
      this.navigate('focus', parent?.id ?? id);
    }

    this.editing = { nodeId: id, parentId: parent?.id ?? id, index: parent ? parent.children.indexOf(node) : 0 };
    this.editor.show(node.text, {
      label: this.words.text('textOf', { name: node.text || this.words.text('thisIdea') }),
      placeholder: node.text || this.words.text('untitled'),
      enterKey: 'done',
    });
    this.paint();
    this.emitEditor('editor-open', node, null);
    return true;
  }

  /**
   * Adds an idea by typing it on the map: a field opens in the orbit of
   * `parentId` (default: the node in focus), at `index` among its children
   * (default: after the last), flying there first. Enter adds the idea
   * where it was typed and opens the next one after it; Escape, or Enter
   * with nothing typed, stops. Fires `editor-open`, `edit` for each idea,
   * then `editor-close`. Returns false when there's no such node.
   */
  editNewNode(parentId?: string, index?: number): boolean {
    const tree = this.tree;
    const path = tree ? getNodePath(tree, parentId ?? this.focusId) : [];
    const parent = path[path.length - 1];

    if (!parent || this.options.interactive === false || (this.options.maxDepth !== undefined && parent.level >= this.options.maxDepth)) {
      return false;
    }

    this.stopEditing();
    const count = parent.children.length;
    const at = index === undefined || !Number.isFinite(index) ? count : Math.min(count, Math.max(0, Math.trunc(index)));
    this.editing = { nodeId: null, parentId: parent.id, index: at };
    this.editor.show('', newIdeaText(parent, this.words));

    if (this.viewMode !== 'focus' || this.focusId !== parent.id) {
      this.navigate('focus', parent.id);
    } else {
      this.refreshSlot();
    }

    this.paint();
    this.emitEditor('editor-open', null, parent);
    return true;
  }

  /** Closes the field for typing on the map, keeping what was typed unless `save` is false. */
  stopEditing(save = true): void {
    if (!this.editing) {
      return;
    }

    if (save) {
      this.saveEdit(this.editor.value, 'blur');
    } else {
      this.finishEditing(false);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.editing = null;
    this.editor.hide();
    this.clock.stop();
    this.input.detach();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.visibilityObserver?.disconnect();
    this.visibilityObserver = null;
    this.svg.removeEventListener('click', this.handleClick);
    this.svg.removeEventListener('contextmenu', this.handleContextMenu);
    this.svg.removeEventListener('keydown', this.handleKeyDown);
    this.svg.removeEventListener('pointerover', this.handlePointerOver);
    this.svg.removeEventListener('pointerout', this.handlePointerOut);
    this.root.removeEventListener('focusin', this.handleFocusIn);
    this.root.removeEventListener('focusout', this.handleFocusOut);

    this.contentPainter.clear();

    this.viewer.destroy();
    this.sheet.destroy();
    this.controls.destroy();
    this.stopWatchingFonts();
    this.labelFonts.destroy();
    this.listeners.clear();
    this.root.remove();

    if (OrbitSVGRenderer.registry.get(this.container) === this) {
      OrbitSVGRenderer.registry.delete(this.container);
    }
  }

  // The tree and edits

  /** Draws `tree`, keeping the reader's place in it. */
  private showTree(tree: OrbitNode): void {
    const firstRender = this.tree === null;
    // A new map, or new text for it, ends a drag that isn't this map's own drop.
    const drag = this.nodeDrag;

    if (drag) {
      this.nodeDrag = null;

      if (drag.moving) {
        this.emitDrag('end', drag.node, null, null);
      }
    }

    this.tree = tree;
    this.nodeColors = null;

    if (firstRender && this.options.focus) {
      this.focusPath = [this.options.focus];
    }

    const session = this.editing;

    if (session && !findNodeById(tree, session.nodeId ?? session.parentId)) {
      // What was being typed into is gone.
      this.finishEditing(false, false);
    }

    let path: OrbitNode[] = [];

    for (let index = this.focusPath.length - 1; index >= 0 && path.length === 0; index -= 1) {
      path = getNodePath(tree, this.focusPath[index]);
    }

    this.focusPath = path.length > 0 ? path.map((node) => node.id) : [tree.id];
    this.actionBar.reset();
    this.labelPainter.forgetLightText();
    this.updateEmbedding();
    this.updateControls();
    this.updateOutline();
    this.rebuild(firstRender || !this.scene ? 'enter' : 'morph');
  }

  /** Whether `tree`, with the document's `options`, is the map as drawn now, in another object. */
  private isSameMap(tree: OrbitNode, options: OrbitDocumentOptions | null): boolean {
    return this.tree !== null && this.scene !== null && tree !== this.tree
      && (options === null || sameValues(definedEntries(options), definedEntries(this.sourceOptions)))
      && sameTree(tree, this.tree);
  }

  /**
   * Takes a copy of the map as drawn without drawing it again, so a flight or
   * an edit's animation carries on. The copy proved equal to the drawn tree
   * (see `isSameMap`): the drawn nodes stay, so their views, labels and
   * outline entries carry on too; the copy lends only its places in the source.
   */
  private adoptTree(tree: OrbitNode): void {
    transplantSource(this.tree as OrbitNode, tree);
    this.nodeColors = null;
    const scene = this.buildScene();

    if (!scene) {
      return;
    }

    if (this.nextScene) {
      this.nextScene = scene;
    } else if (this.transition) {
      this.transition = { ...this.transition, target: scene };
    } else {
      this.scene = scene;
    }

    this.actionBar.reset();
    this.clock.requestPaint();
  }

  /** How edits keep top-level nodes' colors: the palette's colors after the root's, and each node's own color or its type's. */
  private branchColorRules(): BranchColorRules {
    return { count: branchPalette(resolvePalette(this.options.palette)).length, ownColor: (node) => this.extensions.color(node) };
  }

  /** Shows an edit, keeping the reader's place, and reports it. */
  private afterEdit(kind: OrbitEdit['kind'], node: OrbitNode, announcement?: string): void {
    const tree = this.tree as OrbitNode;
    const focus = this.focusPath.join('\n');
    this.showTree(tree);

    if (this.focusPath.join('\n') !== focus) {
      this.emitFocusChange(getNodePath(tree, this.focusId));
    }

    if (announcement) {
      this.outline.announce(announcement);
    }

    const edit: OrbitEdit = { kind, node, tree };
    this.options.onEdit?.(edit);
    this.emit('edit', edit);
  }

  /** Adds a node; `arrival`, where a new idea was typed, is where it first shows. */
  private insertNode(parentId: string, input: OrbitNewNode, index?: number, arrival?: Omit<Arrival, 'id'>): OrbitNode | null {
    const added = this.tree ? addToTree(this.tree, parentId, input, index, this.branchColorRules()) : null;

    if (!added) {
      return null;
    }

    const { node, parent } = added;
    this.changedIds.add(parent.id);
    this.arrival = arrival ? { id: node.id, ...arrival } : null;
    this.afterEdit('add', node, this.words.text('added', { name: node.text || this.words.text('anIdea') }));
    return node;
  }

  /** Whether Tab, Shift+Enter and Delete edit the map (see `editingKeys`). */
  private get editingKeys(): boolean {
    return this.options.editable === true && this.options.editingKeys === true && this.options.interactive !== false;
  }

  /** Shift+Enter: a new idea beside `id`, right after it. Beside the root, which has no orbit around it, is under it. */
  private addBeside(id: string): boolean {
    const path = this.tree ? getNodePath(this.tree, id) : [];
    const node = path[path.length - 1];
    const parent = path[path.length - 2];

    if (!node) {
      return false;
    }

    return parent ? this.editNewNode(parent.id, parent.children.indexOf(node) + 1) : this.editNewNode(node.id);
  }

  /** Delete: removes `id`, and keyboard focus moves on to the node after it, or before it, or up to its parent. */
  private removeWithKey(id: string): boolean {
    const path = this.tree ? getNodePath(this.tree, id) : [];
    const node = path[path.length - 1];
    const parent = path[path.length - 2];

    if (!node || !parent) {
      return false;
    }

    const position = parent.children.indexOf(node);
    const next = parent.children[position + 1] ?? parent.children[position - 1] ?? parent;

    if (!this.removeNode(id)) {
      return true;
    }

    const scene = this.transition?.target ?? this.scene;
    this.focusNodeElement(scene?.nodes.has(next.id) ? next.id : this.focusId);
    return true;
  }

  /**
   * Tab and Shift+Tab in the field (see `editingKeys`). Tab goes on a level
   * down: under the idea just typed, or with nothing typed, under the idea
   * before. Shift+Tab goes on a level up, beside the parent. What was typed
   * is kept first. Returns whether the key was used.
   */
  private tabFromEditor(text: string, back: boolean): boolean {
    const session = this.editing;
    const tree = this.tree;

    if (!session || !tree || !this.editingKeys) {
      return false;
    }

    const parentPath = getNodePath(tree, session.parentId);
    const parent = parentPath[parentPath.length - 1];

    if (!parent) {
      return false;
    }

    const grandparent = parentPath[parentPath.length - 2] ?? null;
    const value = text.replace(/\s+/g, ' ').trim();
    // The node the text went into: the one being renamed, or the idea typed.
    let typed: OrbitNode | null = null;

    if (session.nodeId !== null) {
      const node = findNodeById(tree, session.nodeId);
      this.finishEditing(false, false);
      typed = node && value && value !== node.text ? this.updateNode(node.id, { text: value }) : node;
    } else if (value) {
      const slot = this.display?.addSlot;
      const typedAt = slot && slot.parentId === session.parentId ? { x: slot.x, y: slot.y, radius: slot.radius } : undefined;
      this.finishEditing(false, false);
      typed = this.insertNode(session.parentId, { text: value }, session.index, typedAt);
    }

    if (back) {
      if (grandparent) {
        return this.editNewNode(grandparent.id, grandparent.children.indexOf(parent) + 1);
      }

      // There's no level above the root's orbit: an idea typed there goes on beside, as with Enter.
      return typed === null || session.nodeId !== null || this.editNewNode(parent.id, session.index + 1);
    }

    const under = typed ?? parent.children[session.index - 1] ?? null;
    // With nothing typed and nothing before it, the field stays where it is.
    return under === null || this.editNewNode(under.id);
  }

  /** Keeps what was typed: new text for a node, or a new idea (and, after Enter, the field moves on to the next). */
  private saveEdit(text: string, how: 'enter' | 'blur'): void {
    const session = this.editing;
    const tree = this.tree;

    if (!session || !tree) {
      return;
    }

    const value = text.replace(/\s+/g, ' ').trim();

    if (session.nodeId !== null) {
      const node = findNodeById(tree, session.nodeId);
      this.finishEditing(how === 'enter');

      if (node && value && value !== node.text) {
        this.updateNode(node.id, { text: value });
      }

      return;
    }

    const parent = findNodeById(tree, session.parentId);

    if (!value || !parent) {
      this.finishEditing(how === 'enter');
      return;
    }

    const slot = this.display?.addSlot;
    const typedAt = slot && slot.parentId === session.parentId ? { x: slot.x, y: slot.y, radius: slot.radius } : undefined;

    if (how === 'enter') {
      // On to the next idea, right after this one.
      this.editing = { ...session, index: session.index + 1 };
      this.editor.clear(newIdeaText(parent, this.words));
    } else {
      this.finishEditing(false, false);
    }

    this.insertNode(session.parentId, { text: value }, session.index, typedAt);
  }

  /**
   * Closes the field. `returnFocus` puts keyboard focus back on the node
   * (or the +) when it was in the field; `refresh` moves the + back to its
   * place, unless an edit is about to redraw the map anyway.
   */
  private finishEditing(returnFocus: boolean, refresh = true): void {
    const session = this.editing;

    if (!session) {
      return;
    }

    const hadFocus = this.editor.hasFocus;
    this.editing = null;
    this.editor.hide();
    const tree = this.tree;
    const node = tree && session.nodeId !== null ? findNodeById(tree, session.nodeId) : null;
    const parent = tree && session.nodeId === null ? findNodeById(tree, session.parentId) : null;

    if (refresh) {
      this.refreshSlot();
    }

    if (returnFocus && hadFocus) {
      if (node) {
        this.focusNodeElement(node.id);
      } else if (this.addSlotView.isShown) {
        this.addSlotView.element.focus({ preventScroll: true });
      }
    }

    this.paint();
    this.emitEditor('editor-close', node, parent);
  }

  /** Redraws the view when the + should show, move or go. */
  private refreshSlot(): void {
    const tree = this.tree;
    const scene = this.nextScene ?? this.transition?.target ?? this.scene;

    if (!tree || !scene || this.viewMode !== 'focus') {
      return;
    }

    const wanted = this.slotPlace();
    const focused = findNodeById(tree, this.focusId);
    const wantedIndex = wanted && focused ? wanted.index ?? focused.children.length : null;

    if ((scene.addSlot?.index ?? null) !== wantedIndex) {
      this.rebuild('morph');
    }
  }

  /** Where the + goes in the focused node's orbit: where a new idea is being typed, else after its children on editable maps. */
  private slotPlace(): { index?: number } | undefined {
    const session = this.editing;

    if (session && session.nodeId === null) {
      return session.parentId === this.focusId ? { index: session.index } : undefined;
    }

    return this.options.editable && this.options.interactive !== false ? {} : undefined;
  }

  private emitEditor(name: 'editor-open' | 'editor-close', node: OrbitNode | null, parent: OrbitNode | null): void {
    const event: OrbitEditorEvent = { node, parent };

    if (name === 'editor-open') {
      this.options.onEditorOpen?.(event);
    } else {
      this.options.onEditorClose?.(event);
    }

    this.emit(name, event);
  }

  /** Keeps the view's place on a node whose id an edit changed. */
  private renameView(from: string, to: string): void {
    this.focusPath = this.focusPath.map((id) => (id === from ? to : id));

    for (const key of ['activeId', 'hoveredId', 'keyboardFocusId', 'topPlanetId'] as const) {
      if (this[key] === from) {
        this[key] = to;
      }
    }

    this.renamedIds.set(from, to);
  }

  // Options

  /** Defaults, then the document's options, then the caller's. `undefined` means "not set". */
  private resolveOptions(): ResolvedRendererOptions {
    return mergeRendererOptions(mergeRendererOptions(DEFAULT_OPTIONS, this.documentOptions), this.userOptions);
  }

  private createExtensions(): MapExtensions {
    return new MapExtensions({ nodeTypes: this.options.nodeTypes, actions: this.options.actions, statuses: this.options.statuses, nodeTypeFor: this.options.nodeTypeFor });
  }

  /**
   * Speaks the language the options ask for, or else the one the map's
   * element is in now, and writes the map's words again if that changed.
   */
  private syncLanguage(): void {
    const requested = this.options.language ?? languageOf(this.container);

    if (requested === this.requestedLanguage && sameValues(this.options.strings, this.requestedStrings)) {
      return;
    }

    this.requestedLanguage = requested;
    this.requestedStrings = this.options.strings;
    this.words = new OrbitWords(requested, this.options.strings);
    this.svg.setAttribute('aria-roledescription', this.words.text('mindMapRole'));
    this.controls.relabel(this.words);
    this.outline.relabel(this.words);
    this.viewer.relabel();
    this.actionBar.reset();
    fillEmptyState(this.emptyState, this.words);

    for (const [, view] of this.nodePainter.entries()) {
      view.element.setAttribute('aria-label', describeNode(view.node, 0, view.node.children.length, this.extensions, this.words));
    }

    if (this.tree) {
      this.updateOutline();
      this.updateControls();
    }
  }

  /** Applies the current options. With `previous`, also updates the map for what changed. */
  private applyOptionEffects(previous: ResolvedRendererOptions | null): void {
    const next = this.options;
    const extended = previous !== null
      && (!sameValues(previous.nodeTypes, next.nodeTypes) || !sameValues(previous.actions, next.actions) || !sameValues(previous.statuses, next.statuses)
        || previous.nodeTypeFor !== next.nodeTypeFor);

    if (extended) {
      this.extensions = this.createExtensions();
    }

    this.applyTheme();
    this.syncLanguage();
    this.spinPhysics.settings = spinSettings(next.spin);
    this.svg.setAttribute('aria-label', next.ariaLabel || this.words.text('mindMap'));
    this.syncInteractivity();
    this.syncAmbientMotion();

    if (!previous || !this.tree) {
      return;
    }

    if (previous.baseUrl !== next.baseUrl || extended) {
      this.clearViews();
    }

    if (extended) {
      this.updateOutline();
      this.refreshScene();
      return;
    }

    if ((!next.editable || next.interactive === false) && this.editing) {
      this.stopEditing();
    }

    if (previous.maxDepth !== next.maxDepth || Boolean(previous.editable) !== Boolean(next.editable)) {
      this.updateOutline();
      this.rebuild('morph');
      return;
    }

    const recolor = !sameValues(previous.palette, next.palette) || !sameValues(previous.theme, next.theme);
    // The focused node's buttons, and the zoom buttons they keep clear of, take room from fitted views.
    const refit = !sameValues(resolveInsets(previous.insets), resolveInsets(next.insets))
      || (previous.showActionButtons !== false) !== (next.showActionButtons !== false)
      || (previous.interactive !== false) !== (next.interactive !== false)
      || (previous.showControls !== false) !== (next.showControls !== false);

    if (refit && this.transition) {
      // The flight lands where it was going; the view moves over once it's there.
      this.refitOnArrival = true;
    } else if (refit) {
      const fitted = this.isFitted();
      this.refreshScene();

      if (fitted) {
        this.fit();
      }

      return;
    }

    if (recolor) {
      this.refreshScene();
      return;
    }

    this.clock.requestPaint();
  }

  /** Whether the camera shows the view as it's fitted, not zoomed or panned away from it. */
  private isFitted(): boolean {
    const frame = this.scene?.frame;

    if (!frame) {
      return false;
    }

    const { camera } = this;
    return Math.abs(camera.scale / frame.scale - 1) < 0.01
      && Math.abs(camera.x - frame.x) * camera.scale < 2
      && Math.abs(camera.y - frame.y) * camera.scale < 2;
  }

  /** The theme object to apply, with a registered theme's name replaced by its tokens. */
  private themeOption(): OrbitRendererTheme | undefined {
    const theme = expandTheme(this.options.theme);
    return typeof theme === 'object' ? theme : undefined;
  }

  private themePreset(): OrbitThemePreset {
    return themeName(this.options.theme);
  }

  private applyTheme(): void {
    const theme = this.options.theme;
    const requested = typeof theme === 'string' ? theme : theme?.preset;

    if (requested !== undefined && !isThemeName(requested) && requested !== this.warnedTheme) {
      this.warnedTheme = requested;
      console.warn(`[orbit] Unknown theme "${String(requested)}", so the map uses paper. Themes: ${themeNames().join(', ')}.`);
    }

    this.root.dataset.orbitTheme = this.themePreset();
    const overrides = themeOverrides(this.themeOption());

    for (const property of this.themeProperties) {
      if (!(property in overrides)) {
        this.root.style.removeProperty(property);
      }
    }

    for (const [property, value] of Object.entries(overrides)) {
      this.root.style.setProperty(property, value);
    }

    this.themeProperties = Object.keys(overrides);
    this.labelPainter.forgetTextColors();
    const shading = JSON.stringify([this.themePreset(), this.themeOption()]);

    if (shading !== this.shadingTheme) {
      this.shadingTheme = shading;
      placeShading(this.definitions, this.ids, readShadeCircle(this.themeValue('node-shade-circle')));
    }

    this.labelFonts.refresh();
  }

  /** A token as the page resolves it (its CSS can set any), or as the theme sets it while the map isn't on a page. */
  private themeValue(token: OrbitThemeToken): string {
    if (typeof getComputedStyle === 'function' && this.root.isConnected) {
      const value = getComputedStyle(this.root).getPropertyValue(`--_orbit-${token}`).trim();

      if (value && !value.startsWith('var(')) {
        return value;
      }
    }

    return resolveThemeTokens(this.themePreset(), this.themeOption())[token];
  }

  /** Concrete theme values for exports: the preset, then the theme object, then the page's CSS. */
  private exportTokens(): Record<string, string> {
    const page: Partial<Record<OrbitThemeToken, string>> = {};

    if (typeof getComputedStyle === 'function' && this.root.isConnected) {
      const style = getComputedStyle(this.root);

      for (const token of THEME_TOKENS) {
        const value = style.getPropertyValue(`--_orbit-${token}`).trim();

        if (value && !value.startsWith('var(')) {
          page[token] = value;
        }
      }
    }

    return resolveThemeTokens(this.themePreset(), this.themeOption(), page);
  }

  private syncInteractivity(): void {
    const interactive = this.options.interactive !== false;
    this.root.classList.toggle('orbit--static', !interactive);
    this.svg.setAttribute('role', interactive ? 'group' : 'img');

    if (interactive) {
      this.input.attach(this.svg);
    } else {
      this.input.detach();
      this.sheet.close();
      this.tooltip.hide();
    }

    // The viewer stays open, but takes input only on an interactive map.
    this.viewer.refresh();
    this.controls.element.hidden = !interactive || this.options.showControls === false;
    this.tabStopsChanged = true;
  }

  // Scenes and navigation

  private get focusId(): string {
    return this.focusPath[this.focusPath.length - 1] ?? this.tree?.id ?? '';
  }

  private get rotation(): number {
    return this.spinPhysics.angle;
  }

  private sceneOptions(withSlot = true): SceneOptions {
    const tree = this.tree as OrbitNode;
    // A planet being dragged is laid out at the place held for it, and the others make room; anything
    // else carried to the orbit is given the + in the orbit as its place. Either way the orbit keeps
    // its count, so nothing moves until the place does.
    const drag = this.nodeDrag?.moving ? this.nodeDrag : null;
    const planet = drag !== null && this.carriesPlanet(drag);
    const held = drag !== null && !planet && drag.slot !== null ? { index: drag.slot } : null;
    // The orbit's rings stay as they were when the drag began: moons need more room next to some neighbors than others.
    const rings = drag?.rings && closeInSize(this.viewport, drag.rings.size) ? drag.rings : null;
    return {
      viewport: this.viewport,
      insets: resolveInsets(this.options.insets),
      colors: assignNodeColors(tree, resolvePalette(this.options.palette), (node) => this.extensions.color(node)),
      maxDepth: this.options.maxDepth,
      addSlot: withSlot ? (held ?? this.slotPlace()) : undefined,
      reorder: planet && drag.slot !== null ? { id: drag.id, index: drag.slot } : undefined,
      keptRings: rings ? { focusId: rings.focusId, radii: rings.radii } : undefined,
    };
  }

  /**
   * The scene for the current view, or null while there is nothing to draw
   * or no room to draw it. `withSlot: false` leaves out the + (for exports).
   */
  private buildScene(withSlot = true): Scene | null {
    const tree = this.tree;

    if (!tree || isEmptyTree(tree) || this.viewport.width <= 0 || this.viewport.height <= 0) {
      return null;
    }

    this.layoutSize = { ...this.viewport };
    return this.viewMode === 'all'
      ? buildOverviewScene(tree, this.sceneOptions(withSlot))
      : this.focusScene(tree, this.focusId, this.sceneOptions(withSlot));
  }

  /**
   * The focus view of `focusId`. Where the focused node's buttons have no
   * place around the sun, it's fitted to leave room for them under the orbit.
   */
  private focusScene(tree: OrbitNode, focusId: string, options: SceneOptions): Scene {
    const scene = buildFocusScene(tree, focusId, options);
    const room = this.roomForActions(scene);
    return room > 0 ? { ...scene, frame: fitScene(scene, this.viewport, options.insets, room) } : scene;
  }

  /**
   * The room (px) a focus view needs under its orbit for the focused node's
   * buttons: none where they have a place in the view as it's fitted.
   */
  private roomForActions(scene: Scene): number {
    const sun = scene.nodes.get(scene.focusId);
    const count = sun ? this.actionBar.count(sun.node) : 0;

    if (!sun || count === 0 || !this.showsActions() || this.actionsPlace(scene, sun, scene.frame) !== null) {
      return 0;
    }

    // In that room the buttons sit at the bottom of the map, beside the zoom buttons.
    return ACTION_ORBIT_GAP + this.rowsUnderOrbit(count, resolveInsets(this.options.insets)).rows.height + ACTION_EDGE_MARGIN;
  }

  private showsActions(): boolean {
    return this.options.showActionButtons !== false && this.options.interactive !== false;
  }

  /**
   * Where the focused node's buttons go, or null where every place would
   * cover something: under the sun where its planets leave room at every
   * turn of the orbit, else on its lower rim under its name, else under the
   * orbit (`focusScene` fits views to leave room there).
   */
  private actionsPlace(scene: Scene, sun: { id: string; node: OrbitNode; x: number; y: number; radius: number; hiddenChildren: number }, camera: Camera): ActionsPlace | null {
    // A node without buttons is still given a place: showing it there clears the last node's.
    const count = Math.max(1, this.actionBar.count(sun.node));
    const size = this.actionBar.size();
    const point = worldToScreen(camera, this.viewport, sun);
    const radius = sun.radius * camera.scale;
    const clear = innerOrbitEdge(scene) * camera.scale - ACTION_CLEARANCE;
    // The planets come round to every angle as the orbit turns: the row's farthest point from the sun stays inside them.
    const offset = (actionRows(count, size).width - size) / 2;
    const reach = (top: number): number => Math.hypot(offset, top + size / 2) + size / 2;
    const labelBelow = this.labelPainter.placementOf(sun.id) === 'outside';
    const under = radius + (labelBelow ? 36 : 12);

    if (reach(under) <= clear) {
      return { x: point.x, y: point.y + under, wrap: 0 };
    }

    if (!labelBelow) {
      const countWidth = showsCount('sun', radius, sun.hiddenChildren) ? measureCount(sun.hiddenChildren, this.labelFonts.count()) : 0;
      const name = insideLabelLayout('sun', radius, sun.node.text, Boolean(this.extensions.icon(sun.node)), this.labelFonts.inside('sun', sun.node), true, countWidth);
      const onRim = radius - size - ACTION_RIM_INSET;

      if (onRim >= (name ? insideLabelReach(name) : 0) + ACTION_CLEARANCE && reach(onRim) <= clear) {
        return { x: point.x, y: point.y + onRim, wrap: 0 };
      }
    }

    // Under the orbit, its edge at every turn.
    const insets = resolveInsets(this.options.insets);
    const top = point.y + Math.max(scene.extent.x, scene.extent.y) * camera.scale + ACTION_ORBIT_GAP;
    const { rows, left, right } = this.rowsUnderOrbit(count, insets, top);

    if (top + rows.height > this.viewport.height - insets.bottom - ACTION_EDGE_MARGIN) {
      return null;
    }

    // Under the sun, unless that takes them past the zoom buttons or the map's side.
    const x = Math.min(Math.max(point.x, left + rows.width / 2), right - rows.width / 2);
    return { x, y: top, wrap: rows.perLine < count ? rows.width : 0 };
  }

  /**
   * How `count` buttons lay out under the orbit with their top `top` px down
   * the map (by default, as low as they go): between the sides of the map
   * that `insets` leave, or short of the zoom buttons where they come down
   * beside them, on more lines if they must.
   */
  private rowsUnderOrbit(count: number, insets: Insets, top = this.viewport.height): { rows: ActionRows; left: number; right: number } {
    const size = this.actionBar.size();
    const left = insets.left + ACTION_EDGE_MARGIN;
    let right = this.viewport.width - insets.right - ACTION_EDGE_MARGIN;
    let rows = actionRows(count, size, right - left);
    const zoom = this.controls.zoomBox(this.viewport.width, this.viewport.height);

    if (zoom && top + rows.height + ACTION_EDGE_MARGIN > zoom.top) {
      right = Math.min(right, zoom.left - ACTION_EDGE_MARGIN);
      rows = actionRows(count, size, right - left);
    }

    return { rows, left, right };
  }

  /**
   * Moves to a view: `nodeId` in focus, or the overview. Fires
   * onFocusChange and onViewModeChange unless `notify` is false.
   */
  private navigate(mode: ViewMode, nodeId: string, notify = true): boolean {
    const tree = this.tree;

    if (!tree) {
      return false;
    }

    const path = getNodePath(tree, nodeId);

    if (path.length === 0) {
      return false;
    }

    const focusChanged = path[path.length - 1].id !== this.focusId;
    const modeChanged = mode !== this.viewMode;
    this.focusPath = path.map((node) => node.id);
    this.viewMode = mode;

    if (!focusChanged && !modeChanged) {
      this.fit();
      return true;
    }

    const active = this.root.ownerDocument.activeElement;
    this.returnFocusToMap ||= Boolean(active && this.svg.contains(active));
    this.hoveredId = null;
    this.updateTooltip();
    this.actionBar.hide();
    this.flyToCurrentView();
    this.updateControls();
    this.outline.setCurrent(this.focusId);
    this.announceView();

    if (notify && modeChanged) {
      this.options.onViewModeChange?.(mode);
      this.emit('view-mode-change', { mode });
    }

    if (notify && focusChanged && mode === 'focus') {
      this.emitFocusChange(path);
    }

    return true;
  }

  private flyToCurrentView(): void {
    const target = this.buildScene();
    this.stopMotion();

    if (!target) {
      this.transition = null;
      this.nextScene = null;
      this.scene = null;
      this.paint();
      return;
    }

    if (this.scene && this.prefersReducedMotion() && this.options.transitionDuration !== 0) {
      this.startFade(target);
      return;
    }

    if (!this.scene || !this.animationsEnabled()) {
      this.transition = null;
      this.nextScene = null;
      this.restOn(target);
      return;
    }

    const now = this.now();
    const from = this.currentDisplay(now);
    const placement = this.placeTarget(from, target);

    if (placement) {
      this.nextScene = null;
      this.startTransition(from, target, placement, now);
      return;
    }

    // Neither view contains the other: pass through their common ancestor.
    const via = this.commonAncestorScene(target);
    const viaPlacement = via ? this.placeTarget(from, via) : null;

    if (via && viaPlacement) {
      this.nextScene = target;
      this.startTransition(from, via, viaPlacement, now);
      return;
    }

    this.nextScene = null;
    this.startTransition(from, target, overlayPlacement(target, from.camera), now);
  }

  /**
   * Where to put `target` in today's world so the flight has a fixed point:
   * a node both views show stays put while the camera moves.
   */
  private placeTarget(from: Display, target: Scene): Similarity | null {
    const visible = (id: string | undefined): DisplayNode | null => {
      const node = id === undefined ? undefined : from.nodes.get(id);
      return node && node.opacity > 0.3 && node.radius > 0.5 ? node : null;
    };

    // The destination's focus is on screen: zoom into it.
    const focus = visible(target.focusId);

    if (focus) {
      return alignScene(target, target.focusId, focus);
    }

    // Today's focus is in the destination: zoom out around it.
    const currentFocusId = this.transition?.target.focusId ?? this.scene?.focusId;
    const current = visible(currentFocusId);

    if (current && currentFocusId !== undefined && target.nodes.has(currentFocusId)) {
      return alignScene(target, currentFocusId, current);
    }

    // Any node both views share, the biggest on screen.
    let shared: DisplayNode | null = null;

    for (const node of from.nodes.values()) {
      if (node.opacity > 0.3 && node.radius > 0.5 && target.nodes.has(node.id) && (!shared || node.radius > shared.radius)) {
        shared = node;
      }
    }

    if (shared) {
      return alignScene(target, shared.id, shared);
    }

    const tree = this.tree;

    if (!tree) {
      return null;
    }

    // An ancestor of today's focus is in the destination: shrink this view into it.
    if (current && currentFocusId !== undefined) {
      for (let node = findNodeById(tree, currentFocusId)?.parent; node; node = node.parent) {
        if (target.nodes.has(node.id)) {
          return alignScene(target, node.id, { x: current.x, y: current.y, radius: current.radius * 1.15 });
        }
      }
    }

    // An ancestor of the destination's focus is on screen: grow the destination out of it.
    for (let node = findNodeById(tree, target.focusId)?.parent; node; node = node.parent) {
      const shown = visible(node.id);

      if (shown) {
        return alignScene(target, target.focusId, { x: shown.x, y: shown.y, radius: shown.radius * 0.45 });
      }
    }

    return null;
  }

  private commonAncestorScene(target: Scene): Scene | null {
    const tree = this.tree;
    const currentFocusId = this.transition?.target.focusId ?? this.scene?.focusId;

    if (!tree || target.kind !== 'focus' || currentFocusId === undefined) {
      return null;
    }

    const fromPath = getNodePath(tree, currentFocusId);
    const toPath = getNodePath(tree, target.focusId);
    let ancestor: OrbitNode | null = null;

    for (let index = 0; index < Math.min(fromPath.length, toPath.length) && fromPath[index].id === toPath[index].id; index += 1) {
      ancestor = fromPath[index];
    }

    if (!ancestor || ancestor.id === currentFocusId || ancestor.id === target.focusId) {
      return null;
    }

    return this.focusScene(tree, ancestor.id, this.sceneOptions());
  }

  private startTransition(from: Display, target: Scene, placement: Similarity, now: number, duration?: number, landing?: Camera): void {
    this.nodePainter.startFlight();
    const destination = landing ?? placedFrame(target, placement);
    const cameraPath = smoothZoomPath(from.camera, destination, this.viewport);
    this.transition = {
      from: visiblePart(from),
      target,
      placement,
      cameraPath,
      startedAt: now,
      duration: duration ?? this.flightDuration(cameraPath.length),
    };
    this.landingCamera = landing ?? null;
    this.spinPhysics.stop();
    this.tabStopsChanged = true;
    this.clock.add(this.transitionTask);
    // Paint the first frame now, so the map's elements exist as soon as render() returns.
    this.paint();
  }

  /** Reduced motion: fade the current view out and the next one in, without moving anything. */
  private startFade(target: Scene): void {
    const now = this.now();
    const from = visiblePart(this.currentDisplay(now));
    this.nextScene = null;
    this.landingCamera = null;
    this.transition = {
      from,
      target,
      placement: IDENTITY,
      cameraPath: { length: 0, at: () => target.frame },
      startedAt: now,
      duration: FADE_DURATION,
      fade: true,
    };
    this.spinPhysics.stop();
    this.tabStopsChanged = true;
    this.clock.add(this.transitionTask);
    this.paint();
  }

  private flightDuration(pathLength: number): number {
    const setting = this.options.transitionDuration;

    if (typeof setting === 'number') {
      return Math.max(0, setting);
    }

    return Math.min(1300, Math.max(480, pathLength * 650));
  }

  private readonly transitionTask: FrameTask = (now) => {
    const transition = this.transition;

    if (!transition) {
      return false;
    }

    if (now - transition.startedAt < transition.duration) {
      return true;
    }

    this.finishTransition();
    return this.transition !== null;
  };

  private finishTransition(): void {
    const transition = this.transition;

    if (!transition) {
      return;
    }

    this.transition = null;
    this.scene = transition.target;
    this.camera = this.landingCamera ? { ...this.landingCamera } : { ...transition.target.frame };
    this.landingCamera = null;
    this.spinPhysics.stop();
    this.spinPhysics.angle = 0;
    const next = this.nextScene;
    this.nextScene = null;

    if (next) {
      const from = sceneDisplay(this.scene, 0, this.camera);
      this.startTransition(from, next, this.placeTarget(from, next) ?? overlayPlacement(next, this.camera), this.now());
      return;
    }

    this.afterArrival();
  }

  /** Jumps to the end of any flight in progress. */
  private completeTransition(): void {
    if (!this.transition) {
      return;
    }

    const landing = this.nextScene ?? this.transition.target;
    const camera = this.nextScene ? null : this.landingCamera;
    this.transition = null;
    this.nextScene = null;
    this.landingCamera = null;
    this.restOn(landing, false);

    if (camera) {
      this.camera = camera;
    }
  }

  /** Shows `scene` at rest, fitted. */
  private restOn(scene: Scene, arrive = true): void {
    this.scene = scene;
    this.camera = { ...scene.frame };
    this.spinPhysics.stop();
    this.spinPhysics.angle = 0;
    this.tabStopsChanged = true;
    this.paint();

    if (arrive) {
      this.afterArrival();
    }
  }

  private afterArrival(): void {
    if (this.relayoutOnArrival) {
      this.relayoutOnArrival = false;
      this.refitOnArrival = false;
      this.rebuild('instant');
      return;
    }

    if (this.refitOnArrival) {
      this.refitOnArrival = false;
      this.refreshScene();
      this.fit();
    }

    this.tabStopsChanged = true;
    this.topPlanetId = this.planetNearestTop()?.id ?? null;
    this.clock.requestPaint();
    this.syncAmbientMotion();
    // Keep keyboard focus on the map when the node it was on has left.
    const active = this.root.ownerDocument.activeElement;

    if (this.returnFocusToMap && (!active || !this.svg.contains(active))) {
      this.paint();
      this.focusNodeElement(this.activeId ?? this.focusId);
    }

    this.returnFocusToMap = false;
  }

  /**
   * Builds the view again: `enter` animates it in, `morph` moves today's
   * nodes into their new places, `instant` just shows it.
   */
  private rebuild(mode: 'enter' | 'morph' | 'instant'): void {
    // The page may have switched the map's fonts since the last draw: check once it's idle.
    this.labelFonts.recheckWhenIdle(() => this.labelPainter.refit());
    const renamed = this.renamedIds;
    this.renamedIds = new Map();
    const arrival = this.arrival;
    this.arrival = null;
    this.completeTransition();
    this.stopMotion();
    const target = this.buildScene();
    this.emptyState.hidden = !(this.tree && isEmptyTree(this.tree));

    if (!target) {
      this.scene = null;
      this.paint();
      return;
    }

    if (mode === 'instant' || !this.animationsEnabled()) {
      this.restOn(target);
      return;
    }

    const now = this.now();

    if (mode === 'enter' || !this.scene) {
      const from: Display = {
        nodes: new Map(),
        rings: [],
        links: [],
        camera: { ...target.frame, scale: target.frame.scale * 0.82 },
      };
      this.scene = target;
      this.startTransition(from, target, IDENTITY, now, ENTRY_DURATION);
      return;
    }

    const from = this.dropFrom ?? withArrival(renameNodes(sceneDisplay(this.scene, this.rotation, this.camera), renamed), arrival, target);
    // A live edit in the overview keeps the reader's zoom and position.
    const keepCamera = target.kind === 'overview' && this.scene.kind === 'overview';
    this.startTransition(from, target, IDENTITY, now, MORPH_DURATION, keepCamera ? { ...this.camera } : undefined);
  }

  /** Rebuilds the current view in place (new colors, same layout). */
  private refreshScene(): void {
    this.completeTransition();
    const target = this.buildScene();

    if (!target || !this.scene) {
      this.rebuild('instant');
      return;
    }

    this.scene = target;
    this.camera = this.clampCamera(this.camera);
    this.labelPainter.forgetLightText();
    this.paint();
  }

  private currentDisplay(now: number): Display {
    const transition = this.transition;

    if (transition) {
      const progress = transition.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - transition.startedAt) / transition.duration));
      return transition.fade ? fadeDisplay(transition, progress) : transitionDisplay(transition, easeInOutCubic(progress));
    }

    // At rest only the camera and the spin change: reuse the layout while the spin stands still.
    const scene = this.scene as Scene;
    const cached = this.restingDisplay;

    if (cached && cached.scene === scene && cached.rotation === this.rotation) {
      return { ...cached.display, camera: this.camera };
    }

    const display = sceneDisplay(scene, this.rotation, this.camera);
    this.restingDisplay = { scene, rotation: this.rotation, display };
    return display;
  }

  /** Stops every camera and orbit motion except a flight between views. */
  private stopMotion(): void {
    this.cameraFlight = null;
    this.wheelZoom = null;
    this.glide.stop();

    if (this.spinPhysics.mode !== 'dragging') {
      this.spinPhysics.stop();
    }
  }

  // Painting

  private paint(): void {
    if (this.destroyed) {
      return;
    }

    if (!this.scene) {
      this.display = null;
      this.clearViews();
      return;
    }

    const settled = this.currentDisplay(this.now());
    const display = this.withCarried(settled);
    this.display = display;
    const worldTransform = cameraTransform(display.camera, this.viewport);

    if (worldTransform !== this.worldTransform) {
      this.world.setAttribute('transform', worldTransform);
      this.worldTransform = worldTransform;
    }

    this.ringsAndLinks.paint(display, this.options.showRings !== false);
    const turn = this.nodePainter.paintTurn(display);
    this.nodePainter.paintNodes(display, turn);
    this.paintAddSlot(display, turn);
    this.paintHeldPlace(settled, turn);
    this.contentPainter.paint(display);
    this.labelPainter.paint(display);

    this.changedIds.clear();
    this.paintOverlay(display);
    this.placeEditor(display);

    if (this.tabStopsChanged) {
      this.updateTabStops();
    }

    if (this.tooltip.isVisible) {
      this.positionTooltip();
    }
  }

  /** The node whose text is being typed on the map, if any. */
  private editedId(): string | null {
    return this.editor.isOpen ? this.editing?.nodeId ?? null : null;
  }

  private paintAddSlot(display: Display, turn: number | undefined): void {
    const slot = display.addSlot;
    const parent = slot ? display.nodes.get(slot.parentId)?.node : undefined;
    // The + in the orbit is the place held for a node carried there from elsewhere.
    const drag = this.nodeDrag?.moving ? this.nodeDrag : null;
    const held = drag !== null && !this.carriesPlanet(drag) && drag.slot !== null ? drag : null;
    const label = held
      ? this.words.text('moveHere', { name: held.node.text || this.words.text('theIdea') })
      : this.words.text('addIdeaTo', { name: parent?.text || this.words.text('thisIdea') });
    const drop = held ? (held.place?.into ? 'waiting' : 'target') : false;
    this.addSlotView.update(slot, label, this.editor.isOpen && this.editing?.nodeId === null, turn, drop);
  }

  /** The place held for a planet being dragged: an empty ring where it's laid out, under the press's way. */
  private paintHeldPlace(settled: Display, turn: number | undefined): void {
    const drag = this.nodeDrag;
    const entry = drag && this.carriesPlanet(drag) ? settled.nodes.get(drag.id) : undefined;
    const place: DisplaySlot | undefined = drag && entry
      ? { parentId: drag.parent.id, index: drag.slot ?? 0, x: entry.x, y: entry.y, radius: entry.radius, opacity: entry.opacity, unturned: entry.unturned }
      : undefined;
    this.heldPlaceView.update(place, '', false, turn, drag?.place?.into ? 'waiting' : 'target');
  }

  /** Lays the field for typing over its node, or the +, wherever they are this frame. */
  private placeEditor(display: Display): void {
    const session = this.editing;

    if (!session || !this.editor.isOpen) {
      return;
    }

    const { camera } = display;

    if (session.nodeId === null) {
      const slot = display.addSlot;
      const shown = slot && slot.parentId === session.parentId && slot.opacity > 0.5;
      this.editor.place(shown ? this.editorPlacement(worldToScreen(camera, this.viewport, slot), slot.radius * camera.scale, 'planet', false, true) : null);
      return;
    }

    const entry = display.nodes.get(session.nodeId);
    const shown = entry && entry.opacity > 0.5;
    this.editor.place(shown ? this.editorPlacement(worldToScreen(camera, this.viewport, entry), entry.radius * camera.scale, entry.role, this.labelPainter.usesLightText(entry), false, entry.hiddenChildren) : null);
  }

  /**
   * The field's place and size: the label's, inside the node; a node too
   * small to hold it gets a field floating over it at a readable size. Over a
   * node with a "+N" (`hiddenChildren` it doesn't draw), the field rises as
   * it grows, as names do, to keep clear of the count.
   */
  private editorPlacement(point: Point, screenRadius: number, role: NodeRole, light: boolean, slot: boolean, hiddenChildren = 0): EditorPlacement {
    const floating = screenRadius < 32;
    const width = floating ? Math.max(140, insideLabelWidth(role, screenRadius)) : insideLabelWidth(role, screenRadius);
    return {
      x: point.x,
      y: point.y,
      width,
      fontSize: Math.max(13, insideFontSize(role, width, this.editor.value || this.words.text('newIdea'), this.labelFonts.inside(role))),
      maxHeight: Math.max(44, screenRadius * 1.5),
      role,
      light: light && !floating,
      slot,
      floating: floating && !slot,
      lowest: !floating && showsCount(role, screenRadius, hiddenChildren) ? COUNT_POSITION * screenRadius - COUNT_HEIGHT / 2 : undefined,
    };
  }

  private paintOverlay(display: Display): void {
    const { camera } = display;
    const scene = this.scene;
    const sun = this.viewMode === 'focus' && !this.transition && scene ? display.nodes.get(scene.focusId) : undefined;

    const place = sun && scene && this.showsActions() && this.zoomLevel() < 1.5 ? this.actionsPlace(scene, sun, camera) : null;

    if (sun && place) {
      this.actionBar.show(sun.node, place.x, place.y, place.wrap);
    } else {
      this.actionBar.hide();
    }
  }

  private clearViews(): void {
    this.labelPainter.clear();

    this.nodePainter.clear();
    this.ringsAndLinks.clear();

    this.contentPainter.clear();

    this.actionBar.reset();
  }

  /** One tab stop for the whole map (roving tabindex); arrow keys move between nodes. */
  private updateTabStops(): void {
    this.tabStopsChanged = false;
    const interactive = this.options.interactive !== false;
    const scene = this.transition?.target ?? this.scene;

    if (!this.activeId || !scene?.nodes.has(this.activeId) || !this.nodePainter.view(this.activeId)) {
      this.activeId = scene?.focusId ?? null;
    }

    for (const [id, view] of this.nodePainter.entries()) {
      const tabStop = interactive ? (id === this.activeId ? '0' : '-1') : null;

      // Only a real change is written: newcomer flights run this once per frame, over every node.
      if (view.element.getAttribute('tabindex') !== tabStop) {
        if (tabStop === null) {
          view.element.removeAttribute('tabindex');
        } else {
          view.element.setAttribute('tabindex', tabStop);
        }
      }
    }
  }

  private focusNodeElement(id: string): void {
    const view = this.nodePainter.view(id);

    if (!view) {
      return;
    }

    this.activeId = id;
    this.updateTabStops();
    view.element.focus({ preventScroll: true });
  }

  // Chrome: controls, outline, tooltip, announcements

  private updateControls(): void {
    this.root.dataset.orbitView = this.viewMode;
    const path = this.tree ? getNodePath(this.tree, this.focusId) : [];
    this.controls.update({ viewMode: this.viewMode, path, outlineOpen: this.outline.isVisible });
  }

  /** The outline, and the pictures and videos the viewer steps through, follow the map. */
  private updateOutline(): void {
    if (this.tree) {
      this.outline.update(this.tree, this.focusId, this.options.maxDepth, this.options.interactive !== false, (node) => this.extensions.icon(node));
    }

    this.viewer.refresh();
  }

  private toggleOutline(): void {
    this.outline.setVisible(!this.outline.isVisible);
    this.updateControls();
  }

  private selectFromOutline(nodeId: string): void {
    if (this.outline.isVisible) {
      this.outline.setVisible(false);
    }

    this.activeId = nodeId;
    this.returnFocusToMap = true;
    this.navigate('focus', nodeId);
    this.updateControls();
  }

  private announceView(): void {
    if (this.viewMode === 'all') {
      this.outline.announce(this.words.text('overviewAnnouncement'));
      return;
    }

    const node = this.getFocusedNode();

    if (node) {
      const count = node.children.length;
      const name = node.text || this.words.text('untitled');
      this.outline.announce(count > 0 ? `${name}, ${this.words.count('ideaCount', count)}` : name);
    }
  }

  private updateTooltip(): void {
    const id = this.dragging ? null : this.hoveredId ?? this.keyboardFocusId;
    const entry = id ? this.display?.nodes.get(id) : undefined;

    if (!entry || this.transition) {
      this.tooltip.hide();
      return;
    }

    const node = entry.node;
    const typeLabel = this.extensions.nodeType(node)?.label;
    const placement = this.labelPainter.placementOf(entry.id) ?? 'hidden';
    // The tooltip shows a little of the note: bound the text before stripping
    // its markdown, whose link markup is slow to unpack on a huge note.
    const note = node.note ? noteToPlainText(node.note.slice(0, 400)).replace(/\s+/g, ' ').trim() : '';
    const clipped = placement === 'hidden' || node.text.length > 24;

    if (!clipped && !note && !node.status && !typeLabel) {
      this.tooltip.hide();
      return;
    }

    const details = [
      typeLabel ?? '',
      node.status ? this.words.text('statusLabel', { status: node.status }) : '',
      note.length > 140 ? `${note.slice(0, 139)}…` : note,
    ].filter(Boolean);
    const point = this.tooltipAnchor(entry);
    this.tooltip.show([this.extensions.icon(node), node.text || this.words.text('untitled')].filter(Boolean).join(' '), details.join(' · '), point.x, point.y);
  }

  private positionTooltip(): void {
    const id = this.hoveredId ?? this.keyboardFocusId;
    const entry = id ? this.display?.nodes.get(id) : undefined;

    if (!entry) {
      this.tooltip.hide();
      return;
    }

    const point = this.tooltipAnchor(entry);
    this.tooltip.place(point.x, point.y);
  }

  private tooltipAnchor(entry: DisplayNode): Point {
    const camera = this.display?.camera ?? this.camera;
    const point = worldToScreen(camera, this.viewport, entry);
    return { x: point.x, y: point.y - entry.radius * camera.scale };
  }

  // Interaction: nodes, keyboard, hover

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.options.interactive === false || event.detail > 1) {
      return;
    }

    if (isAddSlot(event.target)) {
      this.editNewNode();
      return;
    }

    const id = nodeIdFrom(event.target);

    if (id) {
      this.activate(id);
    }
  };

  /** A right click, or the browser's own long press or context menu key, on a node. */
  private readonly handleContextMenu = (event: MouseEvent): void => {
    const id = nodeIdFrom(event.target);

    if (!id || this.options.interactive === false) {
      return;
    }

    if (this.openNodeContext(id, this.contextPoint(event, id))) {
      event.preventDefault();
    }
  };

  /**
   * Where a context menu event points on the map: the pointer when it is on
   * the node, otherwise the node's center (menus opened from the keyboard
   * report the element's corner, or nothing).
   */
  private contextPoint(event: MouseEvent, id: string): Point {
    const center = this.nodeOnScreen(id);
    const bounds = this.root.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const entry = this.display?.nodes.get(id);
    const reach = (entry?.radius ?? 0) * (this.display?.camera.scale ?? 1) + 24;
    return Number.isFinite(point.x) && Number.isFinite(point.y) && Math.hypot(point.x - center.x, point.y - center.y) <= reach ? point : center;
  }

  /** A node's center on the map. */
  private nodeOnScreen(id: string): Point {
    const entry = this.display?.nodes.get(id);

    if (!entry) {
      return this.viewportCenter();
    }

    return worldToScreen(this.display?.camera ?? this.camera, this.viewport, entry);
  }

  /**
   * Reports a long press, right click or context menu key on a node.
   * Returns whether someone took it: an `onNodeContext` callback, a
   * `node-context` listener, or a DOM listener that called
   * `preventDefault()`. A press someone took doesn't open the node, and the
   * browser's menu stays closed.
   */
  private openNodeContext(id: string, point: Point, longPress = false): boolean {
    const scene = this.transition?.target ?? this.scene;
    const entry = scene?.nodes.get(id);

    if (!entry) {
      return false;
    }

    const now = this.now();
    const previous = this.lastContext;

    if (previous && previous.id === id && now - previous.time < CONTEXT_REPEAT) {
      return previous.taken;
    }

    const detail: OrbitNodeContextEvent = { node: entry.node, x: Math.round(point.x), y: Math.round(point.y) };
    const listening = this.options.onNodeContext !== undefined || (this.listeners.get('node-context')?.size ?? 0) > 0;
    this.options.onNodeContext?.(detail);
    let taken = !this.emit('node-context', detail, true) || listening;

    // Without a menu of the page's own, an editable map types the node's text where it is: after a long
    // press, once it's let go without moving, as the press may drag the node instead.
    if (!taken && this.options.editable) {
      if (longPress && this.canLift(id)) {
        this.editOnLift = id;
        taken = true;
      } else {
        taken = this.editNode(id);
      }
    }

    this.lastContext = { id, time: now, taken };

    if (taken) {
      // A menu is about to cover the node: its tooltip goes.
      this.hoveredId = null;
      this.keyboardFocusId = null;
      this.updateTooltip();
    }

    return taken;
  }

  // Interaction: dragging a node somewhere else

  /** Whether a press held on node `id` lifts it: on an editable map at rest, any node but the root and the sun. */
  private canLift(id: string): boolean {
    if (!this.options.editable || this.options.interactive === false || this.transition || this.editing) {
      return false;
    }

    const entry = this.display?.nodes.get(id);
    return entry !== undefined && entry.role !== 'sun' && entry.opacity > 0.5 && entry.parentId !== undefined
      && this.tree !== null && getNodePath(this.tree, id).length > 1;
  }

  /** A press held still on node `id`: it lifts, to be dragged somewhere else. Returns whether it did. */
  private liftNode(id: string | null, point: Point): boolean {
    const editOnRelease = id !== null && this.editOnLift === id;
    this.editOnLift = null;
    const display = this.display;
    const tree = this.tree;

    if (id === null || !display || !tree || !this.canLift(id)) {
      return false;
    }

    const path = getNodePath(tree, id);
    const node = path[path.length - 1];
    const parent = path[path.length - 2];
    const entry = display.nodes.get(id) as DisplayNode;
    const world = screenToWorld(display.camera, this.viewport, point);
    // The moons go with their planet, each where it is around it.
    const bodies = Array.from(display.nodes.values())
      .filter((body) => body.id === id || (body.role === 'moon' && body.hostId === id))
      .map((body) => ({ ...body, x: body.x - entry.x, y: body.y - entry.y, unturned: undefined, cluster: undefined }));
    this.nodeDrag = {
      id,
      node,
      parent,
      index: parent.children.indexOf(node),
      unreachable: unreachableIds(node, parent.id),
      moving: false,
      point,
      grab: { x: world.x - entry.x, y: world.y - entry.y },
      bodies,
      ringRadius: null,
      rings: null,
      slot: null,
      place: null,
      editOnRelease,
      scale: 1,
    };
    this.hoveredId = null;
    this.updateTooltip();
    this.clock.requestPaint();
    return true;
  }

  /** The press holding a lifted node moved, was let go, or was taken away. */
  private dragNode(point: Point, phase: 'move' | 'drop' | 'cancel'): void {
    const drag = this.nodeDrag;

    if (!drag) {
      return;
    }

    if (this.destroyed) {
      this.nodeDrag = null;
      return;
    }

    drag.point = point;

    if (phase === 'move') {
      if (!drag.moving) {
        this.startCarrying(drag);
      }

      this.updateDropPlace(drag);
      this.clock.requestPaint();
      return;
    }

    // Where it's let go decides, even if the last move was elsewhere.
    const place = drag.moving ? this.dropPlaceAt(drag) : null;

    if (phase === 'drop' && place) {
      this.dropNode(drag, place);
      return;
    }

    this.putBack(drag, phase === 'drop');
  }

  /**
   * The lifted node leaves its place to follow the press. A planet of the
   * focused orbit keeps its place held, so nothing moves and nothing slides
   * under the press; anything else leaves an empty place behind.
   */
  private startCarrying(drag: NodeDrag): void {
    drag.moving = true;

    if (this.viewMode === 'focus' && this.scene?.kind === 'focus') {
      drag.ringRadius = this.scene.rings[0]?.radius ?? 0;
      drag.rings = { focusId: this.scene.focusId, radii: this.scene.rings.map((ring) => ring.radius), size: { ...this.viewport } };
      drag.slot = drag.parent.id === this.focusId ? drag.index : null;
    }

    drag.place = drag.slot === null ? null : { parentId: this.focusId, index: drag.slot, into: false };
    this.emitDrag('start', drag.node, drag.parent, drag.index);
    // It leaves its place under the press at once.
    this.paint();
  }

  /** Whether the node being dragged is one of the focused orbit's planets, laid out at the place held for it. */
  private carriesPlanet(drag: NodeDrag): boolean {
    return drag.moving && drag.slot !== null && drag.parent.id === this.focusId && this.viewMode === 'focus';
  }

  /**
   * Where the dragged node would go if let go now: into the node under the
   * press, at the place in the orbit under it, or else at the place held for
   * it. Null when there's none of those.
   */
  private dropPlaceAt(drag: NodeDrag): DropPlace | null {
    const display = this.display;

    if (!display) {
      return null;
    }

    const { camera } = display;
    const world = screenToWorld(camera, this.viewport, drag.point);
    const current = drag.place?.into ? drag.place.parentId : null;
    const focus = this.viewMode === 'focus';

    const catchRadius = (entry: DisplayNode, held: boolean): number => {
      const reach = focus && entry.role === 'planet'
        ? Math.max(entry.radius * PLANET_CORE, PLANET_CORE_PX / camera.scale)
        : entry.radius + DROP_REACH / camera.scale;
      return held ? reach * KEEP_TARGET : reach;
    };

    const under = nodeUnder(display, world, drag.unreachable, catchRadius, current);

    if (under) {
      return { parentId: under.id, index: null, into: true };
    }

    const held = drag.slot === null ? null : { parentId: this.focusId, index: drag.slot, into: false };
    // Over a node it can't go into, such as the planet a moon is leaving, where it would go stays as it was.
    const carried = new Set(drag.bodies.map((body) => body.id));

    for (const entry of display.nodes.values()) {
      if (drag.unreachable.has(entry.id) && !carried.has(entry.id) && Math.hypot(world.x - entry.x, world.y - entry.y) <= entry.radius) {
        return drag.place?.into ? held : drag.place;
      }
    }

    // The orbit as it will rest: a flight's target is drawn unturned.
    const layout = this.transition?.target ?? this.scene;
    const sun = display.nodes.get(this.focusId);

    if (drag.ringRadius !== null && layout && sun) {
      const band = Math.max(ORBIT_BAND / camera.scale, (drag.bodies[0]?.radius ?? 0) * 1.2);
      const rotation = this.transition ? 0 : this.rotation;
      const index = orbitPlaceAt(layout, { x: world.x - sun.x, y: world.y - sun.y }, rotation, drag.ringRadius, band, drag.id, drag.slot);

      if (index !== null) {
        return { parentId: this.focusId, index, into: false };
      }
    }

    return held;
  }

  /**
   * Follows where the dragged node would go, and tells the page when that
   * changes. The orbit is laid out again only when the place held in it
   * moves: hovering a node leaves the planets where they are, so the node
   * stays under the press.
   */
  private updateDropPlace(drag: NodeDrag): void {
    const place = this.dropPlaceAt(drag);

    if (samePlace(place, drag.place)) {
      return;
    }

    drag.place = place;
    const parent = place && this.tree ? findNodeById(this.tree, place.parentId) : null;
    this.emitDrag('over', drag.node, parent, place?.index ?? null);

    if (place && !place.into && place.index !== drag.slot) {
      drag.slot = place.index;
      this.relayoutForDrag();
    } else {
      // The new target shows at once; the place held waits while a node is the target.
      this.paint();
    }
  }

  /**
   * Lays the view out again around the node being dragged, with the place
   * held for it where it would land in the orbit, the planets making room.
   * They glide from wherever they are this frame, and the camera holds still.
   */
  private relayoutForDrag(): void {
    const target = this.buildScene();

    if (!target || !this.scene) {
      return;
    }

    const now = this.now();
    const from = this.currentDisplay(now);
    this.nextScene = null;

    if (!this.animationsEnabled()) {
      this.transition = null;
      this.landingCamera = null;
      this.restOn(target, false);
      this.camera = { ...from.camera };
      this.paint();
      return;
    }

    this.startTransition(from, target, IDENTITY, now, DRAG_MORPH_DURATION, { ...from.camera });
  }

  /** Lets the dragged node go at `place`: it moves there (an `edit`), and flies from where it was let go. */
  private dropNode(drag: NodeDrag, place: DropPlace): void {
    // Back at the place it came from is no move at all.
    if (place.parentId === drag.parent.id && (place.index ?? drag.parent.children.length - 1) === drag.index) {
      this.putBack(drag, false);
      return;
    }

    this.dropFrom = this.display;
    this.nodeDrag = null;
    const moved = this.moveNode(drag.id, place.parentId, place.index ?? undefined);
    this.dropFrom = null;

    if (!moved) {
      this.rebuild('morph');
      this.emitDrag('end', drag.node, null, null);
      return;
    }

    const tree = this.tree as OrbitNode;
    const path = getNodePath(tree, moved.id);
    const parent = path[path.length - 2] ?? null;
    this.emitDrag('end', moved, parent, parent ? parent.children.indexOf(moved) : null);
  }

  /**
   * Puts the dragged node back where it was: it flies back from where it
   * was let go. One only lifted goes back down; `released` without moving
   * after a long press no one took, it's typed into.
   */
  private putBack(drag: NodeDrag, released: boolean): void {
    this.nodeDrag = null;

    if (drag.moving) {
      this.dropFrom = this.display;
      this.rebuild('morph');
      this.dropFrom = null;
      this.emitDrag('end', drag.node, null, null);
      return;
    }

    this.clock.requestPaint();

    if (released && drag.editOnRelease) {
      this.editNode(drag.id);
    }
  }

  private emitDrag(phase: OrbitNodeDragEvent['phase'], node: OrbitNode, parent: OrbitNode | null, index: number | null): void {
    const event: OrbitNodeDragEvent = { phase, node, parent, index };
    this.options.onNodeDrag?.(event);
    this.emit('node-drag', event);
  }

  /**
   * `display` with the node being dragged, and its moons, under the press:
   * over a node it would go into, smaller, nearer the press and without its
   * name, as if about to go inside.
   */
  private withCarried(display: Display): Display {
    const drag = this.nodeDrag;

    if (!drag?.moving) {
      return display;
    }

    const goal = drag.place?.into ? INTO_SCALE : 1;
    drag.scale += (goal - drag.scale) * (this.prefersReducedMotion() ? 1 : CARRIED_EASING);

    if (Math.abs(goal - drag.scale) < 0.01) {
      drag.scale = goal;
    } else {
      this.clock.requestPaint();
    }

    const { scale } = drag;
    const world = screenToWorld(display.camera, this.viewport, drag.point);
    const centerX = world.x - drag.grab.x * scale;
    const centerY = world.y - drag.grab.y * scale;
    const named = scale > (1 + INTO_SCALE) / 2 ? 1 : 0;
    const nodes = new Map(display.nodes);

    for (const body of drag.bodies) {
      nodes.set(body.id, { ...body, x: centerX + body.x * scale, y: centerY + body.y * scale, radius: body.radius * scale, opacity: 1, labelOpacity: named });
    }

    return { ...display, nodes };
  }

  /** A click (or Enter) on a node: the sun goes back up, anything else is entered. */
  private activate(id: string): void {
    const scene = this.transition?.target ?? this.scene;
    const entry = scene?.nodes.get(id);

    if (!entry) {
      return;
    }

    if (this.transition && this.now() - this.transition.startedAt < CLICK_GUARD) {
      return;
    }

    this.options.onNodeClick?.(entry.node);
    this.emit('node-click', { node: entry.node });

    if (this.viewMode === 'focus' && entry.role === 'sun') {
      this.goBack();
      return;
    }

    this.navigate('focus', id);
  }

  /** Up a level in focus mode; from the overview, back to focus mode. */
  private goBack(): boolean {
    if (this.viewMode === 'all') {
      return this.navigate('focus', this.focusId);
    }

    const parent = this.focusPath[this.focusPath.length - 2];
    return parent === undefined ? false : this.navigate('focus', parent);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.options.interactive === false || this.viewer.isOpen || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const id = nodeIdFrom(event.target);
    const onSlot = isAddSlot(event.target);
    let handled = true;

    switch (event.key) {
      case 'Enter':
      case ' ':
        if (event.key === 'Enter' && event.shiftKey && this.editingKeys) {
          handled = onSlot ? this.editNewNode() : id !== null && this.addBeside(id);
        } else if (onSlot) {
          this.editNewNode();
        } else if (id) {
          this.activate(id);
        } else {
          handled = false;
        }

        break;
      case 'F2':
        // Like a long press or a right click, only on maps people may edit; editNode() works on any.
        handled = this.options.editable === true && id !== null && this.editNode(id);
        break;
      case 'Tab':
      case 'Insert':
        // Shift+Tab leaves the map, as without the keys.
        handled = this.editingKeys && !event.shiftKey && (onSlot ? this.editNewNode() : id !== null && this.editNewNode(id));
        break;
      case 'Delete':
        handled = this.editingKeys && id !== null && this.removeWithKey(id);
        break;
      case 'Escape':
      case 'Backspace':
        // Escape puts a node being dragged back first.
        if (event.key === 'Escape' && this.nodeDrag) {
          this.putBack(this.nodeDrag, false);
          break;
        }

        handled = this.goBack();
        break;
      case 'ContextMenu':
        handled = id !== null && this.openNodeContext(id, this.nodeOnScreen(id));
        break;
      case 'F10':
        handled = event.shiftKey && id !== null && this.openNodeContext(id, this.nodeOnScreen(id));
        break;
      case '+':
      case '=':
        this.zoomBy(STEP_ZOOM);
        break;
      case '-':
      case '_':
        this.zoomBy(1 / STEP_ZOOM);
        break;
      case '0':
        this.fit();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
      case 'Home':
      case 'End':
        handled = this.moveFocus(event.key, onSlot ? SLOT_STOP : id);
        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
    }
  };

  /**
   * Arrow-key movement. Focus mode: left and right step through the planets
   * (turning the orbit so the chosen one sits on top), down enters the
   * orbit, up returns to the sun. Overview: the tree, as in a tree view.
   */
  private moveFocus(key: string, currentId: string | null): boolean {
    const scene = this.transition?.target ?? this.scene;
    const tree = this.tree;

    if (!scene || !tree) {
      return false;
    }

    if (this.viewMode === 'focus') {
      // The + takes its turn in the orbit, after the planets before it.
      const stops: (SceneNode | typeof SLOT_STOP)[] = orderedPlanets(scene);

      if (scene.addSlot && this.addSlotView.isShown) {
        const slotAngle = clockwiseFromTop(scene.addSlot.orbitAngle);
        const after = stops.filter((stop) => stop !== SLOT_STOP && clockwiseFromTop(stop.orbitAngle ?? 0) < slotAngle).length;
        stops.splice(after, 0, SLOT_STOP);
      }

      if (stops.length === 0) {
        return false;
      }

      const index = stops.findIndex((stop) => (stop === SLOT_STOP ? currentId === SLOT_STOP : stop.id === currentId));
      let next: SceneNode | typeof SLOT_STOP | undefined;

      if (key === 'ArrowUp') {
        this.focusNodeElement(scene.focusId);
        return true;
      }

      if (key === 'Home') {
        next = stops[0];
      } else if (key === 'End') {
        next = stops[stops.length - 1];
      } else if (index === -1) {
        next = key === 'ArrowLeft' ? stops[stops.length - 1] : stops[0];
      } else if (key === 'ArrowRight') {
        next = stops[(index + 1) % stops.length];
      } else if (key === 'ArrowLeft') {
        next = stops[(index - 1 + stops.length) % stops.length];
      } else {
        next = stops[index];
      }

      if (next === SLOT_STOP) {
        this.addSlotView.element.focus({ preventScroll: true });
      } else {
        this.turnToTop(next);
        this.focusNodeElement(next.id);
      }

      return true;
    }

    const current = currentId ? findNodeById(tree, currentId) : null;

    if (!current) {
      this.focusNodeElement(tree.id);
      return true;
    }

    const siblings = current.parent?.children ?? [current];
    const position = siblings.indexOf(current);
    let next: OrbitNode | undefined;

    if (key === 'ArrowUp') {
      next = current.parent;
    } else if (key === 'ArrowDown') {
      next = current.children.find((child) => scene.nodes.has(child.id));
    } else if (key === 'ArrowLeft') {
      next = siblings[position - 1];
    } else if (key === 'ArrowRight') {
      next = siblings[position + 1];
    } else if (key === 'Home') {
      next = tree;
    } else if (key === 'End') {
      next = siblings[siblings.length - 1];
    }

    if (!next || !scene.nodes.has(next.id)) {
      return true;
    }

    this.focusNodeElement(next.id);
    this.keepInView(next.id);
    return true;
  }

  /** Turns the orbit so `planet` sits at the top. */
  private turnToTop(planet: SceneNode): void {
    if (planet.orbitAngle === undefined || this.transition) {
      return;
    }

    const target = -90 - planet.orbitAngle;

    if (this.prefersReducedMotion()) {
      this.spinPhysics.angle = target;
      this.clock.requestPaint();
      return;
    }

    this.spinPhysics.settleTo(target);
    this.clock.add(this.spinTask);
  }

  /** Pans the overview so a node that has keyboard focus is on screen. */
  private keepInView(id: string): void {
    const entry = this.display?.nodes.get(id);

    if (!entry || !this.display) {
      return;
    }

    const point = worldToScreen(this.display.camera, this.viewport, entry);
    const radius = entry.radius * this.display.camera.scale;
    const margin = 48;

    if (point.x - radius >= margin && point.x + radius <= this.viewport.width - margin
      && point.y - radius >= margin && point.y + radius <= this.viewport.height - margin) {
      return;
    }

    this.flyCamera(this.clampCamera({ ...this.camera, x: entry.x, y: entry.y }), this.viewportCenter());
  }

  private readonly handlePointerOver = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse' || this.dragging) {
      return;
    }

    const id = nodeIdFrom(event.target);

    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.updateTooltip();
    }
  };

  private readonly handlePointerOut = (event: PointerEvent): void => {
    const id = nodeIdFrom(event.relatedTarget);

    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.updateTooltip();
      this.syncAmbientMotion();
    }
  };

  private readonly handleFocusIn = (event: FocusEvent): void => {
    const id = nodeIdFrom(event.target);

    if (!id) {
      return;
    }

    this.nodePainter.view(id)?.showFocusRing();

    if (id !== this.activeId) {
      this.activeId = id;
      this.tabStopsChanged = true;
      this.clock.requestPaint();
    }

    this.keyboardFocusId = isFocusVisible(event.target) ? id : null;
    this.updateTooltip();
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    if (!nodeIdFrom(event.relatedTarget)) {
      this.keyboardFocusId = null;
      this.updateTooltip();
      this.syncAmbientMotion();
    }
  };

  // Interaction: spin

  private dragGestureAt(point: Point): DragGesture {
    const scene = this.scene;

    if (!scene || this.transition) {
      return 'none';
    }

    if (this.viewMode === 'all' || this.zoomLevel() > 1.04) {
      return 'pan';
    }

    if (!Array.from(scene.nodes.values()).some((node) => node.role === 'planet')) {
      return 'none';
    }

    const center = this.sunOnScreen();
    return Math.hypot(point.x - center.x, point.y - center.y) > 12 ? 'spin' : 'none';
  }

  private sunOnScreen(): Point {
    const scene = this.scene;
    const sun = scene ? this.display?.nodes.get(scene.focusId) : undefined;
    return sun && this.display ? worldToScreen(this.display.camera, this.viewport, sun) : this.viewportCenter();
  }

  private releaseSpin(velocity: number): void {
    const scene = this.scene;

    if (!scene) {
      return;
    }

    // Momentum is motion the reader didn't directly make: none with reduced motion.
    if (this.prefersReducedMotion()) {
      this.spinPhysics.stop();
      this.spinSettled();
      return;
    }

    const slots = orderedPlanets(scene).map((planet) => -90 - (planet.orbitAngle ?? 0));
    this.spinPhysics.release(velocity, slots);

    if (this.spinPhysics.isMoving) {
      this.clock.add(this.spinTask);
    } else {
      this.spinSettled();
    }
  }

  private readonly spinTask: FrameTask = (_now, elapsed) => {
    const moving = this.spinPhysics.step(elapsed);
    this.tickHaptics();

    if (!moving) {
      this.spinSettled();
    }

    return moving;
  };

  private spinSettled(): void {
    if (this.userSpun) {
      this.userSpun = false;
      const top = this.planetNearestTop();

      if (top) {
        this.options.onSpinSettle?.(top.node);
        this.emit('spin-settle', { planet: top.node });
      }
    }

    this.syncAmbientMotion();
  }

  private planetNearestTop(): SceneNode | null {
    const scene = this.scene;

    if (!scene || this.viewMode !== 'focus') {
      return null;
    }

    // Every frame of a spin asks: one pass, nothing sorted. Of two as near, the first clockwise from the top.
    let best: SceneNode | null = null;
    let bestDistance = Infinity;

    for (const node of scene.nodes.values()) {
      if (node.role !== 'planet') {
        continue;
      }

      const distance = Math.abs(normalizeDelta((node.orbitAngle ?? 0) + this.rotation + 90));

      if (distance < bestDistance || (distance === bestDistance && best && clockwiseFromTop(node.orbitAngle ?? 0) < clockwiseFromTop(best.orbitAngle ?? 0))) {
        best = node;
        bestDistance = distance;
      }
    }

    return best;
  }

  /** A short vibration each time a planet passes the top, like the detents of a dial. */
  private tickHaptics(): void {
    const top = this.planetNearestTop();

    if (!top || top.id === this.topPlanetId) {
      return;
    }

    const previous = this.topPlanetId;
    this.topPlanetId = top.id;
    const speed = Math.abs(this.spinPhysics.velocity) * 1000;

    if (this.options.spin?.haptics && previous !== null && speed < HAPTIC_SPEED_LIMIT && typeof navigator !== 'undefined') {
      navigator.vibrate?.(4);
    }
  }

  /** The slow drift of `orbitAnimation`; it pauses while the reader is pointing at, holding or tabbing through the map. */
  private syncAmbientMotion(): void {
    if (!this.ambientRunning && this.shouldDrift()) {
      this.ambientRunning = true;
      this.clock.add(this.ambientTask);
    }
  }

  private shouldDrift(): boolean {
    return Boolean(this.options.orbitAnimation)
      && !this.destroyed
      && this.scene !== null
      && this.viewMode === 'focus'
      && !this.transition
      && this.spinPhysics.mode === 'idle'
      && !this.dragging
      && this.cameraFlight === null
      && this.wheelZoom === null
      && !this.glide.isMoving
      && this.hoveredId === null
      && this.keyboardFocusId === null
      && this.onScreen
      && !this.viewer.isOpen
      && !this.prefersReducedMotion();
  }

  private readonly ambientTask: FrameTask = (_now, elapsed) => {
    if (!this.shouldDrift()) {
      this.ambientRunning = false;
      this.pendingDrift = 0;
      return false;
    }

    const reach = this.spinningReach(this.scene as Scene) * this.camera.scale;

    if (reach <= 0) {
      // Nothing in this view spins with the orbit (a leaf in focus): sleep
      // until the view changes and syncAmbientMotion arms the drift again.
      this.ambientRunning = false;
      this.pendingDrift = 0;
      return false;
    }

    // Seconds per turn; anything but a positive number falls back to the default.
    const speed = this.options.orbitSpeed > 0 && Number.isFinite(this.options.orbitSpeed) ? this.options.orbitSpeed : DEFAULT_OPTIONS.orbitSpeed;
    this.pendingDrift += (360 / Math.max(1, speed)) * (elapsed / 1000);

    // Turning the orbit repaints every body in it: wait until the turn shows.
    if (this.pendingDrift < toDegrees(DRIFT_STEP / reach)) {
      return 'hold';
    }

    this.spinPhysics.angle += this.pendingDrift;
    this.pendingDrift = 0;
    return true;
  };

  /** How far the bodies that spin with the orbit reach from the sun, in world units. */
  private spinningReach(scene: Scene): number {
    if (this.spinReach?.scene !== scene) {
      const sun = scene.nodes.get(scene.focusId);
      let reach = 0;

      for (const node of scene.nodes.values()) {
        if (node.spins) {
          reach = Math.max(reach, Math.hypot(node.x - (sun?.x ?? 0), node.y - (sun?.y ?? 0)) + node.radius);
        }
      }

      this.spinReach = { scene, reach };
    }

    return this.spinReach.reach;
  }

  // Interaction: camera

  private zoomLevel(): number {
    return this.scene ? this.camera.scale / this.scene.frame.scale : 1;
  }

  private zoomRange(): [number, number] {
    const minimum = this.options.zoom?.minimum ?? DEFAULT_MINIMUM_ZOOM;
    const maximum = this.options.zoom?.maximum ?? DEFAULT_MAXIMUM_ZOOM;

    if (this.viewMode === 'focus') {
      return [FOCUS_MINIMUM_ZOOM, Math.max(1, maximum)];
    }

    return [Math.min(1, minimum), Math.max(1, maximum)];
  }

  private viewportCenter(): Point {
    return { x: this.viewport.width / 2, y: this.viewport.height / 2 };
  }

  /**
   * Keeps the content reachable. The overview can pan until its edge meets
   * the middle of the map; focus mode stays centered on the sun when fitted
   * and gains room to pan the further it zooms in.
   */
  private clampCamera(camera: Camera): Camera {
    const scene = this.scene;

    if (!scene) {
      return camera;
    }

    const { frame } = scene;
    const relative = camera.scale / frame.scale;
    const reach = scene.kind === 'focus' ? Math.max(0, 1 - 1 / relative) : 1;
    const limitX = (this.viewport.width / 2 / frame.scale) * reach;
    const limitY = (this.viewport.height / 2 / frame.scale) * reach;
    return {
      scale: camera.scale,
      x: Math.min(frame.x + limitX, Math.max(frame.x - limitX, camera.x)),
      y: Math.min(frame.y + limitY, Math.max(frame.y - limitY, camera.y)),
    };
  }

  private panCamera(deltaX: number, deltaY: number): boolean {
    if (!this.scene || this.transition) {
      return false;
    }

    const before = this.camera;
    this.camera = this.clampCamera(panBy(this.camera, deltaX, deltaY));
    this.clock.requestPaint();
    return Math.abs(before.x - this.camera.x) > 1e-6 || Math.abs(before.y - this.camera.y) > 1e-6;
  }

  private readonly glideTask: FrameTask = (_now, elapsed) => {
    if (elapsed <= 0) {
      // A duplicate timestamp: nothing moved yet, but the glide isn't done.
      return 'hold';
    }

    if (this.glide.isMoving && !this.transition) {
      const distance = this.glide.step(elapsed);

      if (this.panCamera(distance.x, distance.y) && this.glide.isMoving) {
        return true;
      }
    }

    this.glide.stop();
    this.syncAmbientMotion();
    return false;
  };

  /** Zooms immediately by `factor` around `anchor`, within the zoom range. */
  private zoomAt(factor: number, anchor: Point): boolean {
    if (!this.scene || this.transition || !Number.isFinite(factor) || factor <= 0) {
      return false;
    }

    const [minimum, maximum] = this.zoomRange();
    const current = this.zoomLevel();
    const next = Math.min(maximum, Math.max(minimum, current * factor));

    if (Math.abs(next - current) < 1e-6) {
      return false;
    }

    this.camera = this.clampCamera(zoomAround(this.camera, this.viewport, next / current, anchor));
    this.hoveredId = null;
    this.tooltip.hide();
    this.clock.requestPaint();
    this.checkZoomNavigation(anchor);
    return true;
  }

  /** Zooming into a planet or moon enters it; zooming out of a view leaves it. */
  private checkZoomNavigation(anchor: Point): void {
    if (this.viewMode !== 'focus' || !this.scene || this.transition) {
      return;
    }

    const level = this.zoomLevel();

    if (level >= ENTER_ZOOM) {
      const body = this.bodyAt(anchor, ENTER_RADIUS);

      if (body) {
        this.navigate('focus', body.id);
      }

      return;
    }

    if (level <= EXIT_ZOOM) {
      const parent = this.focusPath[this.focusPath.length - 2];

      if (parent === undefined) {
        this.navigate('all', this.focusId);
      } else {
        this.navigate('focus', parent);
      }
    }
  }

  /** The planet or moon under `point` at least `minimumRadius` px on screen, preferring the smallest (most specific). */
  private bodyAt(point: Point, minimumRadius = 0): DisplayNode | null {
    const display = this.display;

    if (!display) {
      return null;
    }

    let best: DisplayNode | null = null;

    for (const entry of display.nodes.values()) {
      if (entry.role !== 'planet' && entry.role !== 'moon') {
        continue;
      }

      // The camera as it is now: a zoom checks this before the next frame paints.
      const center = worldToScreen(this.camera, this.viewport, entry);
      const radius = entry.radius * this.camera.scale;

      if (radius < minimumRadius) {
        continue;
      }

      if (Math.hypot(point.x - center.x, point.y - center.y) <= radius * 1.35 + 12 && (!best || entry.radius < best.radius)) {
        best = entry;
      }
    }

    return best;
  }

  /** After a pinch or wheel zoom: focus mode springs back from a partial zoom-out. */
  private settleZoom(): void {
    if (this.viewMode === 'focus' && this.scene && !this.transition && this.zoomLevel() < 0.999) {
      this.fit();
    }

    this.syncAmbientMotion();
  }

  private handleWheel(event: WheelEvent, point: Point): void {
    const setting = this.options.zoom?.wheel ?? 'auto';

    if (setting === false || !this.scene) {
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;

    if (!modifier && (setting === 'modifier' || (setting === 'auto' && this.pageScrolls()))) {
      this.controls.showHint(this.words.text('scrollToZoom', { key: isApplePlatform() ? '⌘' : 'Ctrl' }));
      return;
    }

    event.preventDefault();

    if (this.transition) {
      return;
    }

    this.cameraFlight = null;
    this.glide.stop();
    const amount = Math.log(wheelZoomFactor(event, this.viewport.height));

    if (this.wheelZoom) {
      this.wheelZoom.remaining += amount;
      this.wheelZoom.anchor = point;
    } else {
      this.wheelZoom = { remaining: amount, anchor: point };
      this.clock.add(this.wheelTask);
    }
  }

  private readonly wheelTask: FrameTask = (_now, elapsed) => {
    const zoom = this.wheelZoom;

    if (!zoom || this.transition) {
      this.wheelZoom = null;
      return false;
    }

    if (elapsed <= 0) {
      // A duplicate timestamp: keep the banked zoom for the next frame.
      return 'hold';
    }

    const finished = Math.abs(zoom.remaining) < 0.002;
    const step = finished ? zoom.remaining : zoom.remaining * (1 - Math.exp(-elapsed / WHEEL_SMOOTHING));
    zoom.remaining -= step;

    if (!this.zoomAt(Math.exp(step), zoom.anchor)) {
      // At a limit: don't bank zoom the camera can't use.
      zoom.remaining = 0;
    }

    if (finished || zoom.remaining === 0) {
      this.wheelZoom = null;
      this.settleZoom();
      return false;
    }

    return true;
  };

  private handleDoubleTap(point: Point, target: EventTarget | null): void {
    if (!this.scene || this.transition || nodeIdFrom(target)) {
      return;
    }

    if (this.viewMode === 'all') {
      this.zoomStep(2, point);
    } else if (this.zoomLevel() > 1.04) {
      this.fit();
    }
  }

  /** An animated zoom step (buttons, keys, double taps). */
  private zoomStep(factor: number, anchor: Point): void {
    const scene = this.scene;

    if (!scene || this.transition || !(factor > 0)) {
      return;
    }

    const base = this.cameraFlight?.target ?? this.camera;
    const [minimum, maximum] = this.zoomRange();
    const current = base.scale / scene.frame.scale;
    const next = Math.min(maximum, Math.max(minimum, current * factor));
    this.flyCamera(this.clampCamera(zoomAround(base, this.viewport, next / current, anchor)), anchor);
  }

  private flyCamera(target: Camera, anchor: Point): void {
    if (!this.scene || this.transition) {
      return;
    }

    this.glide.stop();
    this.wheelZoom = null;

    if (!this.animationsEnabled()) {
      this.cameraFlight = null;
      this.camera = target;
      this.paint();
      this.afterCameraFlight(anchor);
      return;
    }

    const path = smoothZoomPath(this.camera, target, this.viewport);
    const duration = Math.min(650, Math.max(240, path.length * 520));
    this.cameraFlight = { path, target, anchor, startedAt: this.now(), duration };
    this.clock.add(this.cameraFlightTask);
  }

  private readonly cameraFlightTask: FrameTask = (now) => {
    const flight = this.cameraFlight;

    if (!flight || this.transition) {
      this.cameraFlight = null;
      return false;
    }

    const progress = Math.min(1, (now - flight.startedAt) / flight.duration);
    this.camera = progress >= 1 ? flight.target : flight.path.at(easeInOutCubic(progress));

    if (progress >= 1) {
      this.cameraFlight = null;
      this.afterCameraFlight(flight.anchor);
      return false;
    }

    return true;
  };

  private afterCameraFlight(anchor: Point): void {
    this.checkZoomNavigation(anchor);
    this.settleZoom();
  }

  /** Whether the page around the map scrolls; if so, a plain wheel scrolls the page instead of zooming. */
  private pageScrolls(): boolean {
    const now = this.now();

    if (this.pageScrollCheck && now - this.pageScrollCheck.time < 500) {
      return this.pageScrollCheck.scrolls;
    }

    const scrolls = scrollsAround(this.container);
    this.pageScrollCheck = { time: now, scrolls };
    return scrolls;
  }

  private updateEmbedding(): void {
    this.pageScrollCheck = null;
    this.root.classList.toggle('orbit--embedded', this.pageScrolls());
  }

  // Events

  private emitFocusChange(path: OrbitNode[]): void {
    const node = path[path.length - 1];
    this.options.onFocusChange?.(node);
    this.emit('focus-change', { node, path });
  }

  /**
   * Calls the `on()` listeners, then dispatches `orbit-<name>` on the
   * container. Returns false when a DOM listener cancelled the event.
   */
  private emit<Name extends OrbitEventName>(name: Name, detail: OrbitEventMap[Name], cancelable = false): boolean {
    for (const listener of Array.from(this.listeners.get(name) ?? [])) {
      try {
        (listener as (detail: OrbitEventMap[Name]) => void)(detail);
      } catch (error) {
        // A failing listener must not break the map; report it like a DOM listener would.
        reportListenerError(error);
      }
    }

    if (typeof CustomEvent !== 'function') {
      return true;
    }

    const event = new CustomEvent(`orbit-${name}`, { detail, bubbles: true, composed: true, cancelable });
    return this.container.dispatchEvent(event);
  }

  // Actions and the detail sheet

  /** Runs a button: one of Orbit's, or one of your actions, after `onAction` and the `action` event let it. */
  private runAction(node: OrbitNode, action: string, sourceEvent: MouseEvent | KeyboardEvent): void {
    if (!this.allowAction(node, action, sourceEvent)) {
      return;
    }

    if (action === 'link') {
      if (isNodeLink(node.link)) {
        const linked = this.findLinked(node.link);

        if (linked) {
          this.followNodeLink(linked);
        }

        return;
      }

      const url = node.link ? guardUrl(node.link, 'link') : null;

      if (url && typeof window !== 'undefined') {
        window.open(resolveUrl(url, this.options.baseUrl), '_blank', 'noopener');
      }

      return;
    }

    if (!CONTENT_ACTIONS.has(action)) {
      const custom = this.extensions.actions(node).find((candidate) => candidate.id === action);

      if (custom) {
        guarded(`The "${custom.id}" action's run()`, undefined, () => custom.run(node, sourceEvent));
      }

      return;
    }

    if ((action === 'image' || action === 'video') && this.options.mediaViewer !== false && this.viewer.open({ node, kind: action })) {
      return;
    }

    if (this.options.showDetailSheet !== false) {
      this.openDetails(node, action as DetailSection);
    }
  }

  /** Whether a button may do what it does: `onAction` didn't return `false` and no listener called the `action` event's `preventDefault()`. */
  private allowAction(node: OrbitNode, action: string, sourceEvent: MouseEvent | KeyboardEvent): boolean {
    if (this.options.onAction?.({ node, action, sourceEvent }) === false) {
      return false;
    }

    let prevented = false;
    const detail: OrbitActionDetail = {
      node,
      action,
      sourceEvent,
      preventDefault: () => {
        prevented = true;
      },
      get defaultPrevented() {
        return prevented;
      },
    };
    return this.emit('action', detail, true) && !prevented;
  }

  /**
   * A picture or video pressed in the detail sheet: a press of "View image"
   * or "Play video". The viewer opens over the sheet; a page that takes the
   * press gets the sheet closed, so what it opens is in front.
   */
  private viewFromSheet(node: OrbitNode, kind: MediaKind, sourceEvent: MouseEvent, startAt?: number): void {
    if (!this.allowAction(node, kind, sourceEvent)) {
      this.sheet.close();
      return;
    }

    this.viewer.open({ node, kind }, { startAt });
  }

  private openDetails(node: OrbitNode, section?: DetailSection): void {
    const path = this.tree ? getNodePath(this.tree, node.id).slice(0, -1) : [];
    this.sheet.open({
      node,
      path,
      siblings: node.parent?.children ?? [node],
      section,
      baseUrl: this.options.baseUrl,
      noteRenderer: this.options.noteRenderer,
      resolveLink: (href) => this.findLinked(href),
      onFollowLink: (linked) => this.followNodeLink(linked),
      onViewMedia: this.options.mediaViewer === false ? undefined : (shown, kind, event, startAt) => this.viewFromSheet(shown, kind, event, startAt),
      extensions: {
        icon: (shown) => this.extensions.icon(shown),
        typeLabel: (shown) => this.extensions.nodeType(shown)?.label,
        details: (shown) => {
          const details = this.extensions.nodeType(shown)?.details;
          return details ? (element) => guarded(`The "${this.extensions.typeName(shown)}" node type's details()`, undefined, () => details(shown, element)) : undefined;
        },
        actions: (shown) => this.extensions.actions(shown).map((action) => ({ id: action.id, label: actionLabel(action, shown), icon: action.icon })),
        runAction: (shown, action, event) => this.runAction(shown, action, event),
        status: (word) => this.extensions.status(word),
      },
      words: this.words,
    });
  }

  /** The media viewer opened, stepped, or closed: the drift rests behind it, and the page hears of it. */
  private mediaShown(name: 'media-open' | 'media-close', item: MediaItem, index: number, total: number): void {
    this.syncAmbientMotion();
    const event: OrbitMediaEvent = { node: item.node, kind: item.kind, index, total };

    if (name === 'media-open') {
      this.options.onMediaOpen?.(event);
    } else {
      this.options.onMediaClose?.(event);
    }

    this.emit(name, event);
  }

  private mediaPlayed(node: OrbitNode, playback: PlaybackState): void {
    const state: OrbitMediaState = { node, ...playback };
    this.options.onMediaState?.(state);
    this.emit('media-state', state);
  }

  /** The node a `#id` link points at, in this map. */
  private findLinked(href: string): OrbitNode | null {
    return this.tree ? findLinkedNode(this.tree, href) : null;
  }

  /** Where a node's link button goes: a page, or another node of the map ("Go to Research"). */
  private describeLink(node: OrbitNode): LinkDescription {
    if (!isNodeLink(node.link)) {
      return { kind: 'page' };
    }

    const linked = this.findLinked(node.link);
    return linked ? { kind: 'node', label: this.words.text('goTo', { name: linked.text || this.words.text('theIdea') }) } : { kind: 'missing' };
  }

  /** Flies to the node a `#id` link points at, from a link button, the detail sheet or a note. */
  private followNodeLink(linked: OrbitNode): void {
    if (this.sheet.isOpen) {
      this.sheet.close();
    }

    this.activeId = linked.id;
    this.returnFocusToMap = true;
    this.focusNode(linked.id);
  }

  // Environment

  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      const size = this.readContainerSize();
      this.warnIfFlat(size);
      this.handleResize(size);
    });

    this.resizeObserver.observe(this.root);
  }

  /** Rests the drift while the map is scrolled out of sight, so a page of maps only moves the ones in view. */
  private observeVisibility(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.visibilityObserver = new IntersectionObserver((entries) => {
      const latest = entries[entries.length - 1];

      if (latest) {
        this.onScreen = latest.isIntersecting;
        this.syncAmbientMotion();
      }
    });

    this.visibilityObserver.observe(this.root);
  }

  /** A map in a container without a height is invisible; say so once, in the console, where it gets noticed. */
  private warnIfFlat(size: Viewport): void {
    if (this.warnedFlat || size.width <= 0 || size.height >= 1 || !this.root.isConnected) {
      return;
    }

    this.warnedFlat = true;
    console.warn('[orbit] The map has no height, so nothing shows. It fills its container: give the container a height, for example style="height: 480px".');
  }

  private handleResize(size: Viewport): void {
    if (Math.abs(size.width - this.viewport.width) < 0.5 && Math.abs(size.height - this.viewport.height) < 0.5) {
      return;
    }

    const hadScene = this.scene !== null;
    this.setViewport(size);
    this.updateEmbedding();

    if (!this.tree) {
      return;
    }

    if (!hadScene) {
      this.rebuild('enter');
      return;
    }

    // A container a little taller or shorter (a page's toolbar changing its text, say) keeps the
    // layout and whatever is moving: the view only re-centers.
    if (closeInSize(size, this.layoutSize)) {
      this.clock.requestPaint();
      return;
    }

    // A flight carries on; the view it lands on is laid out for the new size.
    if (this.transition) {
      this.relayoutOnArrival = true;
      this.clock.requestPaint();
      return;
    }

    this.rebuild('instant');
  }

  private setViewport(size: Viewport): void {
    this.viewport = size;
    this.root.classList.toggle('orbit--narrow', size.width <= NARROW_MAP);
  }

  private readContainerSize(): Viewport {
    const rectangle = this.root.getBoundingClientRect();
    return {
      width: rectangle.width || this.root.clientWidth || 0,
      height: rectangle.height || this.root.clientHeight || 0,
    };
  }

  /** Flights and camera moves animate unless reduced motion is on or `transitionDuration` is 0. */
  private animationsEnabled(): boolean {
    return this.options.transitionDuration !== 0 && !this.prefersReducedMotion();
  }

  private prefersReducedMotion(): boolean {
    if (this.reducedMotionQuery === undefined) {
      this.reducedMotionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    }

    return this.reducedMotionQuery?.matches === true;
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
