/**
 * Spinner physics for the focus-mode orbit.
 *
 * Release speed comes from where the pointer actually was over the last
 * 80 ms, not from the last pointer event, so a lazy drag barely coasts and a
 * hard flick spins for several turns on any device. Coasting decays
 * exponentially using the exact solution for each step, so the result is the
 * same at 60 Hz, 120 Hz or any other frame rate.
 */

/** Degrees. `-180 < result <= 180`. */
export const normalizeDelta = (delta: number): number => {
  let result = delta % 360;

  if (result > 180) {
    result -= 360;
  } else if (result <= -180) {
    result += 360;
  }

  return result;
};

const VELOCITY_WINDOW = 80;
/** A pointer that rested this long before release flings nothing. */
const STALE_AFTER = 50;
const SAMPLE_HISTORY = 160;

/** Tracks a dragged angle over time and reports the release velocity. */
export class AngularVelocityTracker {
  private samples: { time: number; angle: number }[] = [];
  private lastRawAngle = 0;
  private unwrappedAngle = 0;

  reset(time: number, rawAngle: number): void {
    this.lastRawAngle = rawAngle;
    this.unwrappedAngle = rawAngle;
    this.samples = [{ time, angle: rawAngle }];
  }

  /** Records the pointer's angle (degrees) at `time` (milliseconds). Returns the change since the last sample. */
  add(time: number, rawAngle: number): number {
    const delta = normalizeDelta(rawAngle - this.lastRawAngle);
    this.lastRawAngle = rawAngle;
    this.unwrappedAngle += delta;
    this.samples.push({ time, angle: this.unwrappedAngle });

    while (this.samples.length > 2 && time - this.samples[0].time > SAMPLE_HISTORY) {
      this.samples.shift();
    }

    return delta;
  }

  /** Degrees per millisecond at `releaseTime`: the least-squares slope of the last 80 ms. */
  velocityAt(releaseTime: number): number {
    const recent = this.samples.filter((sample) => releaseTime - sample.time <= VELOCITY_WINDOW);

    if (recent.length < 2 || releaseTime - recent[recent.length - 1].time > STALE_AFTER) {
      return 0;
    }

    const meanTime = recent.reduce((sum, sample) => sum + sample.time, 0) / recent.length;
    const meanAngle = recent.reduce((sum, sample) => sum + sample.angle, 0) / recent.length;
    let covariance = 0;
    let variance = 0;

    for (const sample of recent) {
      covariance += (sample.time - meanTime) * (sample.angle - meanAngle);
      variance += (sample.time - meanTime) ** 2;
    }

    return variance === 0 ? 0 : covariance / variance;
  }
}

export interface SpinSettings {
  /** Time constant of the exponential slow-down, in seconds. */
  decay: number;

  /** Fastest coast, in degrees per second. */
  maxSpeed: number;

  /** Below this speed (degrees per second) a coast hands over to settling. */
  settleSpeed: number;

  /** Snap a planet to the top when settling. */
  snap: boolean;
}

export const DEFAULT_SPIN_SETTINGS: SpinSettings = {
  decay: 1.4,
  maxSpeed: 1440,
  settleSpeed: 30,
  snap: false,
};

export type SpinMode = 'idle' | 'dragging' | 'coasting' | 'settling';

/** Natural frequency of the settling spring, in radians per second (critically damped). */
const SETTLE_FREQUENCY = 10;

export class SpinPhysics {
  /** Rotation of the orbit, in degrees. */
  angle = 0;

  /** Degrees per millisecond. */
  velocity = 0;

  mode: SpinMode = 'idle';
  settings: SpinSettings;
  private settleTarget = 0;

  /** Angles (degrees) that put a planet at the top; used for snapping. */
  private slots: number[] = [];

  constructor(settings: Partial<SpinSettings> = {}) {
    this.settings = { ...DEFAULT_SPIN_SETTINGS, ...settings };
  }

  /** The finger is on the orbit: stops any coast. */
  grab(): void {
    this.mode = 'dragging';
    this.velocity = 0;
  }

  /** Rotates directly while dragging. */
  drag(delta: number): void {
    this.angle += delta;
  }

  /** Lets go with a velocity in degrees per millisecond. */
  release(velocity: number, slots: number[] = []): void {
    this.slots = slots;
    const limit = this.settings.maxSpeed / 1000;
    this.velocity = Math.max(-limit, Math.min(limit, velocity));

    if (Math.abs(this.velocity) * 1000 >= this.settings.settleSpeed) {
      this.mode = 'coasting';
    } else {
      this.beginSettling();
    }
  }

  /** Eases the orbit to the turn equivalent to `angle` (degrees) that is nearest to where it is now. */
  settleTo(angle: number): void {
    this.settleTarget = this.angle + normalizeDelta(angle - this.angle);
    this.mode = 'settling';
  }

  /** Stops immediately, wherever the orbit is. */
  stop(): void {
    this.mode = 'idle';
    this.velocity = 0;
  }

  get isMoving(): boolean {
    return this.mode === 'coasting' || this.mode === 'settling';
  }

  /** Advances by `elapsed` milliseconds. Returns whether the orbit is still moving. */
  step(elapsed: number): boolean {
    if (this.mode === 'coasting') {
      const timeConstant = this.settings.decay * 1000;
      const retained = Math.exp(-elapsed / timeConstant);
      // Exact integral of v·e^(−t/τ) over the step, so frame rate never matters.
      this.angle += this.velocity * timeConstant * (1 - retained);
      this.velocity *= retained;

      if (Math.abs(this.velocity) * 1000 < this.settings.settleSpeed) {
        this.beginSettling();
      }

      return true;
    }

    if (this.mode === 'settling') {
      return this.stepSettling(elapsed);
    }

    return false;
  }

  private beginSettling(): void {
    if (!this.settings.snap || this.slots.length === 0) {
      this.stop();
      return;
    }

    this.settleTarget = this.nearestSlot(this.angle);
    this.mode = 'settling';
  }

  private nearestSlot(angle: number): number {
    let best = angle;
    let bestDistance = Infinity;

    for (const slot of this.slots) {
      const distance = normalizeDelta(slot - angle);

      if (Math.abs(distance) < bestDistance) {
        bestDistance = Math.abs(distance);
        best = angle + distance;
      }
    }

    return best;
  }

  private stepSettling(elapsed: number): boolean {
    // Critically damped spring, integrated in 4 ms steps for stability.
    let remaining = elapsed / 1000;
    let velocity = this.velocity * 1000;

    while (remaining > 0) {
      const step = Math.min(remaining, 0.004);
      const offset = this.angle - this.settleTarget;
      const acceleration = -SETTLE_FREQUENCY * SETTLE_FREQUENCY * offset - 2 * SETTLE_FREQUENCY * velocity;
      velocity += acceleration * step;
      this.angle += velocity * step;
      remaining -= step;
    }

    this.velocity = velocity / 1000;

    if (Math.abs(this.angle - this.settleTarget) < 0.05 && Math.abs(velocity) < 0.5) {
      this.angle = this.settleTarget;
      this.stop();
      return false;
    }

    return true;
  }
}
