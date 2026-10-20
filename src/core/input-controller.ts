/**
 * Pointer gestures for the map: tap, long press, spin (focus mode), pan
 * (overview), pinch, wheel, double tap, and dragging a node that a held
 * press lifted. The controller only recognizes gestures; the renderer
 * decides what they do.
 *
 * Two properties are load-bearing for touch: pointerdown is never
 * preventDefault-ed (that would suppress the `click` every tap relies on),
 * and native scrolling is managed with `touch-action` in the stylesheet.
 * Pointer capture is taken only once a drag engages, so taps keep native
 * targeting.
 */

export interface Point {
  x: number;
  y: number;
}

/** What a one-finger drag starting at a point does. */
export type DragGesture = 'spin' | 'pan' | 'none';

export interface GestureCallbacks {
  isInteractive(): boolean;

  /** What dragging from this point (container coordinates) does. */
  dragGesture(point: Point): DragGesture;

  /** The orbit's center on screen. */
  spinCenter(): Point;

  /** True while the orbit coasts: the next press catches it. */
  isCoasting(): boolean;

  onCatch(): void;
  onSpinStart(time: number, angle: number): void;
  onSpinMove(time: number, angle: number): void;

  /** `cancelled` when the browser took the pointer over (to scroll, say): no fling. */
  onSpinEnd(time: number, cancelled: boolean): void;

  onPanStart(time: number): void;
  onPan(deltaX: number, deltaY: number, time: number): void;
  onPanEnd(time: number, cancelled: boolean): void;

  /** Zoom by `factor` around `center`, and pan by how far the center moved. */
  onPinch(factor: number, center: Point, deltaX: number, deltaY: number): void;

  onPinchEnd(): void;
  onWheel(event: WheelEvent, point: Point): void;
  onDoubleTap(point: Point, target: EventTarget | null): void;

  /**
   * A touch or pen held still on `target`. Returns whether the map took it:
   * the press then neither taps nor spins.
   */
  onLongPress(point: Point, target: EventTarget | null): boolean;

  /**
   * A press held still on `target`: whether it lifted a node, which moving
   * the press then drags (see `onNodeDrag`). Touches and pens get here after
   * `onLongPress`; a mouse held still gets here alone, with no menu.
   */
  onHold(point: Point, target: EventTarget | null): boolean;

  /**
   * The lifted node follows the press: `move` as it moves, then `drop` where
   * it's let go (moved or not), or `cancel` when the press is taken away.
   */
  onNodeDrag(point: Point, phase: 'move' | 'drop' | 'cancel'): void;

  /** How long (ms) a still touch takes to become a long press. */
  longPressDelay(): number;

  onDraggingChange(dragging: boolean): void;
}

type Gesture = 'none' | 'tap' | 'spin' | 'pan' | 'pinch' | 'move';

/** Movement (px) before a press becomes a drag. Below this a press is a tap. */
const DRAG_SLOP = 4;
/** Fingers wobble more than a mouse: the drag slop for touch and pens, which also cancels a long press. */
const TOUCH_SLOP = 8;
const DOUBLE_TAP_TIME = 320;
const DOUBLE_TAP_DISTANCE = 28;

export class InputController {
  private element: Element | null = null;
  private readonly container: HTMLElement;
  private readonly callbacks: GestureCallbacks;
  private readonly pointers = new Map<number, Point>();
  private gesture: Gesture = 'none';
  private engaged = false;
  private startPoint: Point | null = null;
  private lastPoint: Point | null = null;

  /**
   * Where the map was on the page when the pointers now down first touched
   * it. Asking again on every move would make the browser lay out the whole
   * map each time, thousands of elements on a big one, and a pointer can
   * move several times a frame.
   */
  private gestureRectangle: DOMRect | null = null;

  private lastPinchDistance: number | null = null;
  private lastPinchCenter: Point | null = null;
  private suppressNextClick = false;
  private lastTap: { time: number; point: Point } | null = null;
  private longPress: { pointerId: number; timer: ReturnType<typeof setTimeout> } | null = null;

  /** The press became a long press: lifting it is no tap. */
  private pressTaken = false;

  /** The held press lifted a node: moving it drags the node. */
  private lifted = false;

