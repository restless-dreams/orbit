/**
 * A live photo in the media viewer: the picture's motion, the few seconds of
 * video a phone records around it, laid exactly over the picture and played
 * there. As the viewer shows the picture, the motion plays once, muted, and
 * settles back on the picture with a cross-fade; when the phone said where
 * in the motion the picture was taken (`still`), it ends there, on the
 * picture itself. Pressed and held (the picture, its mark or the space bar),
 * it plays from the start with its sound, and letting go settles it back; a
 * quick press plays it through once.
 *
 * Its mark, a pill with Orbit's rings and "Live" over the picture's corner,
 * is the control screen readers and keyboards use. With reduced motion the
 * motion plays only when asked. The video loads only once it's needed, and a
 * motion that can't be played leaves the picture as it is, without its mark.
 */

import type { OrbitNode } from '../types.js';
import type { OrbitWords } from '../languages.js';
import { guardUrl } from '../url-guard.js';
import { hasMediaSource } from '../media.js';
import { createIcon } from './icons.js';
import { StateReporter, type PlaybackState } from './media-players.js';

export interface LivePhotoOptions {
  /** The motion's address, allowed and resolved. */
  source: string;

  /** Where in the motion the picture was taken, in seconds, when the phone said so. */
  still?: number;

  words: OrbitWords;

  /** Whether its mark takes presses: on a map that isn't interactive, the page drives the viewer. */
  controls: boolean;

  /** The motion can't be played: the viewer goes on showing the picture alone. */
  onUnavailable(): void;

  /** The motion started, paused, moved on, ended or was muted, as a video's player says it. */
  onState?(state: PlaybackState): void;
}

/** The box the picture is drawn in, on the stage, before its zoom. */
export interface PictureBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A press shorter than this (ms) is a tap, which plays the motion through once; letting go of a longer one settles it back. */
export const HOLD_TIME = 300;
/** The motion that plays as the viewer shows the picture starts this long (ms) after it, once both have loaded… */
export const OPENING_DELAY = 400;
/** …and not at all if the motion isn't ready by this long after (ms): it waits to be asked instead of surprising the reader. */
export const OPENING_PATIENCE = 4000;
/** An opening that would end at a still this close to the start (s) plays the whole motion instead. */
const SHORTEST_OPENING = 0.5;
/** How near the still (s) the opening has to come before it stops there. */
const STILL_REACHED = 0.02;
/** A click this soon (ms) after a press of the mark ends is the press's own: browsers send one after a tap, sometimes a moment later. */
const PRESS_CLICK = 1000;

/** A picture's live photo motion, at a URL allowed there; null for a picture without one. */
export const liveMotion = (image: OrbitNode['image']): string | null => {
  const motion = image?.motion;
  return hasMediaSource(motion) ? guardUrl(motion.src, 'motion') : null;
};

/** How the motion is playing: as the viewer shows the picture, while a press holds it, or through once. */
type Playing = 'opening' | 'held' | 'once';

const MOTION_EVENTS = ['canplay', 'playing', 'waiting', 'ended', 'error'] as const;
/** What the motion's video does that its state follows. */
const STATE_EVENTS = ['loadedmetadata', 'durationchange', 'play', 'playing', 'pause', 'ended', 'seeked', 'timeupdate', 'volumechange'] as const;

export class LivePhoto {
  /** The mark: shown once the picture is, at its top left corner (`placeMark`). */
  readonly mark: HTMLButtonElement;

  private readonly options: LivePhotoOptions;
  private readonly picture: HTMLImageElement;
  private readonly word: HTMLElement;

  /** The motion, made the first time it's needed. */
  private video: HTMLVideoElement | null = null;

  private playing: Playing | null = null;
  private ready = false;
  private failed = false;
  private pictureShown = false;

  /** The opening is waited for: asked for, and not given up on. */
  private opening = false;

  private openingDue = false;

  /** When the press that's playing began (`performance.now()`), to tell a tap from a hold. */
  private pressedAt = 0;

  /** A press on the mark, by a finger, the mouse or a key, is playing it: the click that ends the press is already handled. */
  private markPressed = false;

  /** When that press ended. */
  private markReleasedAt = 0;

  private markPointer: number | null = null;

