/**
 * Videos in the media viewer, behind one interface: a file plays in a
 * `<video>` element, and YouTube and Vimeo in their own players, framed and
 * driven through the messages those players take (the same ones their
 * JavaScript APIs send). A video on any other site is framed as the detail
 * sheet frames it, with nothing to drive.
 */

import type { OrbitNode } from '../types.js';
import { guardUrl, resolveUrl } from '../url-guard.js';
import { detectVideoProvider, isNativeVideoUrl, isYouTubeShort, toVideoEmbedUrl } from '../media.js';
import { embedFrame, playerFrame } from './frames.js';

/** A video as it plays. */
export interface PlaybackState {
  /** Playing, rather than paused, not started yet, or ended. */
  playing: boolean;

  /** Seconds from the start. */
  time: number;

  /** Seconds, once known. */
  duration: number | null;

  /** It played to the end. */
  ended: boolean;

  /** Its sound is off. */
  muted: boolean;
}

export interface MediaPlayer {
  /** What shows the video: a `<video>` element or a frame. */
  readonly element: HTMLVideoElement | HTMLIFrameElement;

  /** Width over height, as far as it's known yet. */
  readonly ratio: number;

  /** Whether `play`, `pause` and `seek` reach the video, and it reports its state. */
  readonly controllable: boolean;

  readonly state: PlaybackState;
  play(): void;
  pause(): void;

  /** Moves to `seconds` from the start. */
  seek(seconds: number): void;

  /** Turns its sound on. */
  unmute(): void;

  /** Shows or hides the player's own controls, where that can change while it plays. */
  setControls(controls: boolean): void;

  /** Stops the video and lets go of it. */
  destroy(): void;
}

export interface PlayerOptions {
  /** Start playing as soon as it can. */
  autoplay: boolean;

  /** Show the player's own controls. */
  controls: boolean;

  /** Seconds into the video to start at. */
  startAt?: number;

  /** The frame's or video's accessible name. */
  title: string;

  /** A picture to show before a video file plays. */
  poster?: string;

  baseUrl?: string;

  /** It played, paused, moved on, ended or was muted. */
  onState(state: PlaybackState): void;

  /** It learned its width over height. */
  onRatio(ratio: number): void;

  /** A video file couldn't be played. */
  onError(): void;
}

const WIDE = 16 / 9;
const UPRIGHT = 9 / 16;
/** While a video plays, its time alone is reported at most this often (ms). */
const TIME_REPORT = 250;
/** YouTube's player answers once it hears that someone listens: say so this often (ms), this many times. */
const LISTEN_INTERVAL = 250;
const LISTEN_TRIES = 40;
/** YouTube's player states, from its API. */
const YOUTUBE_ENDED = 0;
const YOUTUBE_PLAYING = 1;
const YOUTUBE_BUFFERING = 3;
const VIMEO_EVENTS = ['play', 'playing', 'pause', 'ended', 'timeupdate', 'seeked', 'volumechange'];

/**
 * The player for a node's video, or null when its URL isn't allowed. Files
 * (`.mp4`, `.webm`, `.mov`, `blob:` URLs, or `provider: native`) play in a
 * `<video>` element; YouTube and Vimeo in their players.
 */
export const createPlayer = (video: NonNullable<OrbitNode['video']>, options: PlayerOptions): MediaPlayer | null => {
  const guarded = guardUrl(video.src, 'video');

  if (!guarded) {
    return null;
  }

  const source = resolveUrl(guarded, options.baseUrl);
  const provider = video.provider === 'youtube' || video.provider === 'vimeo' || video.provider === 'native' ? video.provider : detectVideoProvider(source);

  if (provider === 'native' || isNativeVideoUrl(source) || /^blob:/i.test(source)) {
    return new FilePlayer(source, options);
  }

  const embed = provider === 'youtube' || provider === 'vimeo' ? toVideoEmbedUrl(source, provider) : null;

  if (embed && provider === 'youtube') {
    const frame = playerFrame(youTubeAddress(embed, options), options.title);
    return frame ? new YouTubePlayer(frame, options, isYouTubeShort(source) ? UPRIGHT : WIDE) : null;
  }

  if (embed && provider === 'vimeo') {
    const frame = playerFrame(vimeoAddress(embed, options), options.title);
    return frame ? new VimeoPlayer(frame, options) : null;
  }

  const frame = embedFrame(source, options.baseUrl, options.title);
  return frame ? new PagePlayer(frame) : null;
};

/** YouTube's player, taking messages from this page and answering them, and starting on its own if asked. */
const youTubeAddress = (embed: string, options: PlayerOptions): string => {
  const url = new URL(embed);
  url.searchParams.set('enablejsapi', '1');
  url.searchParams.set('autoplay', options.autoplay ? '1' : '0');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('rel', '0');

  if (!options.controls) {
    url.searchParams.set('controls', '0');
  }

  const start = wholeSeconds(options.startAt);

  if (start > 0) {
    url.searchParams.set('start', String(start));
  }

  const origin = pageOrigin();

  if (origin) {
    url.searchParams.set('origin', origin);
  }

  return url.href;
};

