/**
 * DOM views for the map content. Nodes are SVG groups drawn at unit radius
 * and positioned with a single `translate() scale()`, so moving or resizing
 * a node is one attribute write per frame; spinning an orbit turns the group
 * its bodies are in instead (see `OrbitTurn`). Labels are HTML in screen
 * space, so text never scales with the camera and keeps a readable size.
 */

import type { OrbitNode } from '../types.js';
import type { DisplayNode, DisplayRing, DisplaySlot } from './display.js';
import type { NodeRole } from './scene.js';
import { guardUrl, resolveUrl } from '../url-guard.js';
import { hasMediaSource, youtubeThumbnailUrl } from '../media.js';
import type { MapExtensions, OrbitNodeType } from '../extensions.js';
import { breakUnits, graphemes, wordPieces, type TextUnit } from '../text-layout.js';
import { COUNT_ESTIMATE, INSIDE_ESTIMATE, onMeasurementsReset, type TextMeasure } from './text-measure.js';
import { OrbitWords } from '../languages.js';


export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export interface ViewIds {
  /** Unit-circle clip path shared by every node image. */
  clip: string;

  /** Sphere shading gradient. */
  shade: string;

  /**
   * The shading of specks: the same, turned back by the turn they're drawn in
   * once their orbit rests, so it comes from the top left (see `turnShading`).
   */
  speckShade: string;

  /** Blur for the shadow (or glow) of planets and moons. */
  shadow: string;

  /** A wider blur for the sun's. */
  sunShadow: string;
}

export const svgElement = <Name extends keyof SVGElementTagNameMap>(name: Name, attributes: Record<string, string> = {}): SVGElementTagNameMap[Name] => {
  const element = document.createElementNS(SVG_NAMESPACE, name);

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  return element;
};

/**
 * Where the sphere shading changes, from the lit side (top left) to the far
 * edge. The theme colors each stop (`node-highlight`, `node-terminator`,
 * `node-shading`); the stylesheet and the SVG export share these offsets.
 */
export const SHADE_STOPS = [
  { offset: 0, part: 'highlight' },
  { offset: 0.45, part: 'highlight-fade' },
  { offset: 0.55, part: 'terminator-start' },
  { offset: 0.78, part: 'terminator' },
  { offset: 1, part: 'shading' },
] as const;

/**
 * The circle the shading spreads over, in fractions of a node's box: its
 * center, then its radius. The default lights spheres from the top left; a
 * theme moves it with the `node-shade-circle` token, such as to the bottom
 * right so the far stops catch light along the top left rim, as glass does.
 */
export interface ShadeCircle {
  x: number;
  y: number;
  radius: number;
}

export const DEFAULT_SHADE_CIRCLE: ShadeCircle = { x: 0.34, y: 0.3, radius: 0.78 };

/** A `node-shade-circle` value (`0.34 0.3 0.78`) read, or the default when it isn't three numbers with a radius above 0. */
export const readShadeCircle = (value: string | undefined): ShadeCircle => {
  const numbers = (value ?? '').trim().split(/[\s,]+/).map(Number);

  if (numbers.length !== 3 || !numbers.every(Number.isFinite) || numbers[2] <= 0) {
    return DEFAULT_SHADE_CIRCLE;
  }

  const [x, y, radius] = numbers;
  return { x, y, radius };
};

/** Moves the shading of every node (specks follow it) to the theme's circle. */
export const placeShading = (defs: SVGDefsElement, ids: ViewIds, circle: ShadeCircle): void => {
  const gradient = Array.from(defs.children).find((child) => child.id === ids.shade);
  gradient?.setAttribute('cx', String(circle.x));
  gradient?.setAttribute('cy', String(circle.y));
  gradient?.setAttribute('r', String(circle.radius));
};

/** Blur radius of a shadow, in node radii: planets and moons, then the sun. */
export const SHADOW_BLUR = { planet: 0.16, sun: 0.3 } as const;

/** Shared definitions: the image clip, sphere shading and shadow blurs, with instance-scoped ids. */
export const createDefinitions = (ids: ViewIds): SVGDefsElement => {
  const defs = svgElement('defs');
  const clip = svgElement('clipPath', { id: ids.clip, clipPathUnits: 'userSpaceOnUse' });
  clip.appendChild(svgElement('circle', { r: '1' }));
  defs.appendChild(clip);

  const shade = svgElement('radialGradient', {
    id: ids.shade,
    cx: String(DEFAULT_SHADE_CIRCLE.x),
    cy: String(DEFAULT_SHADE_CIRCLE.y),
    r: String(DEFAULT_SHADE_CIRCLE.radius),
  });

  for (const stop of SHADE_STOPS) {
    shade.appendChild(svgElement('stop', { offset: String(stop.offset), class: `orbit-shade__${stop.part}` }));
  }

  defs.appendChild(shade);
  defs.appendChild(svgElement('radialGradient', { id: ids.speckShade, href: `#${ids.shade}` }));

  for (const [id, blur] of [[ids.shadow, SHADOW_BLUR.planet], [ids.sunShadow, SHADOW_BLUR.sun]] as const) {
    const filter = svgElement('filter', { id, x: '-60%', y: '-60%', width: '220%', height: '220%' });
    filter.appendChild(svgElement('feGaussianBlur', { stdDeviation: String(blur) }));
    defs.appendChild(filter);
  }

  return defs;
};

/**
 * Turns the shading of specks back by `turn` degrees, the turn they're drawn
 * in, so their light comes from the top left. One write for every speck, but
 * the browser draws each of them again: not on every frame of a spin.
 */
export const turnShading = (defs: SVGDefsElement, ids: ViewIds, turn: number): void => {
  const gradient = Array.from(defs.children).find((child) => child.id === ids.speckShade);

  if (turn === 0) {
    gradient?.removeAttribute('gradientTransform');
  } else {
    gradient?.setAttribute('gradientTransform', `rotate(${-turn} 0.5 0.5)`);
  }
};

const ENGLISH = new OrbitWords('en');

/** Labels and the assistive name of a node, in the map's language (English without one). */
export const describeNode = (
  node: OrbitNode,
  hiddenChildren: number,
  visibleChildren: number,
  extensions?: MapExtensions,
  words: OrbitWords = ENGLISH,
): string => {
  const type = extensions?.nodeType(node);
  const parts = [[extensions ? extensions.icon(node) : node.icon, node.text || words.text('untitled')].filter(Boolean).join(' ')];

  if (type?.label) {
    parts.push(type.label);
  }

  if (node.status) {
    parts.push(words.text('status', { status: node.status }));
  }

  const total = visibleChildren + hiddenChildren;

  if (total > 0) {
    parts.push(words.count('ideaCount', total));
  }

  const content = [
    type?.details ? words.text('hasDetails') : '',
    node.note ? words.text('hasNote') : '',
    hasMediaSource(node.image) ? words.text('hasImage') : '',
    hasMediaSource(node.video) ? words.text('hasVideo') : '',
    hasMediaSource(node.embed) ? words.text('hasEmbed') : '',
    node.link ? words.text('hasLink') : '',
  ].filter(Boolean);

  if (content.length > 0) {
    parts.push(words.text('has', { list: words.list(content) }));
  }

  return parts.join(', ');
};

/** Bodies smaller than this on screen (px) are drawn flat: there a shadow is a smudge. */
const SMALL_BODY_RADIUS = 12;
/**
 * Flat bodies smaller than this on screen, in device pixels, are specks: too
 * few pixels for their shading or badges to show which way is up (see
 * `NodeView.update`).
 */
const SPECK_DEVICE_RADIUS = 5;
/**
 * A crowded orbit's planets without badges are specks below this instead.
 * Drawn flat, with rims that grow with them, they look the same as specks,
 * and their shading, which turns with the orbit while it spins, is too faint
 * at this size to show which way is up.
 */
const CROWDED_SPECK_DEVICE_RADIUS = 16;

/**
 * The on-screen radius (px) below which flat bodies are specks, at
 * `pixelRatio` device pixels per px: bigger for a `plainCrowded` planet, one
 * of a crowded orbit without badges (a status, a note's marker, a play button).
 */
export const speckRadius = (pixelRatio: number, plainCrowded = false): number => {
  return (plainCrowded ? CROWDED_SPECK_DEVICE_RADIUS : SPECK_DEVICE_RADIUS) / (pixelRatio > 0 ? pixelRatio : 1);
};

/** The focus ring's radius, in node radii. */
const FOCUS_RING_RADIUS = 1.22;

/** What every node is drawn with this frame, besides its own place (see `NodeView.update`). */
export interface NodeDrawing {
  /** In an orbit turned as one, the degrees it's turned (see `OrbitTurn`). */
  turn?: number;

