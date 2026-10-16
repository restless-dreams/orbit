import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openMap } from './helpers';

type TouchEventType = 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel';

/**
 * YouTube's player, stood in for so the tests never reach YouTube: it
 * answers the messages Orbit sends it as the real one does, and keeps them.
 */
const YOUTUBE_PLAYER = `<!doctype html>
<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#eee;font:16px sans-serif">
<p>YouTube’s player</p>
<script>
  window.received = [];
  const state = { playerState: 5, currentTime: 0, duration: 120, muted: false };
  const send = (event, info) => parent.postMessage(JSON.stringify({ event, info, channel: 'widget', id: 1 }), '*');
  addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    window.received.push(message.event === 'command' ? message.func : message.event);
    if (message.event === 'listening') {
      send('onReady', null);
      send('infoDelivery', state);
      return;
    }
    if (message.func === 'playVideo') {
      state.playerState = 1;
    } else if (message.func === 'pauseVideo') {
      state.playerState = 2;
    } else if (message.func === 'seekTo') {
      state.currentTime = message.args[0];
    }
    send('infoDelivery', state);
  });
</script>
</body></html>`;

const THUMBNAIL = readFileSync(new URL('./pages/img/mountain.jpg', import.meta.url));

/** Serves YouTube's player and thumbnails from here, and keeps the referrers the player is asked with. */
const standInForYouTube = async (page: Page): Promise<string[]> => {
  const referrers: string[] = [];

  await page.route('https://www.youtube-nocookie.com/**', async (route) => {
    referrers.push(route.request().headers().referer ?? '');
    await route.fulfill({ contentType: 'text/html; charset=utf-8', body: YOUTUBE_PLAYER });
  });

  await page.route('https://img.youtube.com/**', (route) => route.fulfill({ contentType: 'image/jpeg', body: THUMBNAIL }));
  return referrers;
};

/** Opens the trip map, whose pictures and videos are: the summit, the trail (YouTube), the camp and the night sky (a WebM). */
const openTrip = async (page: Page, query = ''): Promise<string[]> => {
  const referrers = await standInForYouTube(page);
  await openMap(page, `sample=trip&instant${query ? `&${query}` : ''}`);
  return referrers;
};

/** Clicks, or taps on touch screens. */
const press = async (locator: Locator, isMobile: boolean): Promise<void> => {
  if (isMobile) {
    await locator.tap();
  } else {
    await locator.click();
  }
};

const viewer = (page: Page) => page.locator('dialog.orbit-viewer[open]');
const picture = (page: Page) => page.locator('.orbit-viewer__picture');
const counter = (page: Page) => page.locator('.orbit-viewer__counter span').first();

/** The picture's box once it has settled: zooms glide for a moment. */
const settledBox = async (page: Page): Promise<{ x: number; y: number; width: number; height: number }> => {
  let previous = await picture(page).boundingBox();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(60);
    const box = await picture(page).boundingBox();

    if (box && previous && Math.abs(box.x - previous.x) < 0.5 && Math.abs(box.width - previous.width) < 0.5) {
      return box;
    }

    previous = box;
  }

  if (!previous) {
    throw new Error('No picture on screen');
  }

  return previous;
};

/** Where a point of the window is on the picture, from 0 to 1 across and down. */
const onPicture = (box: { x: number; y: number; width: number; height: number }, point: { x: number; y: number }) => {
  return { x: (point.x - box.x) / box.width, y: (point.y - box.y) / box.height };
};

/** Opens the viewer on the summit's picture, waiting for it to load. */
const viewSummit = async (page: Page, isMobile: boolean): Promise<void> => {
  await press(page.getByRole('button', { name: 'View image' }), isMobile);
  await expect(viewer(page)).toBeVisible();
  await expect(picture(page)).toHaveJSProperty('complete', true);
  await expect(page.locator('.orbit-viewer__status')).toBeHidden();
};

test.describe('opening the viewer', () => {
  test('"View image" shows the picture fitted to the window, over the whole page', async ({ page, isMobile }) => {
    await openTrip(page);
    await viewSummit(page, isMobile);
    const viewport = page.viewportSize()!;
    const dialog = await viewer(page).boundingBox();
    expect(dialog).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
    const box = await settledBox(page);
    // 800 × 600, fitted: as wide or as tall as the stage allows, and inside the window.
    expect(box.width / box.height).toBeCloseTo(800 / 600, 2);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await expect(counter(page)).toHaveText('1 of 4');
    await expect(page.locator('.orbit-viewer__title')).toHaveText('🏔 Mountain Trip');
    await expect(picture(page)).toHaveAttribute('alt', 'Sunrise from the summit');
  });

  test('the detail sheet’s picture opens it over the sheet', async ({ page, isMobile }) => {
    await openTrip(page);
    await press(page.getByRole('button', { name: 'Read note' }), isMobile);
    const sheet = page.locator('dialog.orbit-sheet[open]');
    await expect(sheet).toBeVisible();
    await press(sheet.getByRole('button', { name: 'View image: Sunrise from the summit' }), isMobile);
    await expect(viewer(page)).toBeVisible();
    await expect(picture(page)).toHaveAttribute('src', /mountain\.jpg$/);
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toHaveCount(0);
    await expect(sheet).toBeVisible();
  });
});

