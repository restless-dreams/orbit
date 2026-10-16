import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sassPlugin } from './sass-plugin';
import { buildWebPageScript } from './build-web-page';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');

const entries = [
  join(root, 'src/index.ts'),
  join(root, 'src/react/index.ts'),
  join(root, 'src/marked/index.ts'),
];

const external = ['react', 'react-dom', 'marked'];

/**
 * Next.js and other React Server Components setups need `"use client"` as
 * the first statement of the React entry. Bun's `banner` applies to every
 * output of a build, and the core entries must stay usable on the server, so
 * the directive is added to this one file afterwards. Its source map moves
 * down one line to match.
 */
const markClientEntry = async (file: string): Promise<void> => {
  const code = await readFile(file, 'utf8');
  await writeFile(file, `"use client";\n${code}`);
  const mapFile = `${file}.map`;
  const map = JSON.parse(await readFile(mapFile, 'utf8')) as { mappings: string };
  map.mappings = `;${map.mappings}`;
  await writeFile(mapFile, JSON.stringify(map));
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const library = await Bun.build({
  entrypoints: entries,
  outdir: dist,
  format: 'esm',
  target: 'browser',
  external,
  // Multi-entry ESM without splitting emits bare re-export shims for entries
  // whose exports are inlined into another entry, leaving them "not defined
  // in module" at runtime. Splitting forces Bun to emit shared chunk-*.js
  // files and turn each entry into a stub, which also means every entry point
  // shares one copy of the renderer.
  splitting: true,
  sourcemap: 'linked',
  naming: '[dir]/[name].[ext]',
  plugins: [sassPlugin],
});

if (!library.success) {
  console.error('Library build failed', library.logs);
  process.exit(1);
}

await markClientEntry(join(dist, 'react/index.js'));

// Orbit and a web page's own script in one file, for exportWebPage() (see scripts/build-web-page.ts).
await writeFile(join(dist, 'web-page.js'), await buildWebPageScript());
await writeFile(join(dist, 'web-page.d.ts'), "// Orbit's web page script: read it as text and pass it to exportWebPage().\nexport {};\n");

const cli = await Bun.build({
  entrypoints: [join(root, 'bin/orbit.ts')],
  outdir: join(dist, 'bin'),
  format: 'esm',
  target: 'node',
  external,
  sourcemap: 'linked',
  banner: '#!/usr/bin/env node',
  naming: '[name].[ext]',
  plugins: [sassPlugin],
});

if (!cli.success) {
  console.error('CLI build failed', cli.logs);
  process.exit(1);
}

await chmod(join(dist, 'bin/orbit.js'), 0o755);

console.log('Build complete:', dist);