  /** The page asked for its sound (`unmute`): every play has it from then on, the opening too. */
  private withSound = false;

  private readonly reporter: StateReporter | null;
  private box: PictureBox | null = null;
  private transform = '';
  private gliding = false;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private stillTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(picture: HTMLImageElement, options: LivePhotoOptions) {
    this.picture = picture;
    this.options = options;
    this.reporter = options.onState ? new StateReporter((state) => options.onState?.(state)) : null;

    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'orbit-viewer__live';
    mark.hidden = true;
    this.word = document.createElement('span');
    this.word.className = 'orbit-viewer__live-word';
    mark.append(createIcon('live'), this.word);
    mark.addEventListener('pointerdown', this.handleMarkDown);
    mark.addEventListener('pointerup', this.handleMarkUp);
    mark.addEventListener('pointercancel', this.handleMarkUp);
    mark.addEventListener('click', this.handleMarkClick);
    mark.addEventListener('keydown', this.handleMarkKeyDown);
    mark.addEventListener('keyup', this.handleMarkKeyUp);
    // A long press on a touch screen plays the motion, instead of opening the browser's menu.
    mark.addEventListener('contextmenu', (event) => event.preventDefault());
    this.mark = mark;
    this.relabel(options.words);
    this.setControls(options.controls);
  }

  /** The picture is drawn: the mark shows, and the motion can play over it. */
  showPicture(): void {
    if (this.failed) {
      return;
    }

    this.pictureShown = true;
    this.mark.hidden = false;
    this.startOpening();
  }

  /** Plays the motion once, muted, as the viewer shows the picture: loads it now, and starts it once both are ready. */
  open(): void {
    if (this.failed) {
      return;
    }

    this.opening = true;
    this.load();

    this.later(() => {
      this.openingDue = true;
      this.startOpening();
    }, OPENING_DELAY);

    this.later(() => {
      this.opening = false;
    }, OPENING_PATIENCE);
  }

  /** The reader got there first, pressing the picture to swipe, zoom or hold it: the opening that hasn't started won't. */
  skipOpening(): void {
    this.opening = false;
  }

  /**
   * A press began, at `startedAt` (`performance.now()`): the motion plays
   * from the start with its sound. Letting go (`release`) settles it back,
   * unless the press was a tap: then it plays through once.
   */
  press(startedAt = now()): void {
    this.pressedAt = startedAt;
    this.play('held');
  }

  /** The press ended. */
  release(): void {
    if (this.playing !== 'held') {
      return;
    }

    if (now() - this.pressedAt < HOLD_TIME) {
      this.playing = 'once';
    } else {
      this.settle();
    }
  }

  /** Plays the motion through once, with its sound: a press of the mark from assistive technology. */
  playOnce(): void {
    this.play('once');
  }

  /**
   * Its sound from now on: the motion playing now plays it, and so does
   * the opening, if it hasn't started. A browser that won't play sound
   * without a press plays it silent, as it would anyway.
   */
  unmute(): void {
    this.withSound = true;

    if (this.video && this.playing !== null) {
      this.video.muted = false;
    }
  }

  /** What the motion is doing, as a video's player says it: from the start, it hasn't played. */
  get state(): PlaybackState {
    const video = this.video;
    return {
      playing: video !== null && !video.paused && !video.ended,
      time: video?.currentTime ?? 0,
      duration: video && Number.isFinite(video.duration) ? video.duration : null,
      ended: video?.ended ?? false,
      muted: video?.muted ?? !this.withSound,
    };
  }

  /** Back to the picture, with a cross-fade. */
  settle(): void {
    this.playing = null;
    this.opening = false;
    this.clearStillTimer();
    this.video?.pause();
    this.show(false);
    this.mark.classList.remove('orbit-viewer__live--playing');
  }

  /** The picture's box on the stage, before its zoom: the motion takes the same. */
  place(box: PictureBox): void {
    this.box = box;
    this.drawBox();
  }

  /** The picture's zoom, as its transform: the motion follows it, gliding when it glides. */
  follow(transform: string, gliding: boolean): void {
    this.transform = transform;
    this.gliding = gliding;
    this.drawTransform();
  }