const vimeoAddress = (embed: string, options: PlayerOptions): string => {
  const url = new URL(embed);
  url.searchParams.set('autoplay', options.autoplay ? '1' : '0');
  url.searchParams.set('playsinline', '1');
  // Vimeo's player without its tracking, as YouTube's comes from youtube-nocookie.com.
  url.searchParams.set('dnt', '1');

  if (!options.controls) {
    url.searchParams.set('controls', '0');
  }

  const start = wholeSeconds(options.startAt);

  if (start > 0) {
    url.hash = `t=${start}s`;
  }

  return url.href;
};

/** A time to start at, as the players' addresses take it: whole seconds, 0 for none. */
const wholeSeconds = (seconds: number | undefined): number => {
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds as number)) : 0;
};

/** The page's origin, which YouTube's player sends its messages to; none for pages without one (files). */
const pageOrigin = (): string | null => {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) {
    return null;
  }

  return location.origin;
};

/**
 * Reports a player's state: at once when it starts, pauses, ends, is muted,
 * learns its length or jumps to another time, and otherwise at most every
 * `TIME_REPORT` ms while it plays.
 */
class StateReporter {
  private last: PlaybackState | null = null;
  private lastAt = 0;
  private readonly listener: (state: PlaybackState) => void;

  constructor(listener: (state: PlaybackState) => void) {
    this.listener = listener;
  }

  report(state: PlaybackState): void {
    const now = performance.now();
    const last = this.last;

    if (last) {
      const same = last.playing === state.playing && last.ended === state.ended && last.muted === state.muted && last.duration === state.duration;
      const expected = last.time + (last.playing ? (now - this.lastAt) / 1000 : 0);
      const jumped = Math.abs(state.time - expected) > 1;

      if (same && !jumped && (state.time === last.time || now - this.lastAt < TIME_REPORT)) {
        return;
      }
    }

    this.last = { ...state };
    this.lastAt = now;
    this.listener({ ...state });
  }
}

const VIDEO_EVENTS = ['loadedmetadata', 'durationchange', 'play', 'playing', 'pause', 'ended', 'seeked', 'timeupdate', 'volumechange', 'error'];

class FilePlayer implements MediaPlayer {
  readonly element: HTMLVideoElement;
  readonly controllable = true;
  ratio = WIDE;
  private readonly options: PlayerOptions;
  private readonly reporter: StateReporter;
  private startAt: number;

  constructor(source: string, options: PlayerOptions) {
    this.options = options;
    this.reporter = new StateReporter(options.onState);
    this.startAt = Number.isFinite(options.startAt) ? Math.max(0, options.startAt as number) : 0;
    const video = document.createElement('video');
    this.element = video;
    video.className = 'orbit-viewer__video';
    video.controls = options.controls;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';

    if (options.autoplay) {
      video.autoplay = true;
      video.setAttribute('autoplay', '');
    }

    if (options.poster) {
      video.setAttribute('poster', options.poster);
    }

    video.setAttribute('aria-label', options.title);

    for (const type of VIDEO_EVENTS) {
      video.addEventListener(type, this.handleEvent);
    }

    video.src = source;

    if (options.autoplay) {
      this.play();
    }
  }

  get state(): PlaybackState {
    const video = this.element;
    return {
      playing: !video.paused && !video.ended,
      time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
      ended: video.ended,
      muted: video.muted,
    };
  }

  play(): void {
    const video = this.element;
    const attempt = video.play() as Promise<void> | undefined;

    // A browser that won't let a video start with sound before the reader
    // has interacted with the page lets it start muted.
    attempt?.catch?.((error: unknown) => {
      if ((error as { name?: string } | null)?.name === 'NotAllowedError' && !video.muted) {
        video.muted = true;
        (video.play() as Promise<void> | undefined)?.catch?.(() => undefined);
      }
    });
  }

  pause(): void {
    this.element.pause();
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      this.element.currentTime = Math.max(0, seconds);
    }
  }

  unmute(): void {
    const video = this.element;
    video.muted = false;

    if (video.volume === 0) {
      video.volume = 1;
    }
  }

  setControls(controls: boolean): void {
    this.element.controls = controls;
  }

  destroy(): void {
    const video = this.element;

    for (const type of VIDEO_EVENTS) {
      video.removeEventListener(type, this.handleEvent);
    }

    video.pause();
    // Letting go of the source stops the download too.
    video.removeAttribute('src');

    try {
      video.load();
    } catch {
      // Some environments can't load media at all.
    }
  }

  private readonly handleEvent = (event: Event): void => {
    const video = this.element;

    if (event.type === 'error') {
      this.options.onError();
      return;
    }

    if (event.type === 'loadedmetadata') {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        this.ratio = video.videoWidth / video.videoHeight;
        this.options.onRatio(this.ratio);
      }

      if (this.startAt > 0) {
        video.currentTime = this.startAt;
        this.startAt = 0;
      }
    }

    this.reporter.report(this.state);
  };
}