  /** The on-screen radius (px) below which flat bodies are specks (see `speckRadius`). */
  speckRadius: number;

  /** The same for a crowded orbit's planets without badges. */
  crowdedSpeckRadius: number;

  /**
   * How many more nodes may become specks, or stop being them, this frame.
   * The rest wait for the next: a zoom across the size where a whole orbit
   * becomes specks doesn't redraw all of it at once.
   */
  switches: number;

  /** Set when a node is waiting for its turn to switch. */
  waiting: boolean;

  /**
   * During a flight bodies don't become specks: one shrinking as the camera
   * pulls away costs less to leave as it is until the flight lands.
   */
  flight: boolean;
}

/**
 * Whether a body leaves out its blurred shadow (and hidden halo): when it's
 * too small on screen for a shadow to show, a planet of a crowded orbit,
 * where shadows overlap into a haze, or one coming or going in a flight,
 * fading in or out while the camera sweeps past it (and may draw it huge).
 * Blurring hundreds of shadows on every frame is also what makes a crowded
 * orbit or a flight slow.
 */
export const drawsFlat = (display: DisplayNode, screenRadius: number): boolean => {
  return display.crowded === true || display.cluster !== undefined || screenRadius < SMALL_BODY_RADIUS;
};

export class NodeView {
  readonly element: SVGGElement;
  readonly id: string;
  readonly node: OrbitNode;

  /** The type the node was drawn as. One given for display can change with the map around it, and the view is drawn again then. */
  readonly typeName: string | undefined;

  /** Shows a picture (an image, or a video's thumbnail) rather than a plain color. */
  hasImage = false;

  /** Shows a status, a note's marker or a play button: a crowded orbit's planet with one stays a body down to the usual size (see `speckRadius`). */
  private readonly hasBadges: boolean;

  private readonly body: SVGGElement;
  private readonly disc: SVGCircleElement;
  private readonly shade: SVGCircleElement;
  private readonly shadeFills: { body: string; speck: string };
  private readonly shadowFilters: { planet: string; sun: string };

  /**
   * Created once a node shows them: a shadow when it's drawn with one (not
   * the hundreds of flat planets of a crowded orbit, or overview nodes), the
   * halo when it becomes the sun, the focus ring when it's focused.
   */
  private shadow: SVGCircleElement | null = null;

  private halo: SVGCircleElement | null = null;
  private focusRing: SVGCircleElement | null = null;
  private status: SVGCircleElement | null = null;
  private role: NodeRole | null = null;
  private color = '';
  private visible = true;

  /** Where the node was last drawn, and how: what its transform (or a speck's circles) is worked out from. */
  private drawn = { x: Number.NaN, y: Number.NaN, radius: Number.NaN, upright: 0, opacity: Number.NaN };

  private transform = '';
  private opacity = '';
  private editing = false;
  private lifted = false;
  private dropTarget = false;
  private flat = false;
  private crowded = false;
  private speck = false;
  private turnedBack = false;

  constructor(display: DisplayNode, screenRadius: number, ids: ViewIds, baseUrl: string | undefined, extensions: MapExtensions, drawing?: NodeDrawing, onImageError?: () => void) {
    this.id = display.id;
    this.node = display.node;
    const { node } = display;
    const type = extensions.nodeType(node);
    this.typeName = extensions.typeName(node);
    this.element = svgElement('g', { class: 'orbit-node', 'data-orbit-node-id': node.id, tabindex: '-1' });
    this.element.setAttribute('role', 'button');
    markNode(this.element, node, this.typeName);
    applyTypeTokens(this.element, type);
    this.body = svgElement('g', { class: 'orbit-node__body' });
    this.shadowFilters = { planet: `url(#${ids.shadow})`, sun: `url(#${ids.sunShadow})` };
    this.disc = svgElement('circle', { class: 'orbit-node__disc', r: '1' });
    this.body.append(this.disc);

    const thumbnail = nodeThumbnail(node);
    const source = thumbnail ? guardUrl(thumbnail, 'image') : null;

    if (source) {
      const image = svgElement('image', {
        class: 'orbit-node__image',
        x: '-1',
        y: '-1',
        width: '2',
        height: '2',
        preserveAspectRatio: 'xMidYMid slice',
        'clip-path': `url(#${ids.clip})`,
      });
      image.setAttribute('href', resolveUrl(source, baseUrl));

      image.addEventListener('error', () => {
        image.remove();
        this.hasImage = false;
        // The label planned for a picture (its pill outside) belongs inside now: ask for a paint.
        onImageError?.();
      });

      this.body.appendChild(image);
      this.hasImage = true;
    }

    // Shading and rim in one element: the gradient fills it, the rim is its stroke.
    this.shadeFills = { body: `url(#${ids.shade})`, speck: `url(#${ids.speckShade})` };
    this.shade = svgElement('circle', { class: 'orbit-node__shade', r: '1', fill: this.shadeFills.body });
    this.body.appendChild(this.shade);

    const hasMarker = node.note || hasMediaSource(node.image) || hasMediaSource(node.embed) || node.link || type?.details;

    if (hasMediaSource(node.video)) {
      const play = svgElement('g', { class: 'orbit-node__play', transform: 'translate(0.62 0.62) scale(0.3)' });
      play.appendChild(svgElement('circle', { r: '1' }));
      play.appendChild(svgElement('path', { d: 'M-0.32 -0.48 L0.52 0 L-0.32 0.48 Z' }));
      this.body.appendChild(play);
    } else if (hasMarker) {
      this.body.appendChild(svgElement('circle', { class: 'orbit-node__marker', cx: '0.72', cy: '0.72', r: '0.13' }));
    }

    this.hasBadges = hasMediaSource(node.video) || Boolean(hasMarker) || Boolean(node.status);

    if (node.status) {
      const look = extensions.status(node.status);
      this.status = svgElement('circle', { class: `orbit-node__status orbit-node__status--${look.tone}` });

      if (look.color) {
        this.status.style.fill = look.color;
      }

      this.body.appendChild(this.status);
    }

    this.element.appendChild(this.body);
    // A new node starts out as what it is now, before it's on the map: that costs nothing to switch.
    this.update(display, screenRadius, drawing && { ...drawing, switches: Number.POSITIVE_INFINITY, flight: false });
  }

