/**
 * Names and "+N" counts, in the HTML layer over the map. Each frame's names
 * are planned for its display (see `planLabels`), shown a share at a time on
 * an animated map, and ride along as one layer while only the camera moves.
 */

import type { LabelFonts } from '../engine/text-measure.js';
import type { Camera, Viewport } from '../engine/camera.js';
import type { Display, DisplayNode } from '../engine/display.js';
import type { Scene } from '../engine/scene.js';
import type { MapExtensions } from '../extensions.js';
import type { OrbitNode } from '../types.js';
import { COUNT_POSITION, NodeLabel, showsCount, type LabelPlacement, type NodeView } from '../engine/views.js';
import { labelOrder, planLabels, type PlannedLabel } from '../engine/labels.js';
import { worldToScreen } from '../engine/camera.js';
import { prefersLightText, resolveColor } from '../engine/colors.js';
import { overlayTransform } from '../browser.js';
import { round } from './numbers.js';

/**
 * While only the camera moves, labels ride along as one layer until they're this much bigger or
 * smaller than where they were placed, or have moved `RIDE_ALONG_PAN` of the map's shorter side.
 */
const RIDE_ALONG_ZOOM = 1.25;
const RIDE_ALONG_PAN = 0.3;
/**
 * Names that start to show, at most, on one frame of an animated map: when a
 * zoom brings hundreds of names into view at once (a crowded orbit), the rest
 * show over the next frames instead of stalling one (see paintLabels).
 */
const LABELS_SHOWN_PER_FRAME = 24;

/** What the names need from the map around them. */
export interface LabelHost {
  extensions(): MapExtensions;
  viewport(): Viewport;

  /** The scene on screen, or null during a flight: names keep their order for a scene. */
  restingScene(): Scene | null;

  inFlight(): boolean;

  /** Whether only the camera moves: a camera flight, a wheel zoom, a glide or a drag. */
  cameraMoving(): boolean;

  /** Nodes changed since the last frame. */
  changedIds(): ReadonlySet<string>;

  /** The node whose text is being typed, which shows the field instead of its name. */
  editedId(): string | null;

  animationsEnabled(): boolean;
  requestPaint(): void;
  nodeView(id: string): NodeView | undefined;
  themeTokens(): Record<string, string>;
}

export class LabelPainter {
  private readonly layer: HTMLDivElement;
  private readonly fonts: LabelFonts;
  private readonly host: LabelHost;
  private readonly labels = new Map<string, NodeLabel>();
  private readonly counts = new Map<string, { element: HTMLSpanElement; text: string; transform: string }>();

  /**
   * Nodes in the order their labels are placed, for one display, and their
   * ids for a scene at rest: the order holds while the orbit spins, only the
   * entries are new each frame.
   */
  private labelOrder: { nodes: Map<string, DisplayNode>; order: DisplayNode[]; scene: Scene | null; ids: string[] } | null = null;

  /** The camera labels and counts were last placed for, and the nodes they were placed for. */
  private placed: { camera: Camera; nodes: Map<string, DisplayNode> } | null = null;

  /** Names planned to show that wait for a later frame (see `LABELS_SHOWN_PER_FRAME`), placed for `placed`'s camera, and whether the map moved then. */
  private waiting: { plans: PlannedLabel[]; moving: boolean } | null = null;

  private layerTransform = '';

  private readonly lightText = new Map<string, { color: string; light: boolean }>();

  /** The theme's label colors, resolved when first needed after each theme change. */
  private textColors: { light: string; dark: string; root: string } | null = null;

  constructor(layer: HTMLDivElement, fonts: LabelFonts, host: LabelHost) {
    this.layer = layer;
    this.fonts = fonts;
    this.host = host;
  }

  /** Places the names and counts for this frame's display, or lets them ride along with the camera. */
  paint(display: Display): void {
    const ride = this.ride(display);
    this.setLayerTransform(ride ?? '');

    if (this.waiting && (ride !== null || this.still(display))) {
      // Names still waiting to show, where they were planned: the labels ride along, or nothing moved since.
      this.showWaiting();
    } else if (ride === null) {
      this.paintLabels(display);
      this.paintCounts(display);
      this.placed = { camera: { ...display.camera }, nodes: display.nodes };
    }
  }

  /** Where the node's name is drawn now. */
  placementOf(id: string): LabelPlacement | undefined {
    return this.labels.get(id)?.currentPlacement;
  }

  /** Forgets which nodes' names are light (their colors may have changed). */
  forgetLightText(): void {
    this.lightText.clear();
  }

  /** Forgets the theme's text colors and which names are light (the theme changed). */
  forgetTextColors(): void {
    this.lightText.clear();
    this.textColors = null;
  }

  /** Forgets a node that left the map. */
  forgetNode(id: string): void {
    this.lightText.delete(id);
  }

  /** Takes every name and count off the map. */
  clear(): void {
    this.placed = null;
    this.waiting = null;
    this.setLayerTransform('');

    for (const label of this.labels.values()) {
      label.element.remove();
    }

    this.labels.clear();

    for (const badge of this.counts.values()) {
      badge.element.remove();
    }

    this.counts.clear();
  }

