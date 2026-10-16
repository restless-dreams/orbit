import { describe, expect, it } from 'bun:test';
import { Marked, marked } from 'marked';
import { configureMarked, hydrateOrbitBlocks, orbitMarked, renderOrbitMarkdown } from '../src/marked';
import { OrbitSVGRenderer } from '../src/core/svg-renderer';

const markdownWithMap = `Intro

\`\`\`orbit
# Root
## Alpha
## <Beta & "Gamma">
\`\`\`

Outro`;

const blockExtensionCount = (instance: Marked): number => {
  return (instance.defaults as unknown as { extensions?: { block?: unknown[] } }).extensions?.block?.length ?? 0;
};

describe('renderOrbitMarkdown', () => {
  it('turns orbit fences into a placeholder with the escaped source', async () => {
    const html = await renderOrbitMarkdown(markdownWithMap);
    expect(html).toContain('<p>Intro</p>');
    expect(html).toContain('<p>Outro</p>');
    expect(html).toContain('class="orbit-mind-map"');
    expect(html).toContain('data-orbit="# Root\n## Alpha\n## &lt;Beta &amp; &quot;Gamma&quot;&gt;"');
  });

  it('puts a readable outline inside the placeholder for readers without JavaScript', async () => {
    const html = await renderOrbitMarkdown(markdownWithMap);
    expect(html).toContain('<ul class="orbit-mind-map__outline"><li>Root<ul><li>Alpha</li><li>&lt;Beta &amp; &quot;Gamma&quot;&gt;</li></ul></li></ul>');
  });

  it('leaves the global marked untouched', async () => {
    await renderOrbitMarkdown(markdownWithMap);
    const html = await marked.parse('```orbit\n# X\n```');
    expect(html).not.toContain('orbit-mind-map');
    expect(html).toContain('<code class="language-orbit">');
  });
});

describe('orbitMarked', () => {
  it('works as an extension for a dedicated instance', async () => {
    const instance = new Marked(orbitMarked());
    expect(await instance.parse('~~~orbit\n# Tilde\n## Fence\n~~~')).toContain('data-orbit="# Tilde\n## Fence"');
  });

  it('turns options in the fence line into data attributes', async () => {
    const instance = new Marked(orbitMarked());
    const html = await instance.parse('```orbit height=480 theme=glass view=all palette="#111,#222"\n# A\n## B\n```');
    expect(html).toContain('data-height="480"');
    expect(html).toContain('data-theme="glass"');
    expect(html).toContain('data-view-mode="all"');
    expect(html).toContain('data-palette="#111,#222"');
  });

  it('leaves other code fences alone', async () => {
    const instance = new Marked(orbitMarked());
    const html = await instance.parse('```js\nconst orbit = 1;\n```\n\n```orbital\nnot a map\n```\n\n```orbit-live\nnot a map either\n```');
    expect(html).not.toContain('orbit-mind-map');
    expect(html).toContain('language-orbit-live');
  });
});

describe('configureMarked', () => {
  it('registers once per instance', () => {
    const instance = new Marked();
    configureMarked(instance);
    configureMarked(instance);
    configureMarked(instance);
    expect(blockExtensionCount(instance)).toBe(1);
  });
});

describe('hydrateOrbitBlocks', () => {
  it('renders every placeholder and applies the fence options', async () => {
    const container = document.createElement('div');
    container.innerHTML = await new Marked(orbitMarked()).parse('```orbit view=all height=300\n# Root\n## A\n## B\n```');
    document.body.appendChild(container);
    const renderers = hydrateOrbitBlocks(container);
    expect(renderers).toHaveLength(1);
    expect(renderers[0]).toBeInstanceOf(OrbitSVGRenderer);
    expect(renderers[0].getViewMode()).toBe('all');
    const placeholder = container.querySelector('.orbit-mind-map') as HTMLElement;
    expect(placeholder.style.minHeight).toBe('300px');
    expect(placeholder.querySelector('svg')).not.toBeNull();
    expect(placeholder.querySelector('.orbit-mind-map__outline')).toBeNull();
    renderers[0].destroy();
    container.remove();
  });
});
