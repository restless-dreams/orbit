import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { MediaViewer } from '../src/core/ui/media-viewer';
import { defineOrbitMapElement, type OrbitMapElement } from '../src/core/auto-render';
import type { OrbitMediaEvent, OrbitMediaState } from '../src/core/types';
import { click, mount, useMapSize } from './helpers/renderer';

useMapSize(600, 400);

const STAGE = { left: 0, top: 0, width: 1000, height: 600 };
const viewerPrototype = MediaViewer.prototype as unknown as { readStageBox: () => typeof STAGE };
const readStageBox = viewerPrototype.readStageBox;

beforeAll(() => {
  viewerPrototype.readStageBox = () => STAGE;
});

afterAll(() => {
  viewerPrototype.readStageBox = readStageBox;
});

beforeEach(() => {
  document.body.innerHTML = '';
});

const MAP = `# Trip
![Sunrise from the summit](https://example.com/summit.jpg)

## Trail
[Walkthrough](https://www.youtube.com/watch?v=aqz-KE-bpKQ)

## Teaser
[Teaser](https://vimeo.com/76979871)

## Both
![Poster](https://example.com/poster.jpg)
<!-- orbit video: "https://example.com/clip.mp4" -->

## Plain`;

const openViewer = (host: ParentNode): HTMLDialogElement | null => {
  return host.querySelector<HTMLDialogElement>('dialog.orbit-viewer[open]');
};

