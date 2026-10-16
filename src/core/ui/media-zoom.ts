/**
 * Geometry for pictures in the media viewer: fitting a picture to the
 * window, zooming around a point that stays where it is, and keeping a
 * zoomed picture over the stage while it is panned.
 *
 * Points are in px from the stage's center. A view is the picture's zoom
 * relative to its fitted size, and where its center is.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A picture shown `scale` times its fitted size, its center `x`, `y` px from the stage's center. */
export interface PictureView {
  scale: number;
  x: number;
  y: number;
}

export const FITTED: PictureView = { scale: 1, x: 0, y: 0 };

/** Fitting never draws a picture more than this many times its own size: a small one would only blur. */
const FIT_UPSCALE = 2;
/** Zooming goes at least to this many times the fitted size… */
const ZOOM_IN = 4;
/** …and on until the picture shows at this many times its own size. */
const OWN_SIZE_ZOOM = 2;
/** A double click or tap zooms in at least this much. */
const DOUBLE_TAP_ZOOM = 2;

/**
 * The size a picture is drawn at to fit `room`: as large as fits, but no
 * more than twice its own size, unless it's `scalable` (a vector picture).
 */
export const fittedSize = (natural: Size, room: Size, scalable = false): Size => {
  if (!(natural.width > 0 && natural.height > 0 && room.width > 0 && room.height > 0)) {
    return { width: 0, height: 0 };
  }

  let scale = Math.min(room.width / natural.width, room.height / natural.height);

  if (!scalable) {
    scale = Math.min(scale, FIT_UPSCALE);
  }

  return { width: natural.width * scale, height: natural.height * scale };
};

/** The furthest a picture zooms in, relative to its fitted size. */
export const maximumZoom = (natural: Size, fitted: Size): number => {
  if (!(fitted.width > 0 && natural.width > 0)) {
    return 1;
  }

  return Math.max(ZOOM_IN, (OWN_SIZE_ZOOM * natural.width) / fitted.width);
};

/**
 * `view` within its limits: zoomed between the fitted size and `maximum`,
 * and placed so a picture bigger than the stage leaves no gap at its edges,
 * while one smaller than the stage (in either direction) stays centered.
 */
export const clampView = (view: PictureView, fitted: Size, stage: Size, maximum: number): PictureView => {
  const scale = clamp(view.scale, 1, Math.max(1, maximum));
  const roomX = Math.max(0, (fitted.width * scale - stage.width) / 2);
  const roomY = Math.max(0, (fitted.height * scale - stage.height) / 2);
  // `|| 0` turns -0 into 0.
  return { scale, x: clamp(view.x, -roomX, roomX) || 0, y: clamp(view.y, -roomY, roomY) || 0 };
};

/**
 * Zooms by `factor`, keeping the point of the picture under `anchor` where
 * it is, as far as the limits allow.
 */
export const zoomAround = (view: PictureView, factor: number, anchor: Point, fitted: Size, stage: Size, maximum: number): PictureView => {
  const scale = clamp(view.scale * factor, 1, Math.max(1, maximum));
  const ratio = scale / view.scale;
  const zoomed = { scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
  return clampView(zoomed, fitted, stage, maximum);
};

/** Moves the picture by `deltaX`, `deltaY`, as far as its edges allow. */
export const panView = (view: PictureView, deltaX: number, deltaY: number, fitted: Size, stage: Size, maximum: number): PictureView => {
  return clampView({ scale: view.scale, x: view.x + deltaX, y: view.y + deltaY }, fitted, stage, maximum);
};

/**
 * A double click or tap: back to the fitted view when zoomed in; otherwise
 * in at `anchor`, to the picture's own size, or to twice the fitted size
 * when that is further.
 */
export const toggleZoom = (view: PictureView, anchor: Point, natural: Size, fitted: Size, stage: Size, maximum: number): PictureView => {
  if (isZoomed(view)) {
    return FITTED;
  }

  const ownSize = fitted.width > 0 ? natural.width / fitted.width : 1;
  return zoomAround(view, Math.max(DOUBLE_TAP_ZOOM, ownSize) / view.scale, anchor, fitted, stage, maximum);
};

/** Whether the picture is zoomed in past its fitted size. */
export const isZoomed = (view: PictureView): boolean => {
  return view.scale > 1.001;
};

const clamp = (value: number, minimum: number, maximum: number): number => {
  return Math.min(maximum, Math.max(minimum, value));
};
