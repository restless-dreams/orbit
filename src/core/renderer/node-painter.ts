/**
 * The nodes on the map: a view per node, drawn in groups of siblings (see
 * `families.ts`), kept in step with each frame's display. Small flat bodies
 * become specks, an orbit spinning turns the layers its planets and moons are
 * in, and while only the camera moves the nodes hold still.
 */

import type { Display, DisplayNode } from '../engine/display.js';
import type { Scene } from '../engine/scene.js';
import type { MapExtensions } from '../extensions.js';
import type { OrbitWords } from '../languages.js';
import { NodeView, describeNode, speckRadius, svgElement, turnShading, type NodeDrawing, type ViewIds } from '../engine/views.js';
import { normalizeDelta } from '../engine/spin.js';
import { clusterHidden, familyMotion, moveFamily, sameMotion, type Family, type FamilyMember } from './families.js';
import { round } from './numbers.js';

/** While the orbit drifts, specks are lit again each time it has turned this far (degrees) since they last were (see `paintTurn`). */
const RELIGHT_STEP = 10;
/** At most this many nodes become specks, or stop being them, in one frame (see `NodeDrawing`). */
const SPECK_SWITCHES_PER_FRAME = 60;
/** A flight's hidden newcomers get their views over this many frames, at least `NEWCOMERS_PER_FRAME` a frame (see paintNodes). */
const NEWCOMER_FRAMES = 6;
const NEWCOMERS_PER_FRAME = 40;

/** What the nodes need from the map around them. */
export interface NodeHost {
  extensions(): MapExtensions;
  words(): OrbitWords;
  baseUrl(): string | undefined;

  /** The scene on screen (the one a flight leaves, until it lands). */
  scene(): Scene | null;

  inFlight(): boolean;

  /** Whether the orbit is at rest: not dragged, coasting or settling. */
  spinResting(): boolean;

  /** Whether the slow drift is running. */
  driftRunning(): boolean;

  /** The node whose text is being typed, if any. */
  editedId(): string | null;

  /** The node lifted to be dragged, the bodies carried under the press (null when nothing is), and the node it would drop into. */
  drag(): { liftedId: string | null; carried: Set<string> | null; targetId: string | null };

  /** Nodes changed since the last frame. */
  changedIds(): ReadonlySet<string>;

  requestPaint(): void;

  /** A node's view came on the map: the map's tab stops need placing again. */
  tabStopsChanged(): void;

  /** A node's view left the map. */
  viewRemoved(id: string): void;
}

/** The layers nodes are drawn in. */
export interface NodeLayers {
  moons: SVGGElement;
  nodes: SVGGElement;
  suns: SVGGElement;
  carried: SVGGElement;
}

export class NodePainter {
  private readonly root: HTMLDivElement;
  private readonly definitions: SVGDefsElement;
  private readonly ids: ViewIds;
  private readonly layers: NodeLayers;
  private readonly host: NodeHost;

  /** The orbit's turn as last written to the layers of its planets and moons (see `paintTurn`). */
  private turnTransform = '';

  /** The turn the shading of specks is turned back by (see `turnShading`). */
  private speckLighting = 0;

  /** The on-screen radius (px) below which bodies were last drawn as specks (see `speckRadius`). */
  private specksBelow = 0;

  /**
   * The nodes as last painted at rest, with what they were drawn for: while
   * only the camera or the orbit's turn changes, they hold still, all but
   * the bodies turned back upright (see `paintNodes`).
   */
  private stillNodes: { scene: Scene; scale: number; speckRadius: number; editedId: string | null; turnedBack: NodeView[] } | null = null;

  private readonly nodeViews = new Map<string, NodeView>();

  /** The family group each node's element is in (see `Family`). */
  private readonly nodeGroups = new Map<string, Family>();

  private readonly families = new Map<string, Family>();

  /** Counts flights, so each one's arrivals get groups of their own. */
  private flightCount = 0;

  private familyCount = 0;

  /** The lifted node and the drop target last drawn, so a change draws every node again. */
  private dragMarks = '\n';

  constructor(root: HTMLDivElement, definitions: SVGDefsElement, ids: ViewIds, layers: NodeLayers, host: NodeHost) {
    this.root = root;
    this.definitions = definitions;
    this.ids = ids;
    this.layers = layers;
    this.host = host;
  }

  /** The view drawing a node, if it's on the map. */
  view(id: string): NodeView | undefined {
    return this.nodeViews.get(id);
  }

  /** Every node's view, by id. */
  entries(): IterableIterator<[string, NodeView]> {
    return this.nodeViews.entries();
  }

  /** A new flight starts: the ideas it brings in get families of their own. */
  startFlight(): void {
    this.flightCount += 1;
  }

  /** Takes a node's view off the map. */
  removeView(id: string): void {
    this.nodeViews.get(id)?.element.remove();
    this.nodeViews.delete(id);
    this.stillNodes = null;
    this.nodeGroups.delete(id);
    this.host.viewRemoved(id);
  }

