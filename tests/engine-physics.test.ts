import { describe, expect, it, spyOn } from 'bun:test';
import { AnimationClock } from '../src/core/engine/animation-clock';
import { AngularVelocityTracker, normalizeDelta, SpinPhysics } from '../src/core/engine/spin';

/** Simulates a drag of `sweep` degrees over `duration` ms, sampled `events` times. */
const trackDrag = (sweep: number, duration: number, events: number, pauseBeforeRelease = 0): number => {
  const tracker = new AngularVelocityTracker();
  tracker.reset(0, 0);

  for (let index = 1; index <= events; index += 1) {
    const time = (duration * index) / events;
    tracker.add(time, normalizeDelta((sweep * index) / events));
  }

  return tracker.velocityAt(duration + pauseBeforeRelease);
};

/** Runs a release to rest at a fixed frame interval and returns how far it coasted. */
const coast = (velocity: number, frameInterval: number, settings = {}): number => {
  const spin = new SpinPhysics(settings);
  spin.release(velocity);
  let guard = 0;

  while (spin.step(frameInterval) && guard < 100000) {
    guard += 1;
  }

  return spin.angle;
};

describe('release velocity', () => {
  it('measures speed per unit of time, whatever the pointer event rate', () => {
    const fewEvents = trackDrag(120, 80, 4);
    const manyEvents = trackDrag(120, 80, 24);
    expect(fewEvents * 1000).toBeCloseTo(1500, -1);
    expect(manyEvents * 1000).toBeCloseTo(1500, -1);
  });

  it('tells a lazy drag from a hard flick', () => {
    expect(trackDrag(120, 800, 24) * 1000).toBeCloseTo(150, -1);
    expect(trackDrag(120, 80, 24) * 1000).toBeCloseTo(1500, -1);
  });

  it('flings nothing when the pointer rested before release', () => {
    expect(trackDrag(120, 80, 24, 120)).toBe(0);
  });

  it('follows the angle across the ±180° seam', () => {
    const tracker = new AngularVelocityTracker();
    tracker.reset(0, 170);
    tracker.add(10, -175);
    tracker.add(20, -160);
    expect(tracker.velocityAt(20) * 1000).toBeCloseTo(1500, -1);
  });
});

describe('coasting', () => {
  it('spins several turns after a hard flick and barely moves after a lazy drag', () => {
    expect(coast(1.5, 1000 / 60) / 360).toBeGreaterThan(3);
    expect(coast(0.15, 1000 / 60) / 360).toBeLessThan(0.6);
  });

  it('coasts the same distance at 60 Hz and 120 Hz', () => {
    const at60 = coast(1, 1000 / 60);
    const at120 = coast(1, 1000 / 120);
    expect(Math.abs(at60 - at120) / at60).toBeLessThan(0.01);
  });

  it('caps the speed', () => {
    const spin = new SpinPhysics({ maxSpeed: 720 });
    spin.release(10);
    expect(spin.velocity * 1000).toBe(720);
  });

  it('stops dead when grabbed', () => {
    const spin = new SpinPhysics();
    spin.release(1);
    spin.step(100);
    spin.grab();
    expect(spin.velocity).toBe(0);
    expect(spin.step(16)).toBe(false);
  });
});

describe('prize-wheel snapping', () => {
  it('settles exactly on the nearest slot', () => {
    const spin = new SpinPhysics({ snap: true });
    const slots = [0, 90, 180, 270];
    spin.release(0.9, slots);
    let guard = 0;

    while (spin.step(1000 / 60) && guard < 100000) {
      guard += 1;
    }

    const remainder = ((spin.angle % 90) + 90) % 90;
    expect(Math.min(remainder, 90 - remainder)).toBeLessThan(0.06);
    expect(spin.mode).toBe('idle');
  });
});

describe('AnimationClock', () => {
  it('runs tasks with elapsed time, paints once per frame and sleeps when idle', () => {
    const frames: ((now: number) => void)[] = [];
    let paints = 0;

    const clock = new AnimationClock(() => {
      paints += 1;
    }, (callback) => frames.push(callback), () => {});

    const elapsedSeen: number[] = [];
    let remaining = 3;

    clock.add((_, elapsed) => {
      elapsedSeen.push(elapsed);
      remaining -= 1;
      return remaining > 0;
    });

    let now = 1000;

    while (frames.length > 0) {
      const next = frames.shift()!;
      now += 20;
      next(now);
    }

    expect(paints).toBe(3);
    expect(elapsedSeen.slice(1)).toEqual([20, 20]);
    expect(clock.isRunning).toBe(false);
  });

  it('keeps a task that holds running without painting its frames', () => {
    const frames: ((now: number) => void)[] = [];
    let paints = 0;

    const clock = new AnimationClock(() => {
      paints += 1;
    }, (callback) => frames.push(callback), () => {});

    let frame = 0;

    clock.add(() => {
      frame += 1;

      if (frame === 6) {
        return false;
      }

      return frame % 3 === 0 ? true : 'hold';
    });

    let now = 1000;

    while (frames.length > 0) {
      now += 16;
      frames.shift()!(now);
    }

    // Frames 3 and 6 changed something: the one that moved, and the last.
    expect(frame).toBe(6);
    expect(paints).toBe(2);
    expect(clock.isRunning).toBe(false);
  });

  it('drops a task that throws, reports it, and still wakes for new work', () => {
    const frames: ((now: number) => void)[] = [];
    let paints = 0;

    const clock = new AnimationClock(() => {
      paints += 1;
    }, (callback) => frames.push(callback), () => {});

    const errors = spyOn(console, 'error').mockImplementation(() => {});
    let ticks = 0;

    clock.add(() => {
      ticks += 1;

      if (ticks === 2) {
        throw new Error('boom');
      }

      return ticks < 5;
    });

    let now = 1000;

    while (frames.length > 0) {
      now += 16;
      frames.shift()!(now);
    }

    // The task threw once and was dropped; its first frame painted, and the throw's frame did too.
    expect(ticks).toBe(2);
    expect(paints).toBe(2);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(clock.isRunning).toBe(false);
    clock.requestPaint();
    now += 16;
    frames.shift()!(now);
    expect(paints).toBe(3);
    errors.mockRestore();
  });

  it('reports a paint that throws and keeps the loop alive', () => {
    const frames: ((now: number) => void)[] = [];
    let paints = 0;

    const clock = new AnimationClock(() => {
      paints += 1;

      if (paints === 1) {
        throw new Error('boom');
      }
    }, (callback) => frames.push(callback), () => {});

    const errors = spyOn(console, 'error').mockImplementation(() => {});
    let ticks = 0;

    clock.add(() => {
      ticks += 1;
      return ticks < 3;
    });

    let now = 1000;

    while (frames.length > 0) {
      now += 16;
      frames.shift()!(now);
    }

    expect(ticks).toBe(3);
    expect(paints).toBe(3);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(clock.isRunning).toBe(false);
    errors.mockRestore();
  });
});