/** A player in a frame, from another origin: what it says arrives as messages. */
abstract class FramedPlayer implements MediaPlayer {
  readonly element: HTMLIFrameElement;
  readonly controllable = true;
  ratio: number;
  protected readonly options: PlayerOptions;
  protected readonly reporter: StateReporter;
  protected readonly current: PlaybackState = { playing: false, time: 0, duration: null, ended: false, muted: false };

  /** Where the player's messages come from, and where ours go. */
  protected readonly origin: string;

  /** The player answered: what's sent now reaches it. */
  protected ready = false;

  private queue: unknown[] = [];
  private autoplayed = false;
  private readonly owner: Window | null;

  constructor(frame: HTMLIFrameElement, options: PlayerOptions, ratio: number) {
    this.element = frame;
    this.options = options;
    this.ratio = ratio;
    this.reporter = new StateReporter(options.onState);
    this.origin = new URL(frame.src).origin;
    this.owner = frame.ownerDocument.defaultView ?? (typeof window === 'undefined' ? null : window);
    this.owner?.addEventListener('message', this.handleMessage);
    frame.addEventListener('load', this.handleLoad);
  }

  get state(): PlaybackState {
    return { ...this.current };
  }

  abstract play(): void;
  abstract pause(): void;
  abstract seek(seconds: number): void;
  abstract unmute(): void;

  setControls(): void {
    // A framed player takes its controls from its address: changing them would reload it.
  }

  destroy(): void {
    this.owner?.removeEventListener('message', this.handleMessage);
    this.element.removeEventListener('load', this.handleLoad);
    this.queue = [];
  }

  /** The frame loaded: the player may have said it's ready already, or wait to be asked. */
  protected abstract loaded(): void;

  /** A message from the player. */
  protected abstract received(message: Record<string, unknown>): void;

  /** The message that starts the video. */
  protected abstract playMessage(): unknown;

  /** Sends a message to the player, or keeps it until the player answers. */
  protected send(message: unknown): void {
    if (this.ready) {
      this.post(message);
    } else {
      this.queue.push(message);
    }
  }

  protected post(message: unknown): void {
    this.element.contentWindow?.postMessage(message, this.origin);
  }

  /** The player answered: start it if asked to, then send what was waiting. */
  protected becomeReady(): void {
    if (this.ready) {
      return;
    }

    this.ready = true;

    if (this.options.autoplay && !this.autoplayed) {
      this.autoplayed = true;
      this.post(this.playMessage());
    }

    const waiting = this.queue;
    this.queue = [];

    for (const message of waiting) {
      this.post(message);
    }
  }

  protected report(): void {
    this.reporter.report(this.current);
  }

  private readonly handleLoad = (): void => {
    this.loaded();
  };

  private readonly handleMessage = (event: MessageEvent): void => {
    if (event.source !== this.element.contentWindow || event.origin !== this.origin) {
      return;
    }

    const message = readMessage(event.data);

    if (message) {
      this.received(message);
    }
  };
}

class YouTubePlayer extends FramedPlayer {
  private static channels = 0;

  /** This player's id in the messages, as YouTube's API numbers its players. */
  private readonly channel = ++YouTubePlayer.channels;

  private listening: ReturnType<typeof setInterval> | null = null;

  play(): void {
    this.command('playVideo');
  }

