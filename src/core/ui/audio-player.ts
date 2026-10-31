/**
 * A sound's player, Orbit's own: a play button, where the sound is (to drag
 * or step with the arrow keys) and its time, over an `<audio>` element
 * without the browser's controls, so it looks the same in every browser and
 * takes the map's theme. The detail sheet shows it on one line; the media
 * viewer shows it big, under the sound's art, with ten seconds back and on
 * and its sound off or on.
 */

import type { OrbitWords } from '../languages.js';
import { createIcon, type IconName } from './icons.js';
import { StateReporter, type MediaPlayer, type PlaybackState } from './media-players.js';

export interface AudioPlayerOptions {
  /** The sound's address, allowed and resolved. */
  source: string;

  /** Start playing as soon as it can. */
  autoplay: boolean;

  /** Whether its buttons take presses: without them, the page drives it (`play`, `pause`, `seek`). */
  controls: boolean;

  /** Seconds into the sound to start at. */
  startAt?: number;

  /** The sound's name, for assistive technology. */
  title: string;

  words: OrbitWords;

  /** `inline`, on one line, for the detail sheet; `stage`, big, for the media viewer. */
  size: 'inline' | 'stage';

  /** It played, paused, moved on, ended or was muted. */
  onState(state: PlaybackState): void;

  /** The sound couldn't be played. */
  onError(): void;
}

/** The skip buttons, and J and L in the media viewer, go this far (seconds). */
export const SKIP_SECONDS = 10;

const AUDIO_EVENTS = ['loadedmetadata', 'durationchange', 'play', 'playing', 'pause', 'ended', 'seeked', 'timeupdate', 'volumechange', 'waiting', 'canplay', 'error'];

/**
 * A time as players write it: `0:42`, `3:05`, `1:02:09`. Unknown times, and
 * the length of a stream, are `--:--`.
 */
export const formatPlaybackTime = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

export class AudioPlayer implements MediaPlayer {
  readonly element: HTMLElement;
  readonly ratio = 1;
  readonly controllable = true;
  private readonly audio: HTMLAudioElement;
  private readonly options: AudioPlayerOptions;
  private readonly reporter: StateReporter;
  private readonly toggle: HTMLButtonElement;
  private readonly position: HTMLInputElement;
  private readonly time: HTMLElement;
  private readonly length: HTMLElement;
  private readonly soundButton: HTMLButtonElement | null = null;
  private readonly skipButtons: { back: HTMLButtonElement; forward: HTMLButtonElement } | null = null;
  private readonly buttons: HTMLButtonElement[] = [];
  private startAt: number;

  /** The words its buttons and slider say, in the map's language (see `relabel`). */
  private words: OrbitWords;

  /** The slider is held: the sound jumps where it's let go, and the time follows the thumb meanwhile. */
  private scrubbing = false;

  /** What's drawn, so a frame that changes nothing writes nothing. */
  private drawn = { playing: false, waiting: false, muted: false, time: '', valueText: '', length: '', progress: '' };