  /**
   * Draws the node as `display` places it, `screenRadius` px across on screen.
   *
   * A speck (see `speckRadius`) is drawn with its circles' own coordinates
   * instead of a transform, its badges left out: the browser handles a
   * thousand of them far faster that way, as long as they hold still. A node
   * `moving` on its own (one travelling in a flight) is drawn as a body:
   * moving it is one write instead of one per circle.
   *
   * In an orbit turned as one (see `OrbitTurn`), a body that turns with it is
   * drawn where it is in the unturned orbit: a speck turns with the orbit,
   * shading and all, and anything bigger is turned back upright.
   */
  update(display: DisplayNode, screenRadius = Infinity, drawing?: NodeDrawing, moving = false): void {
    const flat = drawsFlat(display, screenRadius);

    if (flat !== this.flat) {
      this.element.classList.toggle('orbit-node--flat', flat);
      this.flat = flat;
    }

    const crowded = display.crowded === true;

    if (crowded !== this.crowded) {
      this.element.classList.toggle('orbit-node--crowded', crowded);
      this.crowded = crowded;
    }

    if (display.role !== this.role) {
      if (this.role) {
        this.element.classList.remove(`orbit-node--${this.role}`);
      }

      this.element.classList.add(`orbit-node--${display.role}`);
      this.role = display.role;
      this.shadow?.setAttribute('filter', display.role === 'sun' ? this.shadowFilters.sun : this.shadowFilters.planet);

      if (display.role === 'sun') {
        this.element.setAttribute('aria-current', 'true');
      } else {
        this.element.removeAttribute('aria-current');
      }

      // The sun is big: a smaller share of it keeps its status dot in proportion.
      const statusRadius = display.role === 'sun' ? 0.11 : 0.17;
      const statusOffset = display.role === 'sun' ? 0.68 : 0.72;
      this.status?.setAttribute('r', String(statusRadius));
      this.status?.setAttribute('cx', String(statusOffset));
      this.status?.setAttribute('cy', String(-statusOffset));
    }

    if (!flat && display.role !== 'node' && !this.shadow) {
      this.shadow = svgElement('circle', { class: 'orbit-node__shadow', r: '1' });
      this.shadow.setAttribute('filter', display.role === 'sun' ? this.shadowFilters.sun : this.shadowFilters.planet);
      this.body.insertBefore(this.shadow, this.halo ?? this.disc);
    }

    if (display.role === 'sun' && !this.halo) {
      this.halo = svgElement('circle', { class: 'orbit-node__halo', r: '1' });
      this.body.insertBefore(this.halo, this.disc);
    }

    if (display.color !== this.color) {
      this.disc.style.fill = display.color;
      // The rim, shadow and halo mix the theme's colors with this one.
      this.element.style.setProperty('--orbit-node-color', display.color);
      this.color = display.color;
    }

    const visible = display.opacity > 0.01 && display.radius > 0.05;

    if (visible !== this.visible) {
      this.element.style.display = visible ? '' : 'none';
      this.visible = visible;
    }

    // Decided while hidden too: a hidden node switches at almost no cost, and needn't wait.
    const below = crowded && !this.hasBadges ? drawing?.crowdedSpeckRadius ?? speckRadius(1, true) : drawing?.speckRadius ?? speckRadius(1);
    const speck = !moving && flat && !this.hasImage && screenRadius < below;

    if (speck !== this.speck && !(visible && speck && drawing?.flight)) {
      // A speck that starts moving can't wait either: each frame it waited would cost more than the switch.
      if (visible && drawing && drawing.switches <= 0 && !moving) {
        drawing.waiting = true;
      } else {
        if (visible && drawing) {
          drawing.switches -= 1;
        }

        this.setSpeck(speck);
      }
    }

    if (!visible) {
      return;
    }

    const turn = drawing?.turn;
    const unturned = turn === undefined ? undefined : display.unturned;
    const place = unturned ?? display;
    this.turnedBack = unturned !== undefined && !this.speck;
    const upright = this.turnedBack && turn ? turn : 0;
    // Only touch the DOM when something moved: panning repaints every node, and a spin every body that turns with its orbit.
    const drawn = this.drawn;

    if (place.x !== drawn.x || place.y !== drawn.y || display.radius !== drawn.radius || upright !== drawn.upright) {
      if (this.speck) {
        this.placeSpeck(place.x, place.y, display.radius);
      } else {
        const transform = `translate(${round(place.x)} ${round(place.y)})${upright ? ` rotate(${-upright})` : ''} scale(${round(display.radius, 4)})`;

        if (transform !== this.transform) {
          this.element.setAttribute('transform', transform);
          this.transform = transform;
        }
      }

      drawn.x = place.x;
      drawn.y = place.y;
      drawn.radius = display.radius;
      drawn.upright = upright;
    }

    if (display.opacity !== drawn.opacity) {
      const opacity = display.opacity >= 0.999 ? '' : String(round(display.opacity, 3));

      if (opacity !== this.opacity) {
        this.element.style.opacity = opacity;
        this.opacity = opacity;
      }

      drawn.opacity = display.opacity;
    }
  }

  /** Whether it was last drawn turned back upright in an orbit turned as one: it moves as the orbit turns. */
  get isTurnedBack(): boolean {
    return this.turnedBack;
  }

  /** Draws the node as a speck from now on, or as a body again. */
  private setSpeck(speck: boolean): void {
    this.speck = speck;
    this.element.classList.toggle('orbit-node--speck', speck);
    this.shade.setAttribute('fill', speck ? this.shadeFills.speck : this.shadeFills.body);

    if (speck) {
      this.element.removeAttribute('transform');
      this.transform = '';
    } else {
      for (const circle of this.unitCircles()) {
        circle.removeAttribute('cx');
        circle.removeAttribute('cy');
        circle.setAttribute('r', circle === this.focusRing ? String(FOCUS_RING_RADIUS) : '1');
      }

      this.shade.style.removeProperty('--orbit-speck-radius');
    }

    // Drawn again where it is, the new way.
    this.drawn.x = Number.NaN;
  }

  /** Puts a speck's circles at (`x`, `y`), `radius` in size, in the map's own units. */
  private placeSpeck(x: number, y: number, radius: number): void {
    const cx = String(round(x));
    const cy = String(round(y));

    for (const circle of this.unitCircles()) {
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
      circle.setAttribute('r', String(round(radius * (circle === this.focusRing ? FOCUS_RING_RADIUS : 1), 4)));
    }

    // The rim grows and shrinks with the speck (see the stylesheet).
    this.shade.style.setProperty('--orbit-speck-radius', String(round(radius, 4)));
  }

  /** The circles a body draws at unit radius around its center, and a speck at its own place. */
  private unitCircles(): SVGCircleElement[] {
    return this.focusRing ? [this.disc, this.shade, this.focusRing] : [this.disc, this.shade];
  }

  /** The fill as the browser resolved it (theme tokens and color mixes included). */
  resolvedFill(): string {
    return typeof getComputedStyle === 'function' ? getComputedStyle(this.disc).fill : '';
  }

  /** Marks the node whose text is being edited on the map. */
  setEditing(editing: boolean): void {
    if (editing !== this.editing) {
      if (editing) {
        this.showFocusRing();
      }

      this.element.classList.toggle('orbit-node--editing', editing);
      this.editing = editing;
    }
  }

  /** Held up by a press, to be dragged somewhere else: it grows, its shadow deepens. */
  setLifted(lifted: boolean): void {
    if (lifted !== this.lifted) {
      this.element.classList.toggle('orbit-node--lifted', lifted);
      this.lifted = lifted;
    }
  }

  /** Where a node being dragged would go if let go now: it grows to take it, ringed. */
  setDropTarget(target: boolean): void {
    if (target !== this.dropTarget) {
      if (target) {
        this.showFocusRing();
      }

      this.element.classList.toggle('orbit-node--drop-target', target);
      this.dropTarget = target;
    }
  }

  /** Adds the ring that shows while the node has keyboard focus or is being edited. */
  showFocusRing(): void {
    if (!this.focusRing) {
      this.focusRing = svgElement('circle', { class: 'orbit-node__focus-ring', r: String(FOCUS_RING_RADIUS) });
      this.body.appendChild(this.focusRing);

      if (this.speck) {
        this.placeSpeck(this.drawn.x, this.drawn.y, this.drawn.radius);
      }
    }
  }
}

/**
 * The free place in the orbit for a new idea: a dashed circle with a plus,
 * drawn at unit radius like a node. While a new idea is typed there, it
 * fills in around the field.
 */
export class AddSlotView {
  readonly element: SVGGElement;
  private shown = false;
  private pending = false;
  private drop: 'target' | 'waiting' | false = false;
  private label = '';
  private transform = '';
  private opacity = '';

  get isShown(): boolean {
    return this.shown;
  }

  /** `held`: the place held for a node being dragged, which only shows, rather than the + to press. */
  constructor(held = false) {
    this.element = held
      ? svgElement('g', { class: 'orbit-add orbit-add--held', 'aria-hidden': 'true' })
      : svgElement('g', { class: 'orbit-add', 'data-orbit-add': '', tabindex: '-1' });

    if (!held) {
      this.element.setAttribute('role', 'button');
    }

    const body = svgElement('g', { class: 'orbit-add__body' });
    body.append(
      svgElement('circle', { class: 'orbit-add__disc', r: '1' }),
      svgElement('path', { class: 'orbit-add__plus', d: 'M-0.3 0H0.3M0 -0.3V0.3' }),
      svgElement('circle', { class: 'orbit-add__focus-ring', r: String(FOCUS_RING_RADIUS) }),
    );
    this.element.appendChild(body);
    this.element.style.display = 'none';
  }

  /**
   * Draws the slot where `slot` says, or hides it. `label` names it for
   * assistive technology. `drop` shows it as the place held open for a node
   * being dragged, without its plus: the `target`, or `waiting` while the
   * node is over another one. In an orbit turned `turn` degrees, it's drawn
   * where it is in the unturned orbit, turned back upright.
   */
  update(slot: DisplaySlot | undefined, label: string, pending: boolean, turn?: number, drop: 'target' | 'waiting' | false = false): void {
    const shown = slot !== undefined && slot.opacity > 0.01 && slot.radius > 0.05;

    if (shown !== this.shown) {
      this.element.style.display = shown ? '' : 'none';
      this.shown = shown;
    }

    if (!slot || !shown) {
      return;
    }

    if (pending !== this.pending) {
      this.element.classList.toggle('orbit-add--pending', pending);
      this.pending = pending;
    }

    if (drop !== this.drop) {
      this.element.classList.toggle('orbit-add--drop', drop !== false);
      this.element.classList.toggle('orbit-add--waiting', drop === 'waiting');
      this.drop = drop;
    }

    if (label !== this.label) {
      if (label) {
        this.element.setAttribute('aria-label', label);
      } else {
        this.element.removeAttribute('aria-label');
      }

      this.label = label;
    }

    const unturned = turn === undefined ? undefined : slot.unturned;
    const place = unturned ?? slot;
    const upright = unturned && turn ? ` rotate(${-turn})` : '';
    const transform = `translate(${round(place.x)} ${round(place.y)})${upright} scale(${round(slot.radius, 4)})`;

    if (transform !== this.transform) {
      this.element.setAttribute('transform', transform);
      this.transform = transform;
    }

    const opacity = slot.opacity >= 0.999 ? '' : String(round(slot.opacity, 3));

    if (opacity !== this.opacity) {
      this.element.style.opacity = opacity;
      this.opacity = opacity;
    }
  }
}