  /** Takes every node off the map. */
  clear(): void {
    for (const id of Array.from(this.nodeViews.keys())) {
      this.removeView(id);
    }

    for (const family of this.families.values()) {
      family.group.remove();
    }

    this.families.clear();
  }

  /**
   * Turns the layers of the planets and moons with the orbit (see
   * `OrbitTurn`). Returns the turn (degrees) its bodies are drawn in, or
   * undefined when each is drawn where it is.
   */
  paintTurn(display: Display): number | undefined {
    const { turn } = display;
    const rotation = turn ? round(normalizeDelta(turn.rotation), 3) : 0;
    const transform = turn && rotation !== 0 ? `rotate(${rotation} ${round(turn.cx)} ${round(turn.cy)})` : '';

    if (transform !== this.turnTransform) {
      for (const layer of [this.layers.moons, this.layers.nodes]) {
        if (transform) {
          layer.setAttribute('transform', transform);
        } else {
          layer.removeAttribute('transform');
        }
      }

      this.turnTransform = transform;
    }

    // Specks turn with the orbit, shading and all, while it spins or flies;
    // lighting them all again takes a while, so they're lit from the top left once it rests.
    const lighting = transform ? rotation : 0;
    const resting = !this.host.inFlight() && this.host.spinResting();

    if (resting && Math.abs(normalizeDelta(lighting - this.speckLighting)) > (this.host.driftRunning() ? RELIGHT_STEP : 0)) {
      turnShading(this.definitions, this.ids, lighting);
      this.speckLighting = lighting;
    }

    return turn ? rotation : undefined;
  }

  paintNodes(display: Display, turn: number | undefined): void {
    const editedId = this.host.editedId();
    const scene = this.host.scene();
    const flying = this.host.inFlight();
    const pixelRatio = this.root.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const drawing: NodeDrawing = { turn, speckRadius: this.speckRadius(), crowdedSpeckRadius: speckRadius(pixelRatio, true), switches: SPECK_SWITCHES_PER_FRAME, waiting: false, flight: flying };
    // A node lifted to be dragged, carried under the press, and the node it would be dropped into.
    const { liftedId, carried, targetId } = this.host.drag();
    const marks = `${liftedId}\n${targetId}`;

    if (carried || marks !== this.dragMarks) {
      this.stillNodes = null;
    }

    this.dragMarks = marks;
    // Only the camera or the orbit's turn changed since the last frame at rest: the bodies turned back upright are all that move.
    const still = this.stillNodes;

    if (!flying && still && still.scene === scene && still.scale === display.camera.scale && still.speckRadius === drawing.speckRadius && still.editedId === editedId && this.host.changedIds().size === 0) {
      for (const view of still.turnedBack) {
        const entry = display.nodes.get(view.id);

        if (entry) {
          view.update(entry, entry.radius * display.camera.scale, drawing);
        }
      }

      return;
    }

    this.stillNodes = null;
    const placed: FamilyMember[] = [];
    // Ideas a flight brings in stay hidden for its first quarter: their views are created over its
    // first frames, a share at a time, instead of all at once as it starts.
    let waiting = 0;

    if (this.host.inFlight()) {
      for (const entry of display.nodes.values()) {
        if (entry.cluster && clusterHidden(entry.cluster) && !this.nodeViews.has(entry.id)) {
          waiting += 1;
        }
      }
    }

    let creatable = Math.max(NEWCOMERS_PER_FRAME, Math.ceil(waiting / NEWCOMER_FRAMES));

    for (const entry of display.nodes.values()) {
      let view = this.nodeViews.get(entry.id);

      if (view && (view.node !== entry.node || this.host.changedIds().has(entry.id) || view.typeName !== this.host.extensions().typeName(entry.node))) {
        this.removeView(entry.id);
        view = undefined;
      }

      if (!view && this.host.inFlight() && entry.cluster && clusterHidden(entry.cluster)) {
        if (creatable <= 0) {
          continue;
        }

        creatable -= 1;
      }

      if (!view) {
        view = new NodeView(entry, entry.radius * display.camera.scale, this.ids, this.host.baseUrl(), this.host.extensions(), drawing, () => this.host.requestPaint());
        view.element.setAttribute('aria-label', describeNode(entry.node, 0, entry.node.children.length, this.host.extensions(), this.host.words()));
        this.nodeViews.set(entry.id, view);
        this.host.tabStopsChanged();
      }

      if (carried?.has(entry.id)) {
        // Carried above everything, where the press is, outside the orbit's turn.
        if (view.element.parentNode !== this.layers.carried) {
          this.nodeGroups.delete(entry.id);
          this.layers.carried.appendChild(view.element);
        }

        view.update(entry, entry.radius * display.camera.scale, { ...drawing, turn: undefined }, true);
        view.setLifted(entry.id === liftedId);
        view.setDropTarget(false);
        continue;
      }

      const family = this.placeInFamily(entry, view);

      if (flying) {
        const member = { entry, view, family };
        family.members.push(member);
        placed.push(member);
      } else {
        // At rest no family moves as one: each node is drawn where it is.
        view.update(entry, entry.radius * display.camera.scale, drawing);
        view.setEditing(entry.id === editedId);
        view.setLifted(entry.id === liftedId);
        view.setDropTarget(entry.id === targetId);
      }
    }

    for (const id of Array.from(this.nodeViews.keys())) {
      if (!display.nodes.has(id)) {
        this.removeView(id);
      }
    }

    if (flying) {
      for (const family of Array.from(this.families.values())) {
        this.splitIfMixed(family);
      }

      for (const { entry, view, family } of placed) {
        // A family moving as one holds still in its group, each member where it rests, and the group moves.
        const resting = familyMotion(family) ? entry.cluster : undefined;

        if (resting) {
          view.update({ ...entry, x: resting.x, y: resting.y, radius: resting.radius, opacity: resting.nodeOpacity }, entry.radius * display.camera.scale, drawing);
        } else {
          view.update(entry, entry.radius * display.camera.scale, drawing, true);
        }

        view.setEditing(entry.id === editedId);
        view.setLifted(entry.id === liftedId);
        view.setDropTarget(entry.id === targetId);
      }
    }

    for (const [key, family] of this.families) {
      if (family.group.childElementCount === 0) {
        family.group.remove();
        this.families.delete(key);
        continue;
      }

      moveFamily(family, familyMotion(family));
      family.members = [];
      family.motion = undefined;
    }

    if (drawing.waiting) {
      this.host.requestPaint();
    } else if (!flying && scene) {
      const turnedBack = Array.from(this.nodeViews.values()).filter((view) => view.isTurnedBack);
      this.stillNodes = { scene, scale: display.camera.scale, speckRadius: drawing.speckRadius, editedId, turnedBack };
    }
  }

