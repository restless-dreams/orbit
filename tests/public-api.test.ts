import { describe, expect, it, spyOn } from 'bun:test';
import * as orbit from '../src/index';
import { documentToRendererOptions, OrbitSVGRenderer, parseOrbit, serializeOrbitMarkdown, serializeOrbitYAML } from '../src/index';
import { useMapSize } from './helpers/renderer';
import { PACKAGE_EXPORTS } from '../scripts/exports';

useMapSize(500, 400);

const createRenderer = (options: ConstructorParameters<typeof OrbitSVGRenderer>[1] = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const renderer = new OrbitSVGRenderer(host, { transitionDuration: 0, ...options });
  return {
    host,
    renderer,
    cleanup: () => {
      renderer.destroy();
      host.remove();
    },
  };
};

describe('what each entry exports', () => {
  it('is exactly what scripts/exports.ts lists', async () => {
    const entries: Record<string, string> = { '.': '../src/index', './react': '../src/react', './marked': '../src/marked' };

    for (const [entry, expected] of Object.entries(PACKAGE_EXPORTS)) {
      const module = await import(entries[entry]);
      expect(Object.keys(module).sort()).toEqual([...expected].sort());
    }
  });
});

describe('a map as its root node', () => {
  it('is taken wherever a map is: the print layout, the web page, OPML and the map tools', () => {
    const root = parseOrbit('# Trip\n## Food\n- Tacos').root;
    const page = document.createElement('div');
    orbit.renderPrintLayout(page, root);
    expect(page.textContent).toContain('Tacos');
    expect(orbit.exportWebPage(root, { script: '' })).toContain('Tacos');
    expect(orbit.exportOPML(root)).toContain('<outline text="Tacos"');
    const tools = orbit.createMapTools(root);
    expect(tools.run('read_map', {}).text).toContain('Tacos');
    tools.run('add_nodes', { parent: 'food', outline: '- Churros' });
    expect(root.children[0].children.map((child) => child.text)).toEqual(['Tacos', 'Churros']);
  });
});

describe('names that changed', () => {
  it('keep working until 1.0, and each says once what to use instead', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(orbit.isOrbitThemePreset('night')).toBe(true);
    expect(orbit.isOrbitThemePreset('brand')).toBe(false);
    expect(orbit.renderOrbitMarkdownBlocks(document.createElement('div'))).toEqual([]);
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      '[orbit] isOrbitThemePreset() is deprecated: use isThemePreset(). It keeps working until Orbit 1.0.',
      '[orbit] renderOrbitMarkdownBlocks() is deprecated: use hydrateOrbitBlocks(). It keeps working until Orbit 1.0.',
    ]);
    warn.mockRestore();
  });

  it('the options named as a document writes them answer to their old names too, and each says once what to use instead', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    const { renderer, cleanup } = createRenderer({ viewMode: 'all', orbitAnimation: true, orbitSpeed: 60, mediaViewer: false });
    renderer.render('# Trip\n## Food\n## Sights');
    expect(renderer.getViewMode()).toBe('all');
    renderer.setOptions({ viewMode: 'focus' });
    expect(renderer.getViewMode()).toBe('focus');
    // The new name wins when both are given.
    renderer.setOptions({ view: 'all', viewMode: 'focus' });
    expect(renderer.getViewMode()).toBe('all');
    cleanup();

    // The functions that share the option: the same drawing either way.
    expect(orbit.renderToSVGString('# Trip\n## Food', { viewMode: 'all' })).toBe(orbit.renderToSVGString('# Trip\n## Food', { view: 'all' }));
    expect(orbit.exportWebPage('# Trip', { script: '', viewMode: 'all' })).toContain('"view":"all"');

    // A parsed document's options, by their old names, without showing among them.
    const parsed = parseOrbit('---\nview: all\nanimation: true\nspeed: 40\n---\n# Trip');
    expect(parsed.options.viewMode).toBe('all');
    expect(parsed.options.orbitAnimation).toBe(true);
    expect(parsed.options.orbitSpeed).toBe(40);
    expect(Object.keys(parsed.options).sort()).toEqual(['animation', 'speed', 'view']);

    // Options made by hand with them are written as the document writes them.
    const made = { root: parseOrbit('# Trip').root, options: { viewMode: 'all' as const, orbitSpeed: 30 }, warnings: [] };
    expect(serializeOrbitMarkdown(made, { keepSource: false })).toStartWith('---\nview: all\nspeed: 30\n---\n');
    expect(documentToRendererOptions(made.options)).toEqual({ view: 'all', speed: 30 });

    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      '[orbit] The option viewMode is deprecated: use view. It keeps working until Orbit 1.0.',
      '[orbit] The option orbitAnimation is deprecated: use animation. It keeps working until Orbit 1.0.',
      '[orbit] The option orbitSpeed is deprecated: use speed. It keeps working until Orbit 1.0.',
      '[orbit] The option mediaViewer is deprecated: use showMediaViewer. It keeps working until Orbit 1.0.',
      '[orbit] The document option viewMode is deprecated: use view. It keeps working until Orbit 1.0.',
      '[orbit] The document option orbitAnimation is deprecated: use animation. It keeps working until Orbit 1.0.',
      '[orbit] The document option orbitSpeed is deprecated: use speed. It keeps working until Orbit 1.0.',
    ]);
    warn.mockRestore();
  });
});