/** CSS hooks for a node's element and label: `data-orbit-type`, `data-orbit-status` and `data-orbit-tags`. */
export const markNode = (element: HTMLElement | SVGElement, node: OrbitNode, type: string | undefined = node.type): void => {
  if (type) {
    element.setAttribute('data-orbit-type', type.toLowerCase());
  }

  if (node.status) {
    element.setAttribute('data-orbit-status', node.status.trim().toLowerCase());
  }

  if (node.tags?.length) {
    element.setAttribute('data-orbit-tags', node.tags.join(' '));
  }
};

/** A node type's theme tokens, set on its node's elements so they win over the map's theme there. */
export const applyTypeTokens = (element: HTMLElement | SVGElement, type: OrbitNodeType | undefined): void => {
  for (const [token, value] of Object.entries(type?.tokens ?? {})) {
    if (typeof value === 'string' && value !== '') {
      element.style.setProperty(`--_orbit-${token}`, value);
    }
  }
};

/** The picture a node shows: its image, or its video's thumbnail. */
export const nodeThumbnail = (node: OrbitNode): string | undefined => {
  if (hasMediaSource(node.image)) {
    return node.image.src;
  }

  if (hasMediaSource(node.video)) {
    if (node.video.thumbnail) {
      return node.video.thumbnail;
    }

    if (node.video.provider !== 'vimeo' && node.video.provider !== 'native') {
      return youtubeThumbnailUrl(node.video.src) ?? undefined;
    }
  }

  return undefined;
};

/** Inside the node, as a pill outside it, or not shown. */
export type LabelPlacement = 'inside' | 'outside' | 'hidden';

/** The size (px) a node's name starts at inside it, before it shrinks to fit. */
const LABEL_FONT_SIZE: Record<NodeRole, number> = { sun: 16, planet: 13, node: 12, moon: 13 };
/**
 * The smallest a name gets inside its node. Crowded orbits need small text
 * to keep names inside their nodes, the focused node's too, since its own
 * orbit shrinks it; a node too small even for this shows no name until you
 * zoom in (the focused node always shows its name). An overview node's name
 * has its pill to go to, so it stays closer to the pills' size.
 */
const MINIMUM_FONT_SIZE: Record<NodeRole, number> = { sun: 9, planet: 9, node: 10, moon: 9 };
/** The most lines a name wraps to inside its node. */
const LABEL_LINES: Record<NodeRole, number> = { sun: 4, planet: 3, node: 3, moon: 2 };
/** Height of a line of label text, and of the icon above it, in ems (as the stylesheet sets them). */
const LINE_HEIGHT = 1.22;
const ICON_HEIGHT = 1.45;
/** Pixels between the icon and the text. */
const ICON_GAP = 2;
/** A name cut short still shows this many characters, or none: a few letters don't say what a node is. */
const SHORTEST_CUT = 8;

/** The width (px) of a label typed into a node of this on-screen radius. Snapped to 6 px steps so zooming doesn't re-wrap text every frame. */
export const insideLabelWidth = (role: NodeRole, screenRadius: number): number => {
  return Math.max(44, Math.min(260, Math.round((screenRadius * (role === 'sun' ? 1.6 : 1.68)) / 6) * 6));
};

/** A piece of a name a line can't break inside, its width in ems, and whether a space comes before it. */
interface MeasuredUnit {
  text: string;
  ems: number;
  spaced: boolean;
}

/** A name measured at one font size. */
interface SizedText {
  units: MeasuredUnit[];

  /** Width (em) of the longest run a line can't break inside: a word piece, or a single wide character. */
  longestUnbreakable: number;

  /** Width (em) of the whole text on one line. */
  total: number;

  /** A space between words, an ellipsis and a hyphen, in ems. */
  space: number;

  ellipsis: number;
  hyphen: number;
}

/**
 * The size (px) a name is measured at for text of `fontSize`: text shrunk
 * below 12 px at 9 px, and the rest at 12 px. Fonts with optical sizes draw
 * small text a few percent wider, so measuring at the smallest size of each
 * kind never measures a name narrower than it's drawn.
 */
const measuredSize = (fontSize: number): number => {
  return fontSize < 12 ? 9 : 12;
};

/** A name's pieces, measured at the sizes it's fitted at (see `measuredSize`). */
class TextMetrics {
  readonly measure: TextMeasure;
  private readonly pieces: TextUnit[];
  private readonly sizes = new Map<number, SizedText>();

  constructor(text: string, measure: TextMeasure) {
    this.measure = measure;
    this.pieces = breakUnits(text);
  }

  at(fontSize: number): SizedText {
    const size = this.measure.bySize ? measuredSize(fontSize) : 0;
    let sized = this.sizes.get(size);

    if (!sized) {
      const { measure } = this;
      const units = this.pieces.map((unit) => ({ text: unit.text, ems: measure.ems(unit.text, size), spaced: unit.spaced }));
      const space = measure.space(size);
      sized = {
        units,
        longestUnbreakable: units.reduce((longest, unit) => Math.max(longest, unit.ems), 0),
        total: units.reduce((sum, unit, index) => sum + unit.ems + (index > 0 && unit.spaced ? space : 0), 0),
        space,
        ellipsis: measure.ellipsis(size),
        hyphen: measure.ems('-', size),
      };
      this.sizes.set(size, sized);
    }

    return sized;
  }

  /** Width (em) of one character in text of `fontSize`, for cutting a name between characters. */
  character(character: string, fontSize: number): number {
    return this.measure.ems(character, this.measure.bySize ? measuredSize(fontSize) : 0);
  }
}

/**
 * Metrics by font and text. Every label's fit is worked out each frame while
 * the map moves, but the text rarely changes and measuring it walks every
 * character.
 */
const textMetricsCache = new Map<string, TextMetrics>();
/** More texts than the largest maps have; past it, the measurements start over. */
const TEXT_METRICS_LIMIT = 20000;

const textMetrics = (text: string, measure: TextMeasure): TextMetrics => {
  const key = `${measure.key}\n${text}`;
  const cached = textMetricsCache.get(key);

  if (cached) {
    return cached;
  }

  if (textMetricsCache.size >= TEXT_METRICS_LIMIT) {
    textMetricsCache.clear();
  }

  const metrics = new TextMetrics(text, measure);
  textMetricsCache.set(key, metrics);
  return metrics;
};

/**
 * The font size (px) of text typed into a node: the role's size, reduced
 * (down to its minimum) until the longest word fits on one line.
 */
export const insideFontSize = (role: NodeRole, width: number, text: string, measure: TextMeasure = INSIDE_ESTIMATE): number => {
  const longest = textMetrics(text, measure).at(LABEL_FONT_SIZE[role]).longestUnbreakable;
  const fitting = longest > 0 ? width / longest : LABEL_FONT_SIZE[role];
  return Math.max(MINIMUM_FONT_SIZE[role], Math.min(LABEL_FONT_SIZE[role], Math.floor(fitting * 2) / 2));
};

export interface InsideLabelLayout {
  /** Width of the text block (px): its widest line's room. */
  width: number;

  fontSize: number;

  /** The name as it shows, line by line; the last ends with an ellipsis when the name is cut short. */
  lines: string[];

  /** Whether the node's icon shows above its name. */
  icon: boolean;

  /** The name doesn't fit whole. */
  truncated: boolean;

  /** A narrower width of the font the name is drawn in, as `font-stretch` (a percentage), when it needs one to fit. */
  stretch?: number;

  /** How far above the node's center (px) the lines and icon are centered: they rise to clear the node's "+N". */
  lift: number;
}

/** Joins units onto one line, with their spaces. */
const lineText = (units: MeasuredUnit[]): string => {
  return units.map((unit, index) => (index > 0 && unit.spaced ? ` ${unit.text}` : unit.text)).join('');
};

