import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { MediaViewer, galleryItems } from '../src/core/ui/media-viewer';
import type { OrbitActionEvent } from '../src/core/types';
import { click, internals, mount, pointer, useMapSize, wheel } from './helpers/renderer';

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

const TRIP = `# Trip
![Sunrise from the summit](https://example.com/summit.jpg)
> We left at 5am.

## Gear
- Boots

## Trail
[Walkthrough](https://www.youtube.com/watch?v=aqz-KE-bpKQ)

## Camp
![Sunset at camp](https://example.com/camp.jpg)
<!-- orbit caption: Our tents at dusk. -->

### Night sky
[![Stars over camp](https://example.com/stars.jpg)](https://example.com/stars.webm)
> Three in the morning.`;

const openViewer = (host: HTMLElement): HTMLDialogElement | null => {
  return host.querySelector<HTMLDialogElement>('dialog.orbit-viewer[open]');
};

const openSheet = (host: HTMLElement): HTMLDialogElement | null => {
  return host.querySelector<HTMLDialogElement>('dialog.orbit-sheet[open]');
};

/** "2 of 4": where the viewer is among the map's pictures and videos. */
const position = (host: HTMLElement): string | undefined => {
  return openViewer(host)?.querySelector('.orbit-viewer__counter span')?.textContent ?? undefined;
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

/** The picture's zoom and where its center is, from the stage's center, as drawn. */
const viewOf = (image: HTMLImageElement): { scale: number; x: number; y: number } => {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(image.style.transform);

  if (!match) {
    throw new Error(`No view in "${image.style.transform}"`);
  }

  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
};

/** The point of the picture (fitted px from its center) under a point of the window. */
const pictureUnder = (image: HTMLImageElement, x: number, y: number): { x: number; y: number } => {
  const view = viewOf(image);
  return { x: (x - STAGE.width / 2 - view.x) / view.scale, y: (y - STAGE.height / 2 - view.y) / view.scale };
};

const press = (target: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

const touch = (type: string, x: number, y: number, id = 1, time = 0): Event => {
  return pointer(type, { x, y, time, id, kind: 'touch' });
};

/** Opens the viewer on the focused node's picture or video, with its button. */
const view = (host: HTMLElement, kind: 'image' | 'video'): HTMLDialogElement => {
  const button = host.querySelector<HTMLButtonElement>(`.orbit-action--${kind}`);

  if (!button) {
    throw new Error(`No ${kind} button`);
  }

  button.focus();
  click(button);
  const dialog = openViewer(host);

  if (!dialog) {
    throw new Error('The viewer did not open');
  }

  return dialog;
};

/** Frames log that they can't load in happy-dom. */
const quietFrames = (): () => void => {
  const quiet = spyOn(console, 'error').mockImplementation(() => undefined);
  return () => quiet.mockRestore();
};

describe('the map’s pictures and videos', () => {
  test('come in reading order, a node’s picture before its video, leaving out what can’t be shown', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    const { root } = parseOrbit(`# Root
![The root](root.jpg)

## A
[Clip](https://example.com/a.mp4)

### A1
![Deeper](a1.jpg)

## B
![Poster](b.jpg)
<!-- orbit video: "https://vimeo.com/76979871" -->

## C
<!-- orbit image: "javascript:alert(1)" -->`);
    const order = (maxDepth?: number) => galleryItems(root, maxDepth).map((item) => `${item.node.id} ${item.kind}`);
    expect(order()).toEqual(['root image', 'a video', 'a1 image', 'b image', 'b video']);
    expect(order(1)).toEqual(['root image', 'a video', 'b image', 'b video']);
    warn.mockRestore();
  });
});

describe('opening the viewer', () => {
  test('"View image" shows the picture over the whole window, with the node’s title and a link to the picture', () => {
    const { host } = mount(TRIP);
    const dialog = view(host, 'image');
    const image = dialog.querySelector<HTMLImageElement>('img.orbit-viewer__picture');
    expect(image?.getAttribute('src')).toBe('https://example.com/summit.jpg');
    expect(image?.alt).toBe('Sunrise from the summit');
    const title = dialog.querySelector('.orbit-viewer__title');
    expect(title?.textContent).toBe('Trip');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title?.id ?? '');
    expect(position(host)).toBe('1 of 4');
    expect(dialog.querySelector('.orbit-viewer__counter')?.getAttribute('role')).toBe('status');
    const link = dialog.querySelector<HTMLAnchorElement>('.orbit-viewer__link');
    expect(link?.href).toBe('https://example.com/summit.jpg');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toBe('noopener noreferrer');
    expect(openSheet(host)).toBeNull();
  });

  test('the caption and the picture’s description show under it', () => {
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('camp');
    const dialog = view(host, 'image');
    expect(dialog.querySelector('.orbit-viewer__title')?.textContent).toBe('Camp');
    expect(dialog.querySelector('.orbit-viewer__text')?.textContent).toBe('Our tents at dusk.');
    expect(dialog.querySelector<HTMLElement>('.orbit-viewer__description')?.hidden).toBe(false);
    expect(dialog.querySelector('.orbit-viewer__description')?.textContent).toBe('Sunset at camp');
    expect(dialog.querySelector<HTMLImageElement>('.orbit-viewer__picture')?.alt).toBe('Sunset at camp');
  });

  test('"Play video" plays YouTube in its own player: at once, driven by messages, and with the referrer it needs', () => {
    const restore = quietFrames();
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('trail');
    const frame = view(host, 'video').querySelector('iframe');
    const address = new URL(frame?.src ?? '');
    expect(`${address.origin}${address.pathname}`).toBe('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ');
    expect(address.searchParams.get('autoplay')).toBe('1');
    expect(address.searchParams.get('enablejsapi')).toBe('1');
    expect(address.searchParams.get('origin')).toBe(location.origin);
    expect(frame?.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(frame?.getAttribute('allow')).toBe('autoplay; fullscreen; picture-in-picture; encrypted-media');
    expect(frame?.hasAttribute('allowfullscreen')).toBe(true);
    expect(frame?.title).toBe('Trail');
    const link = openViewer(host)?.querySelector('.orbit-viewer__link');
    expect(link?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=aqz-KE-bpKQ');
    expect(link?.getAttribute('aria-label')).toBe('Watch on YouTube');
    restore();
  });

  test('a video file plays in a video element, at once, inline and with its controls', () => {
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('night-sky');
    const video = view(host, 'video').querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://example.com/stars.webm');
    expect(video?.controls).toBe(true);
    expect(video?.hasAttribute('autoplay')).toBe(true);
    expect(video?.hasAttribute('playsinline')).toBe(true);
    expect(video?.getAttribute('poster')).toBe('https://example.com/stars.jpg');
  });

  test('with the detail sheet off, pictures and videos still open in the viewer', () => {
    const { host } = mount(TRIP, { showDetailSheet: false });
    view(host, 'image');
    expect(openSheet(host)).toBeNull();
  });

  test('without the viewer, they open in the detail sheet, and with neither, nothing opens', () => {
    const { host } = mount(TRIP, { mediaViewer: false });
    click(host.querySelector('.orbit-action--image')!);
    expect(openViewer(host)).toBeNull();
    expect(openSheet(host)?.querySelector('img')?.getAttribute('src')).toBe('https://example.com/summit.jpg');

    const { host: bare } = mount(TRIP, { mediaViewer: false, showDetailSheet: false });
    click(bare.querySelector('.orbit-action--image')!);
    expect(bare.querySelector('dialog[open]')).toBeNull();
  });

  test('a page that handles the button itself keeps the viewer closed', () => {
    const onAction = mock<(event: OrbitActionEvent) => false>(() => false as const);
    const { host } = mount(TRIP, { onAction });
    click(host.querySelector('.orbit-action--image')!);
    expect(onAction.mock.calls[0][0].action).toBe('image');
    expect(host.querySelector('dialog[open]')).toBeNull();

    const { host: other } = mount(TRIP);
    other.addEventListener('orbit-action', (event) => event.preventDefault());
    click(other.querySelector('.orbit-action--image')!);
    expect(other.querySelector('dialog[open]')).toBeNull();
  });
});

describe('stepping through the map’s pictures and videos', () => {
  test('previous and next follow reading order; so do the arrow keys, Home and End', () => {
    const restore = quietFrames();
    const { host } = mount(TRIP);
    const dialog = view(host, 'image');
    const previous = dialog.querySelector<HTMLButtonElement>('.orbit-viewer__step--previous')!;
    const next = dialog.querySelector<HTMLButtonElement>('.orbit-viewer__step--next')!;
    expect(previous.disabled).toBe(true);
    click(next);
    expect(position(host)).toBe('2 of 4');
    expect(dialog.querySelector('iframe')).not.toBeNull();
    press(dialog, 'ArrowRight');
    expect(position(host)).toBe('3 of 4');
    expect(dialog.querySelector('.orbit-viewer__title')?.textContent).toBe('Camp');
    press(dialog, 'End');
    expect(position(host)).toBe('4 of 4');
    expect(dialog.querySelector('video')).not.toBeNull();
    expect(next.disabled).toBe(true);
    press(dialog, 'Home');
    expect(position(host)).toBe('1 of 4');
    press(dialog, 'ArrowLeft');
    expect(position(host)).toBe('1 of 4');
    // A button pressed to the end hands focus to the viewer, which keeps its keys.
    press(dialog, 'End');
    next.focus();
    press(dialog, 'ArrowLeft');
    click(next);
    expect(next.disabled).toBe(true);
    expect(document.activeElement).toBe(dialog);
    restore();
  });

  test('a video stops when the viewer steps away from it', () => {
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('night-sky');
    const dialog = view(host, 'video');
    const video = dialog.querySelector('video')!;
    const pause = spyOn(video, 'pause');
    press(dialog, 'ArrowLeft');
    expect(pause).toHaveBeenCalled();
    expect(video.isConnected).toBe(false);
    expect(video.hasAttribute('src')).toBe(false);
  });

  test('on touch screens, a swipe across steps', () => {
    const restore = quietFrames();
    const { host } = mount(TRIP);
    const dialog = view(host, 'image');
    const image = loadPicture(host);
    image.dispatchEvent(touch('pointerdown', 600, 300));
    image.dispatchEvent(touch('pointermove', 520, 305));
    image.dispatchEvent(touch('pointerup', 480, 305));
    expect(position(host)).toBe('2 of 4');
    expect(dialog.open).toBe(true);
    restore();
  });
});

describe('zooming pictures', () => {
  test('a double click zooms in around its point, and out again', () => {
    const { host } = mount(TRIP);
    view(host, 'image');
    const image = loadPicture(host);
    const before = pictureUnder(image, 650, 350);
    image.dispatchEvent(new MouseEvent('dblclick', { clientX: 650, clientY: 350, bubbles: true }));
    expect(viewOf(image).scale).toBe(2);
    const after = pictureUnder(image, 650, 350);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
    image.dispatchEvent(new MouseEvent('dblclick', { clientX: 650, clientY: 350, bubbles: true }));
    expect(viewOf(image)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  test('the wheel zooms around the pointer', () => {
    const { host } = mount(TRIP);
    view(host, 'image');
    const image = loadPicture(host);
    image.dispatchEvent(new MouseEvent('dblclick', { clientX: 650, clientY: 350, bubbles: true }));
    const before = pictureUnder(image, 300, 200);
    const event = wheel({ deltaY: -100, x: 300, y: 200 });
    image.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(viewOf(image).scale).toBeGreaterThan(2.4);
    const after = pictureUnder(image, 300, 200);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('+, − and 0 zoom from the keyboard; zoomed in, the arrows pan instead of stepping', () => {
    const restore = quietFrames();
    const { host } = mount(TRIP);
    const dialog = view(host, 'image');
    const image = loadPicture(host);
    press(dialog, '+');
    expect(viewOf(image).scale).toBe(1.5);
    press(dialog, 'ArrowRight');
    expect(position(host)).toBe('1 of 4');
    expect(viewOf(image).x).toBeLessThan(0);
    press(dialog, '-');
    expect(viewOf(image).scale).toBe(1);
    press(dialog, '=');
    press(dialog, '0');
    expect(viewOf(image)).toEqual({ scale: 1, x: 0, y: 0 });
    press(dialog, 'ArrowRight');
    expect(position(host)).toBe('2 of 4');
    restore();
  });

  test('the zoom buttons zoom in, out and back to the fitted picture', () => {
    const { host } = mount(TRIP);
    const dialog = view(host, 'image');
    const zoomIn = dialog.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!;
    const zoomOut = dialog.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]')!;
    const fit = dialog.querySelector<HTMLButtonElement>('[aria-label="Fit the picture"]')!;
    expect(zoomIn.disabled).toBe(true);
    const image = loadPicture(host);
    expect(zoomOut.disabled).toBe(true);
    click(zoomIn);
    click(zoomIn);
    expect(viewOf(image).scale).toBe(2.25);
    expect(zoomOut.disabled).toBe(false);
    click(zoomOut);
    expect(viewOf(image).scale).toBe(1.5);
    click(fit);
    expect(viewOf(image).scale).toBe(1);
    expect(fit.disabled).toBe(true);
  });

  test('a drag pans a zoomed picture, and the click that ends it closes nothing', () => {
    const { host } = mount(TRIP);
    const dialog = view(host, 'image');
    const image = loadPicture(host);
    press(dialog, '+');
    image.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, time: 0 }));
    image.dispatchEvent(pointer('pointermove', { x: 470, y: 290, time: 16 }));
    image.dispatchEvent(pointer('pointermove', { x: 450, y: 280, time: 32 }));
    image.dispatchEvent(pointer('pointerup', { x: 450, y: 280, time: 48 }));
    expect(viewOf(image)).toEqual({ scale: 1.5, x: -50, y: -20 });
    click(host.querySelector('.orbit-viewer__stage')!);
    expect(dialog.open).toBe(true);
  });

  test('a pinch zooms around the point between the fingers, which then pan', () => {
    const { host } = mount(TRIP);
    view(host, 'image');
    const image = loadPicture(host);
    image.dispatchEvent(touch('pointerdown', 400, 300, 1));
    image.dispatchEvent(touch('pointerdown', 600, 300, 2));
    image.dispatchEvent(touch('pointermove', 300, 300, 1));
    image.dispatchEvent(touch('pointermove', 700, 300, 2));
    expect(viewOf(image)).toEqual({ scale: 2, x: 0, y: 0 });
    image.dispatchEvent(touch('pointermove', 350, 320, 1));
    image.dispatchEvent(touch('pointermove', 750, 320, 2));
    expect(viewOf(image)).toEqual({ scale: 2, x: 50, y: 20 });
    image.dispatchEvent(touch('pointerup', 350, 320, 1));
    image.dispatchEvent(touch('pointerup', 750, 320, 2));
    expect(viewOf(image).scale).toBe(2);
  });

  test('a pinch captures both fingers, so a lift outside the stage still reaches it', () => {
    const { host } = mount(TRIP);
    view(host, 'image');
    const image = loadPicture(host);
    const stage = host.querySelector('.orbit-viewer__stage')!;
    image.dispatchEvent(touch('pointerdown', 400, 300, 1));
    expect(stage.hasPointerCapture(1)).toBe(false);
    image.dispatchEvent(touch('pointerdown', 600, 300, 2));
    expect(stage.hasPointerCapture(1)).toBe(true);
    expect(stage.hasPointerCapture(2)).toBe(true);
  });
});

describe('closing the viewer', () => {
  test('Escape closes it and gives focus back to the button that opened it', () => {
    const { host } = mount(TRIP);
    const button = host.querySelector<HTMLButtonElement>('.orbit-action--image')!;
    const dialog = view(host, 'image');
    expect(document.activeElement).toBe(dialog);
    press(dialog, 'Escape');
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  test('a click around the media closes it; a click on the picture doesn’t', () => {
    const { host } = mount(TRIP);
    const dialog = view(host, 'image');
    click(loadPicture(host));
    expect(dialog.open).toBe(true);
    click(host.querySelector('.orbit-viewer__media')!);
    expect(dialog.open).toBe(false);
  });

  test('on touch screens, a swipe down closes it', () => {
    const { host } = mount(TRIP);
    const dialog = view(host, 'image');
    const image = loadPicture(host);
    image.dispatchEvent(touch('pointerdown', 500, 300));
    image.dispatchEvent(touch('pointermove', 505, 360));
    image.dispatchEvent(touch('pointerup', 505, 430));
    expect(dialog.open).toBe(false);
  });

  test('the map’s own keys rest while it’s open', () => {
    const { host, renderer } = mount(TRIP);
    const dialog = view(host, 'image');
    const zoom = internals(renderer).zoomLevel();
    press(host.querySelector('svg')!, '+');
    expect(internals(renderer).zoomLevel()).toBe(zoom);
    expect(dialog.open).toBe(true);
  });

  test('it closes when the node it shows goes away, and with the map', () => {
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('camp');
    const dialog = view(host, 'image');
    renderer.updateNode('camp', { text: 'Base camp' });
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.orbit-viewer__title')?.textContent).toBe('Base camp');
    renderer.removeNode('base-camp');
    expect(dialog.open).toBe(false);
    renderer.focusNode('trip');
    view(host, 'image');
    renderer.destroy();
    expect(dialog.isConnected).toBe(false);
  });
});

describe('the detail sheet', () => {
  test('its picture opens the viewer over the sheet; closing the viewer goes back to the sheet', () => {
    const { host } = mount(TRIP);
    click(host.querySelector('.orbit-action--note')!);
    const sheet = openSheet(host)!;
    const picture = sheet.querySelector<HTMLButtonElement>('button.orbit-sheet__picture')!;
    expect(picture.getAttribute('aria-label')).toBe('View image: Sunrise from the summit');
    picture.focus();
    click(picture);
    const dialog = openViewer(host)!;
    expect(dialog.querySelector('.orbit-viewer__picture')?.getAttribute('src')).toBe('https://example.com/summit.jpg');
    press(dialog, 'Escape');
    expect(openViewer(host)).toBeNull();
    expect(openSheet(host)).toBe(sheet);
    expect(document.activeElement).toBe(picture);
  });

  test('its video moves to the viewer with a button, and a file goes on from where it was', () => {
    const { host, renderer } = mount(TRIP);
    renderer.focusNode('night-sky');
    click(host.querySelector('.orbit-action--note')!);
    const sheet = openSheet(host)!;
    const inline = sheet.querySelector('video')!;
    inline.currentTime = 12;
    const pause = spyOn(inline, 'pause');
    click(sheet.querySelector('.orbit-sheet__expand')!);
    expect(pause).toHaveBeenCalled();
    const video = openViewer(host)?.querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://example.com/stars.webm');
    video?.dispatchEvent(new Event('loadedmetadata'));
    expect(video?.currentTime).toBe(12);
  });

  test('a page that handles pictures gets the sheet’s picture too, and the sheet closes for what it opens', () => {
    const onAction = mock<(event: OrbitActionEvent) => false | undefined>((event) => (event.action === 'image' ? false : undefined));
    const { host } = mount(TRIP, { onAction });
    click(host.querySelector('.orbit-action--note')!);
    click(openSheet(host)!.querySelector('button.orbit-sheet__picture')!);
    expect(onAction.mock.calls.map((call) => call[0].action)).toEqual(['note', 'image']);
    expect(host.querySelector('dialog[open]')).toBeNull();
  });

  test('without the viewer, its picture is only a picture', () => {
    const { host, renderer } = mount(TRIP, { mediaViewer: false });
    click(host.querySelector('.orbit-action--note')!);
    expect(openSheet(host)?.querySelector('.orbit-sheet__picture')).toBeNull();
    expect(openSheet(host)?.querySelector('img')).not.toBeNull();
    renderer.focusNode('night-sky');
    click(host.querySelector('.orbit-action--note')!);
    expect(openSheet(host)?.querySelector('.orbit-sheet__expand')).toBeNull();
  });
});
