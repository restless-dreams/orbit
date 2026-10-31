import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, mock, spyOn, test } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { serializeOrbitMarkdown } from '../src/core/serializer-markdown';
import { serializeOrbitYAML } from '../src/core/serializer-yaml';
import { mediaExtras } from '../src/core/node-attributes';
import { withMedia } from '../src/core/web-page/runtime';
import { guardUrl } from '../src/core/url-guard';
import { MediaViewer } from '../src/core/ui/media-viewer';
import { HOLD_TIME, OPENING_DELAY, OPENING_PATIENCE } from '../src/core/ui/live-photo';
import { createMapTools } from '../src/core/map-tools/tools';
import type { OrbitMediaState, OrbitNode } from '../src/core/types';
import { click, mount, node, pointer, useMapSize, useReducedMotion } from './helpers/renderer';

useMapSize(600, 400);

/** happy-dom does no layout: the viewer's stage is 1000 × 600 px at the window's top left. */
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

afterEach(() => {
  mock.restore();
});

/** A length on the stage as the viewer writes it: to the hundredth of a pixel. */
const px = (value: number): number => {
  return Math.round(value * 100) / 100;
};

const TRIP = `# Trip
<!-- orbit
image:
  src: https://example.com/summit.jpg
  motion:
    src: https://example.com/summit.mp4
    still: 1.5
  alt: The summit at dawn
-->
We made it at six.

## Lake
<!-- orbit
image:
  src: media/lake.jpg
  motion: media/lake.mp4
-->

## Camp
![Sunset at camp](https://example.com/camp.jpg)
`;

const find = (root: OrbitNode, id: string): OrbitNode => {
  const visit = (current: OrbitNode): OrbitNode | undefined => (current.id === id ? current : current.children.map(visit).find(Boolean));
  return visit(root)!;
};

const viewer = (host: HTMLElement): HTMLDialogElement => {
  const dialog = host.querySelector<HTMLDialogElement>('dialog.orbit-viewer[open]');

  if (!dialog) {
    throw new Error('The viewer is closed');
  }

  return dialog;
};

/** The viewer's picture, loaded at its own size. */
const loadPicture = (host: HTMLElement, width = 800, height = 600): HTMLImageElement => {
  const image = host.querySelector<HTMLImageElement>('.orbit-viewer__picture');

  if (!image) {
    throw new Error('The viewer shows no picture');
  }

  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true });
  image.dispatchEvent(new Event('load'));
  return image;
};

/** Opens the viewer on the focused node's picture with "View picture", and loads it. */
const viewPicture = (host: HTMLElement): { dialog: HTMLDialogElement; picture: HTMLImageElement } => {
  const button = host.querySelector<HTMLButtonElement>('.orbit-action--image');

  if (!button) {
    throw new Error('No "View picture" button');
  }

  button.focus();
  click(button);
  return { dialog: viewer(host), picture: loadPicture(host) };
};

const motionOf = (host: ParentNode): HTMLVideoElement | null => {
  return host.querySelector<HTMLVideoElement>('video.orbit-viewer__motion');
};

const markOf = (host: ParentNode): HTMLButtonElement | null => {
  return host.querySelector<HTMLButtonElement>('button.orbit-viewer__live');
};

/** What a live photo is doing: playing, with or without its sound, over its picture or not. */
const state = (host: ParentNode): { playing: boolean; muted: boolean; shown: boolean; mark: boolean } => {
  const video = motionOf(host);
  return {
    playing: video !== null && !video.paused,
    muted: video?.muted ?? true,
    shown: video?.classList.contains('orbit-viewer__motion--shown') ?? false,
    mark: markOf(host)?.classList.contains('orbit-viewer__live--playing') ?? false,
  };
};

const STILL = { playing: false, muted: true, shown: false, mark: false };

const key = (target: Element, type: 'keydown' | 'keyup', name: string, repeat = false): KeyboardEvent => {
  const event = new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true, repeat });
  target.dispatchEvent(event);
  return event;
};

/** Promises settle: a refused `play()` is handled a moment after it's called. */
const settle = async (): Promise<void> => {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
};

