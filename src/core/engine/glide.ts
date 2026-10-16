/**
 * Pan momentum for the overview. Like the orbit spin, the release velocity
 * is the least-squares slope of the last 80 ms of pointer movement, and the
 * glide slows down exponentially using the exact solution for each step.
 */

const VELOCITY_WINDOW = 80;
const STALE_AFTER = 50;
const SAMPLE_HISTORY = 160;

export interface Velocity {
  /** Pixels per millisecond. */
  x: number;

  y: number;
}

/** Tracks a dragged position over time and reports the release velocity. */
export class PointVelocityTracker {
  private samples: { time: number; x: number; y: number }[] = [];
  private x = 0;
  private y = 0;

  reset(time: number): void {
    this.x = 0;
    this.y = 0;
    this.samples = [{ time, x: 0, y: 0 }];
  }

  /** Records a movement of (`deltaX`, `deltaY`) pixels at `time` (milliseconds). */
  add(time: number, deltaX: number, deltaY: number): void {
    this.x += deltaX;
    this.y += deltaY;
    this.samples.push({ time, x: this.x, y: this.y });

    while (this.samples.length > 2 && time - this.samples[0].time > SAMPLE_HISTORY) {
      this.samples.shift();
    }
  }

  velocityAt(releaseTime: number): Velocity {
    const recent = this.samples.filter((sample) => releaseTime - sample.time <= VELOCITY_WINDOW);

    if (recent.length < 2 || releaseTime - recent[recent.length - 1].time > STALE_AFTER) {
      return { x: 0, y: 0 };
    }

    const meanTime = recent.reduce((sum, sample) => sum + sample.time, 0) / recent.length;
    const meanX = recent.reduce((sum, sample) => sum + sample.x, 0) / recent.length;
    const meanY = recent.reduce((sum, sample) => sum + sample.y, 0) / recent.length;
    let covarianceX = 0;
    let covarianceY = 0;
    let variance = 0;

    for (const sample of recent) {
      const time = sample.time - meanTime;
      covarianceX += time * (sample.x - meanX);
      covarianceY += time * (sample.y - meanY);
      variance += time * time;
    }

    if (variance === 0) {
      return { x: 0, y: 0 };
    }

    return { x: covarianceX / variance, y: covarianceY / variance };
  }
}

/** Fastest glide, in pixels per millisecond. */
const MAXIMUM_SPEED = 6;
/** Below this speed (pixels per millisecond) a glide stops. */
const STOP_SPEED = 0.02;

export class Glide {
  velocity: Velocity = { x: 0, y: 0 };
  private readonly timeConstant: number;

  /** `timeConstant` in milliseconds: how long the glide takes to lose about two thirds of its speed. */
  constructor(timeConstant = 325) {
    this.timeConstant = timeConstant;
  }

  get isMoving(): boolean {
    return Math.hypot(this.velocity.x, this.velocity.y) >= STOP_SPEED;
  }

  start(velocity: Velocity): void {
    const speed = Math.hypot(velocity.x, velocity.y);
    const scale = speed > MAXIMUM_SPEED ? MAXIMUM_SPEED / speed : 1;
    this.velocity = { x: velocity.x * scale, y: velocity.y * scale };
  }

  stop(): void {
    this.velocity = { x: 0, y: 0 };
  }

  /** Advances by `elapsed` milliseconds and returns the distance travelled, in pixels. */
  step(elapsed: number): { x: number; y: number } {
    const retained = Math.exp(-elapsed / this.timeConstant);
    const travelled = this.timeConstant * (1 - retained);
    const distance = { x: this.velocity.x * travelled, y: this.velocity.y * travelled };
    this.velocity = { x: this.velocity.x * retained, y: this.velocity.y * retained };

    if (!this.isMoving) {
      this.stop();
    }

    return distance;
  }
}