  /** Puts the mark at (`x`, `y`) on the stage, gliding there with the picture's zoom. */
  placeMark(x: number, y: number, gliding: boolean): void {
    this.mark.classList.toggle('orbit-viewer__live--gliding', gliding);
    this.mark.style.transform = `translate(${round(x)}px, ${round(y)}px)`;
  }

  setControls(controls: boolean): void {
    this.mark.disabled = !controls;
  }

  /** Writes the mark's words in `words`: the map's language changed. */
  relabel(words: OrbitWords): void {
    this.word.textContent = words.text('live');
    this.mark.setAttribute('aria-label', words.text('playLivePhoto'));
    this.mark.title = words.text('holdToPlay');
  }

  /** Lets go of the motion: it stops, and its download with it. */
  destroy(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.clearStillTimer();
    this.playing = null;
    this.removeVideo();
    this.mark.remove();
  }

  // Playing

  private play(playing: Playing): void {
    if (this.failed) {
      return;
    }

    const video = this.load();
    this.clearStillTimer();
    this.playing = playing;
    this.opening = false;
    video.muted = playing === 'opening' && !this.withSound;

    try {
      video.currentTime = 0;
    } catch {
      // Not seekable yet: a motion that hasn't loaded starts at its start anyway.
    }

    this.mark.classList.add('orbit-viewer__live--playing');
    const attempt = video.play() as Promise<void> | undefined;
    attempt?.catch?.((error: unknown) => this.refused(error, playing));
  }

  /** `play()` was refused: without a press, a browser may not play sound, or anything at all. */
  private refused(error: unknown, playing: Playing): void {
    const video = this.video;

    if (!video || this.playing !== playing) {
      return;
    }

    const name = error instanceof Error || (typeof error === 'object' && error !== null) ? (error as { name?: string }).name : undefined;

    if (name === 'AbortError') {
      // Paused or let go of before it started: nothing to do.
      return;
    }

    if (name === 'NotAllowedError' && !video.muted) {
      // The motion still plays, without its sound.
      video.muted = true;
      const again = video.play() as Promise<void> | undefined;
      again?.catch?.(() => this.settle());
      return;
    }

    if (name === 'NotSupportedError') {
      this.fail();
      return;
    }

    this.settle();
  }

  /** The opening starts once it's due, the picture is drawn and the motion can play, unless something else has. */
  private startOpening(): void {
    if (this.opening && this.openingDue && this.pictureShown && this.ready && this.playing === null) {
      this.play('opening');
    }
  }

  /** Where the opening ends: the still, when the phone said where it is and it isn't right at either end. */
  private openingEnd(): number | null {
    const still = this.options.still;
    const duration = this.video?.duration;

    if (still === undefined || still < SHORTEST_OPENING) {
      return null;
    }

    if (typeof duration === 'number' && Number.isFinite(duration) && still >= duration - STILL_REACHED) {
      return null;
    }

    return still;
  }

  /** Stops the opening at the still, so the motion settles on the picture itself. */
  private watchForStill(): void {
    const end = this.openingEnd();
    const video = this.video;
    this.clearStillTimer();

    if (this.playing !== 'opening' || end === null || !video) {
      return;
    }

    const remaining = end - video.currentTime;

    if (remaining <= STILL_REACHED) {
      this.settle();
      return;
    }

    const rate = video.playbackRate > 0 ? video.playbackRate : 1;
    this.stillTimer = setTimeout(() => this.watchForStill(), (remaining / rate) * 1000);
  }

  private clearStillTimer(): void {
    if (this.stillTimer !== null) {
      clearTimeout(this.stillTimer);
      this.stillTimer = null;
    }
  }

  private readonly handleVideoEvent = (event: Event): void => {
    switch (event.type) {
      case 'canplay':
        this.ready = true;
        this.startOpening();
        break;
      case 'playing':
        this.revealed();
        break;
      case 'waiting':
        // It waits for more of itself: the still is further away than the clock says.
        this.clearStillTimer();
        break;
      case 'ended':
        this.settle();
        break;
      case 'error':
        this.fail();
        break;
    }
  };