describe('the format', () => {
  test('a live photo is a picture with its motion: an address, or one with where in it the picture was taken', () => {
    const map = parseOrbit(TRIP);
    expect(find(map.root, 'trip').image).toEqual({ src: 'https://example.com/summit.jpg', motion: { src: 'https://example.com/summit.mp4', still: 1.5 }, alt: 'The summit at dawn' });
    expect(find(map.root, 'lake').image).toEqual({ src: 'media/lake.jpg', motion: { src: 'media/lake.mp4' } });
    expect(map.diagnostics).toEqual([]);
  });

  test('saving writes it as the picture\'s attribute, never a line, with the motion right after the address', () => {
    const map = parseOrbit('# Trip\n## Summit\n- Lake\n');
    find(map.root, 'summit').image = { src: 'media/summit.jpg', alt: 'The summit', caption: 'At six', motion: { src: 'media/summit.mp4', still: 1.52 } };
    find(map.root, 'lake').image = { src: 'media/lake.jpg', motion: { src: 'media/lake.mp4' } };
    const written = serializeOrbitMarkdown(map, { keepSource: false });
    expect(written).toBe(`# Trip

## Summit
<!-- orbit
image:
  src: media/summit.jpg
  motion:
    src: media/summit.mp4
    still: 1.52
  alt: The summit
  caption: At six
-->
- Lake
  <!-- orbit
  image:
    src: media/lake.jpg
    motion: media/lake.mp4
  -->
`);
    expect(serializeOrbitMarkdown(parseOrbit(written))).toBe(written);
    expect(serializeOrbitMarkdown(parseOrbit(written), { keepSource: false })).toBe(written);
  });

  test('in YAML the motion goes first, where versions from before live photos write the fields they don\'t read', () => {
    const map = parseOrbit(TRIP);
    const yaml = serializeOrbitYAML(map);
    expect(yaml).toContain(`    image:
      motion:
        src: "https://example.com/summit.mp4"
        still: 1.5
      src: "https://example.com/summit.jpg"
      alt: The summit at dawn`);
    expect(yaml).toContain(`        image:
          motion: media/lake.mp4
          src: media/lake.jpg`);
    const back = parseOrbit(yaml);
    expect(back.diagnostics).toEqual([]);
    expect(find(back.root, 'trip').image).toEqual(find(map.root, 'trip').image!);
    expect(serializeOrbitYAML(back)).toBe(yaml);
    // From YAML, the markdown is the same as Orbit writes it from markdown.
    expect(serializeOrbitMarkdown(back, { keepSource: false })).toBe(serializeOrbitMarkdown(map, { keepSource: false }));
  });

  test('a map with live photos is written back as it was, and an edit rewrites only what it changed', () => {
    const map = parseOrbit(TRIP);
    expect(serializeOrbitMarkdown(map)).toBe(TRIP);
    find(map.root, 'camp').status = 'done';
    find(map.root, 'lake').color = '#F5A3A8';
    const written = serializeOrbitMarkdown(map);
    expect(written).toContain('## Lake\n<!-- orbit\ncolor: "#F5A3A8"\nimage:\n  src: media/lake.jpg\n  motion: media/lake.mp4\n-->');
    expect(written).toContain('<!-- orbit\nimage:\n  src: https://example.com/summit.jpg\n  motion:\n    src: https://example.com/summit.mp4\n    still: 1.5\n  alt: The summit at dawn\n-->');
  });

  test('edits on the map keep it, its fields too', () => {
    const source = '# Trip\n## Lake\n<!-- orbit\nimage:\n  src: lake.jpg\n  motion:\n    src: lake.mp4\n    still: 0.8\n    loop: true\n  width: 640\n-->\n';
    const { renderer } = mount(source);
    renderer.updateNode('lake', { text: 'The lake', color: '#9ED5FD' });
    expect(renderer.toMarkdown()).toBe('# Trip\n## The lake\n<!-- orbit\ncolor: "#9ED5FD"\nimage:\n  src: lake.jpg\n  motion:\n    src: lake.mp4\n    still: 0.8\n    loop: true\n  width: 640\n-->\n');
    // A caption given with the picture's other fields keeps its motion.
    const lake = renderer.getDocument()!.root.children[0];
    renderer.updateNode(lake.id, { image: { ...lake.image!, caption: 'Mist before seven' } });
    expect(renderer.getDocument()!.root.children[0].image?.motion).toEqual({ src: 'lake.mp4', still: 0.8 });
  });

  test('a motion that isn\'t an address or one, or a still that isn\'t a time, is kept as written', () => {
    const source = '# Trip\n## Lake\n<!-- orbit\nimage:\n  src: lake.jpg\n  motion: 42\n-->\n## Pier\n<!-- orbit\nimage:\n  src: pier.jpg\n  motion:\n    src: pier.mp4\n    still: soon\n-->\n';
    const map = parseOrbit(source);
    const lake = find(map.root, 'lake');
    const pier = find(map.root, 'pier');
    expect(lake.image).toEqual({ src: 'lake.jpg' });
    expect(mediaExtras(lake.image)).toEqual({ motion: 42 });
    expect(pier.image).toEqual({ src: 'pier.jpg', motion: { src: 'pier.mp4' } });
    expect(mediaExtras(pier.image?.motion)).toEqual({ still: 'soon' });
    expect(map.diagnostics).toEqual([]);
    expect(serializeOrbitMarkdown(map)).toBe(source);
    expect(serializeOrbitMarkdown(map, { keepSource: false })).toBe(source.replace('## Lake\n', '\n## Lake\n').replace('## Pier\n', '\n## Pier\n'));
    expect(serializeOrbitYAML(parseOrbit(serializeOrbitYAML(map)))).toBe(serializeOrbitYAML(map));
  });

  test('a map as versions from before live photos write it reads the same: the motion where they keep it', () => {
    // They keep the motion with the picture's other fields they don't read: right after `src` in markdown, first in YAML.
    const markdown = '# Trip\n## Lake\n<!-- orbit\nimage:\n  src: lake.jpg\n  motion: lake.mp4\n  width: 640\n  alt: The lake\n-->\n';
    const yaml = 'nodes:\n  - text: Trip\n    children:\n      - text: Lake\n        image:\n          motion: lake.mp4\n          width: 640\n          src: lake.jpg\n          alt: The lake\n';
    expect(find(parseOrbit(markdown).root, 'lake').image).toEqual({ src: 'lake.jpg', motion: { src: 'lake.mp4' }, alt: 'The lake' });
    expect(serializeOrbitMarkdown(parseOrbit(markdown), { keepSource: false })).toBe(markdown.replace('## Lake', '\n## Lake'));
    expect(serializeOrbitYAML(parseOrbit(yaml))).toBe(yaml);
    expect(serializeOrbitYAML(parseOrbit(markdown))).toBe(yaml);
  });

  test('the motion\'s address is checked where it plays: files, the web, blobs and motions inside a page', () => {
    const quiet = spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(guardUrl('media/lake.mp4', 'motion')).toBe('media/lake.mp4');
    expect(guardUrl('https://example.com/lake.mp4', 'motion')).toBe('https://example.com/lake.mp4');
    expect(guardUrl('blob:https://example.com/abc', 'motion')).toBe('blob:https://example.com/abc');
    expect(guardUrl('data:video/mp4;base64,AAAA', 'motion')).toBe('data:video/mp4;base64,AAAA');
    expect(guardUrl('data:video/quicktime;base64,AAAA', 'motion')).toBe('data:video/quicktime;base64,AAAA');
    expect(guardUrl('data:text/html;base64,AAAA', 'motion')).toBeNull();
    expect(guardUrl('javascript:alert(1)', 'motion')).toBeNull();
    // A video is too big to carry inside a page: only a motion is.
    expect(guardUrl('data:video/mp4;base64,AAAA', 'video')).toBeNull();
    quiet.mockRestore();
  });
});

