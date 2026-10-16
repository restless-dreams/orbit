import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const MAP = '# Launch\nWhat ships this year.\n## Research\nSix weeks of interviews.\n## Build\n## Ship\n';

/** A map exported as a web page by the built command, as people make them. */
const exportedPage = (): string => {
  const command = fileURLToPath(new URL('../dist/bin/orbit.js', import.meta.url));
  return execFileSync('node', [command, 'export', '--html', '-'], { input: MAP, encoding: 'utf8' });
};

test('a map exported as a web page draws, and presents one idea at a time', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  expect(errors).toEqual([]);
});
