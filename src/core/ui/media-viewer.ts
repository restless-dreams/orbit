/**
 * The media viewer: a node's picture, video or sound over the whole window,
 * to see the one up close and to play the others. A native `<dialog>`
 * opened as a modal, so it sits in the top layer above a map of any size,
 * keeps focus inside and makes the page behind it inert.
 *
 * Pictures fit the window. The wheel, a pinch, a double click or tap, the
 * +, − and 0 keys and the zoom buttons zoom them around the point under the
 * pointer, and a zoomed picture pans with a drag. A live photo's motion plays
 * over its picture (see live-photo.ts): once as it shows, and again while
 * the picture, its mark or the space bar is held. A sound plays in Orbit's
 * own player, under its idea's picture or art made of its color. Previous
 * and next step through the map's pictures, videos and sounds in reading
 * order; so do the arrow keys and, on touch screens, a swipe, while the
 * picture isn't zoomed. Space or K plays and pauses, J and L go ten seconds
 * back and on, and M turns a sound off and on. Esc, a click around the
 * media or a swipe down closes it.
 *
 * On a map that isn't interactive, the viewer is the page's to drive: no
 * buttons, no input of its own and no controls on videos.
 */

import type { OrbitNode } from '../types.js';
import type { OrbitWords } from '../languages.js';
import { guardUrl, resolveUrl } from '../url-guard.js';
import { detectVideoProvider, hasMediaSource, videoPageUrl } from '../media.js';
import { wheelZoomFactor } from '../input-controller.js';
import { focusedElement } from '../browser.js';
import { createIcon, type IconName } from './icons.js';
import { createPlayer, type MediaPlayer, type PlaybackState } from './media-players.js';
import { AudioPlayer, SKIP_SECONDS } from './audio-player.js';
import { HOLD_TIME, LivePhoto, liveMotion } from './live-photo.js';
import {
  FITTED,
  clampView,
  fittedSize,
  isZoomed,
  maximumZoom,
  panView,
  toggleZoom,
  zoomAround,
  type PictureView,
  type Point,
  type Size,
} from './media-zoom.js';

export type MediaKind = 'image' | 'video' | 'audio';

/** A node's picture, its video or its sound. */
export interface MediaItem {
  node: OrbitNode;
  kind: MediaKind;
}

/** What the viewer asks the map, and tells it. */
export interface MediaViewerContext {
  /** The map's pictures, videos and sounds, in reading order. */
  items(): MediaItem[];

  /** The map's node with this id, while it has one. */
  node(id: string): OrbitNode | null;

  baseUrl(): string | undefined;

  /** Whether the map takes input; without it, neither does the viewer. */
  interactive(): boolean;

  /** Whether the reader asked for less motion: a live photo then plays only when asked. */
  reducedMotion(): boolean;

  /** The icon before a node's title: its own, or its type's. */
  icon(node: OrbitNode): string | undefined;

  /** The color the map draws a node with, for a sound's art. */
  color(node: OrbitNode): string | null;

  /** It shows `item`, `index` of `total`: as it opens, and at every step. */
  onShow(item: MediaItem, index: number, total: number): void;

  /** It closed while showing `item`. */
  onClose(item: MediaItem, index: number, total: number): void;

  /** The video, sound or live photo's motion it shows started, paused, moved on, ended or was muted. */
  onState(node: OrbitNode, kind: MediaKind, state: PlaybackState): void;

  /** The map's words, in its language. */
  words(): OrbitWords;

  /** Puts keyboard focus on the map, when what had it before the viewer opened has gone. */
  returnFocus?(): void;
}

export interface MediaShowOptions {
  /** Start a video or sound playing, and play a live photo's motion once. Default true. */
  autoplay?: boolean;

  /** Start a video or sound this many seconds in: where the detail sheet's player was, or where the page says. */
  startAt?: number;
}

/** Room (px) kept around the media… */
const MEDIA_MARGIN = 16;
/** …and beside it on wide stages, for the previous and next buttons. */
const STEP_ROOM = 72;
const WIDE_STAGE = 720;
/**
 * On narrower stages the buttons go over a picture's sides, but under a
 * video, clear of its player's own controls: a row this tall (px) for
 * buttons this big.
 */
const STEP_ROW = 60;
const STEP_SIZE = 44;
/** A sound's art is at most this wide (px), and its player at least this wide… */
const SOUND_ART = 400;
const SOUND_CONTROLS_WIDTH = 300;
/** …and the player takes this much height under the art, which shows only when it can be this big. */
const SOUND_CONTROLS_HEIGHT = 150;
const SOUND_ART_SMALLEST = 96;
/** Zoom per press of a zoom button, +, or −. */
const STEP_ZOOM = 1.5;
/** The arrow keys pan a zoomed picture by this share of the stage. */
const KEY_PAN = 0.15;
/** A press moves this far (px) before it's a drag, not a tap: a mouse, then a finger or pen. */
const MOUSE_SLOP = 4;
const TOUCH_SLOP = 8;
/** A swipe across this far (px) steps to the previous or next item… */
const SWIPE_STEP = 60;
/** …and one down this far closes the viewer. */
const SWIPE_CLOSE = 100;
const DOUBLE_TAP_TIME = 320;
const DOUBLE_TAP_DISTANCE = 28;
/** Elements that handle presses themselves: gestures never start on them. */
const CONTROLS = 'button, a, video, iframe, input, select, textarea';
/** A live photo's mark sits this far (px) inside the picture's top left corner, or the stage's when the picture is bigger. */
const LIVE_MARK_INSET = 12;

/** Whether a node's picture, video or sound can be shown: it has one, at a URL allowed there. */
export const showsMedia = (node: OrbitNode, kind: MediaKind): boolean => {
  if (kind === 'image') {
    return hasMediaSource(node.image) && guardUrl(node.image.src, 'image') !== null;
  }

  if (kind === 'audio') {
    return hasMediaSource(node.audio) && guardUrl(node.audio.src, 'audio') !== null;
  }

  return hasMediaSource(node.video) && guardUrl(node.video.src, 'video') !== null;
};

/**
 * The map's pictures, videos and sounds in reading order: depth first, as
 * the outline lists the map, a node's picture before its video, and its
 * video before its sound. Nodes below `maxDepth` are left out, as they are
 * from the map, and so are the ideas under the nodes `hidden` names (see
 * `hideChildren`), as they are from the outline.
 */
