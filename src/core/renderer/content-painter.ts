/**
 * What node types draw inside their nodes (`render`), in an HTML layer over
 * the map: a 100 × 100 px box per node, moved and scaled with it each frame,
 * created when the node comes on the map and cleaned up when it leaves.
 */

import type { Display } from '../engine/display.js';
import type { Viewport } from '../engine/camera.js';
import type { MapExtensions } from '../extensions.js';
import type { OrbitNode } from '../types.js';
import { worldToScreen } from '../engine/camera.js';
import { applyTypeTokens, markNode } from '../engine/views.js';
import { guarded } from '../extensions.js';
import { round } from './numbers.js';

/** What a node type draws inside one node, and how it was last placed. */
interface NodeContent {
  element: HTMLDivElement;
  node: OrbitNode;
  cleanup?: () => void;
  transform: string;
  opacity: string;
  visible: boolean;
}

/** What node contents need from the map around them. */
export interface ContentHost {
  extensions(): MapExtensions;
  viewport(): Viewport;

  /** Nodes changed since the last frame. */
  changedIds(): ReadonlySet<string>;
}

export class ContentPainter {
  private readonly layer: HTMLDivElement;
  private readonly host: ContentHost;
  private readonly contents = new Map<string, NodeContent>();

  constructor(layer: HTMLDivElement, host: ContentHost) {
    this.layer = layer;
    this.host = host;
  }

  /** Cleans up every node's content. */
  clear(): void {
    for (const id of Array.from(this.contents.keys())) {
      this.remove(id);
    }
  }

  /**
   * Draws what node types render inside their nodes: a 100 × 100 px box per
   * node, moved and scaled with it each frame, created when the node comes
   * on the map and cleaned up when it leaves.
   */
  paint(display: Display): void {
    const { camera } = display;
    const seen = new Set<string>();

    for (const entry of display.nodes.values()) {
      const type = this.host.extensions().nodeType(entry.node);

      if (!type?.render) {
        continue;
      }

      let content = this.contents.get(entry.id);

      if (content && (content.node !== entry.node || this.host.changedIds().has(entry.id))) {
        this.remove(entry.id);
        content = undefined;
      }

      if (!content) {
        const element = document.createElement('div');
        element.className = 'orbit-node-content';
        element.dataset.orbitFor = entry.id;
        markNode(element, entry.node, this.host.extensions().typeName(entry.node));
        applyTypeTokens(element, type);
        this.layer.appendChild(element);
        const render = type.render;
        const cleanup = guarded(`The "${this.host.extensions().typeName(entry.node)}" node type's render()`, undefined, () => render(entry.node, element));
        content = { element, node: entry.node, cleanup: typeof cleanup === 'function' ? cleanup : undefined, transform: '', opacity: '', visible: true };
        this.contents.set(entry.id, content);
      }

      seen.add(entry.id);
      const radius = entry.radius * camera.scale;
      const visible = entry.opacity > 0.01 && radius >= 6;

      if (visible !== content.visible) {
        content.element.style.display = visible ? '' : 'none';
        content.visible = visible;
      }

      if (!visible) {
        continue;
      }

      const point = worldToScreen(camera, this.host.viewport(), entry);
      const transform = `translate3d(${round(point.x - 50, 1)}px, ${round(point.y - 50, 1)}px, 0) scale(${round(radius / 50, 4)})`;

      if (transform !== content.transform) {
        content.element.style.transform = transform;
        content.transform = transform;
      }

      const opacity = entry.opacity >= 0.999 ? '' : String(round(entry.opacity, 3));

      if (opacity !== content.opacity) {
        content.element.style.opacity = opacity;
        content.opacity = opacity;
      }
    }

    for (const id of Array.from(this.contents.keys())) {
      if (!seen.has(id)) {
        this.remove(id);
      }
    }
  }

  private remove(id: string): void {
    const content = this.contents.get(id);

    if (!content) {
      return;
    }

    content.element.remove();
    this.contents.delete(id);

    if (content.cleanup) {
      guarded('A node type\'s render() cleanup', undefined, content.cleanup);
    }
  }
}