test.describe('pictures with a mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'a mouse');

  test('a double click zooms in around its point; the wheel zooms around the pointer; a drag pans', async ({ page }) => {
    await openTrip(page);
    await viewSummit(page, false);
    const fitted = await settledBox(page);

    const target = { x: fitted.x + fitted.width * 0.7, y: fitted.y + fitted.height * 0.35 };
    const before = onPicture(fitted, target);
    await page.mouse.dblclick(target.x, target.y);
    // The zoom glides: wait for it to start before waiting for it to settle.
    await expect.poll(async () => (await settledBox(page)).width).toBeGreaterThan(fitted.width * 1.5);
    const doubled = await settledBox(page);
    expect(doubled.width / fitted.width).toBeCloseTo(2, 2);
    expect(onPicture(doubled, target).x).toBeCloseTo(before.x, 2);
    expect(onPicture(doubled, target).y).toBeCloseTo(before.y, 2);

    const pointer = { x: 420, y: 330 };
    const under = onPicture(doubled, pointer);
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.wheel(0, -200);
    await expect.poll(async () => (await settledBox(page)).width).toBeGreaterThan(doubled.width * 1.2);
    const wheeled = await settledBox(page);
    expect(onPicture(wheeled, pointer).x).toBeCloseTo(under.x, 2);
    expect(onPicture(wheeled, pointer).y).toBeCloseTo(under.y, 2);

    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.move(600, 380, { steps: 4 });
    await page.mouse.move(560, 350, { steps: 4 });
    await page.mouse.up();
    const panned = await settledBox(page);
    expect(panned.x - wheeled.x).toBeCloseTo(-80, 0);
    expect(panned.y - wheeled.y).toBeCloseTo(-50, 0);
    // The click that ends a drag closes nothing.
    await expect(viewer(page)).toBeVisible();

    await page.keyboard.press('0');
    await expect.poll(async () => (await settledBox(page)).width).toBeCloseTo(fitted.width, 0);
  });

  test('the arrows step through the map’s pictures and videos; Esc closes and gives focus back', async ({ page }) => {
    await openTrip(page);
    const button = page.getByRole('button', { name: 'View image' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(viewer(page)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(counter(page)).toHaveText('2 of 4');
    await expect(page.locator('.orbit-viewer iframe')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await expect(counter(page)).toHaveText('3 of 4');
    await expect(page.locator('.orbit-viewer__title')).toHaveText('Camp');
    await expect(page.locator('.orbit-viewer__text')).toHaveText('The tents went up just before the light went.');
    await page.keyboard.press('ArrowLeft');
    await expect(counter(page)).toHaveText('2 of 4');
    await page.keyboard.press('Escape');
    await expect(viewer(page)).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test('a click around the picture closes the viewer', async ({ page }) => {
    await openTrip(page);
    await viewSummit(page, false);
    const box = await settledBox(page);
    await page.mouse.click(box.x - 60, box.y + box.height / 4);
    await expect(viewer(page)).toHaveCount(0);
  });
});

test.describe('pictures by touch', () => {
  /**
   * Two fingers, or one, through the browser's own touch input. Turning it
   * on makes the pointer coarse, and the buttons bigger: turn it on before
   * measuring anything.
   */
  const touchscreen = async (page: Page) => {
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    return (type: TouchEventType, points: { x: number; y: number }[]) => client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point, index) => ({ x: point.x, y: point.y, id: index + 1 })),
    });
  };

  test('a pinch zooms around the point between the fingers', async ({ page, isMobile }) => {
    await openTrip(page);
    const touch = await touchscreen(page);
    await viewSummit(page, isMobile);
    const fitted = await settledBox(page);
    const middle = { x: fitted.x + fitted.width * 0.4, y: fitted.y + fitted.height * 0.55 };
    const before = onPicture(fitted, middle);
    const fingers = (spread: number) => [{ x: middle.x - spread, y: middle.y }, { x: middle.x + spread, y: middle.y }];
    await touch('touchStart', fingers(30));

    for (let spread = 40; spread <= 90; spread += 10) {
      await touch('touchMove', fingers(spread));
    }

    await touch('touchEnd', []);
    const pinched = await settledBox(page);
    expect(pinched.width / fitted.width).toBeCloseTo(3, 1);
    expect(onPicture(pinched, middle).x).toBeCloseTo(before.x, 2);
    expect(onPicture(pinched, middle).y).toBeCloseTo(before.y, 2);
    await expect(viewer(page)).toBeVisible();
  });

  test('a swipe across steps, and a swipe down closes', async ({ page, isMobile }) => {
    await openTrip(page);
    const touch = await touchscreen(page);
    await viewSummit(page, isMobile);
    const box = await settledBox(page);
    const start = { x: box.x + box.width * 0.75, y: box.y + box.height / 2 };
    await touch('touchStart', [start]);

    for (let step = 1; step <= 6; step += 1) {
      await touch('touchMove', [{ x: start.x - step * 25, y: start.y + step }]);
    }

    await touch('touchEnd', []);
    await expect(counter(page)).toHaveText('2 of 4');

    await page.keyboard.press('ArrowLeft');
    await expect(counter(page)).toHaveText('1 of 4');
    const down = { x: box.x + box.width / 2, y: box.y + box.height / 3 };
    await touch('touchStart', [down]);

    for (let step = 1; step <= 6; step += 1) {
      await touch('touchMove', [{ x: down.x + step, y: down.y + step * 30 }]);
    }

    await touch('touchEnd', []);
    await expect(viewer(page)).toHaveCount(0);
  });
});

test.describe('videos', () => {
  test('a video file plays at once in a video element', async ({ page, isMobile }) => {
    await openTrip(page);
    await viewSummit(page, isMobile);
    await page.keyboard.press('End');
    await expect(counter(page)).toHaveText('4 of 4');
    const video = page.locator('.orbit-viewer video');
    await expect(video).toHaveAttribute('autoplay', '');
    await expect(video).toHaveAttribute('playsinline', '');
    await expect(video).toHaveJSProperty('controls', true);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.2);
    await expect(video).toHaveJSProperty('paused', false);
  });

  test('YouTube plays in its player, which learns the page’s origin and takes play, pause and seek', async ({ page, isMobile }) => {
    const referrers = await openTrip(page);

    await page.evaluate(() => {
      const target = window as unknown as { states: string[]; map: { on(name: string, listener: (state: { playing: boolean; time: number }) => void): void } };
      target.states = [];
      target.map.on('media-state', ({ playing, time }) => target.states.push(`${playing ? 'playing' : 'paused'} at ${time}`));
    });

    await page.evaluate(() => (window as unknown as { map: { focusNode(id: string): void } }).map.focusNode('trail'));
    await press(page.getByRole('button', { name: 'Play video' }), isMobile);
    const frame = page.locator('.orbit-viewer iframe');
    await expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    await expect(frame).toHaveAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    const address = new URL((await frame.getAttribute('src'))!);
    expect(address.pathname).toBe('/embed/aqz-KE-bpKQ');
    expect(address.searchParams.get('autoplay')).toBe('1');
    expect(address.searchParams.get('enablejsapi')).toBe('1');
    expect(address.searchParams.get('origin')).toBe(new URL(page.url()).origin);
    expect(referrers).toEqual([`${new URL(page.url()).origin}/`]);

    const player = page.frameLocator('.orbit-viewer iframe').locator('body');
    await expect(player).toContainText('YouTube’s player');
    const received = () => page.frames().find((candidate) => candidate.url().includes('youtube-nocookie'))!.evaluate(() => (window as unknown as { received: string[] }).received);
    await expect.poll(received).toEqual(['listening', 'playVideo']);

    await page.evaluate(() => {
      const map = (window as unknown as { map: { pauseMedia(): boolean; seekMedia(seconds: number): boolean } }).map;
      map.pauseMedia();
      map.seekMedia(42);
    });

    await expect.poll(received).toEqual(['listening', 'playVideo', 'pauseVideo', 'seekTo']);
    await expect.poll(() => page.evaluate(() => (window as unknown as { states: string[] }).states.at(-1))).toBe('paused at 42');
  });
});