export const galleryItems = (tree: OrbitNode, maxDepth?: number, hidden?: ReadonlySet<string>): MediaItem[] => {
  const items: MediaItem[] = [];
  const stack: OrbitNode[] = [tree];

  while (stack.length > 0) {
    const node = stack.pop() as OrbitNode;

    if (showsMedia(node, 'image')) {
      items.push({ node, kind: 'image' });
    }

    if (showsMedia(node, 'video')) {
      items.push({ node, kind: 'video' });
    }

    if (showsMedia(node, 'audio')) {
      items.push({ node, kind: 'audio' });
    }

    if ((maxDepth === undefined || node.level < maxDepth) && hidden?.has(node.id) !== true) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]);
      }
    }
  }

  return items;
};

/** The parts of the viewer, made once. */
interface ViewerParts {
  bar: HTMLElement;
  counter: HTMLElement;
  zoomOut: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  fit: HTMLButtonElement;
  zoomGroup: HTMLElement;
  link: HTMLAnchorElement;
  close: HTMLButtonElement;
  stage: HTMLElement;

  /** What the media sits in: it follows a swipe. */
  layer: HTMLElement;

  status: HTMLElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  caption: HTMLElement;
  title: HTMLElement;
  text: HTMLElement;
  description: HTMLElement;
}

interface Picture {
  element: HTMLImageElement;

  /** Its own size, once it's loaded. */
  natural: Size | null;

  /** A vector picture: it fits the window at any size. */
  scalable: boolean;

  fitted: Size;
  view: PictureView;
  maximum: number;
}

/**
 * A press on the stage: still a tap, a drag that pans, swipes across
 * (`swipe`) or pulls down (`pull`), or a live photo held to play (`hold`).
 */
interface Press {
  id: number;
  type: string;
  start: Point;
  last: Point;
  moved: boolean;
  mode: 'none' | 'pan' | 'swipe' | 'pull' | 'hold';

  /** When it began (`performance.now()`). */
  startedAt: number;
}

interface StageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class MediaViewer {
  private static count = 0;
  private readonly host: HTMLElement;
  private readonly context: MediaViewerContext;
  private readonly id = `orbit-viewer-${(++MediaViewer.count).toString(36)}`;
  private dialog: HTMLDialogElement | null = null;
  private parts: ViewerParts | null = null;
  private shown = false;
  private items: MediaItem[] = [];
  private index = 0;
  private picture: Picture | null = null;
  private player: MediaPlayer | null = null;

  /** The player's frame or video, in the box fitted to its width over height. */
  private playerBox: HTMLElement | null = null;

  /** A sound's art and player, laid out to the stage. */
  private soundBox: { box: HTMLElement; art: HTMLElement } | null = null;

  /** The live photo the picture is, when it has a motion that can play. */
  private live: LivePhoto | null = null;

  /** The stage's size as it was last laid out. */
  private stageSize: Size | null = null;

  /** A press on a live photo that becomes a hold if it stays still a moment. */
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  /** The space bar is held on a live photo, playing it. */
  private spaceHeld = false;

  private returnFocus: HTMLElement | SVGElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly pointers = new Map<number, Point>();
  private press: Press | null = null;

  /** A pinch, from where it started: the picture's view, and the fingers' distance and middle (from the stage's center). */
  private pinch: { view: PictureView; distance: number; center: Point } | null = null;

  private suppressClick = false;
  private lastTap: { time: number; point: Point } | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(host: HTMLElement, context: MediaViewerContext) {
    this.host = host;
    this.context = context;
  }

  get isOpen(): boolean {
    return this.shown;
  }

  /** What it shows, while it's open. */
  get item(): MediaItem | null {
    return this.shown ? this.items[this.index] ?? null : null;
  }

  /** The video or sound it shows, while it shows one that can be driven. */
  get video(): MediaPlayer | null {
    return this.shown && this.player?.controllable ? this.player : null;
  }

  /** The live photo it shows, while its motion can be played. */
  private get livePhoto(): LivePhoto | null {
    return this.shown && this.items[this.index]?.kind === 'image' ? this.live : null;
  }

  /**
   * Shows a node's picture, video or sound, opening the viewer if it's
   * closed. Returns false when the node has no such media to show.
   */
  open(item: MediaItem, options: MediaShowOptions = {}): boolean {
    if (!showsMedia(item.node, item.kind)) {
      return false;
    }

    let items = this.context.items();
    let index = items.findIndex((candidate) => candidate.node.id === item.node.id && candidate.kind === item.kind);

    if (index === -1) {
      // Opened from code on a node the map doesn't show: just this one.
      items = [item];
      index = 0;
    }

    const dialog = this.ensureDialog();
    const opening = !this.shown;

    if (opening) {
      this.returnFocus = focusedElement(this.host);
    }

    this.items = items;
    this.show(index, options);

    if (opening) {
      this.shown = true;

      if (!dialog.open) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', '');
        }
      }