const press = (target: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

/** Frames log that they can't load in happy-dom. */
const quietFrames = (): () => void => {
  const quiet = spyOn(console, 'error').mockImplementation(() => undefined);
  return () => quiet.mockRestore();
};

/** A stand-in for a player's window in a frame: what the map posts to it, and a way to answer as the player. */
const fakePlayer = (frame: HTMLIFrameElement, origin: string) => {
  const sent: unknown[] = [];
  const window = { postMessage: (message: unknown, target: string) => sent.push({ message, target }) };
  Object.defineProperty(frame, 'contentWindow', { value: window, configurable: true });
  return {
    sent,

    /** What was posted, as objects, without the target origins. */
    messages: () => sent.map((entry) => {
      const { message } = entry as { message: unknown };
      return typeof message === 'string' ? JSON.parse(message) : message;
    }),

    targets: () => new Set(sent.map((entry) => (entry as { target: string }).target)),
    answer: (data: unknown, from = origin) => {
      globalThis.window.dispatchEvent(new MessageEvent('message', { data, origin: from, source: window as unknown as Window }));
    },
    load: () => frame.dispatchEvent(new Event('load')),
  };
};

describe('openMedia', () => {
  test('opens the viewer on a node’s picture, or the video of a node with both when asked', () => {
    const { host, renderer } = mount(MAP);
    expect(renderer.openMedia('trip')).toBe(true);
    expect(openViewer(host)?.querySelector('img')?.getAttribute('src')).toBe('https://example.com/summit.jpg');
    expect(renderer.openMedia('both')).toBe(true);
    expect(openViewer(host)?.querySelector('img')?.getAttribute('src')).toBe('https://example.com/poster.jpg');
    expect(renderer.openMedia('both', { kind: 'video', autoplay: false })).toBe(true);
    expect(openViewer(host)?.querySelector('video')?.getAttribute('src')).toBe('https://example.com/clip.mp4');
  });

  test('returns false for a node without media, or a node the map doesn’t have', () => {
    const { host, renderer } = mount(MAP);
    expect(renderer.openMedia('plain')).toBe(false);
    expect(renderer.openMedia('nowhere')).toBe(false);
    expect(renderer.openMedia('trip', { kind: 'video' })).toBe(false);
    expect(openViewer(host)).toBeNull();
  });

  test('opens whatever mediaViewer and showDetailSheet say', () => {
    const { host, renderer } = mount(MAP, { mediaViewer: false, showDetailSheet: false });
    expect(renderer.openMedia('trip')).toBe(true);
    expect(openViewer(host)).not.toBeNull();
  });

  test('closeMedia closes it, and does nothing when it’s closed', () => {
    const { host, renderer } = mount(MAP);
    renderer.closeMedia();
    renderer.openMedia('trip');
    renderer.closeMedia();
    expect(openViewer(host)).toBeNull();
  });

  test('a video starts unless autoplay is false', () => {
    const { host, renderer } = mount(MAP);
    renderer.openMedia('both', { kind: 'video' });
    expect(openViewer(host)?.querySelector('video')?.hasAttribute('autoplay')).toBe(true);
    renderer.openMedia('both', { kind: 'video', autoplay: false });
    const video = openViewer(host)?.querySelector('video');
    expect(video?.hasAttribute('autoplay')).toBe(false);
    expect(video?.paused).toBe(true);
  });

  test('a video starts startAt seconds in: a file once it knows its length, YouTube and Vimeo at the whole second', () => {
    const restore = quietFrames();
    const { host, renderer } = mount(MAP);
    renderer.openMedia('both', { kind: 'video', autoplay: false, startAt: 42.5 });
    const video = openViewer(host)!.querySelector('video')!;
    expect(video.currentTime).toBe(0);
    Object.defineProperty(video, 'duration', { value: 90, configurable: true });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(video.currentTime).toBe(42.5);

    renderer.openMedia('trail', { startAt: 42.5 });
    const youTube = new URL(openViewer(host)!.querySelector('iframe')!.src);
    expect(youTube.searchParams.get('start')).toBe('42');
    renderer.openMedia('teaser', { autoplay: false, startAt: 61 });
    const vimeo = new URL(openViewer(host)!.querySelector('iframe')!.src);
    expect(vimeo.hash).toBe('#t=61s');
    expect(vimeo.searchParams.get('autoplay')).toBe('0');
    // From the start, the players' addresses say nothing of it.
    renderer.openMedia('trail');
    expect(new URL(openViewer(host)!.querySelector('iframe')!.src).searchParams.has('start')).toBe(false);
    restore();
  });
});

describe('unmuteMedia', () => {
  test('turns on the sound of a video file a browser started muted', () => {
    const { host, renderer } = mount(MAP);
    const states: OrbitMediaState[] = [];
    renderer.on('media-state', (state) => states.push(state));
    renderer.openMedia('both', { kind: 'video' });
    const video = openViewer(host)!.querySelector('video')!;
    video.muted = true;
    video.dispatchEvent(new Event('volumechange'));
    expect(renderer.unmuteMedia()).toBe(true);
    expect(video.muted).toBe(false);
    video.dispatchEvent(new Event('volumechange'));
    expect(states.map((state) => state.muted)).toEqual([true, false]);
  });

  test('tells YouTube’s and Vimeo’s players to, once they answer', () => {
    const restore = quietFrames();
    const { host, renderer } = mount(MAP);
    renderer.openMedia('trail');
    const youTube = fakePlayer(openViewer(host)!.querySelector('iframe')!, 'https://www.youtube-nocookie.com');
    expect(renderer.unmuteMedia()).toBe(true);
    youTube.load();
    youTube.answer(JSON.stringify({ event: 'onReady', info: null, channel: 'widget' }));
    expect(youTube.messages().slice(1).map((message) => message.func)).toEqual(['playVideo', 'unMute']);

    renderer.openMedia('teaser');
    const vimeo = fakePlayer(openViewer(host)!.querySelector('iframe')!, 'https://player.vimeo.com');
    vimeo.load();
    vimeo.answer({ event: 'ready' });
    expect(renderer.unmuteMedia()).toBe(true);
    expect(vimeo.messages().at(-1)).toEqual({ method: 'setMuted', value: false });
    restore();
  });

  test('needs a video to drive', () => {
    const { renderer } = mount(MAP);
    expect(renderer.unmuteMedia()).toBe(false);
    renderer.openMedia('trip');
    expect(renderer.unmuteMedia()).toBe(false);
  });
});

describe('media events', () => {
  test('media-open fires as the viewer opens and at every step, media-close as it closes', () => {
    const restore = quietFrames();
    const opened: OrbitMediaEvent[] = [];
    const closed: OrbitMediaEvent[] = [];
    const dom: string[] = [];
    const { host, renderer } = mount(MAP, { onMediaOpen: (event) => opened.push(event), onMediaClose: (event) => closed.push(event) });
    const heard: string[] = [];
    renderer.on('media-open', ({ node, kind }) => heard.push(`${node.id} ${kind}`));
    host.addEventListener('orbit-media-open', (event) => dom.push((event as CustomEvent<OrbitMediaEvent>).detail.node.id));
    host.addEventListener('orbit-media-close', (event) => dom.push(`closed ${(event as CustomEvent<OrbitMediaEvent>).detail.node.id}`));
    renderer.openMedia('trip');
    press(openViewer(host)!, 'ArrowRight');
    expect(opened.map(({ node, kind, index, total }) => [node.id, kind, index, total])).toEqual([
      ['trip', 'image', 0, 5],
      ['trail', 'video', 1, 5],
    ]);
    expect(heard).toEqual(['trip image', 'trail video']);
    renderer.closeMedia();
    expect(closed.map(({ node, kind, index }) => [node.id, kind, index])).toEqual([['trail', 'video', 1]]);
    expect(dom).toEqual(['trip', 'trail', 'closed trail']);
    restore();
  });

  test('a video file reports playing, pausing, its time and its end as media-state', () => {
    const states: OrbitMediaState[] = [];
    const { host, renderer } = mount(MAP, { onMediaState: (state) => states.push(state) });
    const fromEvents: OrbitMediaState[] = [];
    renderer.on('media-state', (state) => fromEvents.push(state));
    renderer.openMedia('both', { kind: 'video', autoplay: false });
    const video = openViewer(host)!.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 30, configurable: true });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(renderer.playMedia()).toBe(true);
    video.dispatchEvent(new Event('play'));
    expect(renderer.seekMedia(12)).toBe(true);
    expect(video.currentTime).toBe(12);
    video.dispatchEvent(new Event('seeked'));
    expect(renderer.pauseMedia()).toBe(true);
    video.dispatchEvent(new Event('pause'));
    Object.defineProperty(video, 'ended', { value: true, configurable: true });
    video.dispatchEvent(new Event('ended'));
    const summary = states.map(({ node, playing, time, duration, ended }) => `${node.id} ${playing ? 'playing' : 'paused'} ${time} of ${duration}${ended ? ', ended' : ''}`);
    expect(summary).toEqual([
      'both paused 0 of 30',
      'both playing 0 of 30',
      'both playing 12 of 30',
      'both paused 12 of 30',
      'both paused 12 of 30, ended',
    ]);
    expect(fromEvents).toHaveLength(states.length);
  });

  test('play, pause and seek need a video to drive', () => {
    const { renderer } = mount(MAP);
    expect(renderer.playMedia()).toBe(false);
    renderer.openMedia('trip');
    expect(renderer.playMedia()).toBe(false);
    expect(renderer.pauseMedia()).toBe(false);
    expect(renderer.seekMedia(3)).toBe(false);
    renderer.openMedia('both', { kind: 'video' });
    expect(renderer.seekMedia(Number.NaN)).toBe(false);
  });

  test('a browser that won’t start a video with sound gets it started muted', async () => {
    const { host, renderer } = mount(MAP);
    const play = spyOn(HTMLMediaElement.prototype, 'play');
    play.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('No sound yet'), { name: 'NotAllowedError' })));
    renderer.openMedia('both', { kind: 'video' });
    await Promise.resolve();
    await Promise.resolve();
    const video = openViewer(host)!.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    play.mockRestore();
  });
});

