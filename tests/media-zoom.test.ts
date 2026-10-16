import { describe, expect, test } from 'bun:test';
import { FITTED, clampView, fittedSize, isZoomed, maximumZoom, panView, toggleZoom, zoomAround, type PictureView, type Point } from '../src/core/ui/media-zoom';

const STAGE = { width: 1000, height: 600 };
const NATURAL = { width: 1600, height: 1200 };

/** The point of the picture (in fitted px from its center) under `point` of the stage. */
const pictureAt = (view: PictureView, point: Point): Point => {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
};

describe('fitting a picture to the window', () => {
  test('a big picture shrinks to the room it has, keeping its shape', () => {
    expect(fittedSize(NATURAL, STAGE)).toEqual({ width: 800, height: 600 });
    expect(fittedSize({ width: 3000, height: 1000 }, STAGE)).toEqual({ width: 1000, height: 1000 / 3 });
  });

  test('a small picture grows to fit, but never past twice its own size', () => {
    expect(fittedSize({ width: 400, height: 300 }, STAGE)).toEqual({ width: 800, height: 600 });
    expect(fittedSize({ width: 100, height: 50 }, STAGE)).toEqual({ width: 200, height: 100 });
  });

  test('a vector picture fills the room at any size', () => {
    expect(fittedSize({ width: 100, height: 50 }, STAGE, true)).toEqual({ width: 1000, height: 500 });
  });

  test('nothing to fit, or no room, fits as nothing', () => {
    expect(fittedSize({ width: 0, height: 0 }, STAGE)).toEqual({ width: 0, height: 0 });
    expect(fittedSize(NATURAL, { width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe('zoom limits', () => {
  test('zooming goes to four times the fitted size, or on to twice the picture’s own size', () => {
    expect(maximumZoom({ width: 400, height: 300 }, { width: 800, height: 600 })).toBe(4);
    expect(maximumZoom({ width: 4000, height: 3000 }, { width: 800, height: 600 })).toBe(10);
  });

  test('the zoom stays between the fitted size and the maximum', () => {
    const fitted = fittedSize(NATURAL, STAGE);
    expect(clampView({ scale: 0.5, x: 0, y: 0 }, fitted, STAGE, 4).scale).toBe(1);
    expect(clampView({ scale: 9, x: 0, y: 0 }, fitted, STAGE, 4).scale).toBe(4);
  });

  test('a picture narrower than the stage stays centered across it; a bigger one leaves no gap at its edges', () => {
    const fitted = fittedSize(NATURAL, STAGE);
    // 800 × 600 at 1.1 is 880 × 660: narrower than the stage, 30 px taller.
    expect(clampView({ scale: 1.1, x: 200, y: 200 }, fitted, STAGE, 4)).toEqual({ scale: 1.1, x: 0, y: 30 });
    expect(clampView({ scale: 2, x: -1000, y: 1000 }, fitted, STAGE, 4)).toEqual({ scale: 2, x: -300, y: 300 });
  });
});

describe('zooming around a point', () => {
  const fitted = fittedSize(NATURAL, STAGE);
  const zoomedIn: PictureView = { scale: 2, x: -100, y: 50 };

  test('the point under the pointer stays where it is', () => {
    const anchor = { x: 180, y: -120 };
    const before = pictureAt(zoomedIn, anchor);
    const after = zoomAround(zoomedIn, 1.5, anchor, fitted, STAGE, 4);
    expect(after.scale).toBe(3);
    expect(pictureAt(after, anchor).x).toBeCloseTo(before.x, 6);
    expect(pictureAt(after, anchor).y).toBeCloseTo(before.y, 6);
  });

  test('zooming out keeps the point too, until an edge would leave a gap', () => {
    const anchor = { x: -50, y: 40 };
    const before = pictureAt(zoomedIn, anchor);
    const out = zoomAround(zoomedIn, 0.8, anchor, fitted, STAGE, 4);
    expect(pictureAt(out, anchor).x).toBeCloseTo(before.x, 6);
    expect(pictureAt(out, anchor).y).toBeCloseTo(before.y, 6);
    expect(zoomAround(zoomedIn, 0.1, anchor, fitted, STAGE, 4)).toEqual(FITTED);
  });

  test('zoom stops at the limits', () => {
    expect(zoomAround(FITTED, 100, { x: 0, y: 0 }, fitted, STAGE, 4).scale).toBe(4);
    expect(zoomAround(FITTED, 0.5, { x: 0, y: 0 }, fitted, STAGE, 4)).toEqual(FITTED);
  });

  test('a zoomed picture pans as far as its edges allow', () => {
    expect(panView(zoomedIn, 30, -20, fitted, STAGE, 4)).toEqual({ scale: 2, x: -70, y: 30 });
    expect(panView(zoomedIn, 5000, 5000, fitted, STAGE, 4)).toEqual({ scale: 2, x: 300, y: 300 });
    expect(panView(FITTED, 50, 50, fitted, STAGE, 4)).toEqual(FITTED);
  });

  test('a double click zooms in at its point, to the picture’s own size or twice the fitted size, and back out', () => {
    const anchor = { x: 120, y: -60 };
    const own = toggleZoom(FITTED, anchor, NATURAL, fitted, STAGE, 4);
    expect(own.scale).toBe(2);
    expect(pictureAt(own, anchor).x).toBeCloseTo(anchor.x, 6);
    expect(pictureAt(own, anchor).y).toBeCloseTo(anchor.y, 6);
    const small = fittedSize({ width: 400, height: 300 }, STAGE);
    expect(toggleZoom(FITTED, anchor, { width: 400, height: 300 }, small, STAGE, 4).scale).toBe(2);
    const big = fittedSize({ width: 4000, height: 3000 }, STAGE);
    expect(toggleZoom(FITTED, anchor, { width: 4000, height: 3000 }, big, STAGE, 10).scale).toBe(5);
    expect(toggleZoom(own, anchor, NATURAL, fitted, STAGE, 4)).toEqual(FITTED);
    expect(isZoomed(own)).toBe(true);
    expect(isZoomed(FITTED)).toBe(false);
  });
});
