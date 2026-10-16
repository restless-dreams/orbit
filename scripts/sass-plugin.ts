import type { BunPlugin } from 'bun';
import { compile } from 'sass';

/**
 * Imports `.scss` files as a string of compiled, minified CSS. Registered for
 * the build (scripts/build.ts) and for tests (tests/setup.ts), so the library
 * ships plain CSS strings and keeps zero runtime dependencies.
 */
export const sassPlugin: BunPlugin = {
  name: 'orbit-sass',
  setup(build) {
    build.onLoad({ filter: /\.scss$/ }, (args) => {
      const { css } = compile(args.path, { style: 'compressed' });
      return { contents: `export default ${JSON.stringify(css)};`, loader: 'js' };
    });
  },
};