describe('the package root', () => {
  it('exports everything the README documents', () => {
    for (const name of [
      'parseOrbit', 'parseOrbitMarkdown', 'parseOrbitYAML', 'serializeOrbitMarkdown', 'serializeOrbitYAML',
      'OrbitSVGRenderer', 'documentToRendererOptions', 'defineOrbitMapElement', 'renderOrbitElement',
      'hydrateOrbitBlocks', 'OrbitParseError', 'formatDiagnostic',
    ]) {
      expect(typeof (orbit as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('renders a note for a page to show itself', () => {
    const caption = document.createElement('div');
    caption.appendChild(orbit.renderNoteMarkdown('Fly **in**, then [read more](notes.html).\n\n- one\n- two', { baseUrl: 'https://example.com/maps/' }));
    expect(caption.querySelector('strong')?.textContent).toBe('in');
    expect(caption.querySelector('a')?.getAttribute('href')).toBe('https://example.com/maps/notes.html');
    expect(caption.querySelectorAll('li')).toHaveLength(2);
  });

  it('serializes in both flavors', () => {
    const doc = parseOrbit('# Root\n## A');
    expect(serializeOrbitMarkdown(doc)).toContain('## A');
    expect(serializeOrbitYAML(doc)).toContain('text: A');
  });
});

describe('rendering a whole document', () => {
  it('applies the frontmatter options', () => {
    const { host, renderer, cleanup } = createRenderer();
    renderer.render(parseOrbit('---\nview: all\ntitle: Roadmap\n---\n# Root\n## A\n## B'));
    expect(renderer.getViewMode()).toBe('all');
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('Roadmap');
    cleanup();
  });

  it('lets options passed to the renderer win over the document', () => {
    const { renderer, cleanup } = createRenderer({ view: 'focus' });
    renderer.render(parseOrbit('---\nview: all\n---\n# Root\n## A'));
    expect(renderer.getViewMode()).toBe('focus');
    cleanup();
  });

  it('falls back to the document when an option is unset', () => {
    const { host, renderer, cleanup } = createRenderer({ ariaLabel: 'Explicit' });
    renderer.render(parseOrbit('---\ntitle: From the document\n---\n# Root'));
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('Explicit');
    renderer.setOptions({ ariaLabel: undefined });
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('From the document');
    cleanup();
  });

  it('keeps the view the reader chose when the document is rendered again', () => {
    const { renderer, cleanup } = createRenderer();
    const doc = parseOrbit('---\nview: all\n---\n# Root\n## A');
    renderer.render(doc);
    renderer.setViewMode('focus');
    renderer.render(doc);
    expect(renderer.getViewMode()).toBe('focus');
    cleanup();
  });
});

describe('documentToRendererOptions', () => {
  it('maps frontmatter to renderer options', () => {
    expect(documentToRendererOptions({
      view: 'all', title: 'Plan', palette: ['#111', '#222'], theme: 'glass', maxDepth: 2, baseUrl: '/assets/',
      height: 480, className: 'big',
    })).toEqual({
      view: 'all', ariaLabel: 'Plan', palette: ['#111', '#222'], theme: 'glass', maxDepth: 2, baseUrl: '/assets/',
    });
  });

  it('ignores an unknown theme name', () => {
    expect(documentToRendererOptions({ theme: 'neon' })).toEqual({});
  });
});
