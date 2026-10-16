import { expect, test, type Page } from '@playwright/test';
import { THEMES, openMap } from './helpers';

// Names are measured in the font they're drawn with: whatever the font,
// a name inside its node stays inside it, and every label stays on the map.

interface Fit {
  /** Names shown inside their nodes. */
  names: number;

  /** How far the widest line of any name reaches past its node's rim (px; below 0 when every line is inside). */
  worst: number;

  /** Every name as it shows, line by line. */
  texts: string[];
}

const fits = (page: Page): Promise<Fit> => {
  return page.evaluate(() => {
    const host = document.getElementById('map') as HTMLElement;
    const labels = Array.from(host.querySelectorAll<HTMLElement>('.orbit-label')).filter((label) => (
      label.style.display !== 'none' && !label.classList.contains('orbit-label--outside') && label.dataset.orbitFor
    ));
    let worst = -Infinity;
    const texts: string[] = [];

    for (const label of labels) {
      const disc = host.querySelector(`[data-orbit-node-id="${CSS.escape(label.dataset.orbitFor ?? '')}"] .orbit-node__disc`);
      const text = label.querySelector('.orbit-label__text')?.firstChild;

      if (!disc || !text?.textContent) {
        continue;
      }

      texts.push(text.textContent);
      const box = disc.getBoundingClientRect();
      const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      const radius = box.width / 2;
      let offset = 0;

      for (const line of text.textContent.split('\n')) {
        const range = document.createRange();
        range.setStart(text, offset);
        range.setEnd(text, offset + line.length);
        offset += line.length + 1;
        const rect = range.getBoundingClientRect();
        const y = (rect.top + rect.bottom) / 2 - center.y;
        const half = Math.sqrt(Math.max(0, radius * radius - y * y));
        worst = Math.max(worst, Math.max(rect.right - center.x, center.x - rect.left) - half);
      }
    }

    return { names: texts.length, worst, texts };
  });
};

/**
 * The labels that reach past the map's edges, by more than rounding: each as
 * its text and its box on the map. Waits for the page's fonts and pictures,
 * then a frame for the labels to be fitted in them.
 */
const labelsPastTheMap = async (page: Page): Promise<string[]> => {
  await page.waitForLoadState('networkidle');

  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const host = document.getElementById('map') as HTMLElement;
    const map = host.getBoundingClientRect();
    const past: string[] = [];

    for (const label of host.querySelectorAll<HTMLElement>('.orbit-label[data-orbit-for]')) {
      const box = label.getBoundingClientRect();

      if (label.style.display === 'none' || box.width === 0) {
        continue;
      }

      if (box.left < map.left - 1 || box.top < map.top - 1 || box.right > map.right + 1 || box.bottom > map.bottom + 1) {
        const at = (x: number, y: number) => `${Math.round(x - map.left)}, ${Math.round(y - map.top)}`;
        past.push(`${label.textContent}: ${at(box.left, box.top)} to ${at(box.right, box.bottom)} on a ${Math.round(map.width)} x ${Math.round(map.height)} map`);
      }
    }

    return past;
  });
};

interface Counts {
  /** Names inside nodes that show a "+N". */
  names: number;

  /** The lines of those names that run under their node's "+N", each with how far, across and down. */
  under: string[];
}

/**
 * How the names inside nodes sit with their node's "+N". A line's letters
 * are measured down to the end of their tails: the space below them may
 * pass over the count. Waits a frame for the labels to be fitted first.
 */
