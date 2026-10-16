import { describe, test, it, expect, beforeEach } from 'bun:test';
import { renderOrbitElement, renderOrbitMarkdownBlocks } from '../src/core/auto-render';
import { useMapSize } from './helpers/renderer';

useMapSize(400, 400);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderOrbitElement', () => {
  test('renders into the target element', () => {
    const el = document.createElement('div');
    el.setAttribute('data-orbit', '# Root\n## A\n## B');
    document.body.appendChild(el);
    const renderer = renderOrbitElement(el);
    expect(renderer).not.toBeNull();
    expect(el.querySelector('svg')).not.toBeNull();
  });

  test('returns null for empty source', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(renderOrbitElement(el)).toBeNull();
  });

  test('renders pre>code.language-orbit into parent <pre>', () => {
    document.body.innerHTML = '<pre><code class="language-orbit"># Root\n## A</code></pre>';
    const code = document.querySelector('code.language-orbit')!;
    renderOrbitElement(code);
    expect(document.querySelector('pre svg')).not.toBeNull();
  });

  test('preserves inline source so direct rerenders are idempotent', () => {
    const el = document.createElement('div');
    el.textContent = '# Root\n## A';
    document.body.appendChild(el);

    const first = renderOrbitElement(el);
    const second = renderOrbitElement(el);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(el.getAttribute('data-orbit-source')).toBe('# Root\n## A');
    expect(el.querySelector('svg')).not.toBeNull();
  });

  test('preserves pre source for repeated block rendering', () => {
    document.body.innerHTML = '<pre><code class="language-orbit"># Root\n## A</code></pre>';
    const first = renderOrbitMarkdownBlocks(document);
    const second = renderOrbitMarkdownBlocks(document);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(document.querySelector('pre')?.getAttribute('data-orbit-source')).toBe('# Root\n## A');
    expect(document.querySelector('pre svg')).not.toBeNull();
  });

  test('drops classes a previous render asked for when the className changes', () => {
    const el = document.createElement('div');
    el.setAttribute('data-orbit', '---\nclassName: first\n---\n# Root\n## A');
    document.body.appendChild(el);
    renderOrbitElement(el);
    expect(el.classList.contains('first')).toBe(true);

    el.setAttribute('data-orbit', '---\nclassName: second\n---\n# Root\n## A');
    renderOrbitElement(el);
    expect(el.classList.contains('first')).toBe(false);
    expect(el.classList.contains('second')).toBe(true);

    el.setAttribute('data-orbit', '# Root\n## A');
    renderOrbitElement(el);
    expect(el.classList.contains('second')).toBe(false);
  });
});

describe('renderOrbitMarkdownBlocks', () => {
  test('renders all matching orbit blocks under the root', () => {
    document.body.innerHTML = '<div data-orbit="# Root\n## A" class="orbit-mind-map"></div>';
    const renderers = renderOrbitMarkdownBlocks(document);
    expect(renderers).toHaveLength(1);
    expect(document.querySelector('svg')).not.toBeNull();
  });
});

describe('auto-render parses with parseOrbit', () => {
  it('parses inline markdown source', () => {
    const el = document.createElement('div');
    el.setAttribute('data-orbit', '# 🚀 Project\n\n## A\n## B');
    document.body.appendChild(el);
    const r = renderOrbitElement(el);
    expect(r).not.toBeNull();
    expect(el.querySelector('svg')).toBeTruthy();
  });

  it('forwards baseUrl from frontmatter to renderer', () => {
    const el = document.createElement('div');
    el.setAttribute('data-orbit', '---\nbaseUrl: https://example.com/assets/\n---\n# A\n![](./x.png)');
    document.body.appendChild(el);
    renderOrbitElement(el);
    const image = el.querySelector('image');
    expect(image?.getAttribute('href') ?? '').toContain('https://example.com/assets/x.png');
  });

  it('forwards named theme presets from frontmatter to renderer', () => {
    const el = document.createElement('div');
    el.setAttribute('data-orbit', '---\ntheme: glass\n---\n# A\n## B');
    document.body.appendChild(el);
    renderOrbitElement(el);
    expect(el.querySelector('.orbit')?.getAttribute('data-orbit-theme')).toBe('glass');
  });

  it('builds a theme object without a preset on the element\'s theme', () => {
    const el = document.createElement('div');
    el.setAttribute('data-orbit', '# A\n## B');
    el.setAttribute('data-theme', 'ink');
    document.body.appendChild(el);
    renderOrbitElement(el, { theme: { tokens: { 'ring-dash': 'none' } } });
    expect(el.querySelector('.orbit')?.getAttribute('data-orbit-theme')).toBe('ink');
  });
});