  constructor(options: AudioPlayerOptions) {
    this.options = options;
    this.reporter = new StateReporter(options.onState);
    this.startAt = Number.isFinite(options.startAt) ? Math.max(0, options.startAt as number) : 0;
    this.words = options.words;
    const words = options.words;

    const root = element('div', `orbit-audio orbit-audio--${options.size}`);
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', options.title);
    this.element = root;

    const audio = document.createElement('audio');
    audio.className = 'orbit-audio__element';
    audio.preload = 'metadata';
    this.audio = audio;

    this.toggle = this.button('play', words.text('play'), 'orbit-audio__toggle', () => this.togglePlayback());

    const track = element('div', 'orbit-audio__track');
    const position = document.createElement('input');
    position.type = 'range';
    position.className = 'orbit-audio__position';
    position.min = '0';
    position.max = '0';
    position.step = 'any';
    position.value = '0';
    position.setAttribute('aria-label', words.text('playbackPosition'));
    position.addEventListener('input', this.handleScrub);
    position.addEventListener('change', this.handleScrubEnd);

    position.addEventListener('pointerdown', () => {
      this.scrubbing = true;
    });

    position.addEventListener('keydown', this.handlePositionKey);
    this.position = position;

    const times = element('div', 'orbit-audio__times');
    this.time = element('span', 'orbit-audio__time');
    this.length = element('span', 'orbit-audio__length');
    times.append(this.time, this.length);
    track.append(position, times);

    if (options.size === 'stage') {
      const back = this.button('skip-back', words.count('skipBack', SKIP_SECONDS), 'orbit-audio__skip', () => this.skip(-SKIP_SECONDS));
      const forward = this.button('skip-forward', words.count('skipForward', SKIP_SECONDS), 'orbit-audio__skip', () => this.skip(SKIP_SECONDS));

      // How far they go, inside their arrows.
      for (const skip of [back, forward]) {
        const seconds = element('span', 'orbit-audio__skip-seconds');
        seconds.textContent = String(SKIP_SECONDS);
        seconds.setAttribute('aria-hidden', 'true');
        skip.appendChild(seconds);
      }

      this.skipButtons = { back, forward };
      this.soundButton = this.button('sound-on', words.text('mute'), 'orbit-audio__sound', () => this.toggleMute());
      const row = element('div', 'orbit-audio__buttons');
      row.append(back, this.toggle, forward);
      const tools = element('div', 'orbit-audio__tools');
      tools.append(this.soundButton);
      root.append(audio, track, row, tools);
    } else {
      root.append(audio, this.toggle, track);
    }

    this.setControls(options.controls);

    for (const type of AUDIO_EVENTS) {
      audio.addEventListener(type, this.handleEvent);
    }

    audio.src = options.source;
    this.draw();

    if (options.autoplay) {
      this.play();
    }
  }

  get state(): PlaybackState {
    const audio = this.audio;
    return {
      playing: !audio.paused && !audio.ended,
      time: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null,
      ended: audio.ended,
      muted: audio.muted,
    };
  }

  play(): void {
    const attempt = this.audio.play() as Promise<void> | undefined;

    // A browser that won't start a sound before the reader has pressed something keeps it paused: its play button is right there.
    attempt?.catch?.(() => this.draw());
  }

  pause(): void {
    this.audio.pause();
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) {
      return;
    }

