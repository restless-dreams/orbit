import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/** A map with what the print layout shows: notes, statuses, tags, links, a picture, a video, and an outline longer than a page. */
const MAP = `---
title: Weekend in Lisbon
theme: night
---
# 🧳 Lisbon in May
A long weekend in May, with friends. **Book the flights** before March.

## 🍽️ Food <!-- orbit status: done -->
Eat where the locals eat: *tascas* over restaurants.
- [x] Pastéis de nata #sweet #morning
- [ ] Bifana
- Sardines <!-- orbit status: in progress -->
## 🏛️ Museums <!-- orbit priority: 1 -->
> Gulbenkian first, then the tiles.
### Azulejo museum <!-- orbit link: "https://example.com/azulejo" -->
![Blue tiles on a wall](mountain.jpg)
<!-- orbit caption: Tiles from the 1700s -->
### Gulbenkian <!-- orbit link: "#food" -->
## 🚋 Tram 28 <!-- orbit video: "https://vimeo.com/76979871" -->
The yellow tram through Alfama.
${['Graça', 'Alfama', 'Baixa', 'Estrela', 'Prazeres'].map((stop) => `### ${stop}\nA stop on the way, with time for a coffee and a look around.`).join('\n')}
## 🌅 Viewpoints
${['Senhora do Monte', 'Santa Luzia', 'São Pedro de Alcântara', 'Portas do Sol', 'Santa Catarina', 'Monte Agudo'].map((viewpoint) => `- ${viewpoint}`).join('\n')}
## 🗓️ Plan
### Friday
Arrive at noon, check in, walk Baixa.
### Saturday
Belém in the morning, Alfama after lunch, fado at night.
### Sunday
Sintra all day: Pena, Regaleira and the Moorish castle.
`;

/** The map exported as a web page by the built command, with its picture inside, as people share them. */
const exportedPage = (): string => {
  const command = fileURLToPath(new URL('../dist/bin/orbit.js', import.meta.url));
  const picture = `data:image/jpeg;base64,${readFileSync(new URL('pages/img/mountain.jpg', import.meta.url)).toString('base64')}`;
  const html = execFileSync('node', [command, 'export', '--html', '-'], { input: MAP, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  // Read from stdin, the page links to the picture as written: put it inside, as a page made beside its picture has it.
  return html.replace('(mountain.jpg)', `(${picture})`);
};

test('a shared map prints laid out for paper, not as the map on screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setContent(exportedPage());
  await page.waitForSelector('#page-print .orbit-print', { state: 'attached' });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#page-map')).toBeHidden();
  await expect(page.locator('.orbit-print__title')).toHaveText('🧳 Weekend in Lisbon');
  await expect(page.locator('.orbit-print__picture svg')).toBeVisible();
  await page.locator('.orbit-print__image').first().evaluate((image: HTMLImageElement) => image.decode());
  await expect(page).toHaveScreenshot('print-layout.png', { fullPage: true });
  expect(errors).toEqual([]);
});

test('Chromium’s PDF of a shared map has its pages, picture, outline and links', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One PDF is enough: the phone prints the same page.');
  await page.setContent(exportedPage());
  await page.waitForSelector('#page-print .orbit-print', { state: 'attached' });
  const pdf = (await page.pdf({ format: 'A4' })).toString('latin1');
  // The outline runs past the first page, and every page is A4.
  const pages = pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? [];
  expect(pages.length).toBeGreaterThanOrEqual(2);
  expect(pdf.match(/\/MediaBox\s*\[0 0 59[56](\.\d+)? 84[12](\.\d+)?\]/g)?.length).toBe(pages.length);
  // Addresses stay links in the PDF; the video's goes to its page, not its player.
  expect(pdf).toContain('/URI (https://example.com/azulejo)');
  expect(pdf).toContain('/URI (https://vimeo.com/76979871)');
  expect(pdf).toContain('/Title (Weekend in Lisbon)');
});
