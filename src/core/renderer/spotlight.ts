/**
 * A node brought up close (`OrbitSVGRenderer.spotlight`): the camera that
 * holds it in the middle of the map's room, the circle it makes on screen,
 * and the scrim that dims the rest of the map around it.
 */

import { worldToScreen, type Camera, type Insets, type Viewport } from '../engine/camera.js';
import { svgElement } from '../engine/views.js';
import { round } from './numbers.js';

/** How much of the room the insets leave a node up close fills across, along its shorter side, unless the page says otherwise. */
export const SPOTLIGHT_SHARE = 0.86;

/** A circle on screen, in px from the map's top left. */
export interface ScreenCircle {
  x: number;
  y: number;
  radius: number;
}

/** A node where the world has it: its center and radius. */
export interface WorldCircle {
  x: number;
  y: number;
  radius: number;
}

/** `share` as a spotlight takes it: a fraction of the room, more than nothing and at most all of it. */
export const spotlightShare = (share: number | undefined): number => {
  return typeof share === 'number' && Number.isFinite(share) && share > 0 ? Math.min(1, share) : SPOTLIGHT_SHARE;
};

/**
 * The camera that holds `node` in the middle of the room `insets` leave of
 * the viewport, `share` of that room across along its shorter side.
 */
export const spotlightCamera = (node: WorldCircle, viewport: Viewport, insets: Insets, share: number): Camera => {
  const width = Math.max(1, viewport.width - insets.left - insets.right);
  const height = Math.max(1, viewport.height - insets.top - insets.bottom);
  const scale = (share * Math.min(width, height)) / 2 / Math.max(node.radius, 1e-6);
  const centerX = insets.left + width / 2;
  const centerY = insets.top + height / 2;

  return {
    x: node.x - (centerX - viewport.width / 2) / scale,
    y: node.y - (centerY - viewport.height / 2) / scale,
    scale,
  };
};

/** Where `node` is on screen through `camera`, rounded to a hundredth of a px, so a circle that holds still compares equal. */
export const circleOnScreen = (camera: Camera, viewport: Viewport, node: WorldCircle): ScreenCircle => {
  const center = worldToScreen(camera, viewport, node);
  return { x: round(center.x), y: round(center.y), radius: round(node.radius * camera.scale) };
};

export const sameCircle = (one: ScreenCircle | null, other: ScreenCircle | null): boolean => {
  return one === other || (one !== null && other !== null && one.x === other.x && one.y === other.y && one.radius === other.radius);
};

/** The scrim's shape: the whole viewport, with `circle` cut out of it (none when there's no circle). */
export const scrimPath = (viewport: Viewport, circle: ScreenCircle | null): string => {
  const width = round(viewport.width, 1);
  const height = round(viewport.height, 1);
  const whole = `M0 0H${width}V${height}H0Z`;

  if (!circle || circle.radius <= 0) {
    return whole;
  }

  const { x, y, radius } = circle;
  // Two half circles, drawn the other way round from the rectangle: a hole whatever the fill rule.
  return `${whole}M${round(x - radius)} ${y}A${radius} ${radius} 0 1 0 ${round(x + radius)} ${y}A${radius} ${radius} 0 1 0 ${round(x - radius)} ${y}Z`;
};

/**
 * The scrim over the map while a node is up close: the sheet's backdrop
 * over everything but the node's circle. It takes every press over the
 * map, the circle's included, so nothing under it reacts.
 */
export class SpotlightScrim {
  readonly element: SVGSVGElement;
  private readonly shape: SVGPathElement;
  private drawn = '';
  private opacity = '';

  constructor() {
    this.element = svgElement('svg', { class: 'orbit__spotlight', 'aria-hidden': 'true' });
    this.shape = svgElement('path', { class: 'orbit__spotlight-scrim', 'fill-rule': 'evenodd' });
    this.element.appendChild(this.shape);
  }

  /** Draws the scrim over a `viewport`, with `circle` cut out, at `opacity` (0 to 1) of the backdrop. */
  update(viewport: Viewport, circle: ScreenCircle | null, opacity: number, fades: boolean): void {
    const shape = scrimPath(viewport, circle);

    if (shape !== this.drawn) {
      this.shape.setAttribute('d', shape);
      this.drawn = shape;
    }

    this.element.classList.toggle('orbit__spotlight--fading', fades);
    const shown = String(round(Math.min(1, Math.max(0, opacity)), 3));

    if (shown !== this.opacity) {
      this.element.style.opacity = shown;
      this.opacity = shown;
    }
  }

  /** Takes the scrim off the map. */
  remove(): void {
    this.element.remove();
    this.drawn = '';
    this.opacity = '';
  }
}
