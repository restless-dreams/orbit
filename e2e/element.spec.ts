import { expect, test } from '@playwright/test';
import { openMap } from './helpers';

test('<orbit-map> redraws when its content is fixed after a broken edit', async ({ page }) => {
  await openMap(page, 'instant');

  const states = await page.evaluate(async () => {
    // The library as the fixture page loads it, from the build.
    const library = '/dist/index.js';
    const { defineOrbitMapElement } = await import(library);
    defineOrbitMapElement();
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
    const element = document.createElement('orbit-map') as HTMLElement & { renderer: unknown };
    const errors: string[] = [];
    element.addEventListener('orbit-error', () => errors.push('error'));
    element.textContent = '# Root\n## Alpha\n## Beta';
    document.body.appendChild(element);
    await settle();
    const mounted = element.renderer !== null;
    element.textContent = 'nodes: [unclosed';
    await settle();
    const broken = element.renderer !== null;
    element.textContent = '# Root\n## Alpha\n## Beta\n## Gamma';
    await settle();
    return { mounted, broken, fixed: element.renderer !== null, errors: errors.length };
  });

  expect(states).toEqual({ mounted: true, broken: false, fixed: true, errors: 1 });
});