    const duration = this.state.duration;
    this.audio.currentTime = Math.max(0, duration === null ? seconds : Math.min(seconds, duration));
    this.draw();
  }

  /** Goes `seconds` back (below 0) or on from where it is. */
  skip(seconds: number): void {
    this.seek(this.state.time + seconds);
  }

  unmute(): void {
    this.audio.muted = false;

    if (this.audio.volume === 0) {
      this.audio.volume = 1;
    }
  }

  toggleMute(): void {
    if (this.audio.muted) {
      this.unmute();
    } else {
      this.audio.muted = true;
    }
  }

  togglePlayback(): void {
    if (this.state.playing) {
      this.pause();
    } else {
      // At its end, it starts over.
      if (this.audio.ended) {
        this.audio.currentTime = 0;
      }

      this.play();
    }
  }

  setControls(controls: boolean): void {
    this.element.classList.toggle('orbit-audio--still', !controls);

    for (const button of this.buttons) {
      button.disabled = !controls;
    }

    this.position.disabled = !controls;
  }

  /** Writes what its buttons and slider say in `words`: the map's language changed. */
  relabel(words: OrbitWords): void {
    this.words = words;
    setLabel(this.toggle, words.text(this.drawn.playing ? 'pause' : 'play'));
    this.position.setAttribute('aria-label', words.text('playbackPosition'));

    if (this.skipButtons) {
      setLabel(this.skipButtons.back, words.count('skipBack', SKIP_SECONDS));
      setLabel(this.skipButtons.forward, words.count('skipForward', SKIP_SECONDS));
    }

    if (this.soundButton) {
      setLabel(this.soundButton, words.text(this.drawn.muted ? 'unmute' : 'mute'));
    }

    this.drawTime(this.scrubbing ? Number(this.position.value) : this.state.time);
  }

  destroy(): void {
    const audio = this.audio;

    for (const type of AUDIO_EVENTS) {
      audio.removeEventListener(type, this.handleEvent);
    }

    audio.pause();
    // Letting go of the source stops the download too.
    audio.removeAttribute('src');

    try {
      audio.load();
    } catch {
      // Some environments can't load media at all.
    }
  }

  private button(icon: IconName, label: string, className: string, onClick: () => void): HTMLButtonElement {
    const button = element('button', `orbit-audio__button ${className}`);
    button.type = 'button';
    setLabel(button, label);
    button.appendChild(createIcon(icon));

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });

    this.buttons.push(button);
    return button;
  }

  private readonly handleEvent = (event: Event): void => {
    const audio = this.audio;

    if (event.type === 'error') {
      this.element.classList.add('orbit-audio--failed');
      this.options.onError();
      return;
    }

    if (event.type === 'loadedmetadata' && this.startAt > 0) {
      audio.currentTime = this.startAt;
      this.startAt = 0;
    }

    this.draw(event.type === 'waiting' ? true : event.type === 'playing' || event.type === 'canplay' || event.type === 'pause' ? false : undefined);
    this.reporter.report(this.state);
  };

  private readonly handleScrub = (): void => {
    this.scrubbing = true;
    this.drawTime(Number(this.position.value));
  };

  private readonly handleScrubEnd = (): void => {
    this.scrubbing = false;
    this.seek(Number(this.position.value));
  };

  /** The slider's arrow keys go five seconds, Page Up and Down the skip's ten, Home and End to either end. */
  private readonly handlePositionKey = (event: KeyboardEvent): void => {
    const steps: Record<string, number> = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -SKIP_SECONDS, PageUp: SKIP_SECONDS };
    const step = steps[event.key];

    if (step !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      this.skip(step);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      this.seek(event.key === 'Home' ? 0 : this.state.duration ?? 0);
    }
  };

  /** Writes what changed: the play button, the slider and the time. `waiting` is set while the sound waits for more of itself. */
  private draw(waiting?: boolean): void {
    const state = this.state;
    const words = this.words;
    const drawn = this.drawn;

    if (state.playing !== drawn.playing) {
      drawn.playing = state.playing;
      this.toggle.replaceChildren(createIcon(state.playing ? 'pause' : 'play'));
      setLabel(this.toggle, words.text(state.playing ? 'pause' : 'play'));
      this.element.classList.toggle('orbit-audio--playing', state.playing);
    }

    if (waiting !== undefined && waiting !== drawn.waiting) {
      drawn.waiting = waiting;
      this.element.classList.toggle('orbit-audio--waiting', waiting);
    }

    if (this.soundButton && state.muted !== drawn.muted) {
      drawn.muted = state.muted;
      this.soundButton.replaceChildren(createIcon(state.muted ? 'sound-off' : 'sound-on'));
      setLabel(this.soundButton, words.text(state.muted ? 'unmute' : 'mute'));
    }

    const length = formatPlaybackTime(state.duration);

    if (length !== drawn.length) {
      drawn.length = length;
      this.length.textContent = length;
      this.position.max = String(state.duration ?? 0);
    }

    if (!this.scrubbing) {
      this.position.value = String(state.time);
      this.drawTime(state.time);
    }
  }

  /** The time shown, the slider's filled part and what screen readers hear, for `seconds` in. */
  private drawTime(seconds: number): void {
    const drawn = this.drawn;
    const time = formatPlaybackTime(seconds);
    const duration = this.state.duration;
    const progress = duration === null ? '0%' : `${Math.min(100, Math.max(0, (seconds / duration) * 100)).toFixed(2)}%`;
    // Its length too, which a sound learns after its first time is drawn.
    const valueText = this.words.text('timeOf', { time, duration: formatPlaybackTime(duration) });

    if (time !== drawn.time) {
      drawn.time = time;
      this.time.textContent = time;
    }

    if (valueText !== drawn.valueText) {
      drawn.valueText = valueText;
      this.position.setAttribute('aria-valuetext', valueText);
    }

    if (progress !== drawn.progress) {
      drawn.progress = progress;
      this.element.style.setProperty('--_orbit-audio-progress', progress);
    }
  }
}

const setLabel = (button: HTMLButtonElement, label: string): void => {
  button.setAttribute('aria-label', label);
  button.title = label;
};

const element = <Name extends keyof HTMLElementTagNameMap>(name: Name, className: string): HTMLElementTagNameMap[Name] => {
  const created = document.createElement(name);
  created.className = className;
  return created;
};
