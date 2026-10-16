import { describe, expect, it } from 'bun:test';
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

describe('the package root', () => {
  it('exports everything the README documents', () => {
    for (const name of [
      'parseOrbit', 'parseOrbitMarkdown', 'parseOrbitYAML', 'serializeOrbitMarkdown', 'serializeOrbitYAML',
      'OrbitSVGRenderer', 'documentToRendererOptions', 'defineOrbitMapElement', 'renderOrbitElement',
      'renderOrbitMarkdownBlocks', 'OrbitParseError', 'formatDiagnostic',
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
    const { renderer, cleanup } = createRenderer({ viewMode: 'focus' });
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
      viewMode: 'all', title: 'Plan', palette: ['#111', '#222'], theme: 'glass', maxDepth: 2, baseUrl: '/assets/',
      height: 480, className: 'big',
    })).toEqual({
      viewMode: 'all', ariaLabel: 'Plan', palette: ['#111', '#222'], theme: 'glass', maxDepth: 2, baseUrl: '/assets/',
    });
  });

  it('ignores an unknown theme name', () => {
    expect(documentToRendererOptions({ theme: 'neon' })).toEqual({});
  });
});