  constructor(container: HTMLElement, callbacks: GestureCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  attach(element: Element): void {
    if (this.element === element) {
      return;
    }

    this.detach();
    this.element = element;
    element.addEventListener('pointerdown', this.handlePointerDown as EventListener);
    element.addEventListener('pointermove', this.handlePointerMove as EventListener);
    element.addEventListener('pointerup', this.handlePointerUp as EventListener);
    element.addEventListener('pointercancel', this.handlePointerUp as EventListener);
    element.addEventListener('wheel', this.handleWheel as EventListener, { passive: false });
    element.addEventListener('touchmove', this.handleTouchMove as EventListener, { passive: false });
    element.addEventListener('dblclick', this.handleDoubleClick as EventListener);
    // Capture phase so the click that ends a drag never reaches node listeners.
    element.addEventListener('click', this.handleClickCapture as EventListener, true);
  }

  detach(): void {
    const element = this.element;

    if (!element) {
      return;
    }

    element.removeEventListener('pointerdown', this.handlePointerDown as EventListener);
    element.removeEventListener('pointermove', this.handlePointerMove as EventListener);
    element.removeEventListener('pointerup', this.handlePointerUp as EventListener);
    element.removeEventListener('pointercancel', this.handlePointerUp as EventListener);
    element.removeEventListener('wheel', this.handleWheel as EventListener);
    element.removeEventListener('touchmove', this.handleTouchMove as EventListener);
    element.removeEventListener('dblclick', this.handleDoubleClick as EventListener);
    element.removeEventListener('click', this.handleClickCapture as EventListener, true);
    this.element = null;
    this.reset();
  }

  private reset(): void {
    if (this.lifted || this.gesture === 'move') {
      this.callbacks.onNodeDrag(this.lastPoint ?? { x: 0, y: 0 }, 'cancel');
    }

    if (this.engaged) {
      this.callbacks.onDraggingChange(false);
    }

    this.cancelLongPress();
    this.pressTaken = false;
    this.lifted = false;
    this.pointers.clear();
    this.gestureRectangle = null;
    this.gesture = 'none';
    this.engaged = false;
    this.startPoint = null;
    this.lastPoint = null;
    this.lastPinchDistance = null;
    this.lastPinchCenter = null;
  }

  private localPoint(event: { clientX?: number; clientY?: number }): Point {
    const rectangle = this.gestureRectangle ?? this.container.getBoundingClientRect();
    // Synthetic events may carry no coordinates: treat them as the middle of the map.
    const x = Number.isFinite(event.clientX) ? (event.clientX as number) - rectangle.left : rectangle.width / 2;
    const y = Number.isFinite(event.clientY) ? (event.clientY as number) - rectangle.top : rectangle.height / 2;
    return { x, y };
  }

  private angleOf(point: Point): number {
    const center = this.callbacks.spinCenter();
    return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
  }

  private pinchDistance(): number | null {
    if (this.pointers.size < 2) {
      return null;
    }

    const [first, second] = Array.from(this.pointers.values());
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  private pinchCenter(): Point {
    const [first, second] = Array.from(this.pointers.values());
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  private readonly handleClickCapture = (event: MouseEvent): void => {
    if (!this.suppressNextClick) {
      return;
    }

    this.suppressNextClick = false;
    event.stopPropagation();
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.callbacks.isInteractive()) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    if (this.pointers.size === 0) {
      this.gestureRectangle = this.container.getBoundingClientRect();
    }

    const point = this.localPoint(event);
    this.pointers.set(event.pointerId, point);
    this.suppressNextClick = false;
    this.cancelLongPress();

    if (this.pointers.size === 2) {
      // A second finger puts a lifted node back: two fingers pinch.
      if (this.lifted || this.gesture === 'move') {
        this.lifted = false;
        this.callbacks.onNodeDrag(this.lastPoint ?? point, 'cancel');
      }

      if (this.engaged && this.gesture === 'spin') {
        this.callbacks.onSpinEnd(event.timeStamp, true);
      } else if (this.engaged && this.gesture === 'pan') {
        this.callbacks.onPanEnd(event.timeStamp, true);
      }

      if (!this.engaged) {
        this.callbacks.onDraggingChange(true);
      }

      this.gesture = 'pinch';
      this.engaged = true;
      this.lastPinchDistance = this.pinchDistance();
      this.lastPinchCenter = this.pinchCenter();
      return;
    }

    if (this.pointers.size > 2) {
      return;
    }

    const catching = this.callbacks.isCoasting();

    if (catching) {
      // A touch on a spinning orbit catches it; it never opens a planet.
      this.callbacks.onCatch();
      this.suppressNextClick = true;
    }

    this.startPoint = point;
    this.lastPoint = point;
    this.engaged = false;
    this.pressTaken = false;
    const drag = this.callbacks.dragGesture(point);
    this.gesture = drag === 'none' ? 'tap' : drag;

    if (!catching) {
      this.startLongPress(event.pointerId, point, event.target, event.pointerType === 'mouse');
    }
  };

  private startLongPress(pointerId: number, point: Point, target: EventTarget | null, mouse: boolean): void {
    const timer = setTimeout(() => {
      this.longPress = null;

      if (this.engaged || this.pointers.size !== 1) {
        return;
      }

      // A mouse has its right click for menus: held still, it only lifts.
      const taken = !mouse && this.callbacks.onLongPress(point, target);
      const lifted = this.callbacks.onHold(point, target);

      if (!taken && !lifted) {
        return;
      }

      this.lifted = lifted;
      this.lastTap = null;

      if (mouse) {
        // A slow click that lets go without moving still clicks.
        return;
      }

      // The press is spent: lifting the finger doesn't tap, and moving it drags the lifted node or nothing.
      this.pressTaken = true;
      this.gesture = 'none';
      this.suppressNextClick = true;
    }, this.callbacks.longPressDelay());

    this.longPress = { pointerId, timer };
  }

  private cancelLongPress(): void {
    if (this.longPress) {
      clearTimeout(this.longPress.timer);
      this.longPress = null;
    }
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) {
      return;
    }

    const point = this.localPoint(event);
    this.pointers.set(event.pointerId, point);

    if (this.gesture === 'pinch') {
      const distance = this.pinchDistance();

      if (distance === null) {
        return;
      }

      const center = this.pinchCenter();
      const previousCenter = this.lastPinchCenter ?? center;
      const factor = this.lastPinchDistance ? distance / this.lastPinchDistance : 1;
      this.callbacks.onPinch(factor, center, center.x - previousCenter.x, center.y - previousCenter.y);
      this.lastPinchDistance = distance;
      this.lastPinchCenter = center;
      return;
    }

    if (!this.startPoint || !this.lastPoint) {
      return;
    }

    const moved = Math.hypot(point.x - this.startPoint.x, point.y - this.startPoint.y);
    const slop = event.pointerType === 'mouse' ? DRAG_SLOP : TOUCH_SLOP;

    if (this.longPress && moved >= slop) {
      this.cancelLongPress();
    }

    if (this.lifted && this.gesture !== 'move') {
      if (moved < slop) {
        return;
      }

      this.gesture = 'move';
      this.engaged = true;
      this.callbacks.onDraggingChange(true);

      try {
        this.element?.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is optional (some test environments lack it).
      }
    }

    if (this.gesture === 'move') {
      this.lastPoint = point;
      this.callbacks.onNodeDrag(point, 'move');
      return;
    }

    if (this.gesture !== 'spin' && this.gesture !== 'pan') {
      return;
    }

    if (!this.engaged) {
      if (moved < slop) {
        return;
      }

      this.cancelLongPress();
      this.engaged = true;
      this.callbacks.onDraggingChange(true);

      try {
        this.element?.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is optional (some test environments lack it).
      }

      if (this.gesture === 'spin') {
        // Anchor at the current position so the slop distance doesn't jump.
        this.callbacks.onSpinStart(event.timeStamp, this.angleOf(point));
      } else {
        this.callbacks.onPanStart(event.timeStamp);
      }
    }

    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const points = samples.length > 0 ? samples.map((sample) => ({ point: this.localPoint(sample), time: sample.timeStamp })) : [{ point, time: event.timeStamp }];

    for (const sample of points) {
      if (this.gesture === 'spin') {
        this.callbacks.onSpinMove(sample.time, this.angleOf(sample.point));
      } else {
        this.callbacks.onPan(sample.point.x - this.lastPoint.x, sample.point.y - this.lastPoint.y, sample.time);
      }

      this.lastPoint = sample.point;
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointers.delete(event.pointerId)) {
      return;
    }

    this.cancelLongPress();
    const point = this.localPoint(event);

    if (this.pointers.size === 0) {
      this.gestureRectangle = null;
    }

    if (this.gesture === 'pinch') {
      if (this.pointers.size === 1) {
        this.callbacks.onPinchEnd();
        // One finger lifted mid-pinch: continue as a pan in the overview.
        const remaining = Array.from(this.pointers.values())[0];
        this.lastPinchDistance = null;
        this.lastPinchCenter = null;
        this.startPoint = remaining;
        this.lastPoint = remaining;

        if (this.callbacks.dragGesture(remaining) === 'pan') {
          this.gesture = 'pan';
          this.callbacks.onPanStart(event.timeStamp);
        } else {
          this.gesture = 'none';
        }

        this.suppressNextClick = true;
        return;
      }

      if (this.pointers.size === 0) {
        this.callbacks.onPinchEnd();
        this.suppressNextClick = true;
        this.reset();
        return;
      }

      // A finger lifted from a pinch of three or more: the pair that remains sets a fresh baseline.
      this.lastPinchDistance = this.pinchDistance();
      this.lastPinchCenter = this.pinchCenter();
      return;
    }

    if (this.pointers.size > 0) {
      return;
    }

    const cancelled = event.type === 'pointercancel';

    if (this.lifted || this.gesture === 'move') {
      // Let go: a node that moved lands where it is, and one only lifted goes back down.
      this.lifted = false;
      this.callbacks.onNodeDrag(point, cancelled ? 'cancel' : 'drop');
      this.gesture = 'none';
    }

    if (this.engaged) {
      // A cancel ends the drag with no click after it, so there's nothing to swallow.
      this.suppressNextClick = !cancelled;

      if (this.gesture === 'spin') {
        this.callbacks.onSpinEnd(event.timeStamp, cancelled);
      } else if (this.gesture === 'pan') {
        this.callbacks.onPanEnd(event.timeStamp, cancelled);
      }
    } else if (event.pointerType !== 'mouse' && event.type === 'pointerup' && !this.pressTaken) {
      this.detectDoubleTap(point, event.timeStamp, event.target);
    }

    this.reset();
  };

  private detectDoubleTap(point: Point, time: number, target: EventTarget | null): void {
    const previous = this.lastTap;

    if (previous && time - previous.time < DOUBLE_TAP_TIME && Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < DOUBLE_TAP_DISTANCE) {
      this.lastTap = null;
      this.callbacks.onDoubleTap(point, target);
      return;
    }

    this.lastTap = { time, point };
  }

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (!this.callbacks.isInteractive()) {
      return;
    }

    this.callbacks.onDoubleTap(this.localPoint(event), event.target);
  };