test.describe('on a map that isn’t interactive', () => {
  test('the page opens a picture, which fills the window above its title and caption, with nothing over it', async ({ page }) => {
    await openTrip(page);

    await page.evaluate(() => {
      const map = (window as unknown as { map: { setOptions(options: object): void; openMedia(id: string): boolean } }).map;
      map.setOptions({ interactive: false });
      map.openMedia('camp');
    });

    await expect(viewer(page)).toBeVisible();
    await expect(picture(page)).toHaveJSProperty('complete', true);
    const viewport = page.viewportSize()!;
    const box = await settledBox(page);
    const stage = (await page.locator('.orbit-viewer__stage').boundingBox())!;
    const caption = (await page.locator('.orbit-viewer__caption').boundingBox())!;
    // The stage takes the window down to the caption, which ends at the bottom.
    expect(stage.y).toBe(0);
    expect(stage.y + stage.height).toBeCloseTo(caption.y, 0);
    expect(caption.y + caption.height).toBeCloseTo(viewport.height, 0);
    // The picture fits the stage, less its margin: as wide or as tall as it allows.
    expect(Math.max(box.width / (stage.width - 32), box.height / (stage.height - 32))).toBeCloseTo(1, 1);
    expect(box.y + box.height).toBeLessThanOrEqual(caption.y);
    await expect(page.locator('.orbit-viewer__text')).toHaveText('The tents went up just before the light went.');
    await expect(page.locator('.orbit-viewer__bar')).toBeHidden();
  });
});

test.describe('how it looks', () => {
  for (const theme of ['paper', 'night']) {
    test(`a picture in the ${theme} theme`, async ({ page, isMobile }) => {
      await openTrip(page, `theme=${theme}`);
      await viewSummit(page, isMobile);
      await settledBox(page);
      await expect(page).toHaveScreenshot(`viewer-${theme}.png`);
    });
  }
});
