/**
 * One animation loop per map. Tasks (camera flights, spin, transitions,
 * glides) advance with real elapsed time, then the map paints once per
 * frame. The loop sleeps as soon as nothing is moving.
 */

/**
 * Advances one animation. Returns `true` while it still has work to do,
 * `false` once it's done, or `'hold'` to keep running without anything to
 * paint this frame (a motion too slow to show on every frame). A task that
 * throws is reported and dropped, so the loop carries on.
 */
export type FrameTask = (now: number, elapsed: number) => boolean | 'hold';

type Scheduler = (callback: (now: number) => void) => number;
type Canceller = (handle: number) => void;

/** Frames longer than this (a background tab, a debugger pause) count as this long. */
const LONGEST_FRAME = 64;

export class AnimationClock {
  private readonly paint: () => void;
  private readonly schedule: Scheduler;
  private readonly cancel: Canceller;
  private readonly tasks = new Set<FrameTask>();
  private frameHandle: number | null = null;
  private previousTime: number | null = null;
  private paintRequested = false;

  constructor(
    paint: () => void,
    schedule: Scheduler = (callback) => requestAnimationFrame(callback),
    cancel: Canceller = (handle) => cancelAnimationFrame(handle),
  ) {
    this.paint = paint;
    this.schedule = schedule;
    this.cancel = cancel;
  }

  /** Runs `task` every frame until it returns false. Returns a function that removes it. */
  add(task: FrameTask): () => void {
    this.tasks.add(task);
    this.wake();

    return () => {
      this.tasks.delete(task);
    };
  }

  /** Paints once on the next frame, without adding a task. */
  requestPaint(): void {
    this.paintRequested = true;
    this.wake();
  }

  get isRunning(): boolean {
    return this.frameHandle !== null;
  }

  stop(): void {
    if (this.frameHandle !== null) {
      this.cancel(this.frameHandle);
    }

    this.frameHandle = null;
    this.previousTime = null;
    this.tasks.clear();
    this.paintRequested = false;
  }

  private wake(): void {
    if (this.frameHandle === null) {
      this.frameHandle = this.schedule(this.tick);
    }
  }

  private readonly tick = (now: number): void => {
    const elapsed = this.previousTime === null ? 1000 / 60 : Math.min(LONGEST_FRAME, Math.max(0, now - this.previousTime));
    this.previousTime = now;
    let changed = this.paintRequested;

    for (const task of Array.from(this.tasks)) {
      let result: boolean | 'hold';

      try {
        result = task(now, elapsed);
      } catch (error) {
        // A task that threw is done: the rest of the loop carries on.
        console.error('[orbit] An animation task threw:', error);
        result = false;
      }

      if (result === false) {
        this.tasks.delete(task);
      }

      changed ||= result !== 'hold';
    }

    this.paintRequested = false;

    if (changed) {
      try {
        this.paint();
      } catch (error) {
        console.error('[orbit] Painting the map threw:', error);
      }
    }

    if (this.tasks.size > 0 || this.paintRequested) {
      this.frameHandle = this.schedule(this.tick);
    } else {
      this.frameHandle = null;
      this.previousTime = null;
    }
  };
}

/** Ease-in-out cubic, for camera flights and node morphs. */
export const easeInOutCubic = (progress: number): number => {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - (-2 * progress + 2) ** 3 / 2;
};

/** Ease-out cubic, for entrances and small settles. */
export const easeOutCubic = (progress: number): number => {
  return 1 - (1 - progress) ** 3;
};

/** Maps `progress` from the window [start, end] to [0, 1], clamped. */
export const within = (progress: number, start: number, end: number): number => {
  if (progress <= start) {
    return 0;
  }

  if (progress >= end) {
    return 1;
  }

  return (progress - start) / (end - start);
};

export const interpolate = (from: number, to: number, progress: number): number => {
  return from + (to - from) * progress;
};