describe('on the map', () => {
  test('planets show the still, and nothing moves there', () => {
    const { host } = mount(TRIP);
    expect(node(host, 'lake').querySelector('image')?.getAttribute('href')).toBe('media/lake.jpg');
    expect(host.querySelector('video')).toBeNull();
  });

  test('the detail sheet shows the still too, with its mark, and its name says it\'s a live photo', () => {
    const { host } = mount(TRIP);
    click(host.querySelector('.orbit-action--note')!);
    const sheet = host.querySelector<HTMLDialogElement>('dialog.orbit-sheet[open]')!;
    const picture = sheet.querySelector<HTMLButtonElement>('button.orbit-sheet__picture')!;
    expect(picture.getAttribute('aria-label')).toBe('View live photo: The summit at dawn');
    const mark = sheet.querySelector('.orbit-sheet__live')!;
    expect(mark.textContent).toBe('Live');
    // The button's name says it already.
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(sheet.querySelector('video')).toBeNull();
  });

  test('without the viewer, the sheet\'s picture is only a picture, and the mark says what it is', () => {
    const { host } = mount(TRIP, { showMediaViewer: false, language: 'es' });
    click(host.querySelector('.orbit-action--note')!);
    const sheet = host.querySelector<HTMLDialogElement>('dialog.orbit-sheet[open]')!;
    expect(sheet.querySelector('.orbit-sheet__picture')).toBeNull();
    const mark = sheet.querySelector('.orbit-sheet__live')!;
    expect(mark.textContent).toBe('En vivo');
    expect(mark.hasAttribute('aria-hidden')).toBe(false);
  });
});

