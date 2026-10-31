/**
 * Draws maps in Chromium 99, the oldest WebView Orbit for Android runs maps
 * in (and the floor the guide's "Browsers" names): the built package's main
 * features on e2e/pages/older-chromium.html, which says what worked and
 * what went wrong. The browser tests run a current Chromium, and
 * tests/older-browsers.test.ts only simulates missing features: this is
 * the one place an old engine reads the package itself, its syntax included.
 *
 *   bun run build && bun run check:older-chromium
 *
 * Chromium comes from Chromium's own snapshots, once, into the user's cache
 * (~/.cache/orbit/), or from ORBIT_OLDER_CHROMIUM (a `chrome` to run).
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Chromium 99.0.4844.0's snapshot: the branch point of Chromium 99. */
const REVISION = '961656';
const SNAPSHOT = `https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${REVISION}/chrome-linux.zip`;
const VERSION = /Chrome\/99\./;

const root = join(import.meta.dir, '..');
const cache = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'orbit', `chromium-${REVISION}`);

const chromium = async (): Promise<string> => {
  const given = process.env.ORBIT_OLDER_CHROMIUM;

  if (given) {
    return given;
  }

  const binary = join(cache, 'chrome-linux', 'chrome');

  if (existsSync(binary)) {
    return binary;
  }

  console.log(`Downloading Chromium 99 (${SNAPSHOT})…`);
  mkdirSync(cache, { recursive: true });
  const zip = join(cache, 'chrome-linux.zip');
  const response = await fetch(SNAPSHOT);

  if (!response.ok) {
    throw new Error(`Chromium's snapshot didn't download: ${response.status} ${response.statusText}`);
  }

  await Bun.write(zip, response);
  const unzip = Bun.spawnSync(['unzip', '-q', '-o', zip, '-d', cache]);

  if (unzip.exitCode !== 0) {
    throw new Error(`Chromium's snapshot didn't unzip: ${unzip.stderr.toString()}`);
  }

  rmSync(zip);
  return binary;
};

/** The page's result: what each check found, and every error or warning the page logged. */
interface Result {
  userAgent: string;
  checks: Record<string, true | string>;
  problems: string[];
}

const main = async (): Promise<number> => {
  if (!existsSync(join(root, 'dist', 'index.js'))) {
    console.error('Build the package first: bun run build');
    return 2;
  }

  if (!process.env.ORBIT_OLDER_CHROMIUM && (process.platform !== 'linux' || process.arch !== 'x64')) {
    console.log('Chromium 99\'s own build is for Linux on x64, where CI runs this check: skipped here. ORBIT_OLDER_CHROMIUM can name a Chromium 99 to run.');
    return 0;
  }

  const browser = await chromium();
  const port = 4300 + Math.floor(Math.random() * 500);
  const server = Bun.spawn([process.execPath, join(root, 'e2e', 'serve.mjs'), String(port)], { stdout: 'ignore', stderr: 'inherit' });

  try {
    const page = `http://localhost:${port}/older-chromium.html`;

    for (let tries = 0; tries < 50 && !(await fetch(page).then((response) => response.ok, () => false)); tries += 1) {
      await Bun.sleep(100);
    }

    // Virtual time runs the page's timers at once, and waits on its downloads. Its own SwiftShader
    // through ANGLE draws: the system's GL drivers can crash a Chromium this old as it starts.
    const open = () => Bun.spawnSync([
      browser, '--headless', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage',
      '--hide-scrollbars', '--window-size=1280,800', '--virtual-time-budget=30000', '--dump-dom', page,
    ], { timeout: 120_000 });

    let run = open();

    if (run.stdout.length === 0) {
      // Chromium itself stopped before it wrote the page, which says nothing about Orbit: once more.
      console.log('Chromium 99 stopped before the page was drawn; once more.');
      run = open();
    }

    const json = /<pre id="result">([\s\S]*?)<\/pre>/.exec(run.stdout.toString())?.[1];

    if (!json || !json.startsWith('{')) {
      // Nothing the page could say: Chromium's own last words are all there is.
      console.error(`The page didn't finish in Chromium 99: ${json ?? 'no page'}`);
      console.error(run.stderr.toString().split('\n').slice(-20).join('\n'));
      return 1;
    }

    const result = JSON.parse(json.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as Result;
    console.log(result.userAgent);

    if (!VERSION.test(result.userAgent)) {
      console.error('That isn\'t Chromium 99.');
      return 1;
    }

    const failed = Object.entries(result.checks).filter(([, outcome]) => outcome !== true);

    if (Object.keys(result.checks).length === 0) {
      console.error('The package didn\'t load in Chromium 99.');
    }

    for (const [name, outcome] of Object.entries(result.checks)) {
      console.log(`${outcome === true ? '✓' : '✗'} ${name}${outcome === true ? '' : `: ${outcome}`}`);
    }

    for (const problem of result.problems) {
      console.error(`Logged: ${problem}`);
    }

    return failed.length === 0 && result.problems.length === 0 && Object.keys(result.checks).length > 0 ? 0 : 1;
  } finally {
    server.kill();
  }
};

process.exit(await main());
