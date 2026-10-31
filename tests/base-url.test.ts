import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { parseOrbit } from '../src/core/dispatch';
import { renderPrintLayout } from '../src/core/print-layout';
import { renderToSVGString } from '../src/index';
import { embedFrame } from '../src/core/ui/frames';
import { renderNoteMarkdown } from '../src/core/ui/note-markdown';
import { click, mount, useMapSize } from './helpers/renderer';

useMapSize();

// A relative address takes the scheme of the base it's joined to: joined to `javascript://x/`, `%0a…` is
// `javascript://x/%0a…`, whose `//x/` is a comment and whose line break starts the script.
const SCRIPT = "%0atop.document.title='XSS'";

const BODY = `# Plan
<!-- orbit embed: "${SCRIPT}" -->

## Hotel
<!-- orbit link: "${SCRIPT}" -->

## Flights
A note with [a link](${SCRIPT}) in it.

## Summit
![The summit](${SCRIPT}.jpg)
`;

const CRAFTED = `---\nbaseUrl: "javascript://x/"\n---\n${BODY}`;

const containers: HTMLElement[] = [];

afterEach(() => {
  containers.splice(0).forEach((container) => container.remove());
});

const holder = (): HTMLElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  containers.push(container);
  return container;
};

describe('the base a map names', () => {
  it('is left out and reported unless it is a web address or a relative path', () => {
    for (const base of ['javascript://x/', 'JaVaScRiPt://x/', ' java\tscript://x/', 'javascript:/x/', 'vbscript://x/', 'data:text/html,x', 'file:///etc/', 'blob:https://example.com/id']) {
      const markdown = parseOrbit(`---\nbaseUrl: ${JSON.stringify(base)}\n---\n# Plan`);
      expect(markdown.options.baseUrl).toBeUndefined();
      expect(markdown.diagnostics.some((diagnostic) => diagnostic.code === 'invalid-option-value' && diagnostic.message.includes('baseUrl'))).toBe(true);
      const yaml = parseOrbit(`baseUrl: ${JSON.stringify(base)}\nnodes:\n  - text: Plan\n`);
      expect(yaml.options.baseUrl).toBeUndefined();
      expect(yaml.diagnostics.some((diagnostic) => diagnostic.code === 'invalid-option-value')).toBe(true);
    }
  });

  it('keeps web addresses and relative paths as written', () => {
    for (const base of ['https://example.com/maps/', 'http://example.com/maps/', '//cdn.example.com/photos/', '/docs/assets/', 'media/', './photos/']) {
      const doc = parseOrbit(`---\nbaseUrl: ${JSON.stringify(base)}\n---\n# Plan`);
      expect(doc.options.baseUrl).toBe(base);
      expect(doc.diagnostics.filter((diagnostic) => diagnostic.code === 'invalid-option-value')).toEqual([]);
    }
  });
});

describe('nothing a crafted base joins becomes a script', () => {
  const quiet: { mockRestore: () => void }[] = [];

  beforeEach(() => {
    // Frames log that they can't load in happy-dom, and the bases left unused are reported.
    quiet.push(spyOn(console, 'error').mockImplementation(() => undefined), spyOn(console, 'warn').mockImplementation(() => undefined));
  });

  afterEach(() => {
    quiet.splice(0).forEach((spy) => spy.mockRestore());
  });

  // The map's own base is refused, and a page's (or a document made in code) is checked as addresses are joined.
  const cases: { name: string; source: string; baseUrl?: string }[] = [
    { name: 'the map\'s own base', source: CRAFTED },
    { name: 'a page\'s base', source: BODY, baseUrl: 'javascript://x/' },
    { name: 'a page\'s base with one slash', source: BODY, baseUrl: 'javascript:/x/' },
    { name: 'a page\'s vbscript base', source: BODY, baseUrl: 'vbscript://x/' },
  ];

  for (const { name, source, baseUrl } of cases) {
    it(`on the map, in its embed: ${name}`, () => {
      const { host } = mount(source, baseUrl ? { baseUrl } : {});
      click(host.querySelector('.orbit-action--embed')!);
      const frame = host.querySelector('iframe');
      expect(frame).not.toBeNull();
      expect(frame!.getAttribute('src')).toBe(SCRIPT);
      expect(host.innerHTML.toLowerCase()).not.toContain('script:');
      host.remove();
    });

    it(`laid out for print: ${name}`, () => {
      const layout = renderPrintLayout(holder(), source, baseUrl ? { baseUrl } : {});
      expect(layout.innerHTML.toLowerCase()).not.toContain('script:');
      expect(Array.from(layout.querySelectorAll('a')).map((link) => link.getAttribute('href'))).toContain(SCRIPT);
    });

    it(`exported as SVG: ${name}`, () => {
      const svg = renderToSVGString(parseOrbit(source), { view: 'all', ...(baseUrl ? { baseUrl } : {}) });
      expect(svg.toLowerCase()).not.toContain('script:');
    });
  }

  it('in a note and a frame of their own', () => {
    const note = renderNoteMarkdown(`A note with [a link](${SCRIPT}) in it.`, { baseUrl: 'javascript://x/' });
    expect(note.querySelector('a')?.getAttribute('href')).toBe(SCRIPT);
    expect(embedFrame(SCRIPT, 'javascript://x/', 'Plan')?.getAttribute('src')).toBe(SCRIPT);
  });

  it('while web and file bases still resolve as before', () => {
    expect(embedFrame('page.html', 'https://example.com/maps/', 'Plan')?.getAttribute('src')).toBe('https://example.com/maps/page.html');
    const note = renderNoteMarkdown('[a link](notes.html) and ![a picture](summit.jpg)', { baseUrl: 'https://example.com/maps/' });
    expect(note.querySelector('a')?.getAttribute('href')).toBe('https://example.com/maps/notes.html');
    expect(note.querySelector('img')?.getAttribute('src')).toBe('https://example.com/maps/summit.jpg');
    const svg = renderToSVGString(parseOrbit('# Trip\n![Summit](summit.jpg)\n'), { baseUrl: 'file:///home/maps/' });
    expect(svg).toContain('href="file:///home/maps/summit.jpg"');
  });
});
