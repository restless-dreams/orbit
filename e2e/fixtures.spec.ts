import { test } from './fixtures';

// Every browser test fails on a page error it didn't expect (e2e/fixtures.ts):
// these make sure it does, and lets the ones a test expects through.

const throwing = (message: string) => `<script>setTimeout(() => { throw new Error(${JSON.stringify(message)}); })</script>`;

test('a page error the test didn\'t expect fails it, even when its own checks pass', async ({ page }) => {
  test.fail();
  const thrown = page.waitForEvent('pageerror');
  await page.setContent(throwing('Nobody expected this'));
  await thrown;
});

test('a promise the page leaves rejected fails the test too', async ({ page }) => {
  test.fail();
  const thrown = page.waitForEvent('pageerror');
  await page.setContent('<script>Promise.reject(new Error("Left rejected"))</script>');
  await thrown;
});

test.describe('a page error the test expects', () => {
  test.use({ expectedPageErrors: [/An expected failure/] });

  test('leaves it passing', async ({ page }) => {
    const thrown = page.waitForEvent('pageerror');
    await page.setContent(throwing('An expected failure'));
    await thrown;
  });
});
