import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { renderToSVGString } from '../src/index';
import { parseOrbit } from '../src/core/dispatch';

const MAP = `---
title: Launch plan
---
# 🚀 Launch

## Research <!-- orbit status: active -->
- Interviews
- Survey

## Build
## Ship`;

const parse = (svg: string): Document => {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  return document;
};

describe('renderToSVGString', () => {
  test('draws a standalone SVG of the focus view with the document\'s title', () => {
    const svg = renderToSVGString(MAP);
    const document = parse(svg);
    const root = document.documentElement;
    expect(root.getAttribute('width')).toBe('800');
    expect(root.getAttribute('height')).toBe('600');
    expect(root.getAttribute('aria-label')).toBe('Launch plan');
    expect(svg).not.toContain('var(');
    const texts = Array.from(document.querySelectorAll('text')).map((text) => text.textContent);
    expect(texts.some((text) => text?.includes('Launch'))).toBe(true);
    expect(texts.some((text) => text?.includes('Research'))).toBe(true);
    // The status shows as a dot in the theme's color for active work.
    expect(svg).toContain('fill="#2563eb"');
  });

  test('takes a size, a theme, a view and a node to focus on', () => {
    const night = renderToSVGString(MAP, { width: 1000, height: 700, theme: 'night' });
    expect(night).toContain('<rect width="1000" height="700" fill="#0b1120"/>');
    const overview = renderToSVGString(MAP, { viewMode: 'all' });
    expect(overview).toContain('Interviews');
    const focused = renderToSVGString(MAP, { focus: 'research' });
    const texts = Array.from(parse(focused).querySelectorAll('text')).map((text) => text.textContent ?? '');
    expect(texts.some((text) => text.includes('Interviews'))).toBe(true);
    expect(texts.some((text) => text.includes('Ship'))).toBe(false);
  });

  test('draws each theme\'s planets, rings and lettering', () => {
    const paper = renderToSVGString(MAP);
    expect(paper).toContain('<filter id="orbit-export-shadow"');
    expect(paper).toContain('stroke-dasharray="1 6"');
    // The sun's halo: a thin ring around it.
    expect(paper).toMatch(/<circle cx="400" cy="300" r="[\d.]+" fill="none" stroke="#[0-9a-f]{6}" stroke-opacity="0.55" stroke-width="1"\/>/);

    const ink = renderToSVGString(MAP, { theme: 'ink' });
    expect(ink).not.toContain('<filter');
    expect(ink).toContain('font-family="ui-serif');
    expect(ink).toContain('stroke-dasharray="0.5 5"');

    const blueprint = renderToSVGString(MAP, { theme: 'blueprint' });
    expect(blueprint).toContain('font-family="ui-monospace');
    expect(blueprint).toContain('stroke-dasharray="4 4"');
    expect(blueprint).toContain('<rect width="800" height="600" fill="#123a7a"/>');

    // Liquid glass catches its light along the rim: the shading's circle sits to the bottom right.
    expect(renderToSVGString(MAP, { theme: 'liquid' })).toContain('<radialGradient id="orbit-export-shade" cx="0.53" cy="0.55" r="0.56">');
    expect(paper).toContain('<radialGradient id="orbit-export-shade" cx="0.34" cy="0.3" r="0.78">');

    const textColors = (svg: string) => new Set(Array.from(parse(svg).querySelectorAll('text')).map((text) => text.getAttribute('fill')));
    // White on the jewel-toned planets, dark on the golden sun.
    expect(textColors(renderToSVGString(MAP, { theme: 'cosmos' }))).toEqual(new Set(['#ffffff', '#1a1206']));
    expect(textColors(renderToSVGString(MAP, { theme: 'glass-night' }))).toEqual(new Set(['#f4f6ff']));
  });

  test('takes any theme token from a theme object', () => {
    const svg = renderToSVGString(MAP, { theme: { preset: 'paper', tokens: { 'font-family': 'Inter', 'ring-dash': 'none', 'sun-halo-opacity': '0' } } });
    expect(svg).not.toContain('stroke-dasharray');
    expect(svg).toContain('font-family="Inter"');
    expect(svg).not.toMatch(/<circle[^>]*fill="none"/);
  });

  test('accepts parsed documents and node trees', () => {
    const doc = parseOrbit(MAP);
    expect(renderToSVGString(doc)).toBe(renderToSVGString(MAP));
    expect(renderToSVGString(doc.root, { title: 'Tree' })).toContain('aria-label="Tree"');
  });

  test('scales to its container and keeps ids unique when asked', () => {
    const svg = renderToSVGString(MAP, { responsive: true, idPrefix: 'map-1' });
    const root = parse(svg).documentElement;
    expect(root.getAttribute('width')).toBe('100%');
    expect(root.getAttribute('viewBox')).toBe('0 0 800 600');
    expect(svg).toContain('id="map-1-shade"');
    expect(svg).not.toContain('orbit-export');
  });

  test('escapes an id prefix, so it can\'t add markup', () => {
    const svg = renderToSVGString(MAP, { idPrefix: 'map"><script>alert(1)</script>' });
    const document = parse(svg);
    expect(document.querySelector('script')).toBeNull();
    // The escaped prefix still keys every id and its url(#…) reference.
    const prefix = 'map&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;';
    expect(svg).toContain(`id="${prefix}-shade"`);
    expect(svg).toContain(`fill="url(#${prefix}-shade)"`);
  });

  test('an empty map says so', () => {
    expect(renderToSVGString('')).toContain('This map is empty');
  });

  test('rejects sizes it cannot draw instead of hanging', () => {
    for (const options of [{ width: Infinity }, { height: NaN }, { width: 0 }, { height: -4 }, { width: 2_000_000 }, { height: 1e18 }]) {
      expect(() => renderToSVGString(MAP, options)).toThrow('positive number');
    }

    // A poster-sized drawing is fine: only sizes no drawing needs are refused.
    expect(renderToSVGString(MAP, { width: 100_000, height: 2 })).toContain('width="100000"');
    expect(renderToSVGString(MAP, { width: 1_000_000, height: 1_000_000 })).toContain('width="1000000"');
  });

  test('writes colors from the map and the theme as attribute values, so they can\'t add markup', () => {
    const svg = renderToSVGString(`---
palette: ["#F8D978", "red\\" onmouseover=\\"alert(1)"]
---
# Root
## A
<!-- orbit
color: "blue\\" onclick=\\"alert(2)"
-->
## B`, { theme: { tokens: { surface: '"><script>alert(3)</script>' } } });
    const document = parse(svg);
    const handlers = Array.from(document.querySelectorAll('*')).flatMap((element) =>
      Array.from(element.attributes).filter((attribute) => attribute.name.toLowerCase().startsWith('on')).map((attribute) => `${element.tagName}[${attribute.name}]`),
    );
    expect(handlers).toEqual([]);
    expect(document.querySelector('script')).toBeNull();
    // Colors Orbit can't read are kept, escaped, for the viewer to make sense of.
    expect(svg).toContain('fill="blue&quot; onclick=&quot;alert(2)"');
  });

  test('keeps the theme\'s background: the wallpaper glass shows through, stars, a grid', () => {
    const liquid = parse(renderToSVGString(MAP, { theme: 'liquid' }));
    const gradients = liquid.querySelectorAll('radialGradient[id*="surface"]');
    expect(gradients).toHaveLength(4);
    // A gradient fading to transparent keeps its color at the edge, so it doesn't go grey.
    const stops = Array.from(gradients[0].querySelectorAll('stop'));
    expect(stops.map((stop) => stop.getAttribute('stop-color'))).toEqual([stops[0].getAttribute('stop-color'), stops[0].getAttribute('stop-color')]);
    expect(stops.map((stop) => stop.getAttribute('stop-opacity'))[1]).toBe('0');
    const blueprint = parse(renderToSVGString(MAP, { theme: 'blueprint' }));
    expect(blueprint.querySelectorAll('pattern[id*="surface"] rect')).toHaveLength(4);
    const cosmos = parse(renderToSVGString(MAP, { theme: 'cosmos' }));
    expect(cosmos.querySelector('pattern[id*="surface"] image')?.getAttribute('href')).toStartWith('data:image/svg+xml,');
    expect(parse(renderToSVGString(MAP, { theme: 'flat' })).querySelector('[id*="surface"]')).toBeNull();
  });
});