      this.observeStage();
      dialog.focus({ preventScroll: true });
    }

    this.layout();
    this.context.onShow(this.items[this.index], this.index, this.items.length);
    return true;
  }

  close(): void {
    if (!this.shown) {
      return;
    }

    const dialog = this.dialog as HTMLDialogElement;

    if (dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }

    this.finish();
  }

  /** Steps to the previous (-1) or next (1) picture, video or sound. Returns false at either end. */
  step(direction: 1 | -1): boolean {
    return this.go(this.index + direction);
  }

  /**
   * The map changed: what the viewer shows takes the node's new title and
   * media, or the viewer closes if the node or its media went away.
   */
  refresh(): void {
    if (!this.shown) {
      return;
    }

    const current = this.items[this.index];
    let items = this.context.items();
    let index = items.findIndex((candidate) => candidate.node.id === current.node.id && candidate.kind === current.kind);

    if (index === -1) {
      const node = this.context.node(current.node.id);

      if (!node || !showsMedia(node, current.kind)) {
        this.close();
        return;
      }

      items = [{ node, kind: current.kind }];
      index = 0;
    }

    const next = items[index];
    // A live photo is its picture and its motion.
    const source = (item: MediaItem) => (item.kind === 'image' ? `${item.node.image?.src} ${item.node.image?.motion?.src ?? ''}` : item.node[item.kind]?.src);
    this.items = items;

    if (source(next) !== source(current)) {
      this.show(index, { autoplay: false });
      this.layout();
      return;
    }

    this.index = index;
    this.player?.setControls(this.context.interactive());
    this.live?.setControls(this.context.interactive());
    this.describe();
    this.layout();
  }

  /** Plays the video or sound it shows, or its live photo's motion through once, with its sound. */
  play(): boolean {
    const live = this.livePhoto;

    if (live) {
      live.playOnce();
      return true;
    }

    const video = this.video;
    video?.play();
    return video !== null;
  }

  /** Pauses the video or sound, or settles the live photo's motion back on its picture. */
  pause(): boolean {
    const live = this.livePhoto;

    if (live) {
      live.settle();
      return true;
    }

    const video = this.video;
    video?.pause();
    return video !== null;
  }

  /** Takes the video or sound to `seconds` in. A live photo's motion always plays from its start: false. */
  seek(seconds: number): boolean {
    const video = this.video;

    if (!video || !Number.isFinite(seconds)) {
      return false;
    }

    video.seek(seconds);
    return true;
  }

  /** Turns on the video's or sound's sound, or the live photo's, for its motion now and its opening if it hasn't started. */
  unmute(): boolean {
    const live = this.livePhoto;

    if (live) {
      live.unmute();
      return true;
    }

    const video = this.video;
    video?.unmute();
    return video !== null;
  }

  destroy(): void {
    this.close();
    this.dialog?.remove();
    this.dialog = null;
    this.parts = null;
  }

  /** Writes the viewer's buttons in the map's language, and what it shows, if it's open. */
  relabel(): void {
    const parts = this.parts;

    if (!parts) {
      return;
    }

    const words = this.context.words();
    parts.zoomGroup.setAttribute('aria-label', words.text('zoom'));
    setLabel(parts.zoomOut, words.text('zoomOut'));
    setLabel(parts.zoomIn, words.text('zoomIn'));
    setLabel(parts.fit, words.text('fitPicture'));
    setLabel(parts.close, words.text('close'));
    setLabel(parts.previous, words.text('previous'));
    setLabel(parts.next, words.text('next'));

    if (this.player instanceof AudioPlayer) {
      this.player.relabel(words);
    }

    this.live?.relabel(words);

    if (this.shown) {
      this.describe();
    }
  }

  // Showing an item

  private go(index: number): boolean {
    if (!this.shown || index < 0 || index >= this.items.length || index === this.index) {
      return false;
    }

    const parts = this.parts as ViewerParts;
    // Focus on media that's going away (a video's controls) moves to the viewer.
    const focusLeaves = parts.layer.contains(focusedElement(this.host));
    this.show(index, { autoplay: true });
    this.layout();

    if (focusLeaves) {
      this.dialog?.focus({ preventScroll: true });
    }

    this.context.onShow(this.items[this.index], this.index, this.items.length);
    return true;
  }

  private show(index: number, options: MediaShowOptions): void {
    const parts = this.parts as ViewerParts;
    this.clearMedia();
    this.index = index;
    const item = this.items[index];
    this.setStatus(null);

    if (item.kind === 'image') {
      this.showPicture(item.node, options);
    } else if (item.kind === 'audio') {
      this.showSound(item.node, options);
    } else {
      this.showVideo(item.node, options);
    }

    // The newcomer fades in.
    parts.layer.classList.remove('orbit-viewer__media--entering');
    void parts.layer.offsetWidth;
    parts.layer.classList.add('orbit-viewer__media--entering');
    this.describe();
  }

  private showPicture(node: OrbitNode, options: MediaShowOptions): void {
    const parts = this.parts as ViewerParts;
    const image = node.image as NonNullable<OrbitNode['image']>;
    const baseUrl = this.context.baseUrl();
    const url = resolveUrl(guardUrl(image.src, 'image') as string, baseUrl);
    const element = document.createElement('img');
    element.className = 'orbit-viewer__picture';
    // The picture's description is its name; without one, its caption or the node's title.
    element.alt = image.alt?.trim() || image.caption?.trim() || node.text || this.context.words().text('picture');
    element.draggable = false;
    element.decoding = 'async';
    const picture: Picture = { element, natural: null, scalable: /\.svgz?(?:[?#]|$)/i.test(url), fitted: { width: 0, height: 0 }, view: FITTED, maximum: 1 };
    this.picture = picture;
    element.addEventListener('load', () => this.pictureLoaded(picture));

    element.addEventListener('error', () => {
      if (this.picture === picture) {
        this.setStatus(this.context.words().text('pictureUnavailable'));
      }
    });

    this.setStatus('', true);
    element.src = url;
    parts.layer.appendChild(element);
    const motion = liveMotion(image);

    if (motion) {
      const live = new LivePhoto(element, {
        source: resolveUrl(motion, baseUrl),
        still: image.motion?.still,
        words: this.context.words(),
        controls: this.context.interactive(),
        onUnavailable: () => {
          // The picture stays, as a picture.
          if (this.live === live) {
            this.live = null;
            element.classList.remove('orbit-viewer__picture--live');
          }
        },
        onState: (state) => {
          if (this.live === live) {
            this.context.onState(this.items[this.index].node, 'image', state);
          }
        },
      });

      this.live = live;
      element.classList.add('orbit-viewer__picture--live');
      parts.layer.appendChild(live.mark);

      // It plays once as the viewer shows it, unless the page or the reader would rather it didn't.
      if (options.autoplay !== false && !this.context.reducedMotion()) {
        live.open();
      }
    }

    if (element.complete && element.naturalWidth > 0) {
      this.pictureLoaded(picture);
    }
  }

  private pictureLoaded(picture: Picture): void {
    if (this.picture !== picture || picture.natural) {
      return;
    }

    const { naturalWidth, naturalHeight } = picture.element;
    // A vector picture without a size of its own fills the window.
    picture.natural = naturalWidth > 0 && naturalHeight > 0 ? { width: naturalWidth, height: naturalHeight } : { width: 1, height: 1 };
    picture.scalable ||= !(naturalWidth > 0 && naturalHeight > 0);
    this.setStatus(null);
    this.layout();
    this.live?.showPicture();
  }

  private showVideo(node: OrbitNode, options: MediaShowOptions): void {
    const parts = this.parts as ViewerParts;
    const video = node.video as NonNullable<OrbitNode['video']>;
    const baseUrl = this.context.baseUrl();
    const thumbnail = video.thumbnail ? guardUrl(video.thumbnail, 'image') : null;
    // Declared first: a player can report before it's returned.
    let player: MediaPlayer | null = null;
    player = createPlayer(video, {
      autoplay: options.autoplay !== false,
      controls: this.context.interactive(),
      startAt: options.startAt,
      title: node.text || video.caption || this.context.words().text('video'),
      poster: thumbnail ? resolveUrl(thumbnail, baseUrl) : undefined,
      baseUrl,
      onState: (state) => {
        if (player !== null && this.player === player) {
          this.context.onState(this.items[this.index].node, 'video', state);
        }
      },
      onRatio: () => {
        if (player !== null && this.player === player) {
          this.layout();
        }
      },
      onError: () => {
        if (player !== null && this.player === player) {
          this.setStatus(this.context.words().text('videoUnavailable'));
        }
      },
    });

    if (!player) {
      this.setStatus(this.context.words().text('videoUnavailableHere'));
      return;
    }

    this.player = player;
    const box = document.createElement('div');
    box.className = 'orbit-viewer__player';
    box.appendChild(player.element);
    this.playerBox = box;
    parts.layer.appendChild(box);
  }

  /**
   * A sound in Orbit's own player, under the idea's picture or, without one,
   * art made of the idea's color and icon, whose rings turn while it plays.
   */
  private showSound(node: OrbitNode, options: MediaShowOptions): void {
    const parts = this.parts as ViewerParts;
    const audio = node.audio as NonNullable<OrbitNode['audio']>;
    const words = this.context.words();
    const baseUrl = this.context.baseUrl();
    const box = element('div', 'orbit-viewer__sound');
    const art = element('div', 'orbit-viewer__art');
    art.setAttribute('aria-hidden', 'true');

    if (showsMedia(node, 'image')) {
      const image = node.image as NonNullable<OrbitNode['image']>;
      const picture = document.createElement('img');
      picture.className = 'orbit-viewer__art-picture';
      picture.alt = '';
      picture.draggable = false;
      picture.src = resolveUrl(guardUrl(image.src, 'image') as string, baseUrl);
      art.appendChild(picture);
    } else {
      art.classList.add('orbit-viewer__art--made');
      const color = this.context.color(node);

      if (color) {
        art.style.setProperty('--orbit-art-color', color);
      }

      const icon = this.context.icon(node);
      const center = element('span', 'orbit-viewer__art-center');
      center.appendChild(icon ? document.createTextNode(icon) : createIcon('audio'));
      art.append(element('span', 'orbit-viewer__art-ring'), element('span', 'orbit-viewer__art-ring orbit-viewer__art-ring--outer'), center);
    }

    // Declared first: a player can report before it's returned.
    let player: AudioPlayer | null = null;
    player = new AudioPlayer({
      source: resolveUrl(guardUrl(audio.src, 'audio') as string, baseUrl),
      autoplay: options.autoplay !== false,
      controls: this.context.interactive(),
      startAt: options.startAt,
      title: node.text || audio.caption || words.text('audio'),
      words,
      size: 'stage',
      onState: (state) => {
        if (player !== null && this.player === player) {
          this.dialog?.classList.toggle('orbit-viewer--playing', state.playing);
          this.context.onState(this.items[this.index].node, 'audio', state);
        }
      },
      onError: () => {
        if (player !== null && this.player === player) {
          this.setStatus(this.context.words().text('audioUnavailable'));
        }
      },
    });

    this.player = player;
    // A sound that started before the player was returned reported it too soon.
    this.dialog?.classList.toggle('orbit-viewer--playing', player.state.playing);
    box.append(art, player.element);
    this.soundBox = { box, art };
    parts.layer.appendChild(box);
  }

  /** Lets go of the media shown: a video or sound stops. */
  private clearMedia(): void {
    this.resetGestures();
    this.player?.destroy();
    this.player = null;
    this.live?.destroy();
    this.live = null;
    this.spaceHeld = false;
    this.picture = null;
    this.playerBox = null;
    this.soundBox = null;
    this.parts?.layer.replaceChildren();
    this.dialog?.classList.remove('orbit-viewer--zoomed', 'orbit-viewer--playing');
  }

  /** The title, caption, description, counter, link and buttons, for what's shown. */
  private describe(): void {
    const parts = this.parts as ViewerParts;
    const dialog = this.dialog as HTMLDialogElement;
    const item = this.items[this.index];
    const { node } = item;
    const media = node[item.kind];
    const interactive = this.context.interactive();
    dialog.classList.toggle('orbit-viewer--still', !interactive);
    dialog.dataset.orbitMedia = item.kind;

    const title = [this.context.icon(node), node.text].filter(Boolean).join(' ');
    parts.title.textContent = title;
    const caption = media?.caption?.trim() ?? '';
    parts.text.textContent = caption;
    parts.text.hidden = caption === '';
    const description = item.kind === 'image' ? node.image?.alt?.trim() ?? '' : '';
    parts.description.textContent = description;
    parts.description.hidden = description === '' || description === caption;

    // The counter is a live region: it changes, and is read out, only when the viewer moves.
    const total = this.items.length;
    const counted = total > 1 ? this.context.words().text('position', { index: this.index + 1, total }) : '';
    const named = counted && title ? `: ${title}` : '';

    if (parts.counter.textContent !== counted + named) {
      const position = document.createElement('span');
      position.textContent = counted;
      const name = document.createElement('span');
      name.className = 'orbit-visually-hidden';
      name.textContent = named;
      parts.counter.replaceChildren(...(counted ? [position, name] : []));
    }

    parts.previous.hidden = total < 2;
    parts.next.hidden = total < 2;
    parts.previous.disabled = this.index === 0;
    parts.next.disabled = this.index === total - 1;

    const link = this.mediaLink(item);
    parts.link.hidden = link === null;

    if (link) {
      parts.link.href = link.href;
      parts.link.setAttribute('aria-label', link.label);
      parts.link.title = link.label;
    } else {
      parts.link.removeAttribute('href');
    }

    parts.zoomGroup.hidden = item.kind !== 'image';
    this.updateZoomButtons();
    this.keepFocus();
  }

  /** Where to see the picture on its own, the video on its site, or the sound on its own; none for media in the map itself (`data:` and `blob:` URLs). */
  private mediaLink(item: MediaItem): { href: string; label: string } | null {
    const { node } = item;
    const baseUrl = this.context.baseUrl();

    if (item.kind === 'audio') {
      const source = node.audio?.src ?? '';
      const link = /^\s*(?:data|blob):/i.test(source) ? null : guardUrl(source, 'link');
      return link ? { href: resolveUrl(link, baseUrl), label: this.context.words().text('openAudioInNewTab') } : null;
    }

    if (item.kind === 'image') {
      const source = node.image?.src ?? '';
      const link = /^\s*(?:data|blob):/i.test(source) ? null : guardUrl(source, 'link');
      return link ? { href: resolveUrl(link, baseUrl), label: this.context.words().text('openPictureInNewTab') } : null;
    }

    const video = node.video;

    if (!video || /^\s*(?:data|blob):/i.test(video.src)) {
      return null;
    }

    const guarded = guardUrl(video.src, 'link');

    if (!guarded) {
      return null;
    }

    const resolved = resolveUrl(guarded, baseUrl);
    const provider = video.provider === 'youtube' || video.provider === 'vimeo' ? video.provider : detectVideoProvider(resolved);
    const words = this.context.words();
    const label = provider === 'youtube'
      ? words.text('watchOn', { provider: 'YouTube' })
      : provider === 'vimeo' ? words.text('watchOn', { provider: 'Vimeo' }) : words.text('openVideoInNewTab');
    return { href: videoPageUrl(resolved, video.provider), label };
  }

  /** Shows `text` over the stage, with a spinner while it's `loading`; null shows nothing. */
  private setStatus(text: string | null, loading = false): void {
    const parts = this.parts as ViewerParts;
    parts.status.textContent = text ?? '';
    parts.status.hidden = text === null;
    parts.status.classList.toggle('orbit-viewer__status--loading', loading);
    parts.stage.setAttribute('aria-busy', String(loading));
  }

  // Layout and zoom

  /** Fits the picture or the player to the stage. */
  private layout(): void {
    const parts = this.parts;

    if (!this.shown || !parts) {
      return;
    }

    const stage = this.readStageBox();
    this.stageSize = { width: stage.width, height: stage.height };
    const steps = this.items.length > 1 && this.context.interactive();
    const stepsUnder = steps && this.playerBox !== null && stage.width < WIDE_STAGE;
    const room = this.mediaRoom(stage, steps, stepsUnder);
    const picture = this.picture;

    if (picture?.natural) {
      const fitted = fittedSize(picture.natural, room, picture.scalable);
      picture.fitted = fitted;
      picture.maximum = maximumZoom(picture.natural, fitted);
      const style = picture.element.style;
      const box = { left: (stage.width - fitted.width) / 2, top: (stage.height - fitted.height) / 2, width: fitted.width, height: fitted.height };
      style.width = `${round(box.width)}px`;
      style.height = `${round(box.height)}px`;
      style.left = `${round(box.left)}px`;
      style.top = `${round(box.top)}px`;
      this.live?.place(box);
      this.setView(clampView(picture.view, fitted, stage, picture.maximum), false);
    }

    const box = this.playerBox;
    let stepTop = '';

    if (box && this.player) {
      const ratio = this.player.ratio;
      const width = Math.max(0, Math.min(room.width, room.height * ratio));
      const height = width / ratio;
      const top = (stage.height - height - (stepsUnder ? STEP_ROW : 0)) / 2;
      box.style.width = `${round(width)}px`;
      box.style.height = `${round(height)}px`;
      box.style.left = `${round((stage.width - width) / 2)}px`;
      box.style.top = `${round(top)}px`;

      if (stepsUnder) {
        stepTop = `${round(top + height + (STEP_ROW - STEP_SIZE) / 2)}px`;
      }
    }

    const sound = this.soundBox;

    if (sound) {
      // The art as big as the room left over the player allows, and none on a screen too short for it.
      const fits = Math.min(SOUND_ART, room.width, room.height - SOUND_CONTROLS_HEIGHT);
      const art = fits >= SOUND_ART_SMALLEST ? fits : 0;
      // As wide as the art, but never narrower than the player needs, unless the stage itself is.
      const width = Math.min(room.width, Math.max(SOUND_CONTROLS_WIDTH, art));
      sound.box.style.width = `${round(width)}px`;
      sound.box.style.setProperty('--_orbit-viewer-art', `${round(art)}px`);
      sound.art.hidden = art === 0;
      const top = (stage.height - art - SOUND_CONTROLS_HEIGHT) / 2;
      sound.box.style.left = `${round((stage.width - width) / 2)}px`;
      sound.box.style.top = `${round(Math.max(0, top))}px`;

      // Previous and next sit beside the art's middle, clear of the player's buttons.
      if (steps && art > 0) {
        stepTop = `${round(Math.max(0, top) + art / 2 - STEP_SIZE / 2)}px`;
      }
    }

    parts.previous.style.top = stepTop;
    parts.next.style.top = stepTop;
  }

  /**
   * Where the media fits: the stage, less a margin, and the room the
   * previous and next buttons take beside it on wide stages, or under a
   * video on narrow ones.
   */
  private mediaRoom(stage: Size, steps: boolean, stepsUnder: boolean): Size {
    const side = steps && stage.width >= WIDE_STAGE ? STEP_ROOM : MEDIA_MARGIN;
    const under = stepsUnder ? STEP_ROW : 0;
    return { width: Math.max(0, stage.width - 2 * side), height: Math.max(0, stage.height - 2 * MEDIA_MARGIN - under) };
  }

  /** The stage's place in the window: happy-dom has no layout, so tests replace this. */
  private readStageBox(): StageBox {
    const box = (this.parts as ViewerParts).stage.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }

  /** A point in the window, from the stage's center. */
  private stagePoint(point: Point): Point {
    const stage = this.readStageBox();
    return { x: point.x - stage.left - stage.width / 2, y: point.y - stage.top - stage.height / 2 };
  }

  private setView(view: PictureView, glide: boolean): void {
    const picture = this.picture;

    if (!picture) {
      return;
    }

    picture.view = view;
    const element = picture.element;
    const transform = `translate(${round(view.x)}px, ${round(view.y)}px) scale(${Math.round(view.scale * 10000) / 10000})`;
    element.classList.toggle('orbit-viewer__picture--gliding', glide);
    element.style.transform = transform;
    this.live?.follow(transform, glide);
    this.placeLiveMark(glide);
    this.dialog?.classList.toggle('orbit-viewer--zoomed', isZoomed(view));
    this.updateZoomButtons();
  }

  /** A live photo's mark: inside the top left corner of the picture as it's drawn, or of the stage while the picture is bigger. */
  private placeLiveMark(glide: boolean): void {
    const live = this.live;
    const picture = this.picture;
    const stage = this.stageSize;

    if (!live || !picture?.natural || !stage) {
      return;
    }

    const { view, fitted } = picture;
    const left = stage.width / 2 + view.x - (fitted.width * view.scale) / 2;
    const top = stage.height / 2 + view.y - (fitted.height * view.scale) / 2;
    live.placeMark(Math.max(0, left) + LIVE_MARK_INSET, Math.max(0, top) + LIVE_MARK_INSET, glide);
  }

  /** Zooms the picture by `factor` around `anchor` (from the stage's center). */
  private zoomAt(factor: number, anchor: Point, glide: boolean): boolean {
    const picture = this.picture;

    if (!picture?.natural) {
      return false;
    }

    const stage = this.readStageBox();
    this.setView(zoomAround(picture.view, factor, anchor, picture.fitted, stage, picture.maximum), glide);
    return true;
  }

  private fitPicture(): boolean {
    if (!this.picture?.natural) {
      return false;
    }

    this.setView(FITTED, true);
    return true;
  }

  private panBy(deltaX: number, deltaY: number, glide: boolean): void {
    const picture = this.picture;

    if (picture?.natural) {
      this.setView(panView(picture.view, deltaX, deltaY, picture.fitted, this.readStageBox(), picture.maximum), glide);
    }
  }

  private get zoomed(): boolean {
    return this.picture !== null && isZoomed(this.picture.view);
  }

  private updateZoomButtons(): void {
    const parts = this.parts;
    const picture = this.picture;

    if (!parts) {
      return;
    }

    const ready = Boolean(picture?.natural);
    const scale = picture?.view.scale ?? 1;
    parts.zoomOut.disabled = !ready || scale <= 1.001;
    parts.fit.disabled = !ready || scale <= 1.001;
    parts.zoomIn.disabled = !ready || scale >= (picture?.maximum ?? 1) - 0.001;
    this.keepFocus();
  }

  /** A button that had focus and can't be pressed any more (the last step, the furthest zoom) hands focus to the viewer, which keeps its keys. */
  private keepFocus(): void {
    const focused = focusedElement(this.host);

    if (this.shown && focused instanceof HTMLButtonElement && focused.disabled && this.dialog?.contains(focused)) {
      this.dialog.focus({ preventScroll: true });
    }
  }

  // The dialog

  private ensureDialog(): HTMLDialogElement {
    if (this.dialog) {
      return this.dialog;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'orbit-viewer';
    dialog.tabIndex = -1;
    dialog.setAttribute('aria-labelledby', `${this.id}-title`);

    const bar = element('div', 'orbit-viewer__bar');
    const counter = element('p', 'orbit-viewer__counter');
    counter.setAttribute('role', 'status');
    const tools = element('div', 'orbit-viewer__tools');
    const zoomGroup = element('div', 'orbit-panel orbit-viewer__zoom');
    zoomGroup.setAttribute('role', 'group');
    const zoomOut = iconButton('zoom-out', () => this.zoomAt(1 / STEP_ZOOM, { x: 0, y: 0 }, true));
    const zoomIn = iconButton('zoom-in', () => this.zoomAt(STEP_ZOOM, { x: 0, y: 0 }, true));
    const fit = iconButton('fit', () => this.fitPicture());
    zoomGroup.append(zoomOut, zoomIn, fit);
    const actions = element('div', 'orbit-panel');
    const link = element('a', 'orbit-button orbit-button--icon orbit-viewer__link');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.appendChild(createIcon('link'));
    const close = iconButton('close', () => this.close());
    close.classList.add('orbit-viewer__close');
    actions.append(link, close);
    tools.append(zoomGroup, actions);
    bar.append(counter, tools);

    const stage = element('div', 'orbit-viewer__stage');
    const layer = element('div', 'orbit-viewer__media');
    const status = element('p', 'orbit-viewer__status');
    status.hidden = true;
    const previous = iconButton('previous', () => this.step(-1));
    previous.classList.add('orbit-viewer__step', 'orbit-viewer__step--previous');
    const next = iconButton('next', () => this.step(1));
    next.classList.add('orbit-viewer__step', 'orbit-viewer__step--next');
    stage.append(layer, status, previous, next);

    const caption = element('div', 'orbit-viewer__caption');
    const title = element('h2', 'orbit-viewer__title');
    title.id = `${this.id}-title`;
    const text = element('p', 'orbit-viewer__text');
    const description = element('p', 'orbit-viewer__description');
    caption.append(title, text, description);

    dialog.append(bar, stage, caption);
    this.parts = { bar, counter, zoomOut, zoomIn, fit, zoomGroup, link, close, stage, layer, status, previous, next, caption, title, text, description };
    this.relabel();

    dialog.addEventListener('keydown', this.handleKeyDown);
    dialog.addEventListener('keyup', this.handleKeyUp);
    dialog.addEventListener('cancel', this.handleCancel);

    // Only the click that ends a drag is swallowed: any new press is clicked as usual.
    dialog.addEventListener('pointerdown', () => {
      this.suppressClick = false;
    }, true);

    // The browser can close it too. A close event can also arrive after the viewer opened again: that one is stale.
    dialog.addEventListener('close', () => {
      if (!dialog.open) {
        this.finish();
      }
    });

    dialog.addEventListener('click', this.handleClick, true);
    dialog.addEventListener('wheel', this.handleWheel, { passive: false });
    dialog.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    stage.addEventListener('pointerdown', this.handlePointerDown);
    stage.addEventListener('pointermove', this.handlePointerMove);
    stage.addEventListener('pointerup', this.handlePointerUp);
    stage.addEventListener('pointercancel', this.handlePointerUp);
    stage.addEventListener('dblclick', this.handleDoubleClick);
    stage.addEventListener('contextmenu', this.handleContextMenu);
    this.host.appendChild(dialog);
    this.dialog = dialog;
    return dialog;
  }

  /** After the dialog closed, by `close()` or by the browser. */
  private finish(): void {
    if (!this.shown) {
      return;
    }

    this.shown = false;
    const item = this.items[this.index];
    const index = this.index;
    const total = this.items.length;
    this.clearMedia();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }

    this.items = [];
    const target = this.returnFocus;
    this.returnFocus = null;

    // A button made again while the viewer was open, such as the one that opened it, has left the page.
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
    } else if (target) {
      this.context.returnFocus?.();
    }

    if (item) {
      this.context.onClose(item, index, total);
    }
  }

  private observeStage(): void {
    if (this.resizeObserver || typeof ResizeObserver === 'undefined' || !this.parts) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(this.parts.stage);
  }

  // Keys

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.shown || !this.context.interactive() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    // A video's own controls take the arrows and the space bar.
    const onVideo = target?.closest('video, iframe') != null;
    const stage = this.readStageBox();
    let handled = true;

    switch (event.key) {
      case 'Escape':
        this.close();
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const direction = event.key === 'ArrowRight' ? 1 : -1;

        if (onVideo) {
          handled = false;
        } else if (this.zoomed) {
          this.panBy(-direction * stage.width * KEY_PAN, 0, true);
        } else {
          this.step(direction);
        }

        break;
      }
      case 'ArrowUp':
      case 'ArrowDown':
        if (this.zoomed && !onVideo) {
          this.panBy(0, (event.key === 'ArrowDown' ? -1 : 1) * stage.height * KEY_PAN, true);
        } else {
          handled = false;
        }

        break;
      case 'Home':
      case 'End':
        handled = !onVideo && this.go(event.key === 'Home' ? 0 : this.items.length - 1);
        break;
      case '+':
      case '=':
        handled = this.zoomAt(STEP_ZOOM, { x: 0, y: 0 }, true);
        break;
      case '-':
      case '_':
        handled = this.zoomAt(1 / STEP_ZOOM, { x: 0, y: 0 }, true);
        break;
      case '0':
        handled = this.fitPicture();
        break;
      case ' ':
        // On a live photo, the space bar is held as a finger holds the picture.
        if (this.live && !onVideo && !target?.closest('button, a')) {
          if (!event.repeat) {
            this.spaceHeld = true;
            this.live.press();
          }

          break;
        }

        handled = !onVideo && !target?.closest('button, a') && this.togglePlayback();
        break;
      case 'k':
      case 'K':
        handled = !onVideo && this.togglePlayback();
        break;
      case 'j':
      case 'J':
      case 'l':
      case 'L':
        handled = !onVideo && this.skip(event.key.toLowerCase() === 'l' ? SKIP_SECONDS : -SKIP_SECONDS);
        break;
      case 'm':
      case 'M':
        handled = this.player instanceof AudioPlayer;

        if (this.player instanceof AudioPlayer) {
          this.player.toggleMute();
        }

        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
    }
  };

  /** Letting go of the space bar settles a live photo it held, or lets a quick press play through. */
  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key === ' ' && this.spaceHeld) {
      this.spaceHeld = false;
      this.live?.release();
      event.preventDefault();
    }
  };

  /** Plays the video or sound if it's paused, and pauses it if it plays. */
  private togglePlayback(): boolean {
    const video = this.video;

    if (!video) {
      return false;
    }

    if (video instanceof AudioPlayer) {
      video.togglePlayback();
    } else if (video.state.playing) {
      video.pause();
    } else {
      video.play();
    }

    return true;
  }

  /** Moves the video or sound `seconds` back (below 0) or on. */
  private skip(seconds: number): boolean {
    const video = this.video;

    if (!video) {
      return false;
    }

    video.seek(Math.max(0, video.state.time + seconds));
    return true;
  }

  /** Esc, as the browser reports it: the viewer closes itself, so focus goes back and the map hears of it. */
  private readonly handleCancel = (event: Event): void => {
    event.preventDefault();

    if (this.context.interactive()) {
      this.close();
    }
  };

  // Pointer gestures

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    const parts = this.parts;

    if (!parts || !this.context.interactive()) {
      return;
    }

    // A click around the media, not on it, is a click on the backdrop.
    if (event.target === parts.stage || event.target === parts.layer) {
      this.close();
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    const parts = this.parts;

    if (!parts) {
      return;
    }

    // The page behind never scrolls; a long caption does.
    const inCaption = event.target instanceof Node && parts.caption.contains(event.target) && parts.caption.scrollHeight > parts.caption.clientHeight;

    if (!inCaption && event.cancelable) {
      event.preventDefault();
    }

    if (!this.context.interactive() || !(event.target instanceof Node) || !parts.stage.contains(event.target) || !this.picture?.natural) {
      return;
    }

    const factor = wheelZoomFactor(event, this.readStageBox().height);
    this.zoomAt(factor, this.stagePoint({ x: event.clientX, y: event.clientY }), false);
  };

  /** A drag on the viewer never scrolls the page behind it. */
  private readonly handleTouchMove = (event: TouchEvent): void => {
    const parts = this.parts;
    const inCaption = parts !== null && event.target instanceof Node && parts.caption.contains(event.target);

    if (!inCaption && event.cancelable) {
      event.preventDefault();
    }
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (!this.context.interactive() || event.target !== this.picture?.element) {
      return;
    }

    this.toggleZoomAt({ x: event.clientX, y: event.clientY });
  };

  private toggleZoomAt(point: Point): void {
    const picture = this.picture;

    if (!picture?.natural) {
      return;
    }

    const stage = this.readStageBox();
    this.setView(toggleZoom(picture.view, this.stagePoint(point), picture.natural, picture.fitted, stage, picture.maximum), true);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.context.interactive() || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(CONTROLS)) {
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, point);
    this.live?.skipOpening();

    if (this.pointers.size === 2) {
      // Two fingers pinch the picture; a swipe one of them began goes back, and a live photo it held settles.
      if (this.press?.mode === 'swipe' || this.press?.mode === 'pull') {
        this.settleLayer();
      } else if (this.press?.mode === 'hold') {
        this.live?.release();
      }

      this.cancelHold();
      this.press = null;

      if (this.picture?.natural) {
        this.pinch = { view: this.picture.view, distance: this.pinchDistance(), center: this.stagePoint(this.pinchCenter()) };

        // Both fingers, so a lift outside the stage still ends the pinch here instead of leaving a ghost finger behind.
        for (const id of this.pointers.keys()) {
          this.capture(id);
        }
      }

      return;
    }

    if (this.pointers.size > 2) {
      return;
    }

    this.press = { id: event.pointerId, type: event.pointerType, start: point, last: point, moved: false, mode: 'none', startedAt: now() };

    // Held still for a moment, a live photo plays.
    if (this.live && event.target === this.picture?.element) {
      this.holdTimer = setTimeout(() => this.holdLive(), HOLD_TIME);
    }
  };

  /** A press on a live photo that stayed still: its motion plays, with its sound, until it's let go. */
  private holdLive(): void {
    this.holdTimer = null;
    const press = this.press;

    if (!press || press.moved || !this.live || this.pointers.size !== 1) {
      return;
    }

    press.moved = true;
    press.mode = 'hold';
    this.capture(press.id);
    this.live.press(press.startedAt);
  }

  private cancelHold(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  /** A long press on a live photo plays it: the browser's menu for the picture stays closed. */
  private readonly handleContextMenu = (event: MouseEvent): void => {
    if (this.live && (this.holdTimer !== null || this.press?.mode === 'hold')) {
      event.preventDefault();
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) {
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    this.pointers.set(event.pointerId, point);
    const pinch = this.pinch;
    const picture = this.picture;

    if (pinch) {
      if (this.pointers.size < 2 || !picture?.natural) {
        return;
      }

      // The point of the picture that was between the fingers stays between them, zoomed by how far they spread.
      const center = this.stagePoint(this.pinchCenter());
      const factor = pinch.distance > 0 ? this.pinchDistance() / pinch.distance : 1;
      const scale = Math.min(picture.maximum, Math.max(1, pinch.view.scale * factor));
      const ratio = scale / pinch.view.scale;
      const view = { scale, x: center.x - (pinch.center.x - pinch.view.x) * ratio, y: center.y - (pinch.center.y - pinch.view.y) * ratio };
      this.setView(clampView(view, picture.fitted, this.readStageBox(), picture.maximum), false);
      return;
    }

    const press = this.press;

    if (!press || press.id !== event.pointerId) {
      return;
    }

    // A held live photo stays held wherever the finger goes.
    if (press.mode === 'hold') {
      press.last = point;
      return;
    }

    const deltaX = point.x - press.start.x;
    const deltaY = point.y - press.start.y;

    if (!press.moved) {
      if (Math.hypot(deltaX, deltaY) < (press.type === 'mouse' ? MOUSE_SLOP : TOUCH_SLOP)) {
        return;
      }

      this.cancelHold();
      press.moved = true;
      press.mode = this.dragMode(press.type, deltaX, deltaY);
      this.capture(event.pointerId);
      this.dialog?.classList.toggle('orbit-viewer--dragging', press.mode === 'pan');
    }

    const layer = (this.parts as ViewerParts).layer;

    if (press.mode === 'pan') {
      this.panBy(point.x - press.last.x, point.y - press.last.y, false);
    } else if (press.mode === 'swipe') {
      layer.style.transform = `translate(${round(deltaX)}px, 0)`;
    } else if (press.mode === 'pull') {
      const pull = Math.max(0, deltaY);
      layer.style.transform = `translate(0, ${round(pull)}px)`;
      this.dialog?.style.setProperty('--_orbit-viewer-pull', String(Math.min(1, pull / (SWIPE_CLOSE * 3))));
    }

    press.last = point;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointers.delete(event.pointerId)) {
      return;
    }

    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null;
        this.suppressClick = true;
        // The finger left on the screen pans on from where it is.
        const remaining = Array.from(this.pointers.entries())[0];

        if (remaining) {
          this.press = { id: remaining[0], type: event.pointerType, start: remaining[1], last: remaining[1], moved: true, mode: this.zoomed ? 'pan' : 'none', startedAt: now() };
        }
      }

      return;
    }

    const press = this.press;

    if (!press || press.id !== event.pointerId) {
      return;
    }

    this.press = null;
    this.cancelHold();
    this.dialog?.classList.remove('orbit-viewer--dragging');

    // Letting go of a live photo settles it back on its picture.
    if (press.mode === 'hold') {
      this.suppressClick = true;
      this.live?.release();
      return;
    }

    const cancelled = event.type === 'pointercancel';
    const deltaX = event.clientX - press.start.x;
    const deltaY = event.clientY - press.start.y;

    if (press.moved) {
      this.suppressClick = true;

      if (press.mode === 'swipe') {
        if (cancelled || Math.abs(deltaX) < SWIPE_STEP || !this.step(deltaX < 0 ? 1 : -1)) {
          this.settleLayer();
        }
      } else if (press.mode === 'pull') {
        if (!cancelled && deltaY >= SWIPE_CLOSE) {
          this.close();
        } else {
          this.settleLayer();
        }
      }

      return;
    }

    if (press.type !== 'mouse' && !cancelled) {
      const point = { x: event.clientX, y: event.clientY };
      const previous = this.lastTap;

      if (previous && event.timeStamp - previous.time < DOUBLE_TAP_TIME && Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < DOUBLE_TAP_DISTANCE) {
        this.lastTap = null;

        if (event.target === this.picture?.element) {
          this.toggleZoomAt(point);
        }
      } else {
        this.lastTap = { time: event.timeStamp, point };
      }
    }
  };

  /** What a drag that starts this way does: pans a zoomed picture, or swipes across or down on a touch screen. */
  private dragMode(type: string, deltaX: number, deltaY: number): Press['mode'] {
    if (this.zoomed) {
      return 'pan';
    }

    if (type === 'mouse') {
      return 'none';
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return this.items.length > 1 ? 'swipe' : 'none';
    }

    return deltaY > 0 ? 'pull' : 'none';
  }

  /** Brings media a swipe moved back to its place. */
  private settleLayer(): void {
    const parts = this.parts;
    const dialog = this.dialog;

    if (!parts || !dialog) {
      return;
    }

    dialog.classList.add('orbit-viewer--settling');
    parts.layer.style.transform = '';
    dialog.style.removeProperty('--_orbit-viewer-pull');

    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
    }

    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      dialog.classList.remove('orbit-viewer--settling');
    }, 260);
  }

  private resetGestures(): void {
    this.cancelHold();
    this.pointers.clear();
    this.press = null;
    this.pinch = null;
    this.lastTap = null;
    this.dialog?.classList.remove('orbit-viewer--dragging');

    if (this.parts) {
      this.parts.layer.style.transform = '';
    }

    this.dialog?.style.removeProperty('--_orbit-viewer-pull');
  }

  private capture(pointerId: number): void {
    try {
      this.parts?.stage.setPointerCapture?.(pointerId);
    } catch {
      // Pointer capture is optional (some test environments lack it).
    }
  }

  private pinchDistance(): number {
    const [first, second] = Array.from(this.pointers.values());
    return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  }

  private pinchCenter(): Point {
    const [first, second] = Array.from(this.pointers.values());
    return first && second ? { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 } : first ?? { x: 0, y: 0 };
  }
}

const iconButton = (icon: IconName, onClick: () => void): HTMLButtonElement => {
  const button = element('button', 'orbit-button orbit-button--icon');
  button.type = 'button';
  button.appendChild(createIcon(icon));
  button.addEventListener('click', onClick);
  return button;
};

/** A button's name and its tooltip. */
const setLabel = (button: HTMLButtonElement, label: string): void => {
  button.setAttribute('aria-label', label);
  button.title = label;
};

const element = <Name extends keyof HTMLElementTagNameMap>(name: Name, className: string): HTMLElementTagNameMap[Name] => {
  const created = document.createElement(name);
  created.className = className;
  return created;
};

const round = (value: number): number => {
  return Math.round(value * 100) / 100;
};

const now = (): number => {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
};