const namesBesideCounts = (page: Page): Promise<Counts> => {
  return page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const host = document.getElementById('map') as HTMLElement;
    const context = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    const under: string[] = [];
    let names = 0;

    for (const count of host.querySelectorAll<HTMLElement>('.orbit-count[data-orbit-for]')) {
      const label = host.querySelector<HTMLElement>(`.orbit-label[data-orbit-for="${CSS.escape(count.dataset.orbitFor ?? '')}"]`);
      const text = label?.querySelector('.orbit-label__text')?.firstChild;

      if (!label || label.style.display === 'none' || label.classList.contains('orbit-label--outside') || !text?.textContent) {
        continue;
      }

      names += 1;
      const badge = count.getBoundingClientRect();
      const style = getComputedStyle(label);
      // Measured a hundred times bigger: canvas metrics come back in whole pixels.
      context.font = `${style.fontStyle} ${style.fontWeight} ${Number.parseFloat(style.fontSize) * 100}px ${style.fontFamily}`;
      let offset = 0;

      for (const line of text.textContent.split('\n')) {
        const range = document.createRange();
        range.setStart(text, offset);
        range.setEnd(text, offset + line.length);
        offset += line.length + 1;
        const box = range.getBoundingClientRect();
        const metrics = context.measureText(line);
        const letters = box.top + (metrics.fontBoundingBoxAscent + metrics.actualBoundingBoxDescent) / 100;
        const across = Math.min(box.right, badge.right) - Math.max(box.left, badge.left);
        const down = Math.min(letters, badge.bottom) - Math.max(box.top, badge.top);

        if (across > 0.5 && down > 0.5) {
          under.push(`${line} (${count.textContent}): ${across.toFixed(1)} px across, ${down.toFixed(1)} px down`);
        }
      }
    }

    return { names, under };
  });
};

for (const theme of THEMES) {
  test(`every label stays on the map in the ${theme} theme`, async ({ page }) => {
    for (const view of ['focus', 'all']) {
      await openMap(page, `theme=${theme}&view=${view}&instant`);
      expect(await labelsPastTheMap(page), view === 'all' ? 'the overview' : 'focus mode').toEqual([]);
    }
  });
}

test('every label stays on the map with long and non-Latin names, and statuses', async ({ page }) => {
  for (const sample of ['languages', 'team']) {
    for (const view of ['focus', 'all']) {
      await openMap(page, `sample=${sample}&view=${view}&instant`);
      expect(await labelsPastTheMap(page), `${sample}, ${view}`).toEqual([]);
    }
  }
});

test('names inside planets keep clear of their "+N"', async ({ page }, testInfo) => {
  // The size the website draws the large map at, where planets are small enough for names on two lines to reach their counts.
  if (testInfo.project.name === 'desktop') {
    await page.setViewportSize({ width: 1100, height: 560 });
  }

  await openMap(page, 'sample=library&instant');
  await page.waitForLoadState('networkidle');
  const counts = await namesBesideCounts(page);
  expect(counts.names).toBeGreaterThanOrEqual(8);
  expect(counts.under).toEqual([]);
});

test('names stay inside their nodes in a wide font', async ({ page }) => {
  // A monospaced font, widely spaced: far wider than the usual sans-serif.
  await openMap(page, `sample=languages&instant&font=${encodeURIComponent('"Liberation Mono", monospace')}&spacing=0.12em`);
  await page.waitForTimeout(300);
  const fit = await fits(page);
  expect(fit.names).toBeGreaterThan(3);
  expect(fit.worst).toBeLessThanOrEqual(0.5);
});

test('names are fitted again when a font finishes loading', async ({ page }) => {
  await openMap(page, 'sample=languages&instant');
  await page.waitForTimeout(300);
  const before = await fits(page);

  // The page switches to a web font, which only then loads.
  await page.evaluate(async () => {
    const face = new FontFace('Arriving', 'local("Liberation Mono")', { weight: '100 900' });
    document.fonts.add(face);
    document.getElementById('map')?.style.setProperty('--orbit-sans-font', 'Arriving, monospace');
    await face.load();
  });

  await page.waitForTimeout(500);
  const after = await fits(page);
  expect(after.texts).not.toEqual(before.texts);
  expect(after.worst).toBeLessThanOrEqual(0.5);
});
