/**
 * The rings around orbits and the lines between nodes in the overview, kept
 * in step with each frame's display: one view each, written only when what it
 * shows changed.
 */

import type { Display, DisplayRing } from '../engine/display.js';
import { ringPath, svgElement } from '../engine/views.js';
import { round } from './numbers.js';

interface RingView {
  group: SVGGElement;
  line: SVGPathElement;
  band: SVGPathElement;
  shape: string;

  /** The gaps and radius the shape was last checked for: a spin keeps them, so the shape isn't worked out again. */
  gaps: DisplayRing['gaps'] | null;

  radius: number;
  transform: string;
  color: string;
}

interface LinkView {
  element: SVGLineElement;
  geometry: string;
  opacity: string;
}

/** The layers rings and links are drawn in, below the nodes. */
export interface RingAndLinkLayers {
  rings: SVGGElement;
  links: SVGGElement;
}

export class RingsAndLinks {
  private readonly layers: RingAndLinkLayers;
  private readonly rings = new Map<string, RingView>();
  private readonly links = new Map<string, LinkView>();

  constructor(layers: RingAndLinkLayers) {
    this.layers = layers;
  }

  /** Draws the display's rings (unless `showRings` is off) and links. */
  paint(display: Display, showRings: boolean): void {
    this.paintRings(display, showRings);
    this.paintLinks(display);
  }

  /** Takes every ring and link off the map. */
  clear(): void {
    for (const view of this.rings.values()) {
      view.group.remove();
    }

    this.rings.clear();

    for (const view of this.links.values()) {
      view.element.remove();
    }

    this.links.clear();
  }

  private paintRings(display: Display, showRings: boolean): void {
    const seen = new Set<string>();

    if (showRings) {
      for (const ring of display.rings) {
        if (ring.opacity <= 0.01 || ring.radius <= 0) {
          continue;
        }

        seen.add(ring.id);
        let view = this.rings.get(ring.id);

        if (!view) {
          view = createRingView(ring);
          this.rings.set(ring.id, view);
          this.layers.rings.appendChild(view.group);
        }

        if (ring.gaps !== view.gaps || ring.radius !== view.radius) {
          const shape = `${round(ring.radius)}|${ring.gaps.map((gap) => `${round(gap.angle)}:${round(gap.halfWidth)}`).join(',')}`;

          if (shape !== view.shape) {
            view.line.setAttribute('d', ringPath(ring.radius, ring.gaps));
            view.band.setAttribute('d', ringPath(ring.radius, []));
            view.shape = shape;
          }

          view.gaps = ring.gaps;
          view.radius = ring.radius;
        }

        const transform = `translate(${round(ring.cx)} ${round(ring.cy)}) rotate(${round(ring.rotation)})`;

        if (transform !== view.transform) {
          view.group.setAttribute('transform', transform);
          view.transform = transform;
        }

        const ringOpacity = ring.opacity >= 0.999 ? '' : String(round(ring.opacity));

        if (view.group.style.opacity !== ringOpacity) {
          view.group.style.opacity = ringOpacity;
        }

        if (view.color !== ring.color) {
          view.line.style.setProperty('--orbit-ring-color', ring.color);
          view.color = ring.color;
        }
      }
    }

    for (const [id, view] of this.rings) {
      if (!seen.has(id)) {
        view.group.remove();
        this.rings.delete(id);
      }
    }
  }

  private paintLinks(display: Display): void {
    const seen = new Set<string>();

    for (const link of display.links) {
      const from = display.nodes.get(link.fromId);
      const to = display.nodes.get(link.toId);
      const opacity = Math.min(link.opacity, from?.opacity ?? 0, to?.opacity ?? 0);

      if (!from || !to || opacity <= 0.01) {
        continue;
      }

      // Edge to edge, so lines never show through translucent nodes.
      const length = Math.hypot(to.x - from.x, to.y - from.y);

      if (length <= from.radius + to.radius) {
        continue;
      }

      seen.add(link.id);
      let view = this.links.get(link.id);

      if (!view) {
        view = { element: svgElement('line', { class: 'orbit-link' }), geometry: '', opacity: '' };
        this.links.set(link.id, view);
        this.layers.links.appendChild(view.element);
      }

      const unitX = (to.x - from.x) / length;
      const unitY = (to.y - from.y) / length;
      const x1 = String(round(from.x + unitX * from.radius));
      const y1 = String(round(from.y + unitY * from.radius));
      const x2 = String(round(to.x - unitX * to.radius));
      const y2 = String(round(to.y - unitY * to.radius));
      const geometry = `${x1} ${y1} ${x2} ${y2} ${link.color}`;

      if (geometry !== view.geometry) {
        view.element.setAttribute('x1', x1);
        view.element.setAttribute('y1', y1);
        view.element.setAttribute('x2', x2);
        view.element.setAttribute('y2', y2);
        view.element.style.setProperty('--orbit-link-color', link.color);
        view.geometry = geometry;
      }

      const lineOpacity = opacity >= 0.999 ? '' : String(round(opacity));

      if (lineOpacity !== view.opacity) {
        view.element.style.opacity = lineOpacity;
        view.opacity = lineOpacity;
      }
    }

    for (const [id, view] of this.links) {
      if (!seen.has(id)) {
        view.element.remove();
        this.links.delete(id);
      }
    }
  }
}

const createRingView = (ring: DisplayRing): RingView => {
  const group = svgElement('g', { class: 'orbit-ring-group' });
  const band = svgElement('path', { class: 'orbit-ring-band' });
  const line = svgElement('path', { class: 'orbit-ring' });
  group.append(band, line);
  group.setAttribute('data-orbit-ring', ring.centerId);
  return { group, line, band, shape: '', gaps: null, radius: 0, transform: '', color: '' };
};