  /** It plays: it shows over the picture from its first frame, so the picture never flashes away first. */
  private revealed(): void {
    const video = this.video;

    if (!video || this.playing === null) {
      return;
    }

    this.watchForStill();
    const frames = (video as { requestVideoFrameCallback?: (callback: () => void) => number }).requestVideoFrameCallback;

    if (typeof frames === 'function') {
      frames.call(video, () => {
        if (this.video === video && this.playing !== null) {
          this.show(true);
        }
      });
    } else {
      this.show(true);
    }
  }

  private show(shown: boolean): void {
    this.video?.classList.toggle('orbit-viewer__motion--shown', shown);
  }

  /** The motion can't be played: the picture stays, without its mark, and nothing is said. */
  private fail(): void {
    if (this.failed) {
      return;
    }

    this.failed = true;
    this.playing = null;
    this.opening = false;
    this.clearStillTimer();
    this.removeVideo();
    this.mark.remove();
    this.options.onUnavailable();
  }

  // The video

  /** The motion's video, made and loading from the first time it's needed. */
  private load(): HTMLVideoElement {
    if (this.video) {
      return this.video;
    }

    const video = document.createElement('video');
    video.className = 'orbit-viewer__motion';
    // The picture is what it shows, and the mark is how to play it.
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('disablepictureinpicture', '');
    video.setAttribute('disableremoteplayback', '');
    video.preload = 'auto';

    for (const type of MOTION_EVENTS) {
      video.addEventListener(type, this.handleVideoEvent);
    }

    if (this.reporter) {
      for (const type of STATE_EVENTS) {
        video.addEventListener(type, this.reportState);
      }
    }

    video.src = this.options.source;
    this.picture.after(video);
    this.video = video;
    this.drawBox();
    this.drawTransform();
    return video;
  }

  private readonly reportState = (): void => {
    this.reporter?.report(this.state);
  };

  private drawBox(): void {
    const video = this.video;
    const box = this.box;

    if (!video) {
      return;
    }

    // Nothing until the picture has a box: a video takes its own size otherwise.
    video.style.left = `${round(box?.left ?? 0)}px`;
    video.style.top = `${round(box?.top ?? 0)}px`;
    video.style.width = `${round(box?.width ?? 0)}px`;
    video.style.height = `${round(box?.height ?? 0)}px`;
  }

  /** The picture's zoom, as it changes: on every frame of a pinch or a drag, so only the transform. */
  private drawTransform(): void {
    const video = this.video;

    if (!video) {
      return;
    }

    video.style.transform = this.transform;
    video.classList.toggle('orbit-viewer__motion--gliding', this.gliding);
  }

  private removeVideo(): void {
    const video = this.video;

    if (!video) {
      return;
    }

    this.video = null;

    for (const type of MOTION_EVENTS) {
      video.removeEventListener(type, this.handleVideoEvent);
    }

    video.pause();
    // Letting go of the source stops the download too.
    video.removeAttribute('src');

    try {
      video.load();
    } catch {
      // Some environments can't load media at all.
    }

    video.remove();
  }

  /** Runs `callback` after `delay` ms, unless the live photo goes away first. */
  private later(callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);

    this.timers.add(timer);
  }

  // The mark

  private readonly handleMarkDown = (event: PointerEvent): void => {
    if (this.mark.disabled || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    this.markPointer = event.pointerId;
    this.markPressed = true;

    try {
      this.mark.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is optional (some test environments lack it).
    }

    this.press();
  };

  private readonly handleMarkUp = (event: PointerEvent): void => {
    if (this.markPointer !== event.pointerId) {
      return;
    }

    this.markPointer = null;
    this.markReleasedAt = now();
    this.release();
  };

  private readonly handleMarkClick = (event: MouseEvent): void => {
    event.stopPropagation();
    const pressed = this.markPressed && now() - this.markReleasedAt < PRESS_CLICK;
    this.markPressed = false;

    // Otherwise a press of the button from assistive technology, which sends the click alone.
    if (!pressed && !this.mark.disabled) {
      this.playOnce();
    }
  };

  /** The space bar and Enter on the mark press it, as a finger does: held, it plays until they're let go. */
  private readonly handleMarkKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!event.repeat && !this.mark.disabled) {
      this.markPressed = true;
      this.press();
    }
  };

  private readonly handleMarkKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.markReleasedAt = now();
    this.release();
  };
}

const now = (): number => {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
};

const round = (value: number): number => {
  return Math.round(value * 100) / 100;
};