  pause(): void {
    this.command('pauseVideo');
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      this.command('seekTo', [Math.max(0, seconds), true]);
    }
  }

  unmute(): void {
    this.command('unMute');
  }

  destroy(): void {
    this.stopListening();
    super.destroy();
  }

  protected playMessage(): unknown {
    return this.message('playVideo');
  }

  protected loaded(): void {
    // YouTube's player only talks to a page that says it listens: say so
    // until it answers, as YouTube's own API does.
    this.stopListening();

    if (this.ready) {
      return;
    }

    let tries = 0;
    const listen = () => this.post(JSON.stringify({ event: 'listening', id: this.channel, channel: 'widget' }));
    listen();

    this.listening = setInterval(() => {
      tries += 1;

      if (tries >= LISTEN_TRIES || this.ready) {
        this.stopListening();
        return;
      }

      listen();
    }, LISTEN_INTERVAL);
  }

  protected received(message: Record<string, unknown>): void {
    switch (message.event) {
      case 'initialDelivery':
      case 'onReady':
      case 'infoDelivery':
        this.stopListening();
        this.becomeReady();
        this.apply(message.info);
        break;
      case 'onStateChange':
        if (typeof message.info === 'number') {
          this.apply({ playerState: message.info });
        }

        break;
    }
  }

  private apply(info: unknown): void {
    if (!info || typeof info !== 'object') {
      return;
    }

    const values = info as Record<string, unknown>;
    const state = this.current;

    if (typeof values.currentTime === 'number' && Number.isFinite(values.currentTime)) {
      state.time = values.currentTime;
    }

    if (typeof values.duration === 'number' && values.duration > 0) {
      state.duration = values.duration;
    }

    if (typeof values.muted === 'boolean') {
      state.muted = values.muted;
    }

    if (typeof values.playerState === 'number' && values.playerState !== YOUTUBE_BUFFERING) {
      // Buffering keeps whether it's playing.
      state.playing = values.playerState === YOUTUBE_PLAYING;
      state.ended = values.playerState === YOUTUBE_ENDED;
    }

    this.report();
  }

  private command(func: string, args: unknown[] = []): void {
    this.send(this.message(func, args));
  }

  private message(func: string, args: unknown[] = []): string {
    return JSON.stringify({ event: 'command', func, args, id: this.channel, channel: 'widget' });
  }

  private stopListening(): void {
    if (this.listening !== null) {
      clearInterval(this.listening);
      this.listening = null;
    }
  }
}

class VimeoPlayer extends FramedPlayer {
  private width = 0;
  private height = 0;

  constructor(frame: HTMLIFrameElement, options: PlayerOptions) {
    super(frame, options, WIDE);
  }

  play(): void {
    this.send({ method: 'play' });
  }

  pause(): void {
    this.send({ method: 'pause' });
  }

  seek(seconds: number): void {
    if (Number.isFinite(seconds)) {
      this.send({ method: 'setCurrentTime', value: Math.max(0, seconds) });
    }
  }

  unmute(): void {
    this.send({ method: 'setMuted', value: false });
  }

  protected playMessage(): unknown {
    return { method: 'play' };
  }

  protected loaded(): void {
    // Vimeo's player answers a ping once it's ready, if it said so before this page listened.
    this.post({ method: 'ping' });
  }

  protected received(message: Record<string, unknown>): void {
    if (message.event === 'ready' || message.method === 'ping') {
      if (!this.ready) {
        for (const name of VIMEO_EVENTS) {
          this.post({ method: 'addEventListener', value: name });
        }

        for (const method of ['getDuration', 'getVideoWidth', 'getVideoHeight', 'getPaused', 'getMuted']) {
          this.post({ method });
        }
      }

      this.becomeReady();
      return;
    }

    const state = this.current;
    const data = message.data && typeof message.data === 'object' ? (message.data as Record<string, unknown>) : {};

    if (typeof data.seconds === 'number') {
      state.time = data.seconds;
    }

    if (typeof data.duration === 'number' && data.duration > 0) {
      state.duration = data.duration;
    }

    switch (message.event) {
      case 'play':
      case 'playing':
        state.playing = true;
        state.ended = false;
        break;
      case 'pause':
        state.playing = false;
        break;
      case 'ended':
        state.playing = false;
        state.ended = true;
        break;
      case 'volumechange':
        state.muted = data.muted === true || data.volume === 0;
        break;
    }

    switch (message.method) {
      case 'getDuration':
        if (typeof message.value === 'number' && message.value > 0) {
          state.duration = message.value;
        }

        break;
      case 'getPaused':
        if (typeof message.value === 'boolean') {
          state.playing = !message.value;
        }

        break;
      case 'getMuted':
        if (typeof message.value === 'boolean') {
          state.muted = message.value;
        }

        break;
      case 'getVideoWidth':
      case 'getVideoHeight':
        if (typeof message.value === 'number' && message.value > 0) {
          if (message.method === 'getVideoWidth') {
            this.width = message.value;
          } else {
            this.height = message.value;
          }

          if (this.width > 0 && this.height > 0) {
            this.ratio = this.width / this.height;
            this.options.onRatio(this.ratio);
          }
        }

        return;
    }

    this.report();
  }
}

/** A video on a site Orbit has no player for: framed, with nothing to drive. */
class PagePlayer implements MediaPlayer {
  readonly element: HTMLIFrameElement;
  readonly ratio = WIDE;
  readonly controllable = false;
  readonly state: PlaybackState = { playing: false, time: 0, duration: null, ended: false, muted: false };

  constructor(frame: HTMLIFrameElement) {
    this.element = frame;
  }

  play(): void {}

  pause(): void {}

  seek(): void {}

  unmute(): void {}

  setControls(): void {}

  destroy(): void {}
}

/** A message from a player: an object, or JSON text of one. */
const readMessage = (data: unknown): Record<string, unknown> | null => {
  let value = data;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
};
