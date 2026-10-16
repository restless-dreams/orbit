// Builds Orbit's web page script: Orbit and a web page's own code
// (src/core/web-page/start.ts) in one classic script, which exportWebPage()
// puts inside every page it makes, so pages work offline. scripts/build.ts
// writes it to dist/web-page.js; tests that export pages call it when there's
// no build yet.
import { join } from 'node:path';
import { sassPlugin } from './sass-plugin';

export const buildWebPageScript = async (): Promise<string> => {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, '../src/core/web-page/start.ts')],
    format: 'iife',
    target: 'browser',
    minify: true,
    splitting: false,
    plugins: [sassPlugin],
  });

  if (!result.success) {
    throw new AggregateError(result.logs, 'Web page script build failed');
  }

  return result.outputs[0].text();
};
