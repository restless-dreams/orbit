import { test as base, expect, type Page } from '@playwright/test';

export interface PageErrorOptions {
  /** Errors a test expects its pages to throw, by their messages: any other fails it. */
  expectedPageErrors: RegExp[];
}

/**
 * Playwright's `test`, for every browser test (ESLint holds the specs to it):
 * a test fails when a page it opens throws an error it didn't expect, an
 * uncaught exception or an unhandled rejection, even one its own checks would
 * never notice. A test that means a page to throw says which errors with
 * `test.use({ expectedPageErrors: [...] })`.
 */
export const test = base.extend<PageErrorOptions & { pageErrors: void }>({
  expectedPageErrors: [[], { option: true }],
  pageErrors: [
    async ({ context, expectedPageErrors }, use) => {
      const errors: string[] = [];

      const watch = (page: Page) => {
        page.on('pageerror', (error) => {
          if (!expectedPageErrors.some((expected) => expected.test(error.message))) {
            errors.push(error.stack ?? `${error.name}: ${error.message}`);
          }
        });
      };

      context.pages().forEach(watch);
      context.on('page', watch);
      await use();
      expect(errors, 'A page threw an error the test didn\'t expect').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
