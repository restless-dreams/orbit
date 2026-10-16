// A small static server for the browser tests: the pages they open
// (e2e/pages: fixture.html, embedded.html, the sample maps and their
// pictures) at the root, the built package under /dist, and the made-up
// large map (scripts/large-map.js) as /large-map.js.
// Usage: node e2e/serve.mjs [port]  (default 4174, or $PORT)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pages = join(root, 'e2e', 'pages');
const build = join(root, 'dist');
const largeMap = join(root, 'scripts', 'large-map.js');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4174);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.webm': 'video/webm',
};

const fileFor = (pathname) => {
  const clean = normalize(decodeURIComponent(pathname));

  if (clean.startsWith('/dist/')) {
    return join(build, clean.slice('/dist/'.length));
  }

  if (clean === '/large-map.js') {
    return largeMap;
  }

  return join(pages, clean);
};

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const file = fileFor(pathname);

  if (!file.startsWith(pages) && !file.startsWith(build) && file !== largeMap) {
    response.writeHead(403).end();
    return;
  }

  try {
    const body = await readFile(file);
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    // Videos ask for parts of themselves, to start and to seek.
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');

    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;

      if (start > end) {
        response.writeHead(416, { 'content-range': `bytes */${body.length}` }).end();
        return;
      }

      response.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${body.length}`,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      }).end(body.subarray(start, end + 1));
      return;
    }

    response.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }).end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`The browser tests' pages on http://localhost:${port}/fixture.html`);
});