  /**
   * The on-screen radius (px) below which flat bodies are specks, for this
   * screen's pixels; the stylesheet sizes specks' rims from it.
   */
  private speckRadius(): number {
    const radius = speckRadius(this.root.ownerDocument.defaultView?.devicePixelRatio ?? 1);

    if (radius !== this.specksBelow) {
      this.root.style.setProperty('--_orbit-speck-rim', String(round(1 / radius, 4)));
      this.specksBelow = radius;
    }

    return radius;
  }

  /**
   * A family whose members don't all move alike in this flight (some travel
   * on, the rest leave) splits in two, the fewer of them moving to a group of
   * their own, so each part moves as one.
   */
  private splitIfMixed(family: Family): void {
    const first = family.members.find((member) => member.entry.cluster)?.entry.cluster;

    if (!first) {
      return;
    }

    const alike = family.members.filter((member) => member.entry.cluster && sameMotion(member.entry.cluster, first));
    const others = family.members.filter((member) => !(member.entry.cluster && sameMotion(member.entry.cluster, first)));

    if (others.length === 0 || alike.length < 2) {
      return;
    }

    const [moving, staying] = alike.length <= others.length ? [alike, others] : [others, alike];
    this.familyCount += 1;
    const part = this.createFamily(`${family.layer}|${family.parentId}|${this.flightCount}.${this.familyCount}`, family.layer, family.parentId);

    for (const member of moving) {
      this.moveIntoFamily(member.view, member.entry.id, part);
      member.family = part;
      part.members.push(member);
    }

    family.members = staying;
  }

  /**
   * The group a node is drawn in: its family's, in the layer of its role. A
   * node stays in its group while its parent and role do, so nothing moves
   * between groups when a flight lands; the ideas a flight brings in get a
   * group of their own, so they can move as one while their siblings travel.
   */
  private placeInFamily(entry: DisplayNode, view: NodeView): Family {
    const layer = entry.role === 'sun' ? 'sun' : entry.role === 'moon' ? 'moon' : 'node';
    const parentId = entry.parentId ?? '';
    const current = this.nodeGroups.get(entry.id);

    if (current && current.layer === layer && current.parentId === parentId) {
      return current;
    }

    const key = `${layer}|${parentId}${entry.cluster && this.host.inFlight() ? `|${this.flightCount}` : ''}`;
    const family = this.families.get(key) ?? this.createFamily(key, layer, parentId, entry.cluster !== undefined && clusterHidden(entry.cluster));
    this.moveIntoFamily(view, entry.id, family);
    return family;
  }

  /** A new family's group; one that starts hidden (newcomers yet to appear) is hidden before it joins the map, so its members aren't styled until they show. */
  private createFamily(key: string, layer: Family['layer'], parentId: string, hidden = false): Family {
    const group = svgElement('g', { class: 'orbit-family' });

    if (hidden) {
      group.style.display = 'none';
    }

    this.layers[layer === 'sun' ? 'suns' : layer === 'moon' ? 'moons' : 'nodes'].appendChild(group);
    const family: Family = { group, layer, parentId, transform: '', opacity: '', hidden, members: [] };
    this.families.set(key, family);
    return family;
  }

  private moveIntoFamily(view: NodeView, id: string, family: Family): void {
    const hadFocus = this.root.ownerDocument.activeElement === view.element;
    family.group.appendChild(view.element);
    this.nodeGroups.set(id, family);

    if (hadFocus) {
      view.element.focus({ preventScroll: true });
    }
  }
}