describe('the media viewer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('a live photo wears its mark once its picture shows: a button that says what it does', () => {
    const { host } = mount(TRIP);
    click(host.querySelector('.orbit-action--image')!);
    const mark = markOf(host)!;
    expect(mark.hidden).toBe(true);
    const picture = loadPicture(host);
    expect(mark.hidden).toBe(false);
    expect(mark.textContent).toBe('Live');
    expect(mark.getAttribute('aria-label')).toBe('Play the live photo');
    expect(mark.title).toBe('Hold to play');
    expect(picture.classList.contains('orbit-viewer__picture--live')).toBe(true);
    // Inside the picture's top left corner.
    expect(mark.style.transform).toBe(`translate(${px(parseFloat(picture.style.left) + 12)}px, ${px(parseFloat(picture.style.top) + 12)}px)`);
  });

  test('its words are the map\'s, and change with its language', () => {
    const { host, renderer } = mount(TRIP, { language: 'es' });
    viewPicture(host);
    const mark = markOf(host)!;
    expect(mark.textContent).toBe('En vivo');
    expect(mark.getAttribute('aria-label')).toBe('Reproducir la foto en vivo');
    expect(mark.title).toBe('Mantén presionado para reproducirla');
    renderer.setOptions({ language: 'en' });
    expect(mark.textContent).toBe('Live');
    expect(mark.getAttribute('aria-label')).toBe('Play the live photo');
  });

  test('as the viewer opens, the motion plays once, muted, over the picture, and settles back on it where the picture was taken', () => {
    const { host } = mount(TRIP);
    viewPicture(host);
    const video = motionOf(host)!;
    // It loads as the viewer opens, under the picture's mark, hidden from assistive technology: the picture is what it shows.
    expect(video.getAttribute('src')).toBe('https://example.com/summit.mp4');
    expect(video.muted).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.getAttribute('aria-hidden')).toBe('true');
    expect(video.previousElementSibling).toBe(host.querySelector('.orbit-viewer__picture'));
    expect(video.nextElementSibling).toBe(markOf(host));
    expect(state(host)).toEqual(STILL);
    jest.advanceTimersByTime(OPENING_DELAY);
    expect(state(host)).toEqual({ playing: true, muted: true, shown: true, mark: true });
    // A video running behind the clock gets there in its own time…
    video.currentTime = 1.2;
    jest.advanceTimersByTime(1500);
    expect(state(host).playing).toBe(true);
    // …and stops on the picture itself.
    video.currentTime = 1.5;
    jest.advanceTimersByTime(300);
    expect(state(host)).toEqual(STILL);
    expect(video.isConnected).toBe(true);
  });

  test('without the moment the picture was taken, the whole motion plays, and settles when it ends', () => {
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('lake');
    viewPicture(host);
    jest.advanceTimersByTime(OPENING_DELAY);
    expect(state(host)).toEqual({ playing: true, muted: true, shown: true, mark: true });
    jest.advanceTimersByTime(5000);
    expect(state(host).playing).toBe(true);
    motionOf(host)!.dispatchEvent(new Event('ended'));
    expect(state(host)).toEqual(STILL);
  });

  test('held, the picture plays its motion from the start with its sound, and letting go settles it back', () => {
    const { host } = mount(TRIP);
    const { picture } = viewPicture(host);
    jest.advanceTimersByTime(OPENING_DELAY);
    const video = motionOf(host)!;
    video.currentTime = 1.5;
    jest.advanceTimersByTime(1500);
    picture.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, time: 0, kind: 'touch' }));
    jest.advanceTimersByTime(HOLD_TIME - 50);
    expect(state(host)).toEqual(STILL);
    jest.advanceTimersByTime(50);
    expect(video.currentTime).toBe(0);
    expect(state(host)).toEqual({ playing: true, muted: false, shown: true, mark: true });
    // Moving the finger doesn't drag the picture while it's held.
    picture.dispatchEvent(pointer('pointermove', { x: 440, y: 380, time: 400, kind: 'touch' }));
    expect(state(host).playing).toBe(true);
    picture.dispatchEvent(pointer('pointerup', { x: 440, y: 380, time: 450, kind: 'touch' }));
    expect(state(host)).toEqual({ ...STILL, muted: false });
    expect(viewer(host).open).toBe(true);
    expect(host.querySelector('.orbit-viewer__counter span')?.textContent).toBe('1 of 3');
  });

  test('a press that moves is a swipe, not a hold, and a quick one is a tap', () => {
    const { host } = mount(TRIP);
    const { picture } = viewPicture(host);
    const play = spyOn(HTMLMediaElement.prototype, 'play');
    picture.dispatchEvent(pointer('pointerdown', { x: 600, y: 300, time: 0, kind: 'touch' }));
    picture.dispatchEvent(pointer('pointermove', { x: 560, y: 302, time: 16, kind: 'touch' }));
    jest.advanceTimersByTime(HOLD_TIME * 2);
    picture.dispatchEvent(pointer('pointerup', { x: 520, y: 302, time: 600, kind: 'touch' }));
    expect(host.querySelector('.orbit-viewer__counter span')?.textContent).toBe('2 of 3');
    // The press came before the summit's motion started, which it then skipped.
    expect(play.mock.calls.length).toBe(0);
    const lake = loadPicture(host);
    lake.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, time: 700, kind: 'mouse' }));
    jest.advanceTimersByTime(100);
    lake.dispatchEvent(pointer('pointerup', { x: 500, y: 300, time: 800, kind: 'mouse' }));
    jest.advanceTimersByTime(OPENING_PATIENCE);
    expect(play.mock.calls.length).toBe(0);
    expect(state(host)).toEqual(STILL);
  });

  test('a long press by touch plays it, so the browser\'s menu for the picture stays closed', () => {
    const { host } = mount(TRIP);
    const { picture } = viewPicture(host);

    const menu = () => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      picture.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(menu()).toBe(false);
    picture.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, time: 0, kind: 'touch' }));
    expect(menu()).toBe(true);
    jest.advanceTimersByTime(HOLD_TIME);
    expect(menu()).toBe(true);
    picture.dispatchEvent(pointer('pointerup', { x: 500, y: 300, time: 700, kind: 'touch' }));
    expect(menu()).toBe(false);
  });

  test('its mark plays it too: held, until let go; tapped, through once', () => {
    const { host } = mount(TRIP);
    viewPicture(host);
    const mark = markOf(host)!;
    mark.dispatchEvent(pointer('pointerdown', { x: 30, y: 30, time: 0, kind: 'touch' }));
    expect(state(host)).toEqual({ playing: true, muted: false, shown: true, mark: true });
    jest.advanceTimersByTime(HOLD_TIME + 200);
    mark.dispatchEvent(pointer('pointerup', { x: 30, y: 30, time: 500, kind: 'touch' }));
    click(mark);
    expect(state(host)).toEqual({ ...STILL, muted: false });

    const play = spyOn(HTMLMediaElement.prototype, 'play');
    mark.dispatchEvent(pointer('pointerdown', { x: 30, y: 30, time: 1000, kind: 'touch' }));
    jest.advanceTimersByTime(80);
    mark.dispatchEvent(pointer('pointerup', { x: 30, y: 30, time: 1080, kind: 'touch' }));
    // The click a tap ends with, even a moment later, is the tap's own.
    jest.advanceTimersByTime(150);
    click(mark);
    expect(play.mock.calls.length).toBe(1);
    expect(state(host)).toEqual({ playing: true, muted: false, shown: true, mark: true });
    jest.advanceTimersByTime(3000);
    expect(state(host).playing).toBe(true);
    motionOf(host)!.dispatchEvent(new Event('ended'));
    expect(state(host)).toEqual({ ...STILL, muted: false });
  });

  test('keyboards hold the space bar, on the viewer or on the mark, and screen readers press the mark', () => {
    const { host } = mount(TRIP);
    const { dialog } = viewPicture(host);
    expect(key(dialog, 'keydown', ' ').defaultPrevented).toBe(true);
    expect(state(host)).toEqual({ playing: true, muted: false, shown: true, mark: true });
    key(dialog, 'keydown', ' ', true);
    jest.advanceTimersByTime(HOLD_TIME + 100);
    key(dialog, 'keyup', ' ');
    expect(state(host)).toEqual({ ...STILL, muted: false });

    // A quick press plays it through.
    key(dialog, 'keydown', ' ');
    key(dialog, 'keyup', ' ');
    jest.advanceTimersByTime(1000);
    expect(state(host).playing).toBe(true);
    motionOf(host)!.dispatchEvent(new Event('ended'));

    const mark = markOf(host)!;
    mark.focus();
    expect(key(mark, 'keydown', 'Enter').defaultPrevented).toBe(true);
    expect(state(host).playing).toBe(true);
    jest.advanceTimersByTime(HOLD_TIME + 100);
    key(mark, 'keyup', 'Enter');
    expect(state(host)).toEqual({ ...STILL, muted: false });

    // Assistive technology presses the button with a click alone.
    jest.advanceTimersByTime(2000);
    click(mark);
    expect(state(host).playing).toBe(true);
  });

  test('a browser that won\'t play its sound without a press plays it silent', async () => {
    const original = HTMLMediaElement.prototype.play;

    const play = spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      return this.muted ? original.call(this) : Promise.reject(new DOMException('No sound before a press', 'NotAllowedError'));
    });

    const { host } = mount(TRIP);
    viewPicture(host);
    markOf(host)!.dispatchEvent(pointer('pointerdown', { x: 30, y: 30, time: 0, kind: 'touch' }));
    await settle();
    expect(play.mock.calls.length).toBe(2);
    expect(state(host)).toEqual({ playing: true, muted: true, shown: true, mark: true });
  });

  test('a motion that can\'t be played leaves the picture as it is, without its mark, and says nothing', () => {
    const warn = spyOn(console, 'warn');
    const error = spyOn(console, 'error');
    const { host } = mount(TRIP);
    const { picture } = viewPicture(host);
    motionOf(host)!.dispatchEvent(new Event('error'));
    expect(motionOf(host)).toBeNull();
    expect(markOf(host)).toBeNull();
    expect(picture.isConnected).toBe(true);
    expect(picture.classList.contains('orbit-viewer__picture--live')).toBe(false);
    expect(host.querySelector<HTMLElement>('.orbit-viewer__status')?.hidden).toBe(true);
    jest.advanceTimersByTime(OPENING_PATIENCE);
    expect(motionOf(host)).toBeNull();
    // The space bar is the viewer's again.
    key(viewer(host), 'keydown', ' ');
    expect(motionOf(host)).toBeNull();
    expect([warn.mock.calls.length, error.mock.calls.length]).toEqual([0, 0]);
  });

  test('opened by a page that says not to play, it waits to be asked, and loads nothing until then', () => {
    const { host, renderer } = mount(TRIP);
    renderer.openMedia('trip', { autoplay: false });
    loadPicture(host);
    jest.advanceTimersByTime(OPENING_PATIENCE);
    expect(motionOf(host)).toBeNull();
    expect(markOf(host)?.hidden).toBe(false);
    click(markOf(host)!);
    expect(motionOf(host)?.getAttribute('src')).toBe('https://example.com/summit.mp4');
    expect(state(host).playing).toBe(true);
  });

  test('the motion follows the picture as it zooms, and the mark keeps inside the picture, or the stage', () => {
    const { host } = mount(TRIP);
    const { dialog, picture } = viewPicture(host);
    const video = motionOf(host)!;
    const mark = markOf(host)!;
    expect([video.style.left, video.style.top, video.style.width, video.style.height]).toEqual([picture.style.left, picture.style.top, picture.style.width, picture.style.height]);
    key(dialog, 'keydown', '+');
    expect(video.style.transform).toBe(picture.style.transform);
    expect(video.classList.contains('orbit-viewer__motion--gliding')).toBe(true);
    expect(mark.classList.contains('orbit-viewer__live--gliding')).toBe(true);
    key(dialog, 'keydown', '+');
    key(dialog, 'keydown', '+');
    // Bigger than the stage, the picture's corner is off it: the mark keeps to the stage's.
    expect(mark.style.transform).toBe('translate(12px, 12px)');
    key(dialog, 'keydown', '0');
    expect(mark.style.transform).toBe(`translate(${px(parseFloat(picture.style.left) + 12)}px, ${px(parseFloat(picture.style.top) + 12)}px)`);
  });

  test('stepping away stops it, and its download', () => {
    const { host } = mount(TRIP);
    const { dialog } = viewPicture(host);
    jest.advanceTimersByTime(OPENING_DELAY);
    const video = motionOf(host)!;
    expect(state(host).playing).toBe(true);
    key(dialog, 'keydown', 'ArrowRight');
    expect(video.isConnected).toBe(false);
    expect(video.paused).toBe(true);
    expect(video.hasAttribute('src')).toBe(false);
    // The next live photo plays as it shows.
    loadPicture(host);
    jest.advanceTimersByTime(OPENING_DELAY);
    expect(motionOf(host)?.getAttribute('src')).toBe('media/lake.mp4');
    expect(state(host).playing).toBe(true);
    key(dialog, 'keydown', 'ArrowRight');
    expect(markOf(host)).toBeNull();
    expect(motionOf(host)).toBeNull();
  });

  test('on a map that isn\'t interactive it plays as it opens, but takes no presses', () => {
    const { host, renderer } = mount(TRIP, { interactive: false });
    renderer.openMedia('trip');
    loadPicture(host);
    const mark = markOf(host)!;
    expect(mark.disabled).toBe(true);
    jest.advanceTimersByTime(OPENING_DELAY);
    expect(state(host).playing).toBe(true);
    motionOf(host)!.dispatchEvent(new Event('ended'));
    mark.dispatchEvent(pointer('pointerdown', { x: 30, y: 30, time: 0, kind: 'touch' }));
    click(mark);
    expect(state(host)).toEqual(STILL);
  });
});