/** How wide (em) units are on one line, with their spaces. */
const lineEms = (units: MeasuredUnit[], sized: SizedText): number => {
  return units.reduce((sum, unit, index) => sum + unit.ems + (index > 0 && unit.spaced ? sized.space : 0), 0);
};

/** Whether lines this wide (ems) fit the room each has (px), in text of `fontSize`. */
const fitRooms = (ems: number[], widths: number[], fontSize: number): boolean => {
  return ems.length <= widths.length && ems.every((width, index) => width * fontSize <= widths[index] + 1e-9);
};

/**
 * Units of text wrapped onto lines `widths` ems wide, the first unit that
 * doesn't fit starting the next line; null when they need more lines, or a
 * unit is wider than its line.
 */
const wrapUnits = (sized: SizedText, widths: number[]): MeasuredUnit[][] | null => {
  const lines: MeasuredUnit[][] = [];
  let line: MeasuredUnit[] = [];
  let used = 0;

  for (const unit of sized.units) {
    const space = used > 0 && unit.spaced ? sized.space : 0;

    if (used > 0 && used + space + unit.ems > widths[lines.length]) {
      lines.push(line);

      if (lines.length >= widths.length) {
        return null;
      }

      line = [];
      used = 0;
    }

    if (unit.ems > widths[lines.length]) {
      return null;
    }

    used += (used > 0 && unit.spaced ? sized.space : 0) + unit.ems;
    line.push(unit);
  }

  lines.push(line);
  return lines;
};

/**
 * The same units on as many lines, broken where every line fills as little
 * of its room as can be (a circle's lines are widest in the middle), so a
 * name's shape follows its node's instead of crowding the first line:
 * "Lanzamiento / en México" rather than "Lanzamiento en / México".
 */
const balanceLines = (lines: MeasuredUnit[][], sized: SizedText, widths: number[]): MeasuredUnit[][] => {
  const count = lines.length;

  if (count < 2) {
    return lines;
  }

  const units = count === 2 ? [...lines[0], ...lines[1]] : lines.flat();
  const total = units.length;

  if (total <= count) {
    return lines;
  }

  // Ems before each unit, and the spaces before each unit (a line drops the one before its first unit).
  const ems = new Float64Array(total + 1);
  const spaces = new Float64Array(total + 1);

  for (let index = 0; index < total; index += 1) {
    ems[index + 1] = ems[index] + units[index].ems;
    spaces[index + 1] = spaces[index] + (units[index].spaced ? sized.space : 0);
  }

  const fill = (start: number, end: number, line: number) => (ems[end] - ems[start] + spaces[end] - spaces[start + 1]) / widths[line];
  const splits = count === 4 ? fourLineSplits(total, fill) : fewLineSplits(count, total, fill);

  if (!splits) {
    return lines;
  }

  const balanced: MeasuredUnit[][] = [];
  let start = 0;

  for (const end of [...splits, total]) {
    balanced.push(units.slice(start, end));
    start = end;
  }

  return balanced;
};

/** Where two or three lines break (the units each starts at, after the first) so the fullest is as empty as can be; null when none fits. */
const fewLineSplits = (count: number, total: number, fill: (start: number, end: number, line: number) => number): number[] | null => {
  let best = Infinity;
  let splits: number[] | null = null;

  if (count === 2) {
    for (let first = 1; first < total; first += 1) {
      const worst = Math.max(fill(0, first, 0), fill(first, total, 1));

      if (worst <= 1 && worst < best - 1e-9) {
        best = worst;
        splits = [first];
      }
    }

    return splits;
  }

  for (let first = 1; first < total - 1; first += 1) {
    const top = fill(0, first, 0);

    if (top > 1) {
      break;
    }

    for (let second = first + 1; second < total; second += 1) {
      const worst = Math.max(top, fill(first, second, 1), fill(second, total, 2));

      if (worst <= 1 && worst < best - 1e-9) {
        best = worst;
        splits = [first, second];
      }
    }
  }

  return splits;
};

/** As `fewLineSplits`, for four lines (a sun's longest names): the least fullest line, line by line. */
const fourLineSplits = (total: number, fill: (start: number, end: number, line: number) => number): number[] | null => {
  // fills[line][end]: the least fullest line for units before `end` on lines up to `line`; starts: where that last line starts.
  const fills = Array.from({ length: 4 }, () => new Float64Array(total + 1).fill(Infinity));
  const starts = Array.from({ length: 4 }, () => new Int32Array(total + 1));

  for (let end = 1; end <= total; end += 1) {
    const first = fill(0, end, 0);
    fills[0][end] = first <= 1 ? first : Infinity;
  }

  for (let line = 1; line < 4; line += 1) {
    for (let end = line + 1; end <= total; end += 1) {
      for (let start = line; start < end; start += 1) {
        const before = fills[line - 1][start];
        const own = fill(start, end, line);
        const worst = Math.max(before, own);

        if (own <= 1 && worst < fills[line][end] - 1e-9) {
          fills[line][end] = worst;
          starts[line][end] = start;
        }
      }
    }
  }

  if (fills[3][total] === Infinity) {
    return null;
  }

  const splits: number[] = [];
  let end = total;

  for (let line = 3; line > 0; line -= 1) {
    end = starts[line][end];
    splits.unshift(end);
  }

  return splits;
};

/** A name cut to fit its lines: the lines, how wide each is (ems), how many characters show, and whether any don't. */
interface CutText {
  lines: string[];
  widths: number[];
  shown: number;
  truncated: boolean;
}

/**
 * As much of the text as `widths` hold, word pieces kept whole, the last line
 * ending with an ellipsis when text was cut (cut between characters if need
 * be), and how many characters show. Null when a line can't hold even its
 * first piece.
 */
const cutUnits = (metrics: TextMetrics, fontSize: number, widths: number[]): CutText | null => {
  const sized = metrics.at(fontSize);
  const total = sized.units.reduce((sum, unit) => sum + unit.text.length, 0);
  const lines: string[] = [];
  const usedEms: number[] = [];
  const last = widths.length - 1;
  const widest = Math.max(...widths);
  const room = () => widths[lines.length] - (lines.length === last ? sized.ellipsis : 0);
  let line = '';
  let used = 0;
  let shown = 0;

  for (let unit of sized.units) {
    let space = used > 0 && unit.spaced ? sized.space : 0;

    if (used + space + unit.ems > room() && lines.length < last) {
      if (used > 0) {
        lines.push(line);
        usedEms.push(used);
        line = '';
        used = 0;
        space = 0;
      }

      // A long word wider than any line breaks with a hyphen; anything else waits for a wider line.
      if (unit.ems > room() && unit.ems <= widest) {
        return null;
      }

      while (unit.ems > room() && lines.length < last) {
        const split = hyphenate(unit, room(), metrics, fontSize);

        if (!split) {
          return null;
        }

        lines.push(split.head);
        usedEms.push(split.headEms);
        shown += split.head.length - 1;
        unit = split.rest;
      }
    }

    if (used + space + unit.ems <= room()) {
      line += space > 0 ? ` ${unit.text}` : unit.text;
      used += space + unit.ems;
      shown += unit.text.length;
      continue;
    }

    // The last line is full: as much of this piece as fits before the ellipsis.
    for (const character of graphemes(unit.text)) {
      const width = metrics.character(character, fontSize);

      if (used + space + width > room()) {
        break;
      }

      line += space > 0 ? ` ${character}` : character;
      used += space + width;
      space = 0;
      shown += character.length;
    }

    break;
  }

  // A long word hyphenated across lines can leave everything fitting after all: nothing cut, no ellipsis.
  const truncated = shown < total;
  lines.push(truncated ? `${line.trimEnd()}…` : line.trimEnd());
  usedEms.push(used + (truncated ? sized.ellipsis : 0));
  return { lines, widths: usedEms, shown, truncated };
};

/** Words this long or longer may break with a hyphen when a name is cut short anyway. */
const HYPHENATED_WORD = /^\p{L}{8,}$/u;

/** A long word's head (with a hyphen) that fits in `room` ems, how wide it is (ems), and the rest of the word; null for anything else. */
const hyphenate = (unit: MeasuredUnit, room: number, metrics: TextMetrics, fontSize: number): { head: string; headEms: number; rest: MeasuredUnit } | null => {
  if (!HYPHENATED_WORD.test(unit.text)) {
    return null;
  }

  const characters = graphemes(unit.text);
  let head = '';
  let used = metrics.at(fontSize).hyphen;
  let count = 0;
  let headEms = 0;

  for (const character of characters) {
    const width = metrics.character(character, fontSize);

    if (used + width > room) {
      break;
    }

    head += character;
    used += width;
    headEms += width;
    count += 1;
  }

  // At least three letters on each side of the hyphen.
  if (count < 3 || characters.length - count < 3) {
    return null;
  }

  const rest = characters.slice(count).join('');
  // What's left of the word is as wide as the word less its head (give or take kerning).
  return { head: `${head}-`, headEms: used, rest: { text: rest, ems: Math.max(0, unit.ems - headEms), spaced: false } };
};

