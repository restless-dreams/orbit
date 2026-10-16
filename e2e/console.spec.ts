import { expect, test } from '@playwright/test';
import { openMap } from './helpers';

// Setup mistakes are explained in the console, where developers and coding
// agents look when a map doesn't show.

test('a container without a height says how to fix it', async ({ page }) => {
  const warnings: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'warning') {
      warnings.push(message.text());
    }
  });

  await openMap(page, 'flat&instant');
  await expect.poll(() => warnings.join('\n')).toContain('The map has no height, so nothing shows');
  expect(warnings).toHaveLength(1);
});

test('a map with a height and a known theme warns about nothing', async ({ page }) => {
  const messages: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      messages.push(message.text());
    }
  });

  await openMap(page, 'theme=cosmos&instant');
  await page.waitForTimeout(300);
  expect(messages).toEqual([]);
});