  /**
   * A lifted node is dragged, not the page: the browser mustn't scroll it
   * from under the press, as it would where `touch-action` lets one finger
   * scroll the page (Chromium doesn't apply `touch-action` to the shapes
   * inside an SVG, so the canvas's own decides).
   */
  private readonly handleTouchMove = (event: TouchEvent): void => {
    if ((this.lifted || this.gesture === 'move') && event.cancelable) {
      event.preventDefault();
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.callbacks.isInteractive()) {
      return;
    }

    this.callbacks.onWheel(event, this.localPoint(event));
  };
}

/**
 * Zoom factor for a wheel event: the same zoom per scrolled pixel for mouse
 * wheels and trackpads. Trackpad pinches arrive as wheel events with
 * `ctrlKey` and small pixel deltas, so they get a stronger multiplier; a
 * mouse wheel turned with Ctrl held sends large deltas and keeps the normal one.
 */
export const wheelZoomFactor = (event: Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'ctrlKey'>, pageHeight: number): number => {
  let pixels = event.deltaY;

  if (event.deltaMode === 1) {
    pixels *= 16;
  } else if (event.deltaMode === 2) {
    pixels *= pageHeight;
  }

  const trackpadPinch = event.ctrlKey && event.deltaMode === 0 && Math.abs(event.deltaY) < 50;
  const factor = Math.exp(-pixels * 0.002 * (trackpadPinch ? 5 : 1));
  return Math.min(2, Math.max(0.5, factor));
};