describe('YouTube’s player, driven through its messages', () => {
  const ORIGIN = 'https://www.youtube-nocookie.com';

  test('says it listens until the player answers, then starts it and sends what waited', () => {
    const restore = quietFrames();
    const { host, renderer } = mount(MAP);
    renderer.openMedia('trail');
    const player = fakePlayer(openViewer(host)!.querySelector('iframe')!, ORIGIN);
    // Pressed before the player is ready: it waits.
    renderer.pauseMedia();
    player.load();
    expect(player.messages()).toEqual([{ event: 'listening', id: expect.any(Number), channel: 'widget' }]);
    player.answer(JSON.stringify({ event: 'onReady', info: null, channel: 'widget' }));
    expect(player.messages().slice(1).map((message) => message.func)).toEqual(['playVideo', 'pauseVideo']);
    expect(player.targets()).toEqual(new Set([ORIGIN]));
    renderer.seekMedia(42);
    expect(player.messages().at(-1)).toMatchObject({ event: 'command', func: 'seekTo', args: [42, true] });
    restore();
  });

  test('reports what the player says, and nothing from anyone else', () => {
    const restore = quietFrames();
    const states: OrbitMediaState[] = [];
    const { host, renderer } = mount(MAP, { onMediaState: (state) => states.push(state) });
    renderer.openMedia('trail');
    const player = fakePlayer(openViewer(host)!.querySelector('iframe')!, ORIGIN);
    player.load();
    player.answer(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1, currentTime: 3, duration: 635, muted: false } }));
    player.answer(JSON.stringify({ event: 'infoDelivery', info: { playerState: 2, currentTime: 4.5 } }));
    player.answer(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1, currentTime: 99 } }), 'https://example.com');
    globalThis.window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 0 } }), origin: ORIGIN }));
    player.answer(JSON.stringify({ event: 'infoDelivery', info: { playerState: 0, currentTime: 635 } }));
    expect(states.map(({ playing, time, duration, ended }) => [playing, time, duration, ended])).toEqual([
      [true, 3, 635, false],
      [false, 4.5, 635, false],
      [false, 635, 635, true],
    ]);
    restore();
  });
});

