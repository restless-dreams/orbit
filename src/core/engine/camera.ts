/**
 * Camera math. A camera is the world point shown at the viewport's center
 * and a zoom factor. Everything is plain geometry so it can be unit-tested
 * without a DOM.
 */

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Maps world points onto the screen: `p ↦ (p − center) × scale + viewport center`. */
export const worldToScreen = (camera: Camera, viewport: Viewport, point: Point): Point => {
  return {
    x: (point.x - camera.x) * camera.scale + viewport.width / 2,
    y: (point.y - camera.y) * camera.scale + viewport.height / 2,
  };
};

export const screenToWorld = (camera: Camera, viewport: Viewport, point: Point): Point => {
  return {
    x: (point.x - viewport.width / 2) / camera.scale + camera.x,
    y: (point.y - viewport.height / 2) / camera.scale + camera.y,
  };
};

/** SVG `transform` for the world group. */
export const cameraTransform = (camera: Camera, viewport: Viewport): string => {
  return `translate(${round(viewport.width / 2)} ${round(viewport.height / 2)}) scale(${round(camera.scale, 5)}) translate(${round(-camera.x)} ${round(-camera.y)})`;
};

/** Zooms by `factor` keeping the world point under `anchor` (screen coordinates) in place. */
export const zoomAround = (camera: Camera, viewport: Viewport, factor: number, anchor: Point): Camera => {
  const fixed = screenToWorld(camera, viewport, anchor);
  const scale = camera.scale * factor;
  return {
    scale,
    x: fixed.x - (anchor.x - viewport.width / 2) / scale,
    y: fixed.y - (anchor.y - viewport.height / 2) / scale,
  };
};

/** Moves the camera so the content shifts by a screen-space delta. */
export const panBy = (camera: Camera, deltaX: number, deltaY: number): Camera => {
  return { scale: camera.scale, x: camera.x - deltaX / camera.scale, y: camera.y - deltaY / camera.scale };
};

/**
 * A camera that keeps `center` at the middle of the viewport and fits
 * content reaching `extent` away from it on each axis, inside `padding`.
 */
/** Room the page's own controls take at the viewport's edges, in px. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The camera that shows `extent` around `center`, `padding` px from the
 * edges of what `insets` leave of the viewport, and centered there.
 */
export const fitAround = (center: Point, extent: Point, viewport: Viewport, padding: number, maximumScale: number, insets: Insets = NO_INSETS): Camera => {
  const width = Math.max(1, viewport.width - insets.left - insets.right);
  const height = Math.max(1, viewport.height - insets.top - insets.bottom);
  const usableWidth = Math.max(width - padding * 2, width * 0.35);
  const usableHeight = Math.max(height - padding * 2, height * 0.35);
  const fitted = Math.min(
    extent.x > 0 ? usableWidth / (extent.x * 2) : maximumScale,
    extent.y > 0 ? usableHeight / (extent.y * 2) : maximumScale,
    maximumScale,
  );
  const scale = fitted > 0 && Number.isFinite(fitted) ? fitted : 1;
  // The middle of what's left is off the viewport's middle: the camera looks the other way by as much.
  return {
    x: center.x - (insets.left - insets.right) / 2 / scale,
    y: center.y - (insets.top - insets.bottom) / 2 / scale,
    scale,
  };
};

/** A similarity transform `p ↦ p × scale + (x, y)`, used to place one scene inside another. */
export interface Similarity {
  scale: number;
  x: number;
  y: number;
}

export const IDENTITY: Similarity = { scale: 1, x: 0, y: 0 };

export const applySimilarity = (transform: Similarity, point: Point): Point => {
  return { x: point.x * transform.scale + transform.x, y: point.y * transform.scale + transform.y };
};

export const invertSimilarity = (transform: Similarity): Similarity => {
  return { scale: 1 / transform.scale, x: -transform.x / transform.scale, y: -transform.y / transform.scale };
};

/** `outer ∘ inner`: apply `inner` first, then `outer`. */
export const composeSimilarity = (outer: Similarity, inner: Similarity): Similarity => {
  return {
    scale: outer.scale * inner.scale,
    x: inner.x * outer.scale + outer.x,
    y: inner.y * outer.scale + outer.y,
  };
};

/** The same view expressed in coordinates transformed by `transform`. */
export const transformCamera = (transform: Similarity, camera: Camera): Camera => {
  const center = applySimilarity(transform, camera);
  return { x: center.x, y: center.y, scale: camera.scale / transform.scale };
};

const RHO = Math.SQRT2;
const RHO_SQUARED = 2;
const RHO_FOURTH = 4;

export interface CameraPath {
  /** The camera at `progress` ∈ [0, 1]. */
  at(progress: number): Camera;

  /** Path length in the paper's units; flights take time proportional to it. */
  length: number;
}

/**
 * Van Wijk & Nuij, "Smooth and efficient zooming and panning" (2003): the
 * path that zooms out a little, travels, then zooms in, so the start and the
 * destination stay in view for as long as possible. It is the same path
 * d3's `interpolateZoom` follows.
 */
export const smoothZoomPath = (from: Camera, to: Camera, viewport: Viewport): CameraPath => {
  const viewWidth = Math.max(viewport.width, 1);
  const startX = from.x;
  const startY = from.y;
  const startWidth = viewWidth / from.scale;
  const endWidth = viewWidth / to.scale;
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const distanceSquared = deltaX * deltaX + deltaY * deltaY;

  if (distanceSquared < 1e-12) {
    const length = Math.log(endWidth / startWidth) / RHO;
    return {
      length: Math.abs(length),
      at: (progress) => ({
        x: startX + progress * deltaX,
        y: startY + progress * deltaY,
        scale: viewWidth / (startWidth * Math.exp(RHO * progress * length)),
      }),
    };
  }

  const distance = Math.sqrt(distanceSquared);
  const startTerm = (endWidth * endWidth - startWidth * startWidth + RHO_FOURTH * distanceSquared) / (2 * startWidth * RHO_SQUARED * distance);
  const endTerm = (endWidth * endWidth - startWidth * startWidth - RHO_FOURTH * distanceSquared) / (2 * endWidth * RHO_SQUARED * distance);
  const startRatio = Math.log(Math.sqrt(startTerm * startTerm + 1) - startTerm);
  const endRatio = Math.log(Math.sqrt(endTerm * endTerm + 1) - endTerm);
  const length = (endRatio - startRatio) / RHO;
  const coshStart = Math.cosh(startRatio);

  return {
    length: Math.abs(length),
    at: (progress) => {
      const position = progress * length;
      const travelled = (startWidth / (RHO_SQUARED * distance)) * (coshStart * Math.tanh(RHO * position + startRatio) - Math.sinh(startRatio));
      const width = (startWidth * coshStart) / Math.cosh(RHO * position + startRatio);
      return {
        x: startX + travelled * deltaX,
        y: startY + travelled * deltaY,
        scale: viewWidth / width,
      };
    },
  };
};

const round = (value: number, decimals = 3): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
