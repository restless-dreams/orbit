import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openMap } from './helpers';

/**
 * Live photos in the media viewer: the live sample's root is the summit's
 * picture with its motion (img/mountain-motion.webm, the picture taken at
 * 1.5 s), and the camp's picture follows it.
 */

const viewer = (page: Page) => page.locator('dialog.orbit-viewer[open]');
const picture = (page: Page) => page.locator('.orbit-viewer__picture');
const motion = (page: Page) => page.locator('.orbit-viewer__motion');
const mark = (page: Page) => page.locator('.orbit-viewer__live');

/** What the motion is doing: playing, where, with its sound or not, and over the picture or not. */
const playback = (page: Page) => motion(page).evaluate((video: HTMLVideoElement) => ({
  playing: !video.paused,
  time: video.currentTime,
  muted: video.muted,
  shown: video.classList.contains('orbit-viewer__motion--shown'),
}));

/** Clicks, or taps on touch screens. */
const press = async (locator: Locator, isMobile: boolean): Promise<void> => {
  if (isMobile) {
    await locator.tap();
  } else {
    await locator.click();
  }
};

/** Opens the viewer on the summit's live photo, waiting for its picture. */
const viewSummit = async (page: Page, isMobile: boolean, query = ''): Promise<void> => {
  await openMap(page, `sample=live&instant${query ? `&${query}` : ''}`);
  await press(page.getByRole('button', { name: 'View picture' }), isMobile);
  await expect(viewer(page)).toBeVisible();
  await expect(picture(page)).toHaveJSProperty('complete', true);
};

/**
 * Waits for the motion that plays as the viewer opens to start, and then to
 * settle on the picture. It starts a moment after the picture shows
 * (`OPENING_DELAY`): a test that went on before then would hold, press or
 * photograph the opening, playing muted, instead of the picture at rest.
 */
const settled = async (page: Page): Promise<void> => {
  await expect.poll(async () => (await playback(page)).playing, { timeout: 6000 }).toBe(true);
  await expect.poll(async () => (await playback(page)).shown, { timeout: 6000 }).toBe(false);
  await expect.poll(async () => (await playback(page)).playing).toBe(false);
  // The fade back to the picture.
  await page.waitForTimeout(450);
};

/** A finger held on the screen, through the browser's own touch input. */
const finger = async (page: Page) => {
  const client = await page.context().newCDPSession(page);
  return {
    down: (point: { x: number; y: number }) => client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] }),
    up: () => client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
};