describe('driven by the page', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Whether the motion plays over the picture, and with its sound. */
  const playing = (host: ParentNode) => {
    const { playing: moving, muted, shown } = state(host);
    return { moving, muted, shown };
  };

  test('playMedia() plays a live photo\'s motion through once, with its sound, and pauseMedia() settles it back', () => {
    const { host, renderer } = mount(TRIP, { interactive: false });
    renderer.openMedia('trip', { autoplay: false });
    loadPicture(host);
    jest.advanceTimersByTime(OPENING_PATIENCE);
    expect(motionOf(host)).toBeNull();
    expect(renderer.playMedia()).toBe(true);
    expect(playing(host)).toEqual({ moving: true, muted: false, shown: true });
    expect(renderer.pauseMedia()).toBe(true);
    expect(playing(host)).toEqual({ moving: false, muted: false, shown: false });
    // Its motion plays from its start, always.
    expect(renderer.seekMedia(1)).toBe(false);
    // A still picture has nothing to play.
    renderer.openMedia('camp');
    expect(renderer.playMedia()).toBe(false);
    expect(renderer.pauseMedia()).toBe(false);
    expect(renderer.unmuteMedia()).toBe(false);
  });

  test('media-state follows the motion, and says it\'s a picture\'s', () => {
    const states: OrbitMediaState[] = [];
    const heard: OrbitMediaState[] = [];
    const { host, renderer } = mount(TRIP, { onMediaState: (each) => states.push(each) });
    renderer.on('media-state', (each) => heard.push(each));
    renderer.openMedia('lake', { autoplay: false });
    loadPicture(host);
    renderer.playMedia();
    expect(states.at(-1)).toMatchObject({ node: { id: 'lake' }, kind: 'image', playing: true, ended: false, muted: false });
    const video = motionOf(host)!;
    Object.defineProperty(video, 'duration', { value: 2.5, configurable: true });
    Object.defineProperty(video, 'ended', { value: true, configurable: true });
    video.dispatchEvent(new Event('ended'));
    expect(states.at(-1)).toMatchObject({ kind: 'image', playing: false, ended: true, duration: 2.5 });
    expect(heard).toEqual(states);
  });

  test('unmuteMedia() gives a live photo its sound: the motion playing, and its opening if it hasn\'t started', () => {
    const { host, renderer } = mount(TRIP);
    renderer.openMedia('trip');
    loadPicture(host);
    jest.advanceTimersByTime(OPENING_DELAY);
    expect(playing(host)).toEqual({ moving: true, muted: true, shown: true });
    expect(renderer.unmuteMedia()).toBe(true);
    expect(playing(host).muted).toBe(false);
    // Asked for before the next live photo's opening, the opening has it.
    key(viewer(host), 'keydown', 'ArrowRight');
    loadPicture(host);
    expect(renderer.unmuteMedia()).toBe(true);
    jest.advanceTimersByTime(OPENING_DELAY);
    expect(motionOf(host)?.getAttribute('src')).toBe('media/lake.mp4');
    expect(playing(host)).toEqual({ moving: true, muted: false, shown: true });
  });
});