/** The width (px) of a circle of radius `room` at height `y` from its center. */
const chordAt = (room: number, y: number): number => {
  return Math.abs(y) >= room ? 0 : 2 * Math.sqrt(room * room - y * y);
};

/**
 * The "+N" of a node with children that aren't drawn (the renderer's
 * `paintCounts`) is centered this share of the node's radius right of and
 * below the node's center.
 */
export const COUNT_POSITION = 0.74;
/** A "+N" is this tall (px): its line and padding, as the stylesheet sets them. */
export const COUNT_HEIGHT = 15;
/** A "+N"'s text size (px), and its padding on each side (px), as the stylesheet sets them. */
const COUNT_FONT_SIZE = 10.5;
const COUNT_PADDING = 6;
/** Pixels a name inside a node keeps from the node's "+N". */
const COUNT_GAP = 1.5;
/** The space under a line's letters (ems), which may pass over a "+N": the tails of g, p and y end this far above the line's bottom. */
const UNDER_TAILS = 0.15;

/** Whether a node of this role and on-screen radius shows a "+N" for children that aren't drawn (flights and faded nodes hide it for a while). */
export const showsCount = (role: NodeRole, screenRadius: number, hiddenChildren: number): boolean => {
  return hiddenChildren > 0 && role !== 'moon' && screenRadius >= 10;
};

/** "+N" widths (px) by font, then by how many figures the count has: its figures are all as wide (tabular). */
const countWidths = new Map<TextMeasure, number[]>();

/** How wide (px) a node's "+N" is for `hiddenChildren` children, in `measure` (the font it's drawn in). */
export const measureCount = (hiddenChildren: number, measure: TextMeasure = COUNT_ESTIMATE): number => {
  let figures = 1;

  for (let rest = hiddenChildren; rest >= 10; rest = Math.floor(rest / 10)) {
    figures += 1;
  }

  let widths = countWidths.get(measure);

  if (!widths) {
    widths = [];
    countWidths.set(measure, widths);
  }

  let width = widths[figures];

  if (width === undefined) {
    // Tabular figures are as wide as each other: a canvas, which draws the font's own figures, measures zeros.
    width = 2 * COUNT_PADDING + measure.ems(`+${'0'.repeat(figures)}`, COUNT_FONT_SIZE) * COUNT_FONT_SIZE;
    widths[figures] = width;
  }

  return width;
};

/** A node's "+N" as the name inside it keeps clear of it, from the node's center (px): lines reaching below `top` end left of `left`. */
interface CountBox {
  top: number;
  left: number;
}

/**
 * Where a node of this radius shows its "+N", `width` px wide, gap included;
 * null when it shows none. Fits round the radius down, so the count is
 * never nearer the center than this.
 */
const countBox = (radius: number, width: number): CountBox | null => {
  return width > 0 ? { top: COUNT_POSITION * radius - COUNT_HEIGHT / 2 - COUNT_GAP, left: COUNT_POSITION * radius - width / 2 - COUNT_GAP } : null;
};

/** The room for each line of a name (px), and how far above the node's center (px) its lines and icon are centered. */
interface LineRoom {
  widths: number[];
  lift: number;
}

/**
 * Room for each of `count` lines of `fontSize` px text centered in a circle of
 * radius `room`, under an icon when `icon` (null when the icon itself doesn't
 * fit). Each line gets the circle's width at its middle. Beside a "+N"
 * (`badge`), the lines and icon rise, as far as the circle allows, until the
 * last line's letters clear it, and a line still beside it ends short of it:
 * lines are centered, so they end as far from the center on the left too.
 */
const lineWidths = (room: number, fontSize: number, count: number, icon: boolean, badge: CountBox | null = null): LineRoom | null => {
  const lineHeight = fontSize * LINE_HEIGHT;
  const iconHeight = icon ? fontSize * ICON_HEIGHT + ICON_GAP : 0;
  const height = iconHeight + count * lineHeight;

  if (height > room * 2) {
    return null;
  }

  // How low the bottom of a line may sit: the space under its letters may pass over the "+N".
  const lowest = badge ? badge.top + fontSize * UNDER_TAILS : Infinity;
  const lift = badge ? Math.min(Math.max(0, height / 2 - lowest), room - height / 2) : 0;
  const top = -height / 2 - lift;

  if (icon && chordAt(room, top + (fontSize * ICON_HEIGHT) / 2) < fontSize * ICON_HEIGHT) {
    return null;
  }

  const widths: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const lineTop = top + iconHeight + index * lineHeight;
    const width = chordAt(room, lineTop + lineHeight / 2);
    widths.push(badge && lineTop + lineHeight > lowest + 1e-9 ? Math.min(width, 2 * Math.max(0, badge.left)) : width);
  }

  return { widths, lift };
};

/** How far below its node's center (px) a name laid out inside it reaches: its lines and icon are centered `lift` above it. */
export const insideLabelReach = (layout: InsideLabelLayout): number => {
  const iconHeight = layout.icon ? layout.fontSize * ICON_HEIGHT + ICON_GAP : 0;
  return (iconHeight + layout.lines.length * layout.fontSize * LINE_HEIGHT) / 2 - layout.lift;
};

/**
 * A name's fit at one size, in its font's own width, and once tried (when
 * the map is still), the narrower one it may need.
 */
interface InsideFits {
  own: InsideLabelLayout | null;
  narrower?: InsideLabelLayout | null;
}

/** Fitted labels by font, then role, size and text: labels are fitted on every frame while the map moves. */
const insideLayouts = new Map<TextMeasure, Map<string, InsideFits>>();
const INSIDE_LAYOUTS_LIMIT = 20000;

// Fits made from measurements start over with them (a font finished loading).
onMeasurementsReset(() => {
  textMetricsCache.clear();
  insideLayouts.clear();
  countWidths.clear();
});

/**
 * How a node's name fits inside it at this on-screen radius, or null when it
 * doesn't. The name shrinks (down to the role's minimum) and wraps (at
 * spaces, and inside long words where they read), its lines balanced and
 * each as wide as the circle is where it sits. The icon above it stays while
 * the name only shrinks a little. A name too long to fit whole even then
 * shows as much as fits, ending with an ellipsis, as long as that's enough
 * to read. `measure` measures the text in the font it's drawn with (by
 * default, widths are estimated).
 *
 * A name that doesn't fit at its font's width tries narrower ones (see
 * `fitInside`) only when `narrower` allows, as it does while the map is
 * still: while the map moves, trying hundreds of names in each width would
 * make frames late. A fit already made with them is kept, though.
 *
 * A node showing a "+N" `countWidth` px wide (see `measureCount`) keeps its
 * name clear of it: the name rises above it, or gets smaller.
 */
export const insideLabelLayout = (role: NodeRole, screenRadius: number, text: string, hasIcon = false, measure: TextMeasure = INSIDE_ESTIMATE, narrower = true, countWidth = 0): InsideLabelLayout | null => {
  // In steps of about 6% (2 px at least), so a zoom or a flight doesn't fit and write the text again on every frame.
  const step = Math.max(2, Math.round(screenRadius * 0.06));
  const radius = Math.floor(screenRadius / step) * step;

  // Most of a crowded orbit has no room for any name: no need to look each one up on every frame it moves.
  if (insideRoom(radius) < SMALLEST_INSIDE_ROOM) {
    return null;
  }

  let inFont = insideLayouts.get(measure);

  if (!inFont) {
    inFont = new Map();
    insideLayouts.set(measure, inFont);
  }

  const key = `${role}|${radius}|${hasIcon ? 1 : 0}|${countWidth}|${text}`;
  let fits = inFont.get(key);

  if (fits === undefined) {
    if (inFont.size >= INSIDE_LAYOUTS_LIMIT) {
      inFont.clear();
    }

    const own = fitInFont(role, radius, text, hasIcon, measure, countWidth);
    // A name that shows whole in its font's own width needs nothing narrower.
    fits = own !== null && !own.truncated ? { own, narrower: own } : { own };
    inFont.set(key, fits);
  }

  if (fits.narrower !== undefined) {
    return fits.narrower;
  }

  if (!narrower) {
    return fits.own;
  }

  fits.narrower = fitNarrower(role, radius, text, hasIcon, measure, countWidth) ?? fits.own;
  return fits.narrower;
};