describe('orbit render', () => {
  test('renders a map file to SVG without a browser, linking images next to the file from the SVG', () => {
    const folder = mkdtempSync(join(tmpdir(), 'orbit-render-'));
    const input = join(folder, 'map.md');
    const output = join(folder, 'map.svg');
    writeFileSync(input, '# Trip\n![Summit](photos/summit.jpg)\n\n## Gear\n## Route');
    // A separate process without the test DOM: the command must not need one.
    const result = Bun.spawnSync(['bun', 'bin/orbit.ts', 'render', input, '--out', output, '--theme', 'night', '--width', '640', '--height', '480'], {
      cwd: join(import.meta.dir, '..'),
      env: { ...process.env, NODE_ENV: 'production' },
    });
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    const svg = readFileSync(output, 'utf8');
    expect(svg).toContain('width="640" height="480"');
    // The SVG sits next to the map, so its pictures are where the map says.
    expect(svg).toContain('href="photos/summit.jpg"');
    expect(svg).not.toContain('file:');
    expect(svg).toContain('Gear');
  });

  test('rejects unknown options and themes', () => {
    const run = (...argumentsList: string[]) => Bun.spawnSync(['bun', 'bin/orbit.ts', 'render', ...argumentsList], { cwd: join(import.meta.dir, '..') });
    expect(run('--shape', 'round', 'map.md').exitCode).toBe(2);
    expect(run('--theme', 'neon', '-').exitCode).toBe(2);
    expect(run('--view', 'sideways', '-').exitCode).toBe(2);
  });

  test('a baseUrl starting with // is on the web, and one that is not an address is named', () => {
    const folder = mkdtempSync(join(tmpdir(), 'orbit-render-'));

    const run = (frontmatter: string) => {
      const input = join(folder, 'map.md');
      writeFileSync(input, `---\n${frontmatter}\n---\n# Trip\n![Summit](summit.jpg)\n`);
      return Bun.spawnSync(['bun', 'bin/orbit.ts', 'render', input], { cwd: join(import.meta.dir, '..') });
    };

    const web = run('baseUrl: //cdn.example.com/photos/');
    expect(web.exitCode).toBe(0);
    expect(web.stdout.toString()).toContain('href="https://cdn.example.com/photos/summit.jpg"');
    const broken = run('baseUrl: "http://[oops"');
    expect(broken.exitCode).toBe(1);
    expect(broken.stderr.toString()).toContain('baseUrl "http://[oops" is not an address');
  });

  test('rejects sizes it cannot draw, and resolves a relative baseUrl next to the map file, from where the SVG goes', () => {
    const folder = mkdtempSync(join(tmpdir(), 'orbit-render-'));
    const input = join(folder, 'map.md');
    writeFileSync(input, '---\nbaseUrl: photos/\n---\n# Trip\n![Summit](summit.jpg)\n\n## Gear\n');
    const run = (...argumentsList: string[]) => Bun.spawnSync(['bun', 'bin/orbit.ts', 'render', ...argumentsList], { cwd: join(import.meta.dir, '..') });
    expect(run('--width', 'Infinity', input).exitCode).toBe(2);
    expect(run('--height', '2000000', input).exitCode).toBe(2);
    expect(run('--width', '20000', input).exitCode).toBe(0);
    const result = run(input);
    expect(result.stderr.toString()).toBe('');
    expect(result.exitCode).toBe(0);
    // Written to stdout, so linked from the working directory.
    const fromHere = relative(join(import.meta.dir, '..'), join(folder, 'photos', 'summit.jpg')).split(sep).join('/');
    expect(result.stdout.toString()).toContain(`href="${fromHere}"`);
  });
});