describe('with reduced motion', () => {
  useReducedMotion();

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('it plays only when asked, and loads nothing until then', () => {
    const { host } = mount(TRIP);
    viewPicture(host);
    jest.advanceTimersByTime(OPENING_PATIENCE);
    expect(motionOf(host)).toBeNull();
    expect(markOf(host)?.hidden).toBe(false);
    const picture = host.querySelector('.orbit-viewer__picture')!;
    picture.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, time: 0, kind: 'mouse' }));
    jest.advanceTimersByTime(HOLD_TIME);
    expect(motionOf(host)?.getAttribute('src')).toBe('https://example.com/summit.mp4');
    expect(state(host)).toEqual({ playing: true, muted: false, shown: true, mark: true });
    picture.dispatchEvent(pointer('pointerup', { x: 500, y: 300, time: 400, kind: 'mouse' }));
    expect(state(host)).toEqual({ ...STILL, muted: false });
  });
});

describe('pages and tools', () => {
  test('a web page swaps a motion for the one inside it', () => {
    const map = withMedia(parseOrbit(TRIP), { 'media/lake.mp4': 'data:video/mp4;base64,AAAA', 'media/lake.jpg': 'data:image/jpeg;base64,BBBB' });
    expect(find(map.root, 'lake').image).toEqual({ src: 'data:image/jpeg;base64,BBBB', motion: { src: 'data:video/mp4;base64,AAAA' } });
    expect(find(map.root, 'trip').image?.motion).toEqual({ src: 'https://example.com/summit.mp4', still: 1.5 });
  });

  test('map tools say a picture is a live photo, and keep its motion when its caption changes', () => {
    const tools = createMapTools(TRIP);
    expect(tools.run('read_node', { node_id: 'lake' }).text).toContain('Picture: media/lake.jpg (live photo: media/lake.mp4)');
    expect(tools.run('update_node', { node_id: 'lake', image: { src: 'media/lake.jpg', caption: 'Mist before seven' } }).ok).toBe(true);
    expect(tools.document!.root.children[0].image).toEqual({ src: 'media/lake.jpg', caption: 'Mist before seven', motion: { src: 'media/lake.mp4' } });
    // Another picture is another photo.
    tools.run('update_node', { node_id: 'lake', image: { src: 'media/pier.jpg' } });
    expect(tools.document!.root.children[0].image).toEqual({ src: 'media/pier.jpg' });
  });
});