/** How far below its usual size a name shrinks before its node's icon makes way (px). */
const ICON_SHRINK = 3;

/** The radius (px) a name has inside a node of this on-screen radius: text keeps a little off the rim. */
const insideRoom = (radius: number): number => {
  return radius - Math.max(2, radius * 0.05);
};

/** Below this room (px), no name fits inside. */
const SMALLEST_INSIDE_ROOM = 6;

/**
 * Only in nodes with at least this much room (px): a crowded orbit's small
 * planets can't show a name whole in any width, and trying each one at
 * every step of a zoom would slow the zoom down.
 */
const NARROWER_ROOM = 16;

/**
 * A name that's cut short or has no room in its font's own width, fitted
 * in a narrower width of it (a font with a width axis draws semi-condensed,
 * then condensed), when that shows it whole; null when none does.
 */
const fitNarrower = (role: NodeRole, radius: number, text: string, hasIcon: boolean, measure: TextMeasure, countWidth: number): InsideLabelLayout | null => {
  const narrower = insideRoom(radius) >= NARROWER_ROOM ? measure.narrower() : null;

  if (!narrower || !mightFitWhole(role, radius, text, narrower.narrower() ?? narrower)) {
    return null;
  }

  for (let width: TextMeasure | null = narrower; width; width = width.narrower()) {
    const attempt = fitInFont(role, radius, text, hasIcon, width, countWidth);

    if (attempt && !attempt.truncated) {
      return { ...attempt, stretch: width.stretch };
    }
  }

  return null;
};

/**
 * Whether a name could fit whole in this node in `measure`, at the role's
 * smallest size: its longest piece across the circle, and all of it in the
 * circle's area. Most names in a crowded orbit can't, at any width.
 */
const mightFitWhole = (role: NodeRole, radius: number, text: string, measure: TextMeasure): boolean => {
  const smallest = MINIMUM_FONT_SIZE[role];
  const sized = textMetrics(text, measure).at(smallest);
  const room = insideRoom(radius);
  const breakable = Math.max(sized.total - sized.space * LABEL_LINES[role], 0.01);
  return sized.longestUnbreakable * smallest <= 2 * room && smallest <= room * Math.sqrt((1.25 * Math.PI) / (LINE_HEIGHT * breakable));
};

const fitInFont = (role: NodeRole, radius: number, text: string, hasIcon: boolean, measure: TextMeasure, countWidth: number): InsideLabelLayout | null => {
  const room = insideRoom(radius);
  const badge = countBox(radius, countWidth);

  if (room < SMALLEST_INSIDE_ROOM) {
    return null;
  }

  const metrics = textMetrics(text, measure);
  const largest = LABEL_FONT_SIZE[role];
  const smallest = MINIMUM_FONT_SIZE[role];
  // No size above these fits: the longest piece must fit the circle's width, and the text (less the
  // spaces lines break at) its area, with room to spare, since lines are as wide as the circle at their middle.
  const breakableAt = (sized: SizedText) => Math.max(sized.total - sized.space * LABEL_LINES[role], 0.01);
  const widest = metrics.at(largest);
  const fitting = Math.min(largest, (2 * room) / Math.max(widest.longestUnbreakable, 0.01), room * Math.sqrt((1.25 * Math.PI) / (LINE_HEIGHT * breakableAt(widest))));
  const start = Math.floor(fitting * 2) / 2;
  const attempts: [boolean, number][] = [];

  if (hasIcon) {
    for (let fontSize = start; fontSize >= Math.max(smallest, largest - ICON_SHRINK); fontSize -= 0.5) {
      attempts.push([true, fontSize]);
    }
  }

  for (let fontSize = start; fontSize >= smallest; fontSize -= 0.5) {
    attempts.push([false, fontSize]);
  }

  for (const [icon, fontSize] of attempts) {
    const sized = metrics.at(fontSize);
    const breakable = breakableAt(sized);

    // No fewer lines than the text's width (less the spaces lines break at) over the circle's.
    for (let count = Math.max(1, Math.ceil((breakable * fontSize) / (2 * room))); count <= LABEL_LINES[role]; count += 1) {
      const tried = lineWidths(room, fontSize, count, icon, badge);

      if (!tried) {
        break;
      }

      const wrapped = wrapUnits(sized, tried.widths.map((width) => width / fontSize));

      if (!wrapped) {
        continue;
      }

      // Balanced over the lines it takes, each as wide as the circle where those lines sit. Fewer lines than
      // tried sit elsewhere, where the circle may be narrower or the "+N" nearer: they show only if they fit there.
      const shown = wrapped.length === count ? tried : lineWidths(room, fontSize, wrapped.length, icon, badge);

      if (!shown) {
        continue;
      }

      const lines = balanceLines(wrapped, sized, shown.widths.map((width) => width / fontSize));

      if (!fitRooms(lines.map((units) => lineEms(units, sized)), shown.widths, fontSize)) {
        continue;
      }

      return { width: Math.floor(Math.max(...shown.widths.slice(0, lines.length))), fontSize, lines: lines.map(lineText), icon, truncated: false, lift: shown.lift };
    }
  }

  // An overview node's name that doesn't fit whole reads better whole, on its pill.
  if (role === 'node') {
    return null;
  }

  // Too long to fit whole: as many lines of the smallest text as show the most of it.
  let best: InsideLabelLayout | null = null;
  let mostShown = 0;

  for (let count = 1; count <= LABEL_LINES[role]; count += 1) {
    const tried = lineWidths(room, smallest, count, false, badge);

    if (!tried) {
      break;
    }

    const cut = cutUnits(metrics, smallest, tried.widths.map((width) => width / smallest));

    if (!cut || cut.shown <= mostShown) {
      continue;
    }

    // A word hyphenated across lines can leave fewer lines than tried, drawn elsewhere: shown only if they fit there.
    const shown = cut.lines.length === count ? tried : lineWidths(room, smallest, cut.lines.length, false, badge);

    if (!shown || !fitRooms(cut.widths, shown.widths, smallest)) {
      continue;
    }

    mostShown = cut.shown;
    best = { width: Math.floor(Math.max(...shown.widths)), fontSize: smallest, lines: cut.lines, icon: false, truncated: cut.truncated, lift: shown.lift };
  }

  return role === 'sun' || mostShown >= SHORTEST_CUT ? best : null;
};

/**
 * Where a node's label goes at this on-screen size. A name goes inside its
 * node whenever it fits there (see `insideLabelLayout`). A pill beside the
 * node is for the nodes that need one: nodes showing a picture, the focused
 * node when its name doesn't fit inside, and overview nodes too small for
 * their names. Any other node too small for its name shows none until you
 * zoom in. A name inside a node keeps clear of its "+N", `countWidth` px wide.
 */
export const labelPlacement = (role: NodeRole, screenRadius: number, text: string, hasImage: boolean, hasIcon = false, measure: TextMeasure = INSIDE_ESTIMATE, narrower = true, countWidth = 0): LabelPlacement => {
  if (!hasImage && insideLabelLayout(role, screenRadius, text, hasIcon, measure, narrower, countWidth)) {
    return 'inside';
  }

  if (role === 'sun') {
    return 'outside';
  }

  if (hasImage || role === 'node') {
    return screenRadius >= (role === 'moon' ? 11 : 4) ? 'outside' : 'hidden';
  }

  return 'hidden';
};

/** Fills `element` with `text`, marking where long words may break (`wordPieces`), as fitting the label assumes. */
const setBreakableText = (element: HTMLElement, text: string): void => {
  element.textContent = '';

  for (const part of text.split(/(\s+)/)) {
    if (!part) {
      continue;
    }

    if (/^\s+$/.test(part)) {
      element.append(part);
      continue;
    }

    wordPieces(part).forEach((piece, index) => {
      if (index > 0) {
        element.append(document.createElement('wbr'));
      }

      element.append(piece);
    });
  }
};

/** How a node's label is drawn on a frame (see `NodeLabel.update`). */
export interface LabelDrawing {
  /** The node's center on screen (px). */
  x: number;

  y: number;

  /** The node's radius on screen (px). */
  screenRadius: number;

  role: NodeRole;
  placement: LabelPlacement;
  opacity: number;

  /** Whether a name inside its node takes the theme's light text. */
  light?: boolean;

  /** The font a name inside its node is fitted in, as its placement was (default: estimated widths). */
  measure?: TextMeasure;

  /** Whether a name inside its node may try narrower widths of its font, as it does while the map is still (default: true). */
  narrower?: boolean;

  /** The width (px) of the node's "+N", which a name inside it keeps clear of (default: 0, when it shows none). */
  countWidth?: number;