  /**
   * While only the camera moves (a pan, a pinch, a zoom, a glide), labels and counts ride along
   * as one layer instead of being placed again on every frame, which for a big view means
   * restyling hundreds of them. They're placed again once the camera rests, or has gone far
   * enough that they'd be too big or too small, or missing for nodes coming into view. Returns
   * the layer's transform from where they were placed, or null to place them now.
   */
  private ride(display: Display): string | null {
    const placed = this.placed;
    const moving = this.host.cameraMoving();

    if (!placed || !moving || placed.nodes !== display.nodes || this.host.inFlight() || this.host.changedIds().size > 0) {
      return null;
    }

    const { camera } = display;
    const { width, height } = this.host.viewport();
    const ratio = camera.scale / placed.camera.scale;
    const panX = (placed.camera.x - camera.x) * camera.scale;
    const panY = (placed.camera.y - camera.y) * camera.scale;

    if (ratio > RIDE_ALONG_ZOOM || ratio < 1 / RIDE_ALONG_ZOOM || Math.hypot(panX, panY) > RIDE_ALONG_PAN * Math.min(width, height)) {
      return null;
    }

    return `translate(${round((width / 2) * (1 - ratio) + panX, 2)}px, ${round((height / 2) * (1 - ratio) + panY, 2)}px) scale(${round(ratio, 5)})`;
  }

  /** Fits and places every label again, where it is (the fonts changed). */
  refit(): void {
    this.placed = null;
    this.waiting = null;
    this.host.requestPaint();
  }

  /** Whether the labels were placed for this very view: the same nodes, the camera where it was, nothing changed. */
  private still(display: Display): boolean {
    const placed = this.placed;
    return placed !== null
      && placed.nodes === display.nodes
      && placed.camera.x === display.camera.x
      && placed.camera.y === display.camera.y
      && placed.camera.scale === display.camera.scale
      && !this.host.inFlight()
      && this.host.changedIds().size === 0;
  }

  private setLayerTransform(transform: string): void {
    if (transform !== this.layerTransform) {
      this.layer.style.transform = transform;
      this.layerTransform = transform;
    }
  }
  private paintLabels(display: Display): void {
    if (this.labelOrder?.nodes !== display.nodes) {
      const scene = this.host.restingScene();
      const ids = scene && this.labelOrder?.scene === scene ? this.labelOrder.ids : null;
      const order = ids ? ids.map((id) => display.nodes.get(id) as DisplayNode) : labelOrder(display.nodes.values());
      this.labelOrder = { nodes: display.nodes, order, scene, ids: ids ?? order.map((entry) => entry.id) };
    }

    const moving = this.host.inFlight() || this.host.cameraMoving();
    // In a flight, the planets of a crowded orbit that come or go with their siblings, growing out of
    // their parent or shrinking into it, show their names once it lands: hundreds would otherwise be
    // placed again on every frame of it.
    const order = this.host.inFlight() ? this.labelOrder.order.filter((entry) => entry.cluster === undefined || entry.crowded !== true) : this.labelOrder.order;
    const planned = planLabels(display, order, {
      viewport: this.host.viewport(),
      hasImage: (entry) => this.showsImage(entry.node),
      // A picture or a type's content fills the node: its icon goes on the pill, before its name.
      pillIcon: (entry) => (this.showsImage(entry.node) ? this.host.extensions().icon(entry.node) : undefined),
      hasIcon: (entry) => Boolean(this.host.extensions().icon(entry.node)),
      previousSide: (id) => this.labels.get(id)?.direction ?? null,
      inFlight: this.host.inFlight(),
      measures: this.fonts,
      moving,
      isShown: (id) => this.labels.get(id)?.isShown ?? false,
      counts: true,
    });
    const shown = new Set<string>();
    const editedId = this.host.editedId();
    // On an animated map, only so many names start to show on one frame; the rest wait for the next.
    let showable = this.host.animationsEnabled() ? LABELS_SHOWN_PER_FRAME : Infinity;
    const waiting: PlannedLabel[] = [];

    // Read every new node's text color before writing any label, so the browser works out styles once, not once per label.
    for (const plan of planned) {
      if (plan.placement === 'inside') {
        this.usesLightText(plan.entry);
      }
    }

    for (const plan of planned) {
      const { entry } = plan;

      // The field shows this node's text while it is typed.
      if (entry.id === editedId) {
        continue;
      }

      let label = this.labels.get(entry.id);

      if (label && (label.node !== entry.node || this.host.changedIds().has(entry.id) || label.typeName !== this.host.extensions().typeName(entry.node))) {
        label.element.remove();
        this.labels.delete(entry.id);
        label = undefined;
      }

      if (!label?.isShown) {
        if (showable <= 0) {
          waiting.push(plan);
          continue;
        }

        showable -= 1;
      }

      shown.add(entry.id);
      this.showLabel(plan, label, moving);
    }

    this.waiting = waiting.length > 0 ? { plans: waiting, moving } : null;

    if (this.waiting) {
      this.host.requestPaint();
    }

    // Labels that aren't shown this frame stay in the DOM, hidden, while their node is on the map.
    for (const [id, label] of this.labels) {
      if (shown.has(id)) {
        continue;
      }

      const entry = display.nodes.get(id);

      if (entry) {
        label.update({ x: 0, y: 0, screenRadius: 0, role: entry.role, placement: 'hidden', opacity: 0 });
      } else {
        label.element.remove();
        this.labels.delete(id);
      }
    }
  }