test.describe('a live photo in the viewer', () => {
  test('plays once as the viewer opens, muted, over its picture, and settles back on it where it was taken', async ({ page, isMobile }) => {
    await viewSummit(page, isMobile);
    await expect(mark(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play the live photo' })).toBeVisible();
    await expect.poll(async () => (await playback(page)).playing).toBe(true);
    expect(await playback(page)).toMatchObject({ muted: true });
    // Exactly over the picture.
    expect(await motion(page).boundingBox()).toEqual(await picture(page).boundingBox());
    await settled(page);
    expect((await playback(page)).time).toBeCloseTo(1.5, 1);
    // Its mark sits inside the picture's top left corner.
    const corner = (await picture(page).boundingBox())!;
    const pill = (await mark(page).boundingBox())!;
    expect(pill.x - corner.x).toBeCloseTo(12, 0);
    expect(pill.y - corner.y).toBeCloseTo(12, 0);
  });

  test('held, plays from the start with its sound, and settles back when let go', async ({ page, isMobile }) => {
    await viewSummit(page, isMobile);
    await settled(page);
    const box = (await picture(page).boundingBox())!;
    const point = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 };
    const touch = isMobile ? await finger(page) : null;

    if (touch) {
      await touch.down(point);
    } else {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
    }

    await expect.poll(async () => (await playback(page)).shown).toBe(true);
    const held = await playback(page);
    expect(held.playing).toBe(true);
    expect(held.muted).toBe(false);
    expect(held.time).toBeLessThan(1.2);

    if (touch) {
      await touch.up();
    } else {
      await page.mouse.up();
    }

    await expect.poll(async () => (await playback(page)).shown).toBe(false);
    expect((await playback(page)).playing).toBe(false);
    await expect(viewer(page)).toBeVisible();
    await expect(page.locator('.orbit-viewer__counter span').first()).toHaveText('1 of 2');
  });

  test('its mark plays it through once when pressed, and the space bar plays it while held', async ({ page, isMobile }) => {
    await viewSummit(page, isMobile);
    await settled(page);
    await press(mark(page), isMobile);
    await expect.poll(async () => (await playback(page)).playing).toBe(true);
    await expect(mark(page)).toHaveClass(/orbit-viewer__live--playing/);
    // Through to its end.
    await expect.poll(async () => (await playback(page)).time, { timeout: 6000 }).toBeGreaterThan(2.3);
    await expect.poll(async () => (await playback(page)).shown).toBe(false);

    await viewer(page).focus();
    await page.keyboard.down(' ');
    await expect.poll(async () => (await playback(page)).shown).toBe(true);
    await page.waitForTimeout(500);
    await page.keyboard.up(' ');
    await expect.poll(async () => (await playback(page)).shown).toBe(false);
    expect((await playback(page)).time).toBeLessThan(1.5);
  });

  test('with reduced motion, plays only when asked, and loads nothing until then', async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const asked: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('mountain-motion')) {
        asked.push(request.url());
      }
    });

    await viewSummit(page, isMobile);
    await expect(mark(page)).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(motion(page)).toHaveCount(0);
    expect(asked).toEqual([]);
    await press(mark(page), isMobile);
    await expect.poll(async () => (await playback(page)).playing).toBe(true);
    // The page may hear of the motion's download a moment after it plays.
    await expect.poll(() => asked.length).toBeGreaterThan(0);
  });

  test('whose motion can\'t be loaded shows its picture alone, without its mark', async ({ page, isMobile }) => {
    await openMap(page, 'sample=live&instant');

    await page.evaluate(() => {
      const map = (window as unknown as { map: { render(source: string): void; toMarkdown(): string } }).map;
      map.render(map.toMarkdown().replace('mountain-motion.webm', 'missing-motion.webm'));
    });

    await press(page.getByRole('button', { name: 'View picture' }), isMobile);
    await expect(picture(page)).toHaveJSProperty('complete', true);
    await expect(mark(page)).toHaveCount(0);
    await expect(motion(page)).toHaveCount(0);
    await expect(page.locator('.orbit-viewer__status')).toBeHidden();
  });
});

test.describe('how a live photo looks', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'The screenshots are Chromium’s.');

  for (const theme of ['paper', 'night']) {
    test(`at rest, and while it plays, in the ${theme} theme`, async ({ page, isMobile }) => {
      await viewSummit(page, isMobile, `theme=${theme}`);
      await settled(page);
      await expect(page).toHaveScreenshot(`live-photo-${theme}.png`);
      // Held on its mark, the motion shows, held still at one frame for the picture.
      const box = (await mark(page).boundingBox())!;
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const touch = isMobile ? await finger(page) : null;

      if (touch) {
        await touch.down(center);
      } else {
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
      }

      await expect.poll(async () => (await playback(page)).shown).toBe(true);

      await motion(page).evaluate(async (video: HTMLVideoElement) => {
        video.pause();
        // Seeked isn't drawn yet: the frame at 0.6 s is, once it's presented.
        const presented = new Promise((resolve) => video.requestVideoFrameCallback(resolve));
        video.currentTime = 0.6;
        await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
        await presented;
      });

      await expect(page).toHaveScreenshot(`live-photo-${theme}-playing.png`);

      if (touch) {
        await touch.up();
      } else {
        await page.mouse.up();
      }
    });
  }

  test('in the detail sheet, still, with its mark', async ({ page, isMobile }) => {
    await openMap(page, 'sample=live&instant&theme=night');
    await press(page.getByRole('button', { name: 'Read note' }), isMobile);
    const sheet = page.locator('dialog.orbit-sheet[open]');
    await expect(sheet.getByRole('button', { name: 'View live photo: Sunrise from the summit' })).toBeVisible();
    await expect(sheet.locator('img')).toHaveJSProperty('complete', true);
    await expect(sheet.locator('.orbit-sheet__live')).toHaveText('Live');
    await expect(sheet.locator('video')).toHaveCount(0);
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('live-photo-sheet.png');
  });
});