  /** The side of its node a pill touches, a unit vector (default: below). */
  direction?: { x: number; y: number };

  /** How far from the node's center a pill sits (px; see `pillDistance` in `labels.ts`; default: 5 px past its edge). */
  distance?: number;

  /** Pixels a pill above or below its node slid sideways to stay on the map. */
  offset?: number;

  /** A pill's lines, and the width (px) it wraps at on two. */
  lines?: 1 | 2;

  width?: number;

  /** What a pill says (default: the node's name). */
  pillText?: string;
}

/** Where a pill goes when nothing says: below its node. */
const BELOW = { x: 0, y: 1 };

export class NodeLabel {
  readonly element: HTMLDivElement;
  readonly node: OrbitNode;

  /** The type the node was drawn as, as for its view. */
  readonly typeName: string | undefined;

  private readonly text: HTMLSpanElement;

  /** Whether the node has an icon, shown above its name when there's room. */
  private readonly hasIcon: boolean;

  /** The side an outside label sat on last (a unit vector), or null. */
  direction: { x: number; y: number } | null = null;

  private placement: LabelPlacement | null = null;
  private role: NodeRole | null = null;
  private fontSize = 0;

  /** The `font-stretch` written for a name drawn narrower to fit (0: the font's own width). */
  private stretch = 0;

  /** The lines written into the label inside its node, or null while it holds the whole name (pills wrap it themselves). */
  private shownLines: string | null = null;

  /** What the label's pill says, while it's a pill. */
  private pillText: string | null = null;

  private iconHidden = false;
  private light: boolean | null = null;

  /** An outside pill on two lines, and the width it wraps at. */
  private wrapped = false;

  private pillWidth = 0;

  /** What was last written, so a label that didn't move isn't touched: the map repaints every frame while it moves. */
  private shown = true;

  private transform = '';
  private opacity = '';

  constructor(node: OrbitNode, extensions: MapExtensions) {
    this.node = node;
    this.element = document.createElement('div');
    this.element.className = 'orbit-label';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.dataset.orbitFor = node.id;
    this.typeName = extensions.typeName(node);
    markNode(this.element, node, this.typeName);
    applyTypeTokens(this.element, extensions.nodeType(node));
    const iconText = extensions.icon(node);
    this.hasIcon = Boolean(iconText);

    if (iconText) {
      const icon = document.createElement('span');
      icon.className = 'orbit-label__icon';
      icon.textContent = iconText;
      this.element.appendChild(icon);
    }

    this.text = document.createElement('span');
    this.text.className = 'orbit-label__text';
    setBreakableText(this.text, node.text);
    this.element.appendChild(this.text);
  }

  get currentPlacement(): LabelPlacement {
    return this.placement ?? 'hidden';
  }

  /** Whether the label shows: placed somewhere and not hidden. */
  get isShown(): boolean {
    return this.shown && this.placement !== null && this.placement !== 'hidden';
  }

  /** Draws the label as `drawing` says: inside its node, fitted as its placement was, or as a pill beside it. */
  update(drawing: LabelDrawing): void {
    const { x, y, screenRadius, role, placement, opacity } = drawing;

    if (placement !== this.placement || role !== this.role) {
      this.element.className = `orbit-label orbit-label--${role}${placement === 'outside' ? ' orbit-label--outside' : ''}`;
      this.placement = placement;
      this.role = role;
      this.light = null;
      this.wrapped = false;
    }

    const shown = placement !== 'hidden' && opacity > 0.01;

    if (shown !== this.shown) {
      this.element.style.display = shown ? '' : 'none';
      this.shown = shown;
    }

    if (!shown) {
      return;
    }

    let transform: string;

    if (placement === 'inside') {
      const layout = insideLabelLayout(role, screenRadius, this.node.text, this.hasIcon, drawing.measure, drawing.narrower, drawing.countWidth) ?? {
        width: insideLabelWidth(role, screenRadius),
        fontSize: MINIMUM_FONT_SIZE[role],
        lines: [this.node.text],
        icon: false,
        truncated: true,
        lift: 0,
      };
      const light = drawing.light ?? false;

      if (light !== this.light) {
        this.element.classList.toggle('orbit-label--light', light);
        this.light = light;
      }

      if (layout.fontSize !== this.fontSize) {
        this.element.style.fontSize = `${layout.fontSize}px`;
        this.fontSize = layout.fontSize;
      }

      const stretch = layout.stretch ?? 0;

      if (stretch !== this.stretch) {
        this.element.style.fontStretch = stretch ? `${stretch}%` : '';
        this.stretch = stretch;
      }

      // The lines the fit chose, exactly: the browser doesn't wrap them again.
      const shownLines = layout.lines.join('\n');

      if (shownLines !== this.shownLines) {
        this.text.textContent = shownLines;
        this.shownLines = shownLines;
        this.pillText = null;
      }

      const iconHidden = this.hasIcon && !layout.icon;

      if (iconHidden !== this.iconHidden) {
        this.element.classList.toggle('orbit-label--no-icon', iconHidden);
        this.iconHidden = iconHidden;
      }

      transform = `translate3d(${round(x, 1)}px, ${round(y - layout.lift, 1)}px, 0) translate(-50%, -50%)`;
    } else {
      const { direction = BELOW, distance = screenRadius + 5, offset = 0, lines = 1, width = 0, pillText = this.node.text } = drawing;

      if (this.fontSize !== 0) {
        this.element.style.fontSize = '';
        this.fontSize = 0;
      }

      if (this.stretch !== 0) {
        this.element.style.fontStretch = '';
        this.stretch = 0;
      }

      if (this.shownLines !== null || this.pillText !== pillText) {
        setBreakableText(this.text, pillText);
        this.shownLines = null;
        this.pillText = pillText;
      }

      const wrapped = lines === 2;

      if (wrapped !== this.wrapped) {
        this.element.classList.toggle('orbit-label--wrapped', wrapped);
        this.wrapped = wrapped;
      }

      // No wider than the box label planning kept on the map.
      if (wrapped && width !== this.pillWidth) {
        this.element.style.setProperty('--orbit-pill-width', `${Math.floor(width)}px`);
        this.pillWidth = width;
      }

      // The pill's point that matches its side sits `distance` from the node's center (see `pillDistance`).
      this.direction = direction;
      const shiftX = round(-50 + direction.x * 50, 1);
      const shiftY = round(-50 + direction.y * 50, 1);
      transform = `translate3d(${round(x + direction.x * distance + offset, 1)}px, ${round(y + direction.y * distance, 1)}px, 0) translate(${shiftX}%, ${shiftY}%)`;
    }

    if (transform !== this.transform) {
      this.element.style.transform = transform;
      this.transform = transform;
    }

    const opacityValue = opacity >= 0.999 ? '' : String(round(opacity, 3));

    if (opacityValue !== this.opacity) {
      this.element.style.opacity = opacityValue;
      this.opacity = opacityValue;
    }
  }
}

/** Dashed ring arcs between the bodies on a ring (centered on the origin). */
export const ringPath = (radius: number, gaps: DisplayRing['gaps']): string => {
  if (radius <= 0) {
    return '';
  }

  const openings = gaps
    .map((gap) => ({ start: normalizeAngle(gap.angle - gap.halfWidth), width: gap.halfWidth * 2 }))
    .filter((gap) => gap.width > 0)
    .sort((left, right) => left.start - right.start);

  if (openings.length === 0) {
    return `M ${round(radius)} 0 A ${round(radius)} ${round(radius)} 0 1 1 ${round(-radius)} 0 A ${round(radius)} ${round(radius)} 0 1 1 ${round(radius)} 0`;
  }

  const commands: string[] = [];

  for (let index = 0; index < openings.length; index += 1) {
    const current = openings[index];
    const next = openings[(index + 1) % openings.length];
    const arcStart = current.start + current.width;
    let arcEnd = next.start;

    if (index === openings.length - 1) {
      arcEnd += 360;
    }

    const sweep = arcEnd - arcStart;

    if (sweep <= 0.5) {
      continue;
    }

    const from = polar(radius, arcStart);
    const to = polar(radius, arcEnd);
    commands.push(`M ${round(from.x)} ${round(from.y)} A ${round(radius)} ${round(radius)} 0 ${sweep > 180 ? 1 : 0} 1 ${round(to.x)} ${round(to.y)}`);
  }

  return commands.join(' ');
};

const polar = (radius: number, degrees: number): { x: number; y: number } => {
  const radians = (degrees * Math.PI) / 180;
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
};

const normalizeAngle = (degrees: number): number => {
  return ((degrees % 360) + 360) % 360;
};

const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