  /** Shows a planned label: its view (made when it has none yet) placed and fitted as planned. */
  private showLabel(plan: PlannedLabel, existing: NodeLabel | undefined, moving: boolean): void {
    const { entry } = plan;
    let label = existing;

    if (!label) {
      label = new NodeLabel(entry.node, this.host.extensions());
      this.labels.set(entry.id, label);
      this.layer.appendChild(label.element);
    }

    label.update({
      x: plan.x,
      y: plan.y,
      screenRadius: plan.screenRadius,
      role: entry.role,
      placement: plan.placement,
      opacity: plan.opacity,
      light: plan.placement === 'inside' && this.usesLightText(entry),
      measure: this.fonts.inside(entry.role, entry.node),
      narrower: !moving,
      countWidth: plan.countWidth,
      direction: plan.direction,
      distance: plan.distance,
      offset: plan.offset,
      lines: plan.lines,
      width: plan.width,
      pillText: plan.text,
    });
  }

  /**
   * While the labels ride along with the camera, shows the next names
   * waiting to: placed as planned, for the camera the labels were placed
   * at, so they ride along with the rest.
   */
  private showWaiting(): void {
    const waiting = this.waiting;

    if (!waiting) {
      return;
    }

    const editedId = this.host.editedId();
    const now = waiting.plans.splice(0, LABELS_SHOWN_PER_FRAME);

    for (const plan of now) {
      const label = this.labels.get(plan.entry.id);

      if (plan.entry.id !== editedId && (!label || label.node === plan.entry.node)) {
        this.showLabel(plan, label, waiting.moving);
      }
    }

    if (waiting.plans.length > 0) {
      this.host.requestPaint();
    } else {
      this.waiting = null;
    }
  }

  /** Whether the node shows a picture or its type's own content, so its label goes outside. */
  private showsImage(node: OrbitNode): boolean {
    return (this.host.nodeView(node.id)?.hasImage ?? false) || Boolean(this.host.extensions().nodeType(node)?.render);
  }

  /** Whether the theme's light text has more contrast on this node's color than its dark text. Measured once per node and color. */
  usesLightText(entry: DisplayNode): boolean {
    const cached = this.lightText.get(entry.id);

    if (cached && cached.color === entry.color) {
      return cached.light;
    }

    const fill = this.host.nodeView(entry.id)?.resolvedFill() ?? '';
    const text = this.textColors ??= this.resolveTextColors();
    const light = fill !== '' && prefersLightText(fill, text.light, entry.role === 'sun' ? text.root : text.dark);
    this.lightText.set(entry.id, { color: entry.color, light });
    return light;
  }

  /** The theme's label colors as plain values. */
  private resolveTextColors(): { light: string; dark: string; root: string } {
    const tokens = this.host.themeTokens();
    return {
      light: resolveColor(tokens['node-text-inverse'], tokens),
      dark: resolveColor(tokens['node-text'], tokens),
      root: resolveColor(tokens['root-text'], tokens),
    };
  }

  /** The "+N" of nodes with children that aren't drawn, at their lower right. In the label layer, so they ride along with the labels. */
  private paintCounts(display: Display): void {
    const { camera } = display;
    const seen = new Set<string>();

    if (!this.host.inFlight()) {
      for (const entry of display.nodes.values()) {
        const radius = entry.radius * camera.scale;

        if (!showsCount(entry.role, radius, entry.hiddenChildren) || entry.opacity < 0.5) {
          continue;
        }

        const point = worldToScreen(camera, this.host.viewport(), entry);
        let badge = this.counts.get(entry.id);

        if (!badge) {
          const element = document.createElement('span');
          element.className = 'orbit-count';
          element.setAttribute('aria-hidden', 'true');
          element.dataset.orbitFor = entry.id;
          this.layer.appendChild(element);
          badge = { element, text: '', transform: '' };
          this.counts.set(entry.id, badge);
        }

        // New text means laying the badge out again: only when the count changes.
        const count = `+${entry.hiddenChildren}`;

        if (count !== badge.text) {
          badge.element.textContent = count;
          badge.text = count;
        }

        const transform = overlayTransform(round(point.x + radius * COUNT_POSITION, 1), round(point.y + radius * COUNT_POSITION, 1), '-50%, -50%');

        if (transform !== badge.transform) {
          badge.element.style.transform = transform;
          badge.transform = transform;
        }

        seen.add(entry.id);
      }
    }

    for (const [id, badge] of this.counts) {
      if (!seen.has(id)) {
        badge.element.remove();
        this.counts.delete(id);
      }
    }
  }
}
