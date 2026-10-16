import { describe, expect, it } from 'bun:test';
import {
  applySimilarity,
  composeSimilarity,
  fitAround,
  invertSimilarity,
  panBy,
  screenToWorld,
  smoothZoomPath,
  transformCamera,
  worldToScreen,
  zoomAround,
} from '../src/core/engine/camera';

const viewport = { width: 800, height: 600 };

describe('camera projection', () => {
  it('maps the camera center to the middle of the viewport and back', () => {
    const camera = { x: 10, y: -20, scale: 2 };
    expect(worldToScreen(camera, viewport, { x: 10, y: -20 })).toEqual({ x: 400, y: 300 });
    const screen = worldToScreen(camera, viewport, { x: 30, y: 5 });
    expect(screen).toEqual({ x: 440, y: 350 });
    expect(screenToWorld(camera, viewport, screen)).toEqual({ x: 30, y: 5 });
  });

  it('keeps the point under the anchor fixed while zooming', () => {
    const camera = { x: 0, y: 0, scale: 1 };
    const anchor = { x: 650, y: 120 };
    const before = screenToWorld(camera, viewport, anchor);
    const zoomed = zoomAround(camera, viewport, 2.5, anchor);
    expect(zoomed.scale).toBe(2.5);
    const after = screenToWorld(zoomed, viewport, anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('pans by screen pixels at any zoom', () => {
    const camera = { x: 0, y: 0, scale: 4 };
    const panned = panBy(camera, 40, -20);
    const origin = worldToScreen(panned, viewport, { x: 0, y: 0 });
    expect(origin).toEqual({ x: 440, y: 280 });
  });
});

describe('fitAround', () => {
  it('keeps the center fixed and fits the larger extent', () => {
    const camera = fitAround({ x: 0, y: 0 }, { x: 300, y: 100 }, viewport, 50, 4);
    expect(camera.x).toBe(0);
    expect(camera.y).toBe(0);
    expect(camera.scale).toBeCloseTo((800 - 100) / 600, 9);
  });

  it('never zooms in past the maximum', () => {
    expect(fitAround({ x: 0, y: 0 }, { x: 10, y: 10 }, viewport, 50, 1.25).scale).toBe(1.25);
  });

  it('fits into what the page\'s controls leave of the viewport, and centers there', () => {
    const camera = fitAround({ x: 0, y: 0 }, { x: 300, y: 100 }, viewport, 50, 4, { top: 0, right: 0, bottom: 100, left: 200 });
    // 600 × 500 px are left: 500 px across the 600 the extent needs.
    expect(camera.scale).toBeCloseTo(500 / 600, 9);
    // The center lands in the middle of them: 100 px right of the viewport's middle, 50 px above it.
    const center = worldToScreen(camera, viewport, { x: 0, y: 0 });
    expect(center.x).toBeCloseTo(500, 9);
    expect(center.y).toBeCloseTo(250, 9);
  });
});

describe('similarity transforms', () => {
  it('inverts and composes', () => {
    const placeChild = { scale: 0.25, x: 100, y: -40 };
    const point = { x: 12, y: 8 };
    const placed = applySimilarity(placeChild, point);
    expect(placed).toEqual({ x: 103, y: -38 });
    expect(applySimilarity(invertSimilarity(placeChild), placed)).toEqual(point);
    const twice = composeSimilarity(placeChild, placeChild);
    expect(applySimilarity(twice, point)).toEqual(applySimilarity(placeChild, applySimilarity(placeChild, point)));
  });

  it('expresses a camera in transformed coordinates so the screen does not change', () => {
    const camera = { x: 5, y: 7, scale: 3 };
    const transform = { scale: 0.5, x: 40, y: 10 };
    const moved = transformCamera(transform, camera);
    const worldPoint = { x: 9, y: -4 };
    const before = worldToScreen(camera, viewport, worldPoint);
    const after = worldToScreen(moved, viewport, applySimilarity(transform, worldPoint));
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });
});

describe('smoothZoomPath', () => {
  it('starts and ends exactly at the given cameras', () => {
    const from = { x: 0, y: 0, scale: 1 };
    const to = { x: 300, y: -120, scale: 4 };
    const path = smoothZoomPath(from, to, viewport);
    const start = path.at(0);
    const end = path.at(1);
    expect(start.x).toBeCloseTo(0, 6);
    expect(start.scale).toBeCloseTo(1, 6);
    expect(end.x).toBeCloseTo(300, 6);
    expect(end.y).toBeCloseTo(-120, 6);
    expect(end.scale).toBeCloseTo(4, 6);
  });

  it('zooms out mid-flight when travelling far at the same zoom', () => {
    const path = smoothZoomPath({ x: 0, y: 0, scale: 2 }, { x: 4000, y: 0, scale: 2 }, viewport);
    expect(path.at(0.5).scale).toBeLessThan(2);
    expect(path.length).toBeGreaterThan(0);
  });

  it('handles a pure zoom without travel', () => {
    const path = smoothZoomPath({ x: 5, y: 5, scale: 1 }, { x: 5, y: 5, scale: 8 }, viewport);
    expect(path.at(1).scale).toBeCloseTo(8, 6);
    expect(path.at(0.5).scale).toBeCloseTo(Math.sqrt(8), 6);
    expect(path.length).toBeGreaterThan(0);
  });
});