describe('Vimeo’s player, driven through its messages', () => {
  const ORIGIN = 'https://player.vimeo.com';

  test('asks the player when it’s ready, listens to it, and starts it', () => {
    const restore = quietFrames();
    const states: OrbitMediaState[] = [];
    const { host, renderer } = mount(MAP, { onMediaState: (state) => states.push(state) });
    renderer.openMedia('teaser');
    const frame = openViewer(host)!.querySelector('iframe')!;
    const address = new URL(frame.src);
    expect(`${address.origin}${address.pathname}`).toBe('https://player.vimeo.com/video/76979871');
    expect(address.searchParams.get('autoplay')).toBe('1');
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    const player = fakePlayer(frame, ORIGIN);
    renderer.seekMedia(10);
    player.load();
    expect(player.messages()).toEqual([{ method: 'ping' }]);
    player.answer({ method: 'ping', value: 76979871 });
    const methods = player.messages().map((message) => `${message.method}${message.value === undefined ? '' : ` ${message.value}`}`);
    expect(methods).toContain('addEventListener play');
    expect(methods).toContain('addEventListener timeupdate');
    expect(methods).toContain('getVideoWidth');
    expect(methods.slice(-2)).toEqual(['play', 'setCurrentTime 10']);
    player.answer({ event: 'play', data: { seconds: 10, percent: 0.16, duration: 62 } });
    player.answer('{"event":"pause","data":{"seconds":11,"duration":62}}');
    expect(states.map(({ playing, time, duration }) => [playing, time, duration])).toEqual([
      [true, 10, 62],
      [false, 11, 62],
    ]);
    restore();
  });

  test('fits the player to the video’s shape once Vimeo says what it is', () => {
    const restore = quietFrames();
    const { host, renderer } = mount(MAP);
    renderer.openMedia('teaser');
    const frame = openViewer(host)!.querySelector('iframe')!;
    const box = frame.parentElement!;
    const player = fakePlayer(frame, ORIGIN);
    player.load();
    player.answer({ event: 'ready' });
    // 16:9 until it's known: the stage's 1000 px less the room beside it for the buttons, 72 px a side.
    expect(box.style.width).toBe('856px');
    expect(box.style.height).toBe('481.5px');
    player.answer({ method: 'getVideoWidth', value: 720 });
    player.answer({ method: 'getVideoHeight', value: 1280 });
    // Upright now: as tall as the stage allows (600 less the margins), and 9:16 across.
    expect(box.style.height).toBe('568px');
    expect(box.style.width).toBe('319.5px');
    restore();
  });
});

describe('on a map that isn’t interactive', () => {
  test('the viewer opens from code with no buttons and no video controls, and only the page closes it', () => {
    const { host, renderer } = mount(MAP, { interactive: false });
    expect(host.querySelector('.orbit-action--image')).toBeNull();
    renderer.openMedia('both', { kind: 'video' });
    const dialog = openViewer(host)!;
    expect(dialog.classList.contains('orbit-viewer--still')).toBe(true);
    expect(dialog.querySelector('video')?.controls).toBe(false);
    press(dialog, 'Escape');
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    click(host.querySelector('.orbit-viewer__media')!);
    expect(dialog.open).toBe(true);
    renderer.closeMedia();
    expect(dialog.open).toBe(false);
  });

  test('and takes input again once the map does', () => {
    const { host, renderer } = mount(MAP, { interactive: false });
    renderer.openMedia('both', { kind: 'video' });
    renderer.setOptions({ interactive: true });
    const dialog = openViewer(host)!;
    expect(dialog.classList.contains('orbit-viewer--still')).toBe(false);
    expect(dialog.querySelector('video')?.controls).toBe(true);
    press(dialog, 'Escape');
    expect(dialog.open).toBe(false);
  });
});

describe('<orbit-map>', () => {
  test('opens, plays and closes media like the renderer', async () => {
    defineOrbitMapElement();
    const element = document.createElement('orbit-map') as OrbitMapElement;
    element.textContent = MAP;
    document.body.appendChild(element);
    await Promise.resolve();
    const opened: string[] = [];
    element.addEventListener('orbit-media-open', (event) => opened.push((event as CustomEvent<OrbitMediaEvent>).detail.node.id));
    expect(element.playMedia()).toBe(false);
    expect(element.openMedia('both', { kind: 'video', autoplay: false })).toBe(true);
    const root = element.shadowRoot!;
    expect(openViewer(root)?.querySelector('video')).not.toBeNull();
    expect(element.playMedia()).toBe(true);
    expect(element.seekMedia(5)).toBe(true);
    expect(element.unmuteMedia()).toBe(true);
    expect(element.pauseMedia()).toBe(true);
    element.closeMedia();
    expect(openViewer(root)).toBeNull();
    expect(opened).toEqual(['both']);
    element.remove();
  });
});
