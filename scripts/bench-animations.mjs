/**
 * How smoothly Orbit animates a large map, measured in Chromium: the first
 * draw, flights between views, spins, the drift, a crowded orbit, and the
 * overview's zoom and pan. Runs in the Playwright container, like the
 * browser tests:
 *
 *   bun run bench                            # the made-up library map (scripts/large-map.js), desktop size
 *   bun run bench -- --profile=phone         # a phone: 412 × 915 at 2.625×, with the CPU slowed 4×
 *   bun run bench -- --map=path/to/map.md    # any map
 *   bun run bench -- --map=huge              # orbits of 150 planets with moons, and of 1,000 (hugeOrbits)
 *   bun run bench -- --runs=5 --out=results  # results as JSON; add --cpu-profile for DevTools CPU profiles, --trace for Chrome traces
 *   bun run bench -- --strict                # exits with an error when a spin misses 60 fps
 *
 * For each animation it reports frames per second and frame times while
 * Orbit animates (the median, the 95th percentile and the longest), how
 * long Orbit's own code takes per frame, and whether it meets the goal of
 * 60 fps: at least 58 fps, with 95% of frames on time. Spins must meet it
 * on any map. Compare runs on the same machine.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { hugeOrbits, largeMap } from './large-map.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parameters = process.argv.slice(2);

const option = (name, fallback) => {
  const found = parameters.find((parameter) => parameter.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const PROFILES = {
  desktop: { context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, cpuSlowdown: 1 },
  phone: { context: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true }, cpuSlowdown: 4 },
};
const profileName = option('profile', 'desktop');
const profile = PROFILES[profileName];

if (!profile) {
  throw new Error(`--profile is desktop or phone, not ${profileName}.`);
}

const runs = Math.max(1, Number(option('runs', '3')));
const theme = option('theme', 'cosmos');
const outputFolder = option('out', '');
const cpuProfiles = parameters.includes('--cpu-profile') && outputFolder !== '';
const traces = parameters.includes('--trace') && outputFolder !== '';
const mapFile = option('map', '');
const map = mapFile === 'huge' ? hugeOrbits() : mapFile ? fs.readFileSync(mapFile, 'utf8') : largeMap();
/** The goal for every animation: 60 fps, give or take a frame or two a second, with 95% of frames on time. */
const meetsGoal = (median) => median.fps >= 58 && median.p95Frame <= 17.5;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #05060f } orbit-map { display: block; width: 100vw; height: 100vh }</style></head>
<body><orbit-map theme="${theme}"><script type="text/orbit">${map.replace(/<\/script/gi, '<\\/script')}</script></orbit-map>
<script type="module">
import { defineOrbitMapElement } from '/dist/index.js';
defineOrbitMapElement();
</script></body></html>`;

const server = http.createServer((request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');

  if (pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(page);
    return;
  }

  const file = path.join(root, pathname);

  if (pathname.startsWith('/dist/') && file.startsWith(path.join(root, 'dist')) && fs.existsSync(file)) {
    response.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'application/json' });
    response.end(fs.readFileSync(file));
    return;
  }

  response.writeHead(404);
  response.end();
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

/** In the page: records each frame, whether Orbit was animating, and how long Orbit's own frame work took. */
const installRecorder = () => {
  const recorder = {
    recording: false,
    take: 0,
    frames: [],
    orbitWork: [],
    start() {
      this.frames = [];
      this.orbitWork = [];
      this.recording = true;
      this.take += 1;
      const take = this.take;
      const clock = document.querySelector('orbit-map')?.renderer?.clock;

      const frame = (time) => {
        if (this.recording && take === this.take) {
          this.frames.push({ time, animating: Boolean(clock?.isRunning) });
          requestAnimationFrame(frame);
        }
      };

      requestAnimationFrame(frame);
    },
    stop() {
      this.recording = false;
      return { frames: this.frames, orbitWork: this.orbitWork };
    },

    /** Times each run of Orbit's animation loop, by scheduling its frames. */
    timeOrbit() {
      const clock = document.querySelector('orbit-map')?.renderer?.clock;

      if (!clock || clock.timed) {
        return;
      }

      clock.timed = true;

      clock.schedule = (callback) => requestAnimationFrame((time) => {
        const started = performance.now();
        callback(time);

        if (recorder.recording) {
          recorder.orbitWork.push(performance.now() - started);
        }
      });
    },
  };
  window.benchRecorder = recorder;
};

const percentile = (sorted, fraction) => {
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
};

const rounded = (value) => {
  return Math.round(value * 10) / 10;
};

const summarize = ({ frames, orbitWork }) => {
  const intervals = [];

  for (let index = 1; index < frames.length; index += 1) {
    if (frames[index - 1].animating || frames[index].animating) {
      intervals.push(frames[index].time - frames[index - 1].time);
    }
  }

  const sorted = [...intervals].sort((first, second) => first - second);
  const total = intervals.reduce((sum, interval) => sum + interval, 0);
  const work = [...orbitWork].sort((first, second) => first - second);
  return {
    fps: total > 0 ? rounded((intervals.length / total) * 1000) : 0,
    medianFrame: rounded(percentile(sorted, 0.5)),
    p95Frame: rounded(percentile(sorted, 0.95)),
    longestFrame: rounded(sorted.at(-1) ?? 0),
    orbitMedian: rounded(percentile(work, 0.5)),
    orbitP95: rounded(percentile(work, 0.95)),
  };
};

const call = (script, argument) => (browserPage) => browserPage.evaluate(script, argument);
const SCENARIOS = [
  { name: 'spin at the root', run: call(() => document.querySelector('orbit-map').renderer.spin(540)) },
  { name: 'drift', run: call(() => document.querySelector('orbit-map').renderer.setOptions({ orbitAnimation: true })), hold: 2000, after: call(() => document.querySelector('orbit-map').renderer.setOptions({ orbitAnimation: false })) },
  { name: 'fly into a planet', target: 'planet' },
  { name: 'spin a planet', run: call(() => document.querySelector('orbit-map').renderer.spin(540)) },
  { name: 'fly into a moon', target: 'moon' },
  { name: 'fly into the most crowded orbit', target: 'crowded' },
  { name: 'spin the crowded orbit', run: call(() => document.querySelector('orbit-map').renderer.spin(540)) },
  {
    name: 'spin the crowded orbit by dragging it',
    run: async (browserPage) => {
      const { width, height } = browserPage.viewportSize();
      const radius = Math.min(width, height) * 0.3;
      const at = (angle) => [width / 2 + radius * Math.cos(angle), height / 2 + radius * Math.sin(angle)];
      await browserPage.mouse.move(...at(0));
      await browserPage.mouse.down();

      for (let step = 1; step <= 12; step += 1) {
        await browserPage.mouse.move(...at((step / 12) * Math.PI * 0.75));
      }

      await browserPage.mouse.up();
    },
  },
  { name: 'zoom into the crowded orbit', run: call(() => document.querySelector('orbit-map').renderer.zoomBy(2.5)) },
  { name: 'fly back to the root', target: 'root' },
  { name: 'fly out to the overview', run: call(() => document.querySelector('orbit-map').overview()) },
  { name: 'zoom the overview', run: call(() => document.querySelector('orbit-map').renderer.zoomBy(3)) },
  {
    name: 'pan the overview',
    run: async (browserPage) => {
      const { width, height } = browserPage.viewportSize();
      await browserPage.mouse.move(width * 0.7, height * 0.5);
      await browserPage.mouse.down();

      for (let step = 1; step <= 6; step += 1) {
        await browserPage.mouse.move(width * (0.7 - step * 0.06), height * (0.5 - step * 0.02));
      }

      await browserPage.mouse.up();
    },
  },
  { name: 'fit the overview', run: call(() => document.querySelector('orbit-map').renderer.fit()) },
  { name: 'fly in from the overview', target: 'other' },
];

/** Waits until Orbit's animation loop sleeps: the animation is over. */
const animationEnds = async (browserPage, timeout = 8000) => {
  await browserPage.waitForFunction(() => !document.querySelector('orbit-map')?.renderer?.clock?.isRunning, null, { timeout }).catch(() => {});
  await browserPage.waitForTimeout(100);
};

const browser = await chromium.launch();
const results = [];

for (let run = 1; run <= runs; run += 1) {
  const context = await browser.newContext(profile.context);
  const browserPage = await context.newPage();
  browserPage.on('pageerror', (error) => console.error('Page error:', error.message));
  await browserPage.addInitScript(installRecorder);
  const session = await context.newCDPSession(browserPage);

  if (profile.cpuSlowdown > 1) {
    await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
  }

  const started = Date.now();
  await browserPage.goto(origin);
  await browserPage.waitForFunction(() => document.querySelector('orbit-map')?.renderer?.getSVGElement()?.querySelector('[data-orbit-node-id]'), null, { timeout: 60000 });
  results.push({ run, scenario: 'first draw', firstDrawMs: Date.now() - started });
  await browserPage.evaluate(() => window.benchRecorder.timeOrbit());
  await animationEnds(browserPage);

  // Where to fly: the first planet with moons, its first moon with ideas of its own, the node with
  // the most children (the most crowded orbit), and another planet.
  const targets = await browserPage.evaluate(() => {
    const tree = document.querySelector('orbit-map').renderer.getDocument().root;
    const planet = tree.children.find((child) => child.children.length > 0) ?? tree.children[0];
    const moon = planet?.children.find((child) => child.children.length > 0) ?? planet?.children[0];
    const other = tree.children.find((child) => child !== planet) ?? planet;
    let crowded = null;

    const visit = (node) => {
      if (node !== tree && node.children.length > (crowded?.children.length ?? 0)) {
        crowded = node;
      }

      node.children.forEach(visit);
    };

    visit(tree);
    return { root: tree.id, planet: planet?.id, moon: moon?.id, crowded: crowded?.id, other: other?.id };
  });

  for (const scenario of SCENARIOS) {
    if (scenario.target && !targets[scenario.target]) {
      continue;
    }

    const profiling = cpuProfiles && run === 1;

    if (profiling) {
      await session.send('Profiler.enable');
      await session.send('Profiler.start');
    }

    const tracing = traces && run === 1;

    if (tracing) {
      await browser.startTracing(browserPage, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink', 'cc', 'v8.execute', 'toplevel'] });
    }

    await browserPage.evaluate(() => window.benchRecorder.start());

    if (scenario.target) {
      await browserPage.evaluate((id) => document.querySelector('orbit-map').flyTo(id), targets[scenario.target]);
    } else {
      await scenario.run(browserPage);
    }

    if (scenario.hold) {
      await browserPage.waitForTimeout(scenario.hold);
      await scenario.after(browserPage);
    } else {
      await browserPage.waitForTimeout(120);
    }

    await animationEnds(browserPage);
    const recording = await browserPage.evaluate(() => window.benchRecorder.stop());

    if (profiling) {
      const { profile: cpuProfile } = await session.send('Profiler.stop');
      const file = `${profileName}-${scenario.name.replace(/\s+/g, '-')}.cpuprofile`;
      fs.mkdirSync(outputFolder, { recursive: true });
      fs.writeFileSync(path.join(outputFolder, file), JSON.stringify(cpuProfile));
    }

    if (tracing) {
      const trace = await browser.stopTracing();
      fs.mkdirSync(outputFolder, { recursive: true });
      fs.writeFileSync(path.join(outputFolder, `${profileName}-${scenario.name.replace(/\s+/g, '-')}.trace.json`), trace);
    }

    results.push({ run, scenario: scenario.name, ...summarize(recording) });
  }

  await context.close();
}

await browser.close();
server.close();

// The median of each measurement across runs.
const scenarios = [...new Set(results.map((result) => result.scenario))];

const medians = scenarios.map((scenario) => {
  const rows = results.filter((result) => result.scenario === scenario);
  const median = { scenario };

  for (const key of Object.keys(rows[0]).filter((key) => key !== 'run' && key !== 'scenario')) {
    const values = rows.map((row) => row[key]).sort((first, second) => first - second);
    median[key] = values[Math.floor(values.length / 2)];
  }

  if (median.fps !== undefined) {
    median.goal = meetsGoal(median) ? '60 fps' : 'missed';
  }

  return median;
});

console.log(`Orbit animations, ${profileName}, ${mapFile === 'huge' ? 'huge orbits' : mapFile || 'the made-up library map'}, median of ${runs} run${runs === 1 ? '' : 's'}:`);
console.table(medians);
const missed = medians.filter((median) => median.goal === 'missed').map((median) => median.scenario);

if (missed.length > 0) {
  console.log(`Missed the 60 fps goal: ${missed.join(', ')}.`);
}

if (outputFolder) {
  fs.mkdirSync(outputFolder, { recursive: true });
  fs.writeFileSync(path.join(outputFolder, `${profileName}.json`), JSON.stringify({ profile: profileName, map: mapFile || 'large-map.js', runs: results, medians }, null, 2));
}

if (parameters.includes('--strict') && missed.some((scenario) => scenario.startsWith('spin'))) {
  process.exitCode = 1;
}
