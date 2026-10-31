import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from './fixtures';

const MAP = '# Launch\nWhat ships this year.\n## Research\nSix weeks of interviews.\n## Build\n## Ship\n';

/** The built command, as people run it. */
const COMMAND = fileURLToPath(new URL('../dist/bin/orbit.js', import.meta.url));

/** A map with a live photo, its picture and motion, and a picture in its note, all in the map's photos/ folder. */
const MAP_WITH_PICTURES = `# Summit day
<!-- orbit
image:
  src: photos/mountain.jpg
  motion:
    src: photos/mountain-motion.webm
  alt: Sunrise from the summit
-->
> Up at four, at the top by six.
>
> ![Sunset at camp](photos/sunset.jpg)

## Camp
## Descent
`;

/** A map exported as a web page by the built command, as people make them. */
const exportedPage = (): string => {
  return execFileSync('node', [COMMAND, 'export', '--html', '-'], { input: MAP, encoding: 'utf8' });
};

test('a map exported as a web page draws, and presents one idea at a time', async ({ page }) => {
  await page.setContent(exportedPage());
  await page.waitForFunction(() => document.querySelectorAll('#page-map .orbit-label').length >= 4);
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.locator('#page-title')).toHaveText('Launch');
  await expect(page.locator('#page-note')).toHaveText('What ships this year.');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#page-title')).toHaveText('Research');
  await expect(page.locator('#page-count')).toHaveText('2 of 4');
  await page.keyboard.press('Escape');
  await expect(page.locator('#page-caption')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
});

test('presenting from the keyboard puts focus on the idea shown, where the keys step, and Escape gives it back to Present', async ({ page }) => {
  await page.setContent(exportedPage());
  await page.waitForFunction(() => document.querySelectorAll('#page-map .orbit-label').length >= 4);
  const present = page.getByRole('button', { name: 'Present' });
  await present.focus();
  await page.keyboard.press('Enter');
  // The Present button hides: focus goes to the title, not onto the body, nor with the hidden button.
  await expect(page.locator('#page-title')).toBeFocused();
  await expect(page.locator('#page-title')).toHaveText('Launch');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#page-title')).toHaveText('Research');
  await page.keyboard.press('Space');
  await expect(page.locator('#page-title')).toHaveText('Build');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#page-title')).toHaveText('Research');
  await page.keyboard.press('Escape');
  await expect(page.locator('#page-caption')).toBeHidden();
  await expect(present).toBeFocused();
});

test('a web page opened from its file with no network shows the pictures it carries, and asks for nothing', async ({ page, context }, testInfo) => {
  const folder = testInfo.outputPath('map');
  mkdirSync(join(folder, 'photos'), { recursive: true });

  for (const name of ['mountain.jpg', 'mountain-motion.webm', 'sunset.jpg']) {
    copyFileSync(fileURLToPath(new URL(`pages/img/${name}`, import.meta.url)), join(folder, 'photos', name));
  }

  writeFileSync(join(folder, 'summit.md'), MAP_WITH_PICTURES);
  // The page goes to a folder without the photos, as a file sent to someone does: it can show only what it carries.
  const shared = testInfo.outputPath('shared');
  mkdirSync(shared);
  const file = join(shared, 'summit.html');
  execFileSync('node', [COMMAND, 'export', '--html', '--out', file, join(folder, 'summit.md')]);
  const address = pathToFileURL(file).href;
  const requests: string[] = [];

  page.on('request', (request) => {
    requests.push(request.url());
  });

  // No network: anything the page asked the web for fails, and shows in requests. Only the web's addresses are cut,
  // since Chromium and WebKit would route the page's own file and its data: URLs too.
  await context.route((url) => url.protocol === 'http:' || url.protocol === 'https:', (route) => route.abort('internetdisconnected'));
  await page.goto(address);
  await page.waitForFunction(() => document.querySelectorAll('#page-map .orbit-label').length >= 3);

  // The live photo opens in the viewer: its picture, then its motion, from inside the page.
  await page.getByRole('button', { name: 'View picture' }).click();
  const picture = page.locator('dialog.orbit-viewer[open] .orbit-viewer__picture');
  await expect(picture).toHaveJSProperty('complete', true);
  expect(await picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const motion = page.locator('.orbit-viewer__motion');
  await expect.poll(() => motion.evaluate((video: HTMLVideoElement) => !video.paused && video.readyState >= 2), { timeout: 6000 }).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.orbit-viewer[open]')).toHaveCount(0);

  // Presented, the note shows its picture.
  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.locator('#page-title')).toHaveText('Summit day');
  await expect.poll(() => page.locator('#page-note img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  // Laid out for paper once the page is idle, with the summit's picture.
  await expect(page.locator('#page-print .orbit-print')).toBeAttached();
  await expect.poll(() => page.locator('#page-print .orbit-print__image').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(requests.filter((url) => url !== address && !/^(data|blob):/.test(url))).toEqual([]);
});
